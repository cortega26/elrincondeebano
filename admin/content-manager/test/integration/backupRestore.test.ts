import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `cm-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

const knownProductContent = JSON.stringify({
  version: 'backup-test',
  last_updated: '2026-07-15T00:00:00.000Z',
  rev: 1,
  products: [
    {
      name: 'Backup Product',
      description: 'For testing',
      price: 999,
      discount: 0,
      stock: true,
      category: 'cat1',
      image_path: '',
      image_avif_path: '',
      order: 0,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    },
  ],
});

const knownCategoryContent = JSON.stringify({
  nav_groups: [{ id: 'g1', active: true, sort_order: 0 }],
  categories: [{ id: 'c1', key: 'cat1', slug: 'cat-1', active: true, sort_order: 0 }],
});

const knownStorefrontContent = JSON.stringify({
  trustBar: { highlights: [], statusItems: [] },
  home: {
    primaryCategories: [],
    secondaryCategories: [],
    fallbackQuickPicks: [],
    featuredStaples: [],
  },
  bundles: [],
  companionRules: [],
});

function setupDir(dir: string): void {
  writeFileSync(resolve(dir, 'data', 'product_data.json'), knownProductContent);
  writeFileSync(resolve(dir, 'data', 'category_registry.json'), knownCategoryContent);
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    knownStorefrontContent
  );
}

test('POST /api/v1/backup creates a timestamped backup', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ backup_id: string; files: string[]; timestamp: string }>();
    expect(body.backup_id).toBeTruthy();
    expect(typeof body.backup_id).toBe('string');
    expect(body.timestamp).toBeTruthy();
    expect(body.files.length).toBeGreaterThanOrEqual(2);

    const backupDir = resolve(dir, 'data', 'backups', body.backup_id);
    expect(existsSync(backupDir)).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/backup lists available backups', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });
    expect(createRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json<{
      backups: Array<{ id: string; files: Array<{ name: string; size: number }> }>;
    }>();
    expect(body.backups.length).toBeGreaterThanOrEqual(1);

    const created = createRes.json<{ backup_id: string }>();
    const found = body.backups.find((b) => b.id === created.backup_id);
    expect(found).toBeDefined();
    expect(found!.files.length).toBeGreaterThanOrEqual(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backed up files match original content', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });
    const { backup_id } = createRes.json<{ backup_id: string }>();

    const backupDir = resolve(dir, 'data', 'backups', backup_id);
    const productBackup = readFileSync(resolve(backupDir, 'product_data.json'), 'utf-8');
    const parsed = JSON.parse(productBackup);
    expect(parsed.products[0].name).toBe('Backup Product');
    expect(parsed.products[0].price).toBe(999);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/backup/:id/restore restores files and creates pre-restore snapshot', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });
    const { backup_id } = createRes.json<{ backup_id: string }>();

    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({
        version: 'modified',
        last_updated: '',
        rev: 99,
        products: [
          {
            name: 'Modified',
            description: 'changed',
            price: 1,
            discount: 0,
            stock: false,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
            rev: 1,
            field_last_modified: {},
          },
        ],
      })
    );

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/backup/${backup_id}/restore`,
      headers: credHeaders(app),
    });

    expect(restoreRes.statusCode).toBe(200);
    const body = restoreRes.json<{ status: string; files: string[] }>();
    expect(body.status).toBe('restored');
    expect(body.files.length).toBeGreaterThanOrEqual(2);

    const productContent = readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf-8');
    const parsed = JSON.parse(productContent);
    expect(parsed.products[0].name).toBe('Backup Product');
    expect(parsed.products[0].price).toBe(999);

    const backupsDir = resolve(dir, 'data', 'backups');
    const entries = readdirSync(backupsDir, { withFileTypes: true });
    const snapshotDirs = entries.filter(
      (e) => e.isDirectory() && e.name.startsWith('pre-restore-')
    );
    expect(snapshotDirs.length).toBeGreaterThanOrEqual(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/backup/:id/restore returns 404 for unknown backup', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/backup/nonexistent-id/restore',
      headers: credHeaders(app),
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('multiple backups are independent', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });
    const { backup_id: id1 } = res1.json<{ backup_id: string }>();

    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({
        version: 'v2',
        last_updated: '',
        rev: 2,
        products: [
          {
            name: 'V2 Product',
            description: 'v2',
            price: 2000,
            discount: 0,
            stock: true,
            category: 'cat2',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
            rev: 2,
            field_last_modified: {},
          },
        ],
      })
    );

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/backup',
      headers: credHeaders(app),
    });
    const { backup_id: id2 } = res2.json<{ backup_id: string }>();

    expect(id1).not.toBe(id2);

    const listRes = await app.inject({ method: 'GET', url: '/api/v1/backup' });
    const body = listRes.json<{ backups: Array<{ id: string }> }>();
    expect(body.backups.length).toBeGreaterThanOrEqual(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
