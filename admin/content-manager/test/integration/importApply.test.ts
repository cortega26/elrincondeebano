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
      payload: { products: [{ name: 'Imported', description: 'New', price: 999 }] },
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
