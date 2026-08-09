import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

test('POST /api/v1/import/apply creates new products', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app),
      payload: {
        products: [{ name: 'Imported', description: 'New', price: 999, category: 'x' }],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ applied: number }>();
    expect(body.applied).toBe(1);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ total: number }>();
    expect(list.total).toBe(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/import/apply updates existing products', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const existing = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      items: Array<{ name: string; description: string }>;
    }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app),
      payload: {
        products: [
          {
            name: existing.items[0].name,
            description: existing.items[0].description,
            price: 1000,
            discount: 100,
            category: 'x',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ applied: number }>();
    expect(body.applied).toBe(1);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ items: Array<{ price: number }> }>();
    expect(list.items[0].price).toBe(1000);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/import/apply rejects invalid products', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app),
      payload: { products: [{ name: '', price: -1 }] },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ errors?: string[]; applied: number; skipped: number }>();
    expect(body.applied).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.errors?.length).toBeGreaterThan(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/import/preview returns full new_products objects, not just a count', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
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
      no_conflicts: number;
      new_products: Array<{ name: string; price: number; category: string }>;
    }>();
    expect(body.no_conflicts).toBe(1);
    expect(body.new_products).toHaveLength(1);
    expect(body.new_products[0].name).toBe('Brand New');
    expect(body.new_products[0].price).toBe(750);
    expect(body.new_products[0].category).toBe('x');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/import/preview returns incoming_by_id for conflicted products', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const existing = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      items: Array<{ id: string; name: string; description: string }>;
    }>();
    const existingId = existing.items[0].id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: {
        products: [
          {
            name: existing.items[0].name,
            description: existing.items[0].description,
            price: 1234,
            category: 'x',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      conflicts: Array<{ product_id: string; field: string }>;
      incoming_by_id: Record<string, { price: number }>;
    }>();
    expect(body.conflicts.some((c) => c.field === 'price')).toBe(true);
    expect(body.incoming_by_id[existingId]).toBeDefined();
    expect(body.incoming_by_id[existingId].price).toBe(1234);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('preview -> apply round trip: resolved conflict + new product, mixed in one apply', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const existing = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      items: Array<{ id: string; name: string; description: string }>;
    }>();
    const existingId = existing.items[0].id;

    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: credHeaders(app),
      payload: {
        products: [
          {
            name: existing.items[0].name,
            description: existing.items[0].description,
            price: 2000, // conflicts with the existing price of 500
            category: 'x',
          },
          { name: 'Second New Product', description: '', price: 300, category: 'x' },
        ],
      },
    });
    const preview = previewRes.json<{
      conflicts: Array<{ product_id: string; field: string }>;
      new_products: Array<Record<string, unknown>>;
      incoming_by_id: Record<string, Record<string, unknown>>;
    }>();
    expect(preview.new_products).toHaveLength(1);
    const priceConflict = preview.conflicts.find((c) => c.field === 'price');
    expect(priceConflict).toBeDefined();

    // Mirror exactly what ImportPage.handleApply now builds: the full
    // incoming object for the resolved conflict, plus the new product as-is,
    // with a resolutions array naming only the resolved field.
    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app),
      payload: {
        products: [preview.incoming_by_id[existingId], ...preview.new_products],
        resolutions: [{ product_id: existingId, field: 'price', resolution: 'incoming' }],
      },
    });
    expect(applyRes.statusCode).toBe(200);
    const applyBody = applyRes.json<{ applied: number; skipped: number }>();
    expect(applyBody.applied).toBe(2); // price field + the new product

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{
      total: number;
      items: Array<{ id: string; name: string; price: number }>;
    }>();
    expect(list.total).toBe(2); // 1 pre-existing (updated in place) + 1 new
    const updated = list.items.find((p) => p.id === existingId)!;
    expect(updated.price).toBe(2000);
    expect(list.items.some((p) => p.name === 'Second New Product')).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolutions protocol skips fields not explicitly resolved to incoming', async () => {
  const dir = resolve(tmpdir(), `cm-import-${Date.now()}`);
  setup(dir);

  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const existing = (await app.inject({ method: 'GET', url: '/api/v1/products' })).json<{
      items: Array<{ id: string; name: string; description: string; price: number }>;
    }>();
    const existingId = existing.items[0].id;
    const originalPrice = existing.items[0].price;

    // Full incoming object differs on both price and stock, but only price
    // is resolved to "incoming" — stock must stay at its local value.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/import/apply',
      headers: credHeaders(app),
      payload: {
        products: [
          {
            name: existing.items[0].name,
            description: existing.items[0].description,
            price: 999,
            stock: false,
            category: 'x',
          },
        ],
        resolutions: [{ product_id: existingId, field: 'price', resolution: 'incoming' }],
      },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const list = getRes.json<{ items: Array<{ id: string; price: number; stock: boolean }> }>();
    const updated = list.items.find((p) => p.id === existingId)!;
    expect(updated.price).toBe(999);
    expect(updated.price).not.toBe(originalPrice);
    expect(updated.stock).toBe(true); // unchanged — "stock" was never resolved

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/change-sets/:id/discard rejects published', async () => {
  const dir = resolve(tmpdir(), `cm-cs-${Date.now()}`);
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

    // Manually set to published via patch
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/change-sets/${cs.id}`,
      headers: credHeaders(app),
      payload: { status: 'published' },
    });

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
  const dir = resolve(tmpdir(), `cm-cs-${Date.now()}`);
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
