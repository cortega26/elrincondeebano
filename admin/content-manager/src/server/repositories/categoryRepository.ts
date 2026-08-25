import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { CategoryRegistry } from '../../shared/schemas/category.ts';
import { categoryRegistrySchema } from '../../shared/schemas/category.ts';
import type { ValidationIssue } from '../../shared/schemas/validation.ts';
import { createIssue } from '../../shared/schemas/validation.ts';
import { MutationLock } from '../services/mutationLock.ts';
import { JsonFileRepository } from './jsonFileRepository.ts';
import { writeJsonFileAtomic } from '../services/atomicFileWriter.ts';

export interface CategoryRepositoryConfig {
  repoRoot: string;
  registryFile?: string;
  legacyFile?: string;
}

const DEFAULT_REGISTRY = 'data/category_registry.json';
const DEFAULT_LEGACY = 'data/categories.json';

export class CategoryRepository extends JsonFileRepository<CategoryRegistry> {
  private readonly registryPath: string;
  private readonly legacyPath: string;
  private readonly lock = new MutationLock();

  constructor(config: CategoryRepositoryConfig) {
    super();
    this.registryPath = resolve(config.repoRoot, config.registryFile ?? DEFAULT_REGISTRY);
    this.legacyPath = resolve(config.repoRoot, config.legacyFile ?? DEFAULT_LEGACY);
  }

  override getFilePath(): string {
    return existsSync(this.registryPath) ? this.registryPath : this.legacyPath;
  }

  protected getSchema(): z.ZodType<CategoryRegistry> {
    return categoryRegistrySchema;
  }

  protected override getMissingFileMessage(_filePath: string): string {
    return `No category source found. Looked at: ${this.registryPath}, ${this.legacyPath}`;
  }

  protected override getInvalidJsonMessage(_filePath: string): string {
    return 'Invalid JSON in category source';
  }

  protected override getSchemaErrorPrefix(_filePath: string): string {
    return 'Schema validation failed for categories';
  }

  protected override getReadErrorMessage(filePath: string, cause: Error): string {
    return `Cannot read categories from ${filePath}: ${cause.message}`;
  }

  async write(
    registry: CategoryRegistry,
    baseRevision: number,
  ): Promise<{ ok: boolean; error?: string; statusCode: number; rev: number }> {
    this.invalidateCache();
    const release = await this.lock.acquire();
    try {
      const current = this.load();
      if (current.rev !== baseRevision) {
        return {
          ok: false,
          error: `Stale category registry revision: expected ${baseRevision}, got ${current.rev}`,
          statusCode: 409,
          rev: current.rev,
        };
      }

      registry.rev = current.rev + 1;
      const result = categoryRegistrySchema.safeParse(registry);
      if (!result.success) {
        return {
          ok: false,
          error: result.error.issues.map((i) => i.message).join('; '),
          statusCode: 500,
          rev: registry.rev,
        };
      }

      try {
        writeJsonFileAtomic(this.registryPath, result.data, {
          maxBackups: 10,
          filePrefix: 'category_registry.json',
        });
        this.invalidateCache();
        return { ok: true, statusCode: 200, rev: registry.rev };
      } catch (err) {
        return { ok: false, error: (err as Error).message, statusCode: 500, rev: registry.rev };
      }
    } finally {
      release();
    }
  }

  getCategories(): NonNullable<CategoryRegistry['categories']> {
    return this.load().categories ?? [];
  }

  getNavGroups(): NonNullable<CategoryRegistry['nav_groups']> {
    return this.load().nav_groups ?? [];
  }

  getByKey(
    key: string,
  ): CategoryRegistry['categories'] extends Array<infer T> ? T | undefined : never {
    const normalized = (key ?? '').trim().toLowerCase();
    const categories = this.load().categories ?? [];
    return categories.find((c) => c.key.toLowerCase() === normalized) as never;
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
            }),
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
              },
            ),
          );
        }
        slugs.set(cat.slug, i);
      }
    } catch (err) {
      issues.push(
        createIssue('error', sourcePath, 'category', 'load_error', (err as Error).message),
      );
    }

    return issues;
  }

}
