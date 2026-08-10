import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `cm-perf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

function generateCatalog(productCount: number): string {
  const products = Array.from({ length: productCount }, (_, i) => ({
    name: `Producto ${i + 1}`,
    description: `Descripcion del producto ${i + 1}`,
    price: 1000 + i * 100,
    discount: i % 3 === 0 ? 100 : 0,
    stock: i % 2 === 0,
    category: `cat-${(i % 5) + 1}`,
    image_path: '',
    image_avif_path: '',
    order: i,
    is_archived: false,
    rev: 1,
    field_last_modified: {},
  }));

  return JSON.stringify({
    version: 'perf-test',
    last_updated: '2026-07-15T00:00:00.000Z',
    rev: 1,
    products,
  });
}

function generateCategories(): string {
  return JSON.stringify({
    nav_groups: [
      { id: 'g1', active: true, sort_order: 0 },
      { id: 'g2', active: true, sort_order: 1 },
    ],
    categories: [
      { id: 'c1', key: 'cat-1', slug: 'cat-uno', active: true, sort_order: 0 },
      { id: 'c2', key: 'cat-2', slug: 'cat-dos', active: true, sort_order: 1 },
      { id: 'c3', key: 'cat-3', slug: 'cat-tres', active: true, sort_order: 2 },
      { id: 'c4', key: 'cat-4', slug: 'cat-cuatro', active: true, sort_order: 3 },
      { id: 'c5', key: 'cat-5', slug: 'cat-cinco', active: true, sort_order: 4 },
    ],
  });
}

function generateStorefront(): string {
  return JSON.stringify({
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
}

test('server factory creation < 150ms', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), generateCatalog(1));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), generateCategories());
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      generateStorefront()
    );

    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const app = createApp({ repoRoot: dir, logger: false });
      samples.push(performance.now() - start);
      await app.close();
    }
    samples.sort((a, b) => a - b);
    expect(samples[1]).toBeLessThan(150);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('health route inject < 50ms', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), generateCatalog(1));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), generateCategories());
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      generateStorefront()
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const start = performance.now();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    const elapsed = performance.now() - start;

    expect(response.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(50);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('product list inject with 10 products < 200ms', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), generateCatalog(10));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), generateCategories());
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      generateStorefront()
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const start = performance.now();
    const response = await app.inject({ method: 'GET', url: '/api/v1/products' });
    const elapsed = performance.now() - start;

    expect(response.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('filtered product search inject < 100ms', async () => {
  const dir = createTempDir();
  try {
    writeFileSync(resolve(dir, 'data', 'product_data.json'), generateCatalog(10));
    writeFileSync(resolve(dir, 'data', 'category_registry.json'), generateCategories());
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      generateStorefront()
    );

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const start = performance.now();
    const response = await app.inject({ method: 'GET', url: '/api/v1/products?q=Producto+5' });
    const elapsed = performance.now() - start;

    expect(response.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(100);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
