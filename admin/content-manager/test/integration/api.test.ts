import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

const validCatalog = {
  version: '20260715-000000',
  last_updated: '2026-07-15T00:00:00.000Z',
  rev: 42,
  products: [
    {
      name: 'Producto A',
      description: 'Producto de prueba',
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
    {
      name: 'Producto B',
      description: 'Otro producto',
      price: 2000,
      discount: 500,
      stock: false,
      category: 'cat2',
      image_path: 'assets/images/b.webp',
      image_avif_path: 'assets/images/b.avif',
      order: 1,
      is_archived: false,
      rev: 2,
      field_last_modified: {},
    },
  ],
};

const validCategories = {
  nav_groups: [{ id: 'g1', active: true, sort_order: 0 }],
  categories: [
    { id: 'c1', key: 'cat1', slug: 'cat-1', active: true, sort_order: 0 },
    { id: 'c2', key: 'cat2', slug: 'cat-2', active: true, sort_order: 1 },
  ],
};

const validStorefront = {
  trustBar: {
    highlights: [{ label: 'Env', value: 'Ok' }],
    statusItems: [{ label: 'Status', value: 'Open' }],
  },
  home: {
    primaryCategories: ['cat1'],
    secondaryCategories: [],
    fallbackQuickPicks: [],
    featuredStaples: [{ category: 'cat1', name: 'Producto A' }],
  },
  bundles: [],
  companionRules: [],
};

test('GET /api/v1/products returns paginated products', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/products' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{ total: number; items: unknown[] }>();
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/products with filter', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/products?q=Producto+A' });
    const body = response.json<{ total: number }>();
    expect(body.total).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/products with out_of_stock filter', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/products?out_of_stock=true' });
    const body = response.json<{ total: number }>();
    expect(body.total).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/products returns discounted_price', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const body = response.json<{
      items: Array<{ discounted_price: number; discount_percentage: number }>;
    }>();

    expect(body.items[0].discounted_price).toBe(1000);
    expect(body.items[0].discount_percentage).toBe(0);
    expect(body.items[1].discounted_price).toBe(1500);
    expect(body.items[1].discount_percentage).toBe(25);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/products/:id returns 404 for missing product', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/products/nonexistent' });
    expect(response.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/categories returns taxonomy', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{ nav_groups: unknown[]; categories: unknown[] }>();
    expect(body.categories).toHaveLength(2);
    expect(body.nav_groups).toHaveLength(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/bootstrap returns capabilities and counts', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/bootstrap' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{ counts: { products: number; categories: number } }>();
    expect(body.counts.products).toBe(2);
    expect(body.counts.categories).toBe(2);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Read-only requests do not mutate files', async () => {
  const dir = createTempDir();
  try {
    const productFile = resolve(dir, 'data', 'product_data.json');
    const catFile = resolve(dir, 'data', 'category_registry.json');
    const sfFile = resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json');

    const originalProducts = JSON.stringify(validCatalog);
    const originalCategories = JSON.stringify(validCategories);
    const originalStorefront = JSON.stringify(validStorefront);

    writeFileSync(productFile, originalProducts);
    writeFileSync(catFile, originalCategories);
    writeFileSync(sfFile, originalStorefront);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    await app.inject({ method: 'GET', url: '/api/v1/products' });
    await app.inject({ method: 'GET', url: '/api/v1/categories' });
    await app.inject({ method: 'GET', url: '/api/v1/storefront/bundles' });
    await app.inject({ method: 'GET', url: '/api/v1/bootstrap' });

    const { readFileSync } = await import('node:fs');
    expect(readFileSync(productFile, 'utf-8')).toBe(originalProducts);
    expect(readFileSync(catFile, 'utf-8')).toBe(originalCategories);
    expect(readFileSync(sfFile, 'utf-8')).toBe(originalStorefront);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/export returns the full catalog for manual export', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), JSON.stringify(validCatalog));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), JSON.stringify(validCategories));
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify(validStorefront)
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/export' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe(validCatalog.version);
    expect(body.products).toHaveLength(validCatalog.products.length);
    expect(body.products[0].name).toBe('Producto A');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
