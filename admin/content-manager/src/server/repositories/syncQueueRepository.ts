import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

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

export class SyncQueueRepository {
  private readonly path: string;
  private readonly lockFile: string;
  // Plan 147: mtime+size-keyed cache — every sync-status read paid full file
  // read+parse+zod. Keyed on stat so external edits invalidate automatically;
  // writes invalidate eagerly.
  private cached: { mtimeMs: number; size: number; entries: SyncQueueEntry[] } | null = null;

  constructor(repoRoot: string) {
    const dir = resolve(repoRoot, 'data');
    mkdirSync(dir, { recursive: true });
    this.path = resolve(dir, 'sync-queue.json');
    this.lockFile = resolve(dir, '.sync-queue.lock');
  }

  load(): SyncQueueEntry[] {
    if (!existsSync(this.path)) return [];
    try {
      const stat = statSync(this.path);
      if (this.cached && this.cached.mtimeMs === stat.mtimeMs && this.cached.size === stat.size) {
        return this.cached.entries;
      }
      const parsed = JSON.parse(readFileSync(this.path, 'utf-8'));
      const items = Array.isArray(parsed) ? parsed : parsed.queue;
      if (!Array.isArray(items)) return [];
      const entries: SyncQueueEntry[] = [];
      for (const item of items) {
        const result = syncQueueEntrySchema.safeParse(item);
        if (result.success) entries.push(result.data);
      }
      this.cached = { mtimeMs: stat.mtimeMs, size: stat.size, entries };
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
    const payload = JSON.stringify({ queue: trimmed }, null, 2);
    const tmpPath = `${this.path}.tmp`;
    writeFileSync(tmpPath, payload, { encoding: 'utf-8', flush: true });
    renameSync(tmpPath, this.path);
    this.cached = null;
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
