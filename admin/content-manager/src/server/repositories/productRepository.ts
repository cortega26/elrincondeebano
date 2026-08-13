import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Product, ProductCatalog } from '../../shared/schemas/product.ts';
import { productCatalogSchema } from '../../shared/schemas/product.ts';
import type { ValidationIssue } from '../../shared/schemas/validation.ts';
import { createIssue } from '../../shared/schemas/validation.ts';
import { AtomicWriter } from '../services/atomicWriter.ts';
import { migrateCatalog, type CatalogMigration } from '../services/catalogMigrations.ts';
import { MutationLock } from '../services/mutationLock.ts';
import type { PersistentIdempotencyStore } from '../services/persistentIdempotencyStore.ts';
import type { RecoveryJournal } from '../services/recoveryJournal.ts';

export interface ProductRepositoryConfig {
  repoRoot: string;
  dataFile?: string;
  recoveryJournal?: RecoveryJournal;
  /** Plan 127 F2.2: injectable migration registry (tests register fake
   * upgrades; production uses the built-in one). */
  catalogMigrations?: CatalogMigration[];
}

const DEFAULT_PRODUCT_FILE = 'data/product_data.json';

export class ProductRepository {
  private readonly filePath: string;
  private readonly lock: MutationLock;
  private readonly writer: AtomicWriter;
  private idempotencyStore?: PersistentIdempotencyStore;
  private readonly catalogMigrations?: CatalogMigration[];
  // Plan 092: mtime+size-keyed cache — every request used to re-read and
  // re-validate the whole catalog. Keyed on the file stat so external edits
  // (git pull, editor) invalidate automatically; writes invalidate eagerly.
  private cache: { key: string; catalog: ProductCatalog } | null = null;

  constructor(config: ProductRepositoryConfig, idempotencyStore?: PersistentIdempotencyStore) {
    const dataFile = config.dataFile ?? DEFAULT_PRODUCT_FILE;
    this.filePath = resolve(config.repoRoot, dataFile);
    this.lock = new MutationLock();
    this.writer = new AtomicWriter(this.filePath, config.recoveryJournal);
    this.idempotencyStore = idempotencyStore;
    this.catalogMigrations = config.catalogMigrations;
  }

  setIdempotencyStore(store: PersistentIdempotencyStore): void {
    this.idempotencyStore = store;
  }

