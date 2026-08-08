import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { CategoryRegistry } from '../../shared/schemas/category.ts';
import { categoryRegistrySchema } from '../../shared/schemas/category.ts';
import type { ValidationIssue } from '../../shared/schemas/validation.ts';
import { createIssue } from '../../shared/schemas/validation.ts';
import { uniqueTimestamp } from '../services/uniqueTimestamp.ts';

export interface CategoryRepositoryConfig {
  repoRoot: string;
  registryFile?: string;
  legacyFile?: string;
}

const DEFAULT_REGISTRY = 'data/category_registry.json';
const DEFAULT_LEGACY = 'data/categories.json';

export class CategoryRepository {
  private readonly registryPath: string;
  private readonly legacyPath: string;

  constructor(config: CategoryRepositoryConfig) {
    this.registryPath = resolve(config.repoRoot, config.registryFile ?? DEFAULT_REGISTRY);
    this.legacyPath = resolve(config.repoRoot, config.legacyFile ?? DEFAULT_LEGACY);
  }

  load(): CategoryRegistry {
    let raw: string;
    const sourcePath = existsSync(this.registryPath) ? this.registryPath : this.legacyPath;

    if (!existsSync(sourcePath)) {
      throw new Error(
        `No category source found. Looked at: ${this.registryPath}, ${this.legacyPath}`
      );
    }

    try {
      raw = readFileSync(sourcePath, 'utf-8');
    } catch (err) {
      throw new Error(`Cannot read categories from ${sourcePath}: ${(err as Error).message}`, {
        cause: err,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON in category source');
    }

    const result = categoryRegistrySchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Schema validation failed for categories: ${message}`);
    }

    return result.data;
  }

  write(registry: CategoryRegistry): { ok: boolean; error?: string } {
    const result = categoryRegistrySchema.safeParse(registry);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
    }

    const tmpPath = `${this.registryPath}.tmp`;
    const backupPath = `${this.registryPath}.backup_${uniqueTimestamp()}`;

    try {
      mkdirSync(dirname(this.registryPath), { recursive: true });

      const json = JSON.stringify(result.data, null, 2);
      writeFileSync(tmpPath, json, { encoding: 'utf-8', flush: true });

      if (existsSync(this.registryPath)) {
        renameSync(this.registryPath, backupPath);
      }

      renameSync(tmpPath, this.registryPath);
      return { ok: true };
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      return { ok: false, error: (err as Error).message };
    }
  }

  getCategories(): NonNullable<CategoryRegistry['categories']> {
    return this.load().categories ?? [];
  }

  getNavGroups(): NonNullable<CategoryRegistry['nav_groups']> {
    return this.load().nav_groups ?? [];
  }

  getByKey(
    key: string
  ): CategoryRegistry['categories'] extends Array<infer T> ? T | undefined : never {
    const normalized = (key ?? '').trim().toLowerCase();
    const categories = this.load().categories ?? [];
    return categories.find((c) => c.key.toLowerCase() === normalized) as never;
  }

  countProductsInCategory(_categoryId: string): number {
    return 0; // Product-count check requires product repo cross-reference — deferred to domain
  }

  validate(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const sourcePath = existsSync(this.registryPath) ? this.registryPath : this.legacyPath;

    try {
      const raw = readFileSync(sourcePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const result = categoryRegistrySchema.safeParse(parsed);

      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push(
            createIssue('error', sourcePath, 'category', 'schema_violation', issue.message, {
              field: issue.path.join('.'),
            })
          );
        }
        return issues;
      }

      const slugs = new Map<string, number>();
      for (let i = 0; i < (result.data.categories ?? []).length; i++) {
        const cat = (result.data.categories ?? [])[i];
        const existing = slugs.get(cat.slug);
        if (existing !== undefined) {
          issues.push(
            createIssue(
              'error',
              sourcePath,
              'category',
              'duplicate_slug',
              `Duplicate slug "${cat.slug}"`,
              {
                entity_id: cat.id,
                field: 'slug',
              }
            )
          );
        }
        slugs.set(cat.slug, i);
      }
    } catch (err) {
      issues.push(
        createIssue('error', sourcePath, 'category', 'load_error', (err as Error).message)
      );
    }

    return issues;
  }

  getFilePath(): string {
    return existsSync(this.registryPath) ? this.registryPath : this.legacyPath;
  }
}
