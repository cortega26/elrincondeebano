import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as Record<string, unknown>).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(tmpdir(), `cm-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function setup(dir: string): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });

  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 0,
      products: [
        {
          id: 'existing-1',
          name: 'Existing',
          description: 'Old',
          price: 500,
          discount: 0,
          stock: true,
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

function readCatalogOnDisk(dir: string): { rev: number; products: Array<{ name: string }> } {
  return JSON.parse(readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf8'));
}

// ── preview ──────────────────────────────────────────────────────────────────

test('POST /api/v1/import/preview binds input with hash, base rev and summary', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: {
        products: [{ name: 'Brand New', description: '', price: 750, category: 'x' }],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      preview_id: string;
      input_hash: string;
      base_rev: number;
      summary: {
        additions: number;
        updates: number;
        unchanged: number;
        invalid: number;
        conflicts: number;
      };
      additions: Array<{ name: string; price: number; category: string }>;
    }>();
    expect(body.preview_id).toMatch(/^import-/);
    expect(body.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.base_rev).toBe(0);
    expect(body.summary.additions).toBe(1);
    expect(body.additions).toHaveLength(1);
    expect(body.additions[0].name).toBe('Brand New');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preview reports conflicted products with full updates and per-field conflicts', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: {
        products: [
          {
            name: 'Existing',
            description: 'Old',
            price: 1234,
            discount: 0,
            stock: true,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      summary: { conflicts: number; updates: number };
      updates: Array<{ price: number }>;
      conflicts: Array<{ product_id: string; field: string }>;
    }>();
    expect(body.summary.updates).toBe(1);
    expect(body.summary.conflicts).toBe(1);
    expect(body.updates[0].price).toBe(1234);
    expect(body.conflicts[0].field).toBe('price');
    expect(body.conflicts[0].product_id).toBe('existing-1');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preview reports invalid records as validation_errors without blocking', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: { products: [{ name: '', price: -1 }] },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      summary: { invalid: number };
      validation_errors: Array<{ message: string }>;
    }>();
    expect(body.summary.invalid).toBe(1);
    expect(body.validation_errors.length).toBeGreaterThan(0);
    expect(body.validation_errors[0].message.length).toBeGreaterThan(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── apply ────────────────────────────────────────────────────────────────────

test('apply: new-only import creates products atomically', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: { products: [{ name: 'Imported', description: 'New', price: 999, category: 'x' }] },
    });
    const previewId = preview.json<{ preview_id: string }>().preview_id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: { preview_id: previewId, resolutions: [] },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      created: number;
      updated: number;
      skipped: number;
      resulting_revision: number;
    }>();
    expect(body.created).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.resulting_revision).toBe(1);

    const onDisk = readCatalogOnDisk(dir);
    expect(onDisk.rev).toBe(1);
    expect(onDisk.products.some((p) => p.name === 'Imported')).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply: update-only with use_incoming resolution', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: {
        products: [
          {
            name: 'Existing',
            description: 'Old',
            price: 1000,
            discount: 0,
            stock: true,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
          },
        ],
      },
    });
    const p = preview.json<{
      preview_id: string;
      conflicts: Array<{ product_id: string; field: string }>;
    }>();
    const priceConflict = p.conflicts.find((c) => c.field === 'price')!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: {
        preview_id: p.preview_id,
        resolutions: [
          { product_id: priceConflict.product_id, field: 'price', resolution: 'use_incoming' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ created: number; updated: number }>();
    expect(body.created).toBe(0);
    expect(body.updated).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      items: Array<{ id: string; price: number }>;
    }>();
    expect(list.items.find((i) => i.id === 'existing-1')?.price).toBe(1000);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply: keep-local-only skips all fields without writing', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: {
        products: [
          {
            name: 'Existing',
            description: 'Old',
            price: 777,
            discount: 0,
            stock: true,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
          },
        ],
      },
    });
    const p = preview.json<{
      preview_id: string;
      conflicts: Array<{ product_id: string; field: string }>;
    }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: {
        preview_id: p.preview_id,
        resolutions: p.conflicts.map((c) => ({
          product_id: c.product_id,
          field: c.field,
          resolution: 'keep_local' as const,
        })),
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ created: number; updated: number; skipped: number }>();
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(1);
    expect(readCatalogOnDisk(dir).rev).toBe(0); // no-op: no write

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply: mixed new + resolved update in a single bound apply', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: {
        products: [
          {
            name: 'Existing',
            description: 'Old',
            price: 2000,
            discount: 0,
            stock: true,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
          },
          { name: 'Second New Product', description: '', price: 300, category: 'x' },
        ],
      },
    });
    const p = preview.json<{
      preview_id: string;
      conflicts: Array<{ product_id: string; field: string }>;
    }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: {
        preview_id: p.preview_id,
        resolutions: [{ product_id: 'existing-1', field: 'price', resolution: 'use_incoming' }],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ created: number; updated: number }>();
    expect(body.created).toBe(1);
    expect(body.updated).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      total: number;
      items: Array<{ id: string; price: number }>;
    }>();
    expect(list.total).toBe(2);
    expect(list.items.find((i) => i.id === 'existing-1')?.price).toBe(2000);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply: no-op import returns zeros without bumping the revision', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: {
        products: [
          {
            name: 'Existing',
            description: 'Old',
            price: 500,
            discount: 0,
            stock: true,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
          },
        ],
      },
    });
    const p = preview.json<{ preview_id: string }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: { preview_id: p.preview_id, resolutions: [] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ created: number; updated: number; skipped: number }>();
    expect(body.created).toBe(0);
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
    expect(readCatalogOnDisk(dir).rev).toBe(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply rejects an unknown preview id (404)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app),
      payload: { preview_id: 'import-does-not-exist', resolutions: [] },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply rejects unresolved conflicts (422) and tampered resolution fields are ignored', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: {
        products: [
          {
            name: 'Existing',
            description: 'Old',
            price: 999,
            discount: 0,
            stock: true,
            category: 'x',
            image_path: '',
            image_avif_path: '',
            order: 0,
            is_archived: false,
          },
        ],
      },
    });
    const p = preview.json<{ preview_id: string }>();

    // Missing resolution for the price conflict.
    const unresolved = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: { preview_id: p.preview_id, resolutions: [] },
    });
    expect(unresolved.statusCode).toBe(422);

    // Resolution for a field that is not in the preview is dropped — the
    // product must stay untouched.
    const tampered = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: {
        preview_id: p.preview_id,
        resolutions: [
          { product_id: 'existing-1', field: 'price', resolution: 'use_incoming' },
          { product_id: 'existing-1', field: 'name', resolution: 'use_incoming' },
        ],
      },
    });
    expect(tampered.statusCode).toBe(200);
    const list = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      items: Array<{ id: string; name: string }>;
    }>();
    const updated = list.items.find((i) => i.id === 'existing-1')!;
    expect(updated.name).toBe('Existing'); // name field was not in the conflicts

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('apply rejects a stale base revision with 409 and leaves the catalog untouched', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: ch,
      payload: { products: [{ name: 'Imported', description: '', price: 999, category: 'x' }] },
    });
    const previewId = preview.json<{ preview_id: string }>().preview_id;
    const before = readCatalogOnDisk(dir);

    // Bump the catalog revision between preview and apply.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/products/existing-1',
      headers: ch,
      payload: { command_id: 'cmd-stale-import', base_revision: 1, payload: { price: 600 } },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: ch,
      payload: { preview_id: previewId, resolutions: [] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('CONFLICT');

    // No import artifacts landed.
    const after = readCatalogOnDisk(dir);
    expect(after.products.some((p) => p.name === 'Imported')).toBe(false);
    expect(after.rev).toBe(before.rev + 1); // only the PATCH write

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preview survives a server restart and apply still works (durable preview)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app1 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app1.ready();
    const preview = await app1.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app1),
      payload: {
        products: [{ name: 'After Restart', description: '', price: 111, category: 'x' }],
      },
    });
    const previewId = preview.json<{ preview_id: string }>().preview_id;
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app2.ready();
    const res = await app2.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app2),
      payload: { preview_id: previewId, resolutions: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ created: number }>().created).toBe(1);
    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('import apply requires a credential (401) — non-loopback only; loopback bypasses', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const loopback = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      payload: { preview_id: 'import-any', resolutions: [] },
    });
    // Loopback bypass (2026-08-29)
    expect(loopback.statusCode).not.toBe(401);
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: { host: '192.168.1.10:3000' },
      payload: { preview_id: 'import-any', resolutions: [] },
    });
    expect([401, 403].includes(blocked.statusCode)).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('import routes are rejected in read-only mode (405)', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: false, logger: false });
    await app.ready();

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      payload: { products: [] },
    });
    expect(preview.statusCode).toBe(405);

    const apply = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      payload: { preview_id: 'import-any', resolutions: [] },
    });
    expect(apply.statusCode).toBe(405);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── change sets (unchanged from plan 073) ────────────────────────────────────

test('POST /api/v1/change-sets/:id/discard rejects published', async () => {
  const dir = createTempDir();
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: credHeaders(app),
      payload: { product_ops: [] },
    });
    const cs = create.json<{ id: string }>();

    // Walk the legal transition chain up to published (plan 062: no
    // arbitrary status assignment).
    for (const status of ['validating', 'validated', 'publishing', 'published']) {
      const hop = await app.inject({
        method: 'PATCH',
        url: `/api/v1/change-sets/${cs.id}`,
        headers: credHeaders(app),
        payload: { status },
      });
      expect(hop.statusCode).toBe(200);
    }

    const discard = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${cs.id}/discard`,
      headers: credHeaders(app),
    });
    expect(discard.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/change-sets/:id/discard allows draft', async () => {
  const dir = createTempDir();
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/change-sets',
      headers: credHeaders(app),
      payload: { product_ops: [] },
    });
    const cs = create.json<{ id: string }>();

    const discard = await app.inject({
      method: 'POST',
      url: `/api/v1/change-sets/${cs.id}/discard`,
      headers: credHeaders(app),
    });
    expect(discard.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
