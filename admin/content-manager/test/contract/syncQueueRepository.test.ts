import { test, expect } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SyncQueueRepository, type SyncQueueEntry } from '../../src/server/repositories/syncQueueRepository.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-sync-queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

function makeEntry(overrides: Partial<SyncQueueEntry> & { product_id: string }): SyncQueueEntry {
  const now = new Date().toISOString();
  return {
    product_id: overrides.product_id,
    base_rev: overrides.base_rev ?? 1,
    fields: overrides.fields ?? { price: 100 },
    snapshot: overrides.snapshot ?? { name: 'Test', price: 100 },
    changeset_id: overrides.changeset_id ?? `cs-${Math.random().toString(36).slice(2, 8)}`,
    status: overrides.status ?? 'pending',
    attempts: overrides.attempts ?? 0,
    enqueued_at: overrides.enqueued_at ?? now,
    next_retry_at: overrides.next_retry_at ?? null,
    last_attempt: overrides.last_attempt,
    last_error: overrides.last_error,
  };
}

// ── pruning ───────────────────────────────────────────────────────────────

test('save prunes synced entries entirely (plan 147: UI shows only counts, not history)', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    const entries: SyncQueueEntry[] = [
      makeEntry({ product_id: 'p-pending-1', status: 'pending' }),
      makeEntry({ product_id: 'p-synced-1', status: 'synced' }),
      makeEntry({ product_id: 'p-synced-2', status: 'synced' }),
      makeEntry({ product_id: 'p-error-1', status: 'error', last_error: 'retryable' }),
      makeEntry({ product_id: 'p-pending-2', status: 'pending' }),
    ];
    repo.save(entries);

    const loaded = repo.load();
    // synced dropped — see code comment in save() for rationale (SyncStatusPanel
    // renders only pending/error/total, never synced history).
    expect(loaded.some((e) => e.status === 'synced')).toBe(false);
    expect(loaded.filter((e) => e.status === 'pending')).toHaveLength(2);
    expect(loaded.filter((e) => e.status === 'error')).toHaveLength(1);
    // Also verify persisted file has no synced entries
    const raw = JSON.parse(readFileSync(resolve(dir, 'data', 'sync-queue.json'), 'utf-8'));
    const persisted: SyncQueueEntry[] = raw.queue;
    expect(persisted.some((e) => e.status === 'synced')).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('error entries capped to most-recent 200, pending always kept, order preserved', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    const entries: SyncQueueEntry[] = [];
    // 250 error entries (ids e-0 .. e-249, oldest first)
    for (let i = 0; i < 250; i++) {
      entries.push(
        makeEntry({ product_id: `e-${i}`, status: 'error', changeset_id: `cs-e-${i}`, last_error: `err-${i}` })
      );
    }
    // 10 pending interspersed at the end
    for (let i = 0; i < 10; i++) {
      entries.push(makeEntry({ product_id: `p-${i}`, status: 'pending', changeset_id: `cs-p-${i}` }));
    }
    // 5 synced that should be dropped
    for (let i = 0; i < 5; i++) {
      entries.push(makeEntry({ product_id: `s-${i}`, status: 'synced', changeset_id: `cs-s-${i}` }));
    }

    repo.save(entries);
    const loaded = repo.load();

    expect(loaded.some((e) => e.status === 'synced')).toBe(false);
    const errors = loaded.filter((e) => e.status === 'error');
    const pendings = loaded.filter((e) => e.status === 'pending');
    // Most recent 200 errors kept: e-50 .. e-249 (50 oldest dropped)
    expect(errors).toHaveLength(200);
    expect(errors[0].product_id).toBe('e-50');
    expect(errors[errors.length - 1].product_id).toBe('e-249');
    expect(pendings).toHaveLength(10);
    // Pending entries still present despite error cap
    expect(pendings.map((p) => p.product_id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `p-${i}`)
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('when error count <= 200 all errors kept', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    const entries: SyncQueueEntry[] = [];
    for (let i = 0; i < 150; i++) {
      entries.push(makeEntry({ product_id: `e-${i}`, status: 'error', changeset_id: `cs-e-${i}` }));
    }
    entries.push(makeEntry({ product_id: 'p-1', status: 'pending' }));
    repo.save(entries);
    const loaded = repo.load();
    expect(loaded.filter((e) => e.status === 'error')).toHaveLength(150);
    expect(loaded.filter((e) => e.status === 'pending')).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('final cap at 1000 entries after pruning', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    const entries: SyncQueueEntry[] = [];
    for (let i = 0; i < 1200; i++) {
      entries.push(makeEntry({ product_id: `p-${i}`, status: 'pending', changeset_id: `cs-${i}` }));
    }
    repo.save(entries);
    const loaded = repo.load();
    expect(loaded).toHaveLength(1000);
    // Most recent 1000 kept: p-200 .. p-1199
    expect(loaded[0].product_id).toBe('p-200');
    expect(loaded[loaded.length - 1].product_id).toBe('p-1199');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── caching ───────────────────────────────────────────────────────────────

test('load() twice with no write between is served from cache (same array identity)', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    const entries: SyncQueueEntry[] = [
      makeEntry({ product_id: 'p-1', status: 'pending' }),
      makeEntry({ product_id: 'p-2', status: 'pending' }),
    ];
    repo.save(entries);

    const first = repo.load();
    const second = repo.load();
    // Cached: same reference when mtime+size unchanged
    expect(second).toBe(first);

    // Content still correct
    expect(second).toHaveLength(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cache invalidated after save: next load returns fresh data and new identity', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    repo.save([makeEntry({ product_id: 'p-1', status: 'pending', changeset_id: 'cs-1' })]);
    const first = repo.load();
    expect(first).toHaveLength(1);

    // Save new entry — should invalidate cache
    repo.save([
      ...first,
      makeEntry({ product_id: 'p-2', status: 'pending', changeset_id: 'cs-2' }),
    ]);
    const afterSave = repo.load();
    expect(afterSave).toHaveLength(2);
    expect(afterSave).not.toBe(first);
    // Subsequent load without write is cached again
    const cachedAgain = repo.load();
    expect(cachedAgain).toBe(afterSave);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('external file edit invalidates cache via mtime/size', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    repo.save([makeEntry({ product_id: 'p-1', status: 'pending', changeset_id: 'cs-1' })]);
    const first = repo.load();
    expect(first).toHaveLength(1);

    // External edit: directly overwrite the file with different content
    // (simulates git pull / manual edit). Ensure mtime changes by writing
    // after a tick — writeFileSync updates mtime/size, so next stat differs.
    const queuePath = resolve(dir, 'data', 'sync-queue.json');
    const externalEntries: SyncQueueEntry[] = [
      makeEntry({ product_id: 'ext-1', status: 'pending', changeset_id: 'cs-ext-1' }),
      makeEntry({ product_id: 'ext-2', status: 'pending', changeset_id: 'cs-ext-2' }),
    ];
    writeFileSync(queuePath, JSON.stringify({ queue: externalEntries }, null, 2));

    const afterExternal = repo.load();
    expect(afterExternal).not.toBe(first);
    expect(afterExternal).toHaveLength(2);
    expect(afterExternal.map((e) => e.product_id)).toEqual(['ext-1', 'ext-2']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('load returns [] when file absent and does not cache phantom', () => {
  const dir = createTempDir();
  try {
    const repo = new SyncQueueRepository(dir);
    const empty = repo.load();
    expect(empty).toEqual([]);
    // After save, load should return data
    repo.save([makeEntry({ product_id: 'p-1', status: 'pending' })]);
    expect(repo.load()).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
