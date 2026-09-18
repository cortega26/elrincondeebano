// Plan 188: stable sync-enqueue dedup — scalar fields short-circuit, the one
// signature built is key-order-insensitive, and reordered-but-identical
// updates do not duplicate (the old JSON.stringify comparison did).
import { test, expect, vi, afterEach } from 'vitest';
import { SyncService, stableStringify } from '../../src/server/services/syncService.ts';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

afterEach(() => {
  vi.useRealTimers();
});

test('stableStringify is order-insensitive for objects, ordered for arrays', () => {
  expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  expect(stableStringify({ x: { d: 4, c: 3 } })).toBe(stableStringify({ x: { c: 3, d: 4 } }));
  expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  expect(stableStringify(null)).toBe('null');
});

function createService(): { service: SyncService; dir: string } {
  const dir = resolve(
    tmpdir(),
    `cm-sync-dedup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  const service = new SyncService(dir, { isConfigured: true } as never, {} as never);
  return { service, dir };
}

test('enqueue dedupes identical updates even with reordered keys', () => {
  const { service, dir } = createService();
  try {
    expect(service.enqueue('p1', 3, { price: 100, stock: true }, {})).toBe(true);
    expect(service.enqueue('p1', 3, { price: 100, stock: true }, {})).toBe(false);
    // Same update, different key insertion order: still a duplicate.
    expect(service.enqueue('p1', 3, { stock: true, price: 100 }, {})).toBe(false);
    expect(service.getQueue()).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('enqueue distinguishes revisions and products', () => {
  const { service, dir } = createService();
  try {
    expect(service.enqueue('p1', 3, { price: 100 }, {})).toBe(true);
    expect(service.enqueue('p1', 4, { price: 100 }, {})).toBe(true);
    expect(service.enqueue('p2', 3, { price: 100 }, {})).toBe(true);
    expect(service.getQueue()).toHaveLength(3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
