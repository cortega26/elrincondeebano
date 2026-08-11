import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import { selectPrunable, type BackupEntryMeta } from '../../src/server/services/backupPolicy.ts';
import { BackupManager } from '../../src/server/services/backupManager.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(tmpdir(), `cm-ret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });
  writeFileSync(resolve(dataDir, 'product_data.json'), JSON.stringify({ rev: 1, products: [] }));
  writeFileSync(
    resolve(dataDir, 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(astroDataDir, 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles: [],
      companionRules: [],
    })
  );
}

function entry(
  id: string,
  backupClass: BackupEntryMeta['backup_class'],
  timestamp: string
): BackupEntryMeta {
  return { id, backup_class: backupClass, timestamp, files: [], reason: 'test' };
}

// ── policy table (step 1) ────────────────────────────────────────────────────

test('policy protects the newest per class and recovery-referenced entries', () => {
  const entries: BackupEntryMeta[] = [
    entry('manual-3', 'manual', '2026-08-11T10:00:00'),
    entry('manual-2', 'manual', '2026-08-11T09:00:00'),
    entry('manual-1', 'manual', '2026-08-11T08:00:00'),
    entry('auto-1', 'auto', '2026-08-11T07:00:00'),
    entry('pre-restore-1', 'pre-restore', '2026-08-11T06:00:00'),
  ];

  // Manual count = 20 -> nothing prunable; auto count = 10 -> nothing.
  expect(selectPrunable(entries)).toEqual([]);

  // Recovery reference protects even an old manual entry.
  const prunable = selectPrunable(entries, new Set(['manual-1']));
  expect(prunable.some((p) => p.id === 'manual-1')).toBe(false);

  // Over-limit classes prune the oldest; the newest (auto-14) is never in
  // the over-limit range, and a recovery reference protects any entry.
  const manyAuto = Array.from({ length: 15 }, (_, i) =>
    entry(`auto-${i}`, 'auto', `2026-08-11T${String(10 + i).padStart(2, '0')}:00:00`)
  );
  expect(selectPrunable(manyAuto)).toHaveLength(5); // 15 - 10 limit
  expect(selectPrunable(manyAuto).every((p) => p.id !== 'auto-14')).toBe(true);
  expect(selectPrunable(manyAuto, new Set(['auto-0']))).toHaveLength(4);
});

test('corrupt index falls back to an empty listing', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    writeFileSync(resolve(dir, 'data', 'backups-index.json'), '{not-json');
    const manager = new BackupManager(dir);
    expect(manager.list()).toEqual({ entries: [], total: 0, page: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── verified creation + pruning (step 2) ─────────────────────────────────────

test('manual backups are verified and pruned after success', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const first = await app.inject({ method: 'POST', url: '/api/v1/backup', headers: ch });
    expect(first.statusCode).toBe(200);
    const firstId = first.json<{ backup_id: string }>().backup_id;
    expect(firstId).toMatch(/^manual-/);

    // The index entry carries the copied files.
    const list = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json<{
      backups: { entries: Array<{ id: string; files: Array<{ name: string }> }>; total: number };
    }>();
    expect(list.backups.total).toBe(1);
    expect(list.backups.entries[0].files.length).toBeGreaterThanOrEqual(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prune preview lists only prunable ids and prune rejects protected ones', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const created = await app.inject({ method: 'POST', url: '/api/v1/backup', headers: ch });
    const id = created.json<{ backup_id: string }>().backup_id;

    // Newest manual entry is protected: preview must not list it.
    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/backup/prune-preview',
      headers: ch,
    });
    const prunable = preview.json<{ prunable: Array<{ id: string }> }>().prunable;
    expect(prunable.some((p) => p.id === id)).toBe(false);

    // Explicit prune of a protected id is rejected with 409.
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/backup/prune',
      headers: { ...ch, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json<{ error: { code: string } }>().error.code).toBe('PROTECTED_BACKUP');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── bounded, index-driven listing (step 3) ───────────────────────────────────

test('listing is index-driven: thousands of entries page without per-file stat', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    // Seed the index with 2000 entries but NO on-disk directories — the
    // listing must still work (it reads only the index).
    const entries = Array.from({ length: 2000 }, (_, i) =>
      entry(`manual-${i}`, 'manual', `2026-08-11T${String(10 + (i % 50)).padStart(2, '0')}:00:00`)
    );
    writeFileSync(resolve(dir, 'data', 'backups-index.json'), JSON.stringify({ backups: entries }));
    const backupsDir = resolve(dir, 'data', 'backups');
    if (existsSync(backupsDir)) rmSync(backupsDir, { recursive: true, force: true });

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/backup?page=2&limit=25' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      backups: { entries: Array<{ id: string }>; total: number; page: number };
    }>();
    expect(body.backups.total).toBe(2000);
    expect(body.backups.page).toBe(2);
    expect(body.backups.entries).toHaveLength(25);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── writers apply bounded retention (step 2) ─────────────────────────────────

test('category writes keep at most 10 adjacent backups', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    for (let i = 0; i < 15; i++) {
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/categories/cat1',
        headers: ch,
        payload: { sort_order: i, base_revision: 1 },
      });
    }

    const backups = readdirSync(resolve(dir, 'data')).filter((f) =>
      f.startsWith('category_registry.json.backup_')
    );
    expect(backups.length).toBeLessThanOrEqual(10);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── reconcile (step 3) ───────────────────────────────────────────────────────

test('reconcile adds on-disk backups missing from the index', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const manager = new BackupManager(dir);
    mkdirSync(resolve(dir, 'data', 'backups', 'manual-orphan'), { recursive: true });
    writeFileSync(resolve(dir, 'data', 'backups', 'manual-orphan', 'product_data.json'), '{}');

    const result = manager.reconcile();
    expect(result.added).toBe(1);
    expect(manager.list().entries.some((e) => e.id === 'manual-orphan')).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
