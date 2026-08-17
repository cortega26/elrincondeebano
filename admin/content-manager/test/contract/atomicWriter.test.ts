import { test, expect, vi, beforeEach } from 'vitest';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AtomicWriter } from '../../src/server/services/atomicWriter.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';

// `renameSync` on `node:fs` can't be spied on directly (ESM named exports
// aren't configurable), so the tmp -> target rename failure is simulated by
// mocking the whole module and wrapping just that one export.
const { renameState } = vi.hoisted(() => ({
  renameState: { failAtCall: null as number | null, callCount: 0 },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      renameState.callCount += 1;
      if (renameState.failAtCall !== null && renameState.callCount === renameState.failAtCall) {
        throw new Error('simulated rename failure');
      }
      return actual.renameSync(...args);
    },
  };
});

beforeEach(() => {
  renameState.failAtCall = null;
  renameState.callCount = 0;
});

function createTempDir(): string {
  const dir = resolve(tmpdir(), `aw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

test('AtomicWriter happy path writes and backs up on the second write', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'catalog.json');
    const writer = new AtomicWriter(dataFile);

    const catalog1: ProductCatalog = { version: 'v1', last_updated: '', rev: 1, products: [] };
    const result1 = writer.write(catalog1);
    expect(result1.success).toBe(true);
    expect(result1.backedUp).toBe(false);

    const catalog2: ProductCatalog = { version: 'v2', last_updated: '', rev: 2, products: [] };
    const result2 = writer.write(catalog2);
    expect(result2.success).toBe(true);
    expect(result2.backedUp).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AtomicWriter restores the previous file when the tmp -> target rename fails', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'catalog.json');
    const writer = new AtomicWriter(dataFile);

    const catalog1: ProductCatalog = { version: 'v1', last_updated: '', rev: 1, products: [] };
    const first = writer.write(catalog1);
    expect(first.success).toBe(true);
    const previousContent = readFileSync(dataFile, 'utf-8');

    // Reset so call counting starts fresh for this write: call 1 is
    // `target -> backup` (must succeed so the restore has something to
    // restore from), call 2 is `tmp -> target` — the one this test
    // simulates failing.
    renameState.callCount = 0;
    renameState.failAtCall = 2;

    const catalog2: ProductCatalog = { version: 'v2', last_updated: '', rev: 2, products: [] };
    const result = writer.write(catalog2);

    expect(result.success).toBe(false);
    // The canonical file must still exist with the previous good content —
    // this is the whole point of the fix: no window where it's absent.
    const restored = readFileSync(dataFile, 'utf-8');
    expect(restored).toBe(previousContent);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AtomicWriter calls the recovery journal on start/complete and on failure', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'catalog.json');
    const journal = {
      startOperation: vi.fn(),
      completeOperation: vi.fn(),
      failOperation: vi.fn(),
      getPendingRecoveries: vi.fn(() => []),
      getUnrecoveredFailures: vi.fn(() => []),
    };
    const writer = new AtomicWriter(dataFile, journal as never);

    const catalog: ProductCatalog = { version: 'v1', last_updated: '', rev: 1, products: [] };
    const result = writer.write(catalog, 'cmd-1');
    expect(result.success).toBe(true);
    expect(journal.startOperation).toHaveBeenCalledWith(
      'atomic-write',
      'catalog.json',
      'cmd-1',
      expect.stringMatching(/^.*catalog\.json\.backup_/)
    );
    expect(journal.completeOperation).toHaveBeenCalledWith('atomic-write', 'catalog.json', 'cmd-1');
    expect(journal.failOperation).not.toHaveBeenCalled();

    renameState.callCount = 0;
    renameState.failAtCall = 2;

    const catalog2: ProductCatalog = { version: 'v2', last_updated: '', rev: 2, products: [] };
    const failed = writer.write(catalog2, 'cmd-2');
    expect(failed.success).toBe(false);
    expect(journal.failOperation).toHaveBeenCalledWith('atomic-write', 'catalog.json', 'cmd-2');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
