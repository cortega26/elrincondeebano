import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { JsonFileRepository } from './jsonFileRepository.ts';
import { writeJsonFileAtomic } from '../services/atomicFileWriter.ts';

// Durable sync queue (plan 064 step 2): atomic replace (tmp + rename),
// bounded retention, restart-safe normalization. Python parity (sync.py):
// exponential backoff, initial delay max(30, poll_interval), max 15 min,
// exponent capped at 6.
export const syncQueueEntrySchema = z.object({
  product_id: z.string(),
  base_rev: z.number().int().nonnegative(),
  fields: z.record(z.string(), z.unknown()),
  snapshot: z.record(z.string(), z.unknown()),
  changeset_id: z.string(),
  status: z.enum(['pending', 'synced', 'error']).default('pending'),
  attempts: z.number().int().nonnegative().default(0),
  enqueued_at: z.string(),
  last_attempt: z.string().optional(),
  last_error: z.string().optional(),
  next_retry_at: z.string().nullable().default(null),
});
export type SyncQueueEntry = z.infer<typeof syncQueueEntrySchema>;

export function generateChangesetId(): string {
  return `cs-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

const MAX_QUEUE_ENTRIES = 1000;
const MAX_ERROR_ENTRIES = 200;

// Plan 086: a crashed process (kill -9, power loss) can leave the lock file
// behind; after this TTL the lock is treated as stale and reclaimed. Must be
// well above the worst-case duration of a single processOnce (today < 1s).
const SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * SyncQueueRepository now extends JsonFileRepository (plan 152) to share
 * the mtime+size cache (key = `${filePath}:${mtimeMs}:${size}`) and the
 * atomic writer (tmp+rename+backup+prune). The queue's pruning policy
 * (synced dropped, error capped to 200, pending always kept, final cap
 * 1000) is catalog-specific and stays in save() before delegating to the
 * shared writer; the lenient per-entry filtering on load (invalid entries
 * are dropped, malformed file returns []) is also preserved intentionally
 * — strict throw would break restart-safe normalization.
 */
export class SyncQueueRepository extends JsonFileRepository<SyncQueueEntry[]> {
  private readonly queuePath: string;
  private readonly lockFile: string;

  constructor(repoRoot: string) {
    super();
    const dir = resolve(repoRoot, 'data');
    mkdirSync(dir, { recursive: true });
    this.queuePath = resolve(dir, 'sync-queue.json');
    this.lockFile = resolve(dir, '.sync-queue.lock');
  }

  override getFilePath(): string {
    return this.queuePath;
  }

  protected getSchema(): z.ZodType<SyncQueueEntry[]> {
    return z.array(syncQueueEntrySchema);
  }

  override load(): SyncQueueEntry[] {
    if (!existsSync(this.queuePath)) return [];
    try {
      const stat = statSync(this.queuePath);
      const cacheKey = this.buildCacheKey(this.queuePath, stat);
      if (this.cache?.key === cacheKey) {
        return this.cache.data;
      }
      const parsed = JSON.parse(readFileSync(this.queuePath, 'utf-8'));
      const items = Array.isArray(parsed) ? parsed : parsed.queue;
      if (!Array.isArray(items)) return [];
      const entries: SyncQueueEntry[] = [];
      for (const item of items) {
        const result = syncQueueEntrySchema.safeParse(item);
        if (result.success) entries.push(result.data);
      }
      this.cache = { key: cacheKey, data: entries };
      return entries;
    } catch {
      return [];
    }
  }

  save(entries: SyncQueueEntry[]): void {
    // Plan 147 pruning policy:
    // - synced: dropped entirely. The UI (SyncStatusPanel, ConflictsPage)
    //   never renders synced-queue history; buildSyncStatus in
    //   conflicts.ts only exposes counts (pending/synced/error/total) and
    //   the SyncStatusPanel renders only pending/error/total. Once the
    //   remote has acked a change (synced), keeping it has no consumer — it
    //   only grows the file and the per-read zod cost. If the UI ever shows
    //   recent syncs, change this to keep the last 50 synced (see plan 147).
    // - error: kept but capped to most-recent 200 (retryable per plan 064;
    //   a stuck remote must not grow the file forever).
    // - pending: kept always (dedup in syncService.enqueue depends on it).
    // Order of the surviving entries is preserved; final cap is
    // MAX_QUEUE_ENTRIES (1000).
    let pruned: SyncQueueEntry[];
    const errorEntries = entries.filter((e) => e.status === 'error');
    if (errorEntries.length > MAX_ERROR_ENTRIES) {
      const keepErrors = new Set(errorEntries.slice(-MAX_ERROR_ENTRIES));
      pruned = entries.filter((e) => e.status === 'pending' || keepErrors.has(e));
    } else {
      pruned = entries.filter((e) => e.status !== 'synced');
    }
    const trimmed = pruned.slice(-MAX_QUEUE_ENTRIES);
    this.invalidateCache();
    // Use the shared atomic writer (plan 152) — maxBackups 0 preserves the
    // historical no-backup behavior of the queue (a transient local queue,
    // not a system of record like categories). The writer still does tmp+rename.
    writeJsonFileAtomic(this.queuePath, { queue: trimmed }, { maxBackups: 0 });
  }

  // Single-consumer lock: returns true only if this process won the lock.
  // A lock file older than SYNC_LOCK_TTL_MS is stale (crashed owner) and is
  // reclaimed; the write still uses flag 'wx' so a concurrent acquirer keeps
  // the single-consumer guarantee.
  acquireLock(): boolean {
    if (existsSync(this.lockFile)) {
      try {
        const mtime = statSync(this.lockFile).mtimeMs;
        if (Date.now() - mtime <= SYNC_LOCK_TTL_MS) return false;
        unlinkSync(this.lockFile);
      } catch {
        return false;
      }
    }
    try {
      writeFileSync(this.lockFile, String(process.pid), { encoding: 'utf-8', flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  }

  releaseLock(): void {
    try {
      unlinkSync(this.lockFile);
    } catch {
      // Already gone
    }
  }
}
