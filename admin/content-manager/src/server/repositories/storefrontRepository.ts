import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import type { StorefrontExperience } from '../../shared/schemas/storefront.ts';
import {
  storefrontExperienceSchema,
  storefrontBundleSchema,
} from '../../shared/schemas/storefront.ts';
import type { ValidationIssue } from '../../shared/schemas/validation.ts';
import { createIssue } from '../../shared/schemas/validation.ts';
import { uniqueTimestamp } from '../services/uniqueTimestamp.ts';

export interface StorefrontRepositoryConfig {
  repoRoot: string;
  experienceFile?: string;
  bundlesFile?: string;
}

const DEFAULT_EXPERIENCE = 'astro-poc/src/data/storefront-experience.json';
const DEFAULT_BUNDLES = 'astro-poc/src/data/storefront-bundles.json';

export class StorefrontRepository {
  private readonly experiencePath: string;
  private readonly bundlesPath: string;

  constructor(config: StorefrontRepositoryConfig) {
    this.experiencePath = resolve(config.repoRoot, config.experienceFile ?? DEFAULT_EXPERIENCE);
    this.bundlesPath = resolve(config.repoRoot, config.bundlesFile ?? DEFAULT_BUNDLES);
  }

  load(): StorefrontExperience {
    this.ensureFileExists();

    let raw: string;
    try {
      raw = readFileSync(this.experiencePath, 'utf-8');
    } catch (err) {
      throw new Error(
        `Cannot read storefront experience from ${this.experiencePath}: ${(err as Error).message}`,
        { cause: err }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in ${this.experiencePath}`);
    }

    let data: Record<string, unknown>;
    if (typeof parsed === 'object' && parsed !== null) {
      data = parsed as Record<string, unknown>;
    } else {
      throw new Error(`Unexpected JSON structure in ${this.experiencePath}`);
    }

    if (!data.bundles || !Array.isArray(data.bundles)) {
      data.bundles = this.loadBundles();
    }

    const result = storefrontExperienceSchema.safeParse(data);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Schema validation failed for ${this.experiencePath}: ${message}`);
    }

    return result.data;
  }

  getBundles(): StorefrontExperience['bundles'] {
    return this.load().bundles;
  }

  getFeaturedStaples(): StorefrontExperience['home']['featuredStaples'] {
    return this.load().home.featuredStaples;
  }

  write(experience: StorefrontExperience): { ok: boolean; error?: string } {
    const result = storefrontExperienceSchema.safeParse(experience);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
    }

    const tmpPath = `${this.experiencePath}.tmp`;
    const backupPath = `${this.experiencePath}.backup_${uniqueTimestamp()}`;
    const bundlesTmp = `${this.bundlesPath}.tmp`;
    const bundlesBackupPath = `${this.bundlesPath}.backup_${uniqueTimestamp()}`;

    try {
      mkdirSync(dirname(this.experiencePath), { recursive: true });
      const json = JSON.stringify(result.data, null, 2);
      writeFileSync(tmpPath, json, { encoding: 'utf-8', flush: true });

      if (existsSync(this.experiencePath)) {
        renameSync(this.experiencePath, backupPath);
      }
      renameSync(tmpPath, this.experiencePath);

      // Also write bundles separately (unconditionally, so clearing all
      // bundles persists [] instead of leaving a stale file behind — plan 081).
      writeFileSync(bundlesTmp, JSON.stringify(result.data.bundles, null, 2), {
        encoding: 'utf-8',
        flush: true,
      });
      if (existsSync(this.bundlesPath)) {
        renameSync(this.bundlesPath, bundlesBackupPath);
      }
      renameSync(bundlesTmp, this.bundlesPath);

      return { ok: true };
    } catch (err) {
      // Plan 066 step 2: transactional rollback across BOTH files — the
      // experience and the bundle projection must never diverge. Restore
      // each prior file (removing any partially-written successor).
      try {
        if (existsSync(backupPath)) {
          if (existsSync(this.experiencePath)) unlinkSync(this.experiencePath);
          renameSync(backupPath, this.experiencePath);
        }
      } catch {
        /* restoration is best-effort */
      }
      try {
        if (existsSync(bundlesBackupPath)) {
          if (existsSync(this.bundlesPath)) unlinkSync(this.bundlesPath);
          renameSync(bundlesBackupPath, this.bundlesPath);
        }
      } catch {
        /* restoration is best-effort */
      }
      try {
        unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      try {
        unlinkSync(bundlesTmp);
      } catch {
        /* ignore */
      }
      return { ok: false, error: (err as Error).message };
    }
  }

  private loadBundles(): unknown[] {
    if (!existsSync(this.bundlesPath)) {
      return [];
    }

    try {
      const raw = readFileSync(this.bundlesPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const result = z.array(storefrontBundleSchema).safeParse(parsed);
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }

  validate(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    try {
      const raw = readFileSync(this.experiencePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const data = parsed as Record<string, unknown>;
        if (!data.bundles || !Array.isArray(data.bundles)) {
          data.bundles = this.loadBundles();
        }
        const result = storefrontExperienceSchema.safeParse(data);

        if (!result.success) {
          for (const issue of result.error.issues) {
            issues.push(
              createIssue(
                'error',
                this.experiencePath,
                'bundle',
                'schema_violation',
                issue.message,
                {
                  field: issue.path.join('.'),
                }
              )
            );
          }
        }
      }
    } catch (err) {
      issues.push(
        createIssue('error', this.experiencePath, 'bundle', 'load_error', (err as Error).message)
      );
    }

    return issues;
  }

  private ensureFileExists(): void {
    if (!existsSync(this.experiencePath)) {
      throw new Error(`Storefront experience file not found: ${this.experiencePath}`);
    }
  }

  getFilePath(): string {
    return this.experiencePath;
  }
}

export function createStorefrontRepository(
  config: StorefrontRepositoryConfig
): StorefrontRepository {
  return new StorefrontRepository(config);
}
