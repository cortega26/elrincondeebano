import { test, expect } from 'vitest';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { CategoryRepository } from '../../src/server/repositories/categoryRepository.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `content-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

const validCatalog = {
  version: '20260715-000000',
  last_updated: '2026-07-15T00:00:00.000Z',
  rev: 42,
  products: [
    {
      name: 'Producto A',
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
    {
      name: 'Producto B',
      description: 'Segundo producto',
      price: 2000,
      discount: 500,
      stock: false,
      category: 'cat1',
      image_path: 'assets/images/b.webp',
      image_avif_path: 'assets/images/b.avif',
      order: 1,
      is_archived: false,
      rev: 2,
      field_last_modified: {},
    },
    {
      name: 'Archivado',
      description: 'Archived product',
      price: 500,
      discount: 0,
      stock: false,
      category: 'cat2',
      image_path: '',
      image_avif_path: '',
      order: 2,
      is_archived: true,
      rev: 1,
      field_last_modified: {},
    },
  ],
};

test('ProductRepository loads a valid catalog', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(validCatalog), 'utf-8');

    const repo = new ProductRepository({ repoRoot: dir });
    const catalog = repo.loadCatalog();

    expect(catalog.products).toHaveLength(3);
    expect(catalog.rev).toBe(42);
    expect(catalog.products[0].name).toBe('Producto A');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository throws for missing file', () => {
  const dir = createTempDir();
  try {
    const repo = new ProductRepository({ repoRoot: dir });
    expect(() => repo.loadCatalog()).toThrow(/not found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository throws for invalid JSON', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, 'not json', 'utf-8');

    const repo = new ProductRepository({ repoRoot: dir });
    expect(() => repo.loadCatalog()).toThrow(/Invalid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository validates schema', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(
      dataFile,
      JSON.stringify({
        version: '1',
        last_updated: 'x',
        rev: 0,
        products: [{ name: '', description: 'x', price: -1 }],
      }),
      'utf-8'
    );

    const repo = new ProductRepository({ repoRoot: dir });
    expect(() => repo.loadCatalog()).toThrow(/Schema validation failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository.getAll returns paginated results', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(validCatalog), 'utf-8');

    const repo = new ProductRepository({ repoRoot: dir });
    const page1 = repo.getAll(1, 2);

    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.items[0].name).toBe('Producto A');
    expect(page1.items[1].name).toBe('Producto B');

    const page2 = repo.getAll(2, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].name).toBe('Archivado');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository.getAll filters by archived', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(validCatalog), 'utf-8');

    const repo = new ProductRepository({ repoRoot: dir });
    const { items, total } = repo.getAll(1, 50, { archived: true });
    expect(total).toBe(1);
    expect(items[0].name).toBe('Archivado');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository.getAll filters by text search', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(validCatalog), 'utf-8');

    const repo = new ProductRepository({ repoRoot: dir });
    const { items, total } = repo.getAll(1, 50, { q: 'Segundo' });
    expect(total).toBe(1);
    expect(items[0].name).toBe('Producto B');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ProductRepository getAll does not mutate data', () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    const original = JSON.stringify(validCatalog);
    writeFileSync(dataFile, original, 'utf-8');

    const repo = new ProductRepository({ repoRoot: dir });
    const result = repo.getAll(1, 50);
    // Accessing items shouldn't change the file
    void result.items;

    const after = require('node:fs').readFileSync(dataFile, 'utf-8');
    expect(after).toBe(original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const validCategories = {
  nav_groups: [{ id: 'g1', active: true, sort_order: 0 }],
  categories: [
    { id: 'c1', key: 'cat1', slug: 'cat-1', active: true, sort_order: 0 },
    { id: 'c2', key: 'cat2', slug: 'cat-2', active: true, sort_order: 1 },
  ],
};

test('CategoryRepository loads valid registry', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    const registryFile = resolve(dir, 'data', 'category_registry.json');
    writeFileSync(registryFile, JSON.stringify(validCategories), 'utf-8');

    const repo = new CategoryRepository({ repoRoot: dir });
    const registry = repo.load();

    expect(registry.categories).toHaveLength(2);
    expect(registry.nav_groups).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CategoryRepository throws for missing file', () => {
  const dir = createTempDir();
  try {
    const repo = new CategoryRepository({ repoRoot: dir });
    expect(() => repo.load()).toThrow(/No category source found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CategoryRepository getByKey finds category', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    const registryFile = resolve(dir, 'data', 'category_registry.json');
    writeFileSync(registryFile, JSON.stringify(validCategories), 'utf-8');

    const repo = new CategoryRepository({ repoRoot: dir });
    const cat = repo.getByKey('cat1');
    expect(cat).toBeDefined();
    expect(cat!.id).toBe('c1');

    const missing = repo.getByKey('nonexistent');
    expect(missing).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CategoryRepository does not mutate data on read', () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'data'), { recursive: true });
    const registryFile = resolve(dir, 'data', 'category_registry.json');
    const original = JSON.stringify(validCategories);
    writeFileSync(registryFile, original, 'utf-8');

    const repo = new CategoryRepository({ repoRoot: dir });
    void repo.load();

    const after = require('node:fs').readFileSync(registryFile, 'utf-8');
    expect(after).toBe(original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
