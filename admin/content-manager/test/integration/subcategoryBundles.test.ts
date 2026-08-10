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
  const dir = resolve(
    tmpdir(),
    `cm-sub-bundle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

const baseCatalog = {
  version: '20260715-test',
  last_updated: '2026-07-15T00:00:00.000Z',
  rev: 5,
  products: [
    {
      name: 'Producto Uno',
      description: 'Primer producto',
      price: 1000,
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
};

const baseCategories = {
  nav_groups: [],
  categories: [
    {
      id: 'cat1',
      key: 'bebidas',
      slug: 'bebidas',
      display_name: { default: 'Bebidas' },
      nav_group: 'g1',
      sort_order: 0,
      active: true,
      subcategories: [],
    },
  ],
};

const baseStorefront = {
  trustBar: { highlights: [], statusItems: [] },
  home: {
    primaryCategories: [],
    secondaryCategories: [],
    fallbackQuickPicks: [],
    featuredStaples: [],
  },
  bundles: [
    {
      id: 'combo-1',
      title: 'Combo original',
      description: 'Original bundle',
      items: [{ category: 'cat1', name: 'Producto Uno' }],
      bundlePrice: 1500,
    },
  ],
  companionRules: [],
};

function setupDir(dir: string): void {
  writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(baseCatalog));
  writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(baseCategories));
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify(baseStorefront)
  );
}

test('POST /api/v1/categories/:categoryId/subcategories creates a subcategory', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/cat1/subcategories',
      headers: credHeaders(app),
      payload: { id: 'sub-1', title: 'Sub Uno', product_key: 'sub-uno', slug: 'sub-uno' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; title: string }>();
    expect(body.id).toBe('sub-1');
    expect(body.title).toBe('Sub Uno');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DELETE /api/v1/categories/:categoryId/subcategories/:subId removes it', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app1 = createApp({ repoRoot: dir, enableWrites: true });
    await app1.ready();

    const createRes = await app1.inject({
      method: 'POST',
      url: '/api/v1/categories/cat1/subcategories',
      headers: credHeaders(app1),
      payload: { id: 'sub-del', title: 'Para eliminar', product_key: 'sub-del', slug: 'sub-del' },
    });
    expect(createRes.statusCode).toBe(201);
    await app1.close();

    const app2 = createApp({ repoRoot: dir, enableWrites: true });
    await app2.ready();

    const deleteRes = await app2.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat1/subcategories/sub-del',
      headers: credHeaders(app2),
    });
    expect(deleteRes.statusCode).toBe(204);

    await app2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PUT /api/v1/storefront/bundles updates bundles', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: credHeaders(app),
      payload: {
        bundles: [
          {
            id: 'combo-updated',
            title: 'Updated Bundle',
            description: 'Changed',
            items: [{ category: 'cat1', name: 'Producto Uno' }],
            bundlePrice: 2000,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ bundle_count: number }>();
    expect(body.bundle_count).toBe(1);

    const getRes = await app.inject({ method: 'GET', url: '/api/v1/storefront/bundles' });
    const getBody = getRes.json<{ bundles: Array<{ id: string }> }>();
    expect(getBody.bundles).toHaveLength(1);
    expect(getBody.bundles[0].id).toBe('combo-updated');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST subcategory returns 405 when writes disabled', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/cat1/subcategories',
      payload: { id: 'sub-x', title: 'X', product_key: 'x', slug: 'x' },
    });
    expect(response.statusCode).toBe(405);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PATCH subcategory returns 405 when writes disabled', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/categories/cat1/subcategories/sub-1',
      payload: { title: 'Nuevo' },
    });
    expect(response.statusCode).toBe(405);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DELETE subcategory returns 405 when writes disabled', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/v1/categories/cat1/subcategories/sub-1',
    });
    expect(response.statusCode).toBe(405);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST subcategory reorder returns 405 when writes disabled', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/categories/cat1/subcategories/reorder',
      payload: { ordered_ids: ['sub-1'] },
    });
    expect(response.statusCode).toBe(405);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PUT bundles returns 405 when writes disabled', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: false });
    await app.ready();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      payload: { bundles: [] },
    });

    expect(response.statusCode).toBe(405);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST nav-groups returns 400 and does not corrupt the registry when body is missing', async () => {
  const dir = createTempDir();
  try {
    setupDir(dir);
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/nav-groups',
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(400);

    const registry = JSON.parse(
      readFileSync(resolve(dir, 'data', 'category_registry.json'), 'utf-8')
    ) as { nav_groups: unknown[] };
    expect(registry.nav_groups).toHaveLength(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
