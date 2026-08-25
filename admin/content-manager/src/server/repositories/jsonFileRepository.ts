import { readFileSync, existsSync, statSync } from 'node:fs';
import { z } from 'zod';
import {
  writeJsonFileAtomic,
  type AtomicWriteOptions,
} from '../services/atomicFileWriter.ts';

/**
 * Shared JSON-file repository base (plan 152).
 *
 * Consolidates the duplicated load pipeline (readFileSync → JSON.parse →
 * zod safeParse → throw-with-joined-issues) and the mtime+size cache that
 * ProductRepository (plan 092), StorefrontRepository (plan 150) and
 * SyncQueueRepository (plan 147) each re-implemented. Writes go through
 * the shared AtomicFileWriter (tmp + rename + backup + prune).
 *
 * Cache: key = `${filePath}:${mtimeMs}:${size}` so external edits (git
 * pull, manual edit) invalidate via stat change; own writes invalidate
 * eagerly (mirrors ProductRepository.writeCatalog).
 *
 * Subclasses that need custom semantics (CategoryRegistry fallback paths,
 * SyncQueue lenient filtering) override load()/save to preserve exact
 * contracts but reuse the cache + atomic helpers exposed as protected
 * members.
 */
export abstract class JsonFileRepository<T> {
  abstract getFilePath(): string;
  protected abstract getSchema(): z.ZodType<T>;

  protected cache: { key: string; data: T } | null = null;

  protected getInvalidJsonMessage(filePath: string): string {
    return `Invalid JSON in ${filePath}`;
  }

  protected getSchemaErrorPrefix(filePath: string): string {
    return `Schema validation failed for ${filePath}`;
  }

  protected getMissingFileMessage(filePath: string): string {
    return `File not found: ${filePath}`;
  }

  protected getReadErrorMessage(filePath: string, cause: Error): string {
    return `Cannot read ${filePath}: ${cause.message}`;
  }

  protected buildCacheKey(filePath: string, stat: { mtimeMs: number; size: number }): string {
    return `${filePath}:${stat.mtimeMs}:${stat.size}`;
  }

  load(): T {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      throw new Error(this.getMissingFileMessage(filePath));
    }
    const stat = statSync(filePath);
    const cacheKey = this.buildCacheKey(filePath, stat);
    if (this.cache?.key === cacheKey) {
      return this.cache.data;
    }
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new Error(this.getReadErrorMessage(filePath, err as Error), {
        cause: err,
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(this.getInvalidJsonMessage(filePath));
    }
    const result = this.getSchema().safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`${this.getSchemaErrorPrefix(filePath)}: ${message}`);
    }
    this.cache = { key: cacheKey, data: result.data };
    return result.data;
  }

  protected saveAtomic(data: T, options: AtomicWriteOptions = {}): void {
    this.cache = null;
    const filePath = this.getFilePath();
    const validated = this.getSchema().safeParse(data);
    if (!validated.success) {
      const message = validated.error.issues.map((i) => i.message).join('; ');
      throw new Error(message);
    }
    writeJsonFileAtomic(filePath, validated.data, options);
  }

  protected invalidateCache(): void {
    this.cache = null;
  }
}
