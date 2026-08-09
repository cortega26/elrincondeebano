import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Product, ProductCatalog } from '../../shared/schemas/product.ts';
import { productCatalogSchema } from '../../shared/schemas/product.ts';
import type { ValidationIssue } from '../../shared/schemas/validation.ts';
import { createIssue } from '../../shared/schemas/validation.ts';
import { AtomicWriter } from '../services/atomicWriter.ts';
import { MutationLock } from '../services/mutationLock.ts';
import type { PersistentIdempotencyStore } from '../services/persistentIdempotencyStore.ts';
import type { RecoveryJournal } from '../services/recoveryJournal.ts';

export interface ProductRepositoryConfig {
  repoRoot: string;
  dataFile?: string;
  recoveryJournal?: RecoveryJournal;
}

const DEFAULT_PRODUCT_FILE = 'data/product_data.json';

export class ProductRepository {
  private readonly filePath: string;
  private readonly lock: MutationLock;
  private readonly writer: AtomicWriter;
  private idempotencyStore?: PersistentIdempotencyStore;

  constructor(config: ProductRepositoryConfig, idempotencyStore?: PersistentIdempotencyStore) {
    const dataFile = config.dataFile ?? DEFAULT_PRODUCT_FILE;
    this.filePath = resolve(config.repoRoot, dataFile);
    this.lock = new MutationLock();
    this.writer = new AtomicWriter(this.filePath, config.recoveryJournal);
    this.idempotencyStore = idempotencyStore;
  }

  setIdempotencyStore(store: PersistentIdempotencyStore): void {
    this.idempotencyStore = store;
  }

  loadCatalog(): ProductCatalog {
    this.ensureFileExists();

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

    const result = productCatalogSchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Schema validation failed for ${this.filePath}: ${message}`);
    }

    return result.data;
  }

  async writeCatalog(
    data: ProductCatalog,
    commandId: string,
    baseRevision: number
  ): Promise<{ ok: boolean; error?: string; statusCode: number }> {
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

export function createProductRepository(
  config: ProductRepositoryConfig,
  idempotencyStore?: PersistentIdempotencyStore
): ProductRepository {
  return new ProductRepository(config, idempotencyStore);
}
