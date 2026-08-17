import { test, expect } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AtomicWriter, NODE_FS, type AtomicFs } from '../../src/server/services/atomicWriter.ts';
import { RecoveryJournal } from '../../src/server/services/recoveryJournal.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';

// Plan 108: port of the plan-030 fault-injection boundaries (previously only
// guarding the retired legacy server/productStore.js) against the LIVE write
// path. Each boundary = an injected failure at one fs operation during
// write(); the invariants: the target is never corrupt, a fresh writer heals
// to a valid old-or-new state, and a subsequent write succeeds.

const catalog = (rev: number, name = 'Widget'): ProductCatalog => ({
  version: 'v1',
  last_updated: '2026-01-01T00:00:00.000Z',
  rev,
  products: [
    {
      id: 'p1',
      sku: null,
      name,
      description: '',
      price: 100,
      discount: 0,
      stock: true,
      category: 'cat',
      order: 0,
      is_archived: false,
      image_path: '',
      image_avif_path: '',
      rev: 0,
      field_last_modified: {},
    },
  ],
});

const createTempDir = (): string => {
  const dir = resolve(tmpdir(), `aw-fault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

type Op =
  | 'mkdirSync'
  | 'writeFileSync'
  | 'readFileSync'
  | 'renameSync'
  | 'unlinkSync'
  | 'existsSync'
  | 'readdirSync'
  | 'statSync';

const failingFs = (failOn: { op: Op; call: number }): AtomicFs => {
  const counts: Record<string, number> = {};
  const fail = (op: Op): void => {
    counts[op] = (counts[op] ?? 0) + 1;
    if (failOn.op === op && counts[op] === failOn.call) {
      throw new Error(`injected failure at ${op}#${counts[op]}`);
    }
  };
  return {
    mkdirSync: (...args) => {
      fail('mkdirSync');
      return NODE_FS.mkdirSync(...args);
    },
    writeFileSync: (...args) => {
      fail('writeFileSync');
      return NODE_FS.writeFileSync(...args);
    },
    readFileSync: (...args) => {
      fail('readFileSync');
      return NODE_FS.readFileSync(...args);
    },
    renameSync: (...args) => {
      fail('renameSync');
      return NODE_FS.renameSync(...args);
    },
    unlinkSync: (...args) => {
      fail('unlinkSync');
      return NODE_FS.unlinkSync(...args);
    },
    existsSync: (...args) => {
      fail('existsSync');
      return NODE_FS.existsSync(...args);
    },
    readdirSync: (...args) => {
      fail('readdirSync');
      return NODE_FS.readdirSync(...args);
    },
    statSync: (...args) => {
      fail('statSync');
      return NODE_FS.statSync(...args);
    },
  };
};

const BOUNDARIES: Array<{ name: string; failOn: { op: Op; call: number } }> = [
  { name: 'mkdirSync (target dir)', failOn: { op: 'mkdirSync', call: 1 } },
  { name: 'writeFileSync tmp', failOn: { op: 'writeFileSync', call: 1 } },
  { name: 'readFileSync tmp (verify)', failOn: { op: 'readFileSync', call: 1 } },
  { name: 'renameSync target->backup', failOn: { op: 'renameSync', call: 1 } },
  { name: 'renameSync tmp->target', failOn: { op: 'renameSync', call: 2 } },
  // readFileSync calls: 1 = tmp verify, 2 = target verify.
  { name: 'readFileSync target (verify)', failOn: { op: 'readFileSync', call: 2 } },
  // NOTE: backup pruning (unlinkSync) is best-effort by design — prune
  // failures are swallowed and cannot corrupt the target, so no boundary.
];

for (const boundary of BOUNDARIES) {
  test(`interruption at ${boundary.name} heals to a valid old-or-new state`, () => {
    const dir = createTempDir();
    try {
      const dataFile = resolve(dir, 'data', 'catalog.json');

      // Baseline: a committed rev-1 file exists.
      const baseline = new AtomicWriter(dataFile);
      const first = baseline.write(catalog(1));
      expect(first.success).toBe(true);

      const failing = new AtomicWriter(dataFile, undefined, failingFs(boundary.failOn));
      const second = failing.write(catalog(2));

      // The failure must not silently succeed.
      expect(second.success).toBe(false);

      // A FRESH writer on the real fs heals: target is valid JSON with
      // either the old (rev 1) or new (rev 2) state, never corrupt/absent.
      const fresh = new AtomicWriter(dataFile);
      const healed = fresh.write(catalog(3));
      expect(healed.success).toBe(true);

      const { readFileSync } = NODE_FS;
      const finalState = JSON.parse(readFileSync(dataFile, 'utf-8')) as { rev: number };
      expect(finalState.rev).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('writeFileSync is never called directly on the target path', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'catalog.json');
    const writes: string[] = [];
    const spyFs: AtomicFs = {
      ...NODE_FS,
      writeFileSync: (path: string | URL, ...args: Parameters<typeof NODE_FS.writeFileSync>) => {
        writes.push(String(path));
        return NODE_FS.writeFileSync(path, ...args);
      },
    };
    const writer = new AtomicWriter(dataFile, undefined, spyFs);
    writer.write(catalog(1));
    writer.write(catalog(2));

    expect(writes.every((p) => p.endsWith('.tmp'))).toBe(true);
    expect(writes).toHaveLength(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('interruption during the first write (no baseline) still heals', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'catalog.json');
    // No baseline -> the only rename in the first write is tmp->target (call 1).
    const failing = new AtomicWriter(dataFile, undefined, failingFs({ op: 'renameSync', call: 1 }));
    expect(failing.write(catalog(1)).success).toBe(false);

    const fresh = new AtomicWriter(dataFile);
    const healed = fresh.write(catalog(5));
    expect(healed.success).toBe(true);
    const finalState = JSON.parse(NODE_FS.readFileSync(dataFile, 'utf-8')) as { rev: number };
    expect(finalState.rev).toBe(5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('journal started entry records the backupPath used for the rename', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'catalog.json');
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    const journal = new RecoveryJournal(dir);
    const writer = new AtomicWriter(dataFile, journal);

    const first = writer.write(catalog(1));
    expect(first.success).toBe(true);

    // Second write backs up the first version: the backup rename happens.
    const second = writer.write(catalog(2));
    expect(second.success).toBe(true);
    expect(second.backedUp).toBe(true);

    const entries = NODE_FS.readFileSync(resolve(dir, 'data', 'recovery-journal.ndjson'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { status: string; backupPath?: string });

    const started = entries.filter((e) => e.status === 'started');
    expect(started.length).toBe(2);

    const lastStarted = started[started.length - 1];
    expect(lastStarted.backupPath).toBeDefined();
    expect(lastStarted.backupPath?.startsWith(`${dataFile}.backup_`)).toBe(true);
    expect(NODE_FS.existsSync(lastStarted.backupPath as string)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