  loadCatalog(): ProductCatalog {
    this.ensureFileExists();

    const stat = statSync(this.filePath);
    const cacheKey = `${stat.mtimeMs}:${stat.size}`;
    if (this.cache?.key === cacheKey) {
      // Plan 105: hand out a private copy — services mutate the catalog in
      // place, so a shared reference would let one request's uncommitted
      // edits leak into another (false 409s, wrong command attribution,
      // GET handlers observing unsaved state). writeCatalog invalidates the
      // cache first, so the in-lock re-read is always a fresh disk parse.
      return structuredClone(this.cache.catalog);
    }

    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Cannot read product data from ${this.filePath}: ${(err as Error).message}`, {
        cause: err,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in ${this.filePath}`);
    }

    // Plan 127 F2.2: run schema migrations BEFORE validation — the catalog
    // is the system of record, so old-shape data upgrades in place.
    const { catalog: migrated, migrated: didMigrate } = migrateCatalog(
      parsed,
      this.catalogMigrations
    );

    const result = productCatalogSchema.safeParse(migrated);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Schema validation failed for ${this.filePath}: ${message}`);
    }

    if (didMigrate) {
      // Persist the migration atomically (idempotent — the version marker
      // prevents re-running). Revision semantics are untouched.
      this.writer.write(result.data, 'catalog-migration', 1);
      this.cache = null;
    }

    this.cache = { key: cacheKey, catalog: result.data };
    return result.data;
  }

  async writeCatalog(
    data: ProductCatalog,
    commandId: string,
    baseRevision: number
  ): Promise<{ ok: boolean; error?: string; statusCode: number }> {
    // Plan 092: invalidate before the in-lock revision check so it always
    // sees the on-disk state, never the mutated in-memory catalog.
    this.cache = null;
    if (this.idempotencyStore?.has(commandId)) {
      const cached = this.idempotencyStore.get(commandId)!;
      return {
        ok: cached.status === 'ok',
        statusCode: cached.status === 'ok' ? 200 : 409,
      };
    }

    const release = await this.lock.acquire();
    try {
      const current = this.loadCatalog();

      if (current.rev !== baseRevision) {
        const result = {
          ok: false,
          error: `Stale catalog revision: expected ${baseRevision}, got ${current.rev}`,
          statusCode: 409,
        };
        this.idempotencyStore?.set(commandId, { command_id: commandId, status: 'conflict' });
        return result;
      }

      const writeResult = this.writer.write(data, commandId);
      if (!writeResult.success) {
        this.idempotencyStore?.set(commandId, {
          command_id: commandId,
          status: 'error',
          warnings: [writeResult.error ?? 'Write failed'],
        });
        return { ok: false, error: writeResult.error ?? 'Write failed', statusCode: 500 };
      }

      this.idempotencyStore?.set(commandId, {
        command_id: commandId,
        status: 'ok',
        resulting_revision: data.rev,
      });

      return { ok: true, statusCode: 200 };
    } finally {
      release();
    }
  }

  getAll(
    page = 1,
    limit = 50,
    filters?: {
      q?: string;
      category?: string;
      archived?: boolean;
      out_of_stock?: boolean;
      min_price?: number;
      max_price?: number;
      discounted_only?: boolean;
      min_discount?: number;
      max_discount?: number;
    }
  ): { items: Product[]; total: number } {
    const catalog = this.loadCatalog();
    let products = catalog.products;

    if (filters?.archived === false) {
      products = products.filter((p) => !p.is_archived);
    } else if (filters?.archived === true) {
      products = products.filter((p) => p.is_archived);
    }

    if (filters?.out_of_stock === true) {
      products = products.filter((p) => !p.stock);
    }

    if (filters?.min_price !== undefined) {
      products = products.filter((p) => p.price >= filters.min_price!);
    }
    if (filters?.max_price !== undefined) {
      products = products.filter((p) => p.price <= filters.max_price!);
    }

    // Plan 091: discount filters operate on the same derived percentage the
    // storefront displays (discount / price * 100).
    const discountPercent = (p: Product): number =>
      p.price > 0 ? (p.discount / p.price) * 100 : 0;
    if (filters?.discounted_only === true) {
      products = products.filter((p) => discountPercent(p) > 0);
    }
    if (filters?.min_discount !== undefined) {
      products = products.filter((p) => discountPercent(p) >= filters.min_discount!);
    }
    if (filters?.max_discount !== undefined) {
      products = products.filter((p) => discountPercent(p) <= filters.max_discount!);
    }

    if (filters?.category) {
      const cat = filters.category.toLowerCase().trim();
      products = products.filter((p) => p.category.toLowerCase().trim() === cat);
    }

    if (filters?.q) {
      const q = filters.q.toLowerCase().trim();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    products = products.sort((a, b) => a.order - b.order);

    const total = products.length;
    const offset = (page - 1) * limit;
    const items = products.slice(offset, offset + limit);

    return { items, total };
  }

  getById(id: string): Product | null {
    const catalog = this.loadCatalog();
    return catalog.products.find((p) => p.id === id || p.sku === id) ?? null;
  }

  getRevision(): { rev: number; last_updated: string } {
    const catalog = this.loadCatalog();
    return { rev: catalog.rev, last_updated: catalog.last_updated };
  }

  validate(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = productCatalogSchema.safeParse(parsed);

      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push(
            createIssue('error', this.filePath, 'product', 'schema_violation', issue.message, {
              field: issue.path.join('.'),
            })
          );
        }
        return issues;
      }

      for (const product of result.data.products) {
        if (product.discount > product.price) {
          issues.push(
            createIssue(
              'error',
              this.filePath,
              'product',
              'discount_exceeds_price',
              `Discount (${product.discount}) exceeds price (${product.price}) for "${product.name}"`,
              {
                entity_id: product.id ?? product.name,
                field: 'discount',
              }
            )
          );
        }
      }
    } catch (err) {
      issues.push(
        createIssue('error', this.filePath, 'product', 'load_error', (err as Error).message)
      );
    }

    return issues;
  }

  private ensureFileExists(): void {
    if (!existsSync(this.filePath)) {
      throw new Error(`Product data file not found: ${this.filePath}`);
    }
  }

  getFilePath(): string {
    return this.filePath;
  }
}
