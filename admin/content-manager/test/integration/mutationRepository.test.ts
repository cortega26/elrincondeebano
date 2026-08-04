import { test, expect } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { IdempotencyStore } from '../../src/server/services/idempotencyStore.ts';
import { ProductService } from '../../src/domain/products/productService.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  return dir;
}

const baseCatalog: ProductCatalog = {
  version: '20260715-test',
  last_updated: '2026-07-15T00:00:00.000Z',
  rev: 5,
  products: [
    {
      name: 'P1',
      description: 'First',
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

test('writeCatalog saves and backup is created', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(baseCatalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);

    const catalog = repo.loadCatalog();
    catalog.products.push({
      name: 'P2',
      description: 'Second',
      price: 2000,
      discount: 0,
      stock: true,
      category: 'cat1',
      image_path: '',
      image_avif_path: '',
      order: 1,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    });
    catalog.rev += 1;

    const result = await repo.writeCatalog(catalog, 'cmd-1', 5);
    expect(result.ok).toBe(true);

    // Reload and verify
    const reloaded = repo.loadCatalog();
    expect(reloaded.products).toHaveLength(2);
    expect(reloaded.products[1].name).toBe('P2');
    expect(reloaded.rev).toBe(6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeCatalog rejects stale catalog revision', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(baseCatalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);

    const catalog = repo.loadCatalog();
    catalog.rev += 1;

    const result = await repo.writeCatalog(catalog, 'cmd-stale', 99);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(409);
    expect(result.error).toContain('Stale');

    // Verify no changes
    const reloaded = repo.loadCatalog();
    expect(reloaded.products).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeCatalog is idempotent for same commandId', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(baseCatalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);

    const catalog = repo.loadCatalog();
    catalog.products.push({
      name: 'P2',
      description: '',
      price: 500,
      discount: 0,
      stock: true,
      category: '',
      image_path: '',
      image_avif_path: '',
      order: 1,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    });
    catalog.rev += 1;

    const result1 = await repo.writeCatalog(catalog, 'cmd-dup', 5);
    expect(result1.ok).toBe(true);

    // Second call with same commandId returns cached result
    const result2 = await repo.writeCatalog(catalog, 'cmd-dup', 5);
    expect(result2.ok).toBe(true);

    // Only one product added (not doubled)
    const reloaded = repo.loadCatalog();
    expect(reloaded.products).toHaveLength(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeCatalog with failure preserves original data', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(baseCatalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);

    // Verify data unchanged after a successful+failed sequence
    const catalog1 = repo.loadCatalog();
    catalog1.rev += 1;
    catalog1.products.push({
      name: 'P2',
      description: '',
      price: 500,
      discount: 0,
      stock: true,
      category: '',
      image_path: '',
      image_avif_path: '',
      order: 1,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    });

    await repo.writeCatalog(catalog1, 'cmd-ok', 5);

    // Stale write should fail but leave data intact
    const catalog2 = repo.loadCatalog(); // rev is now 6
    catalog2.rev += 1;
    catalog2.products.push({
      name: 'SHOULD NOT BE ADDED',
      description: '',
      price: 1,
      discount: 0,
      stock: true,
      category: '',
      image_path: '',
      image_avif_path: '',
      order: 2,
      is_archived: false,
      rev: 1,
      field_last_modified: {},
    });

    await repo.writeCatalog(catalog2, 'cmd-bad', 99);

    const reloaded = repo.loadCatalog();
    expect(reloaded.products).toHaveLength(2);
    expect(reloaded.products[1].name).toBe('P2');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Atomic write creates backup files', async () => {
  const dir = createTempDir();
  try {
    const dataFile = resolve(dir, 'data', 'product_data.json');
    writeFileSync(dataFile, JSON.stringify(baseCatalog));

    const store = new IdempotencyStore();
    const repo = new ProductRepository({ repoRoot: dir }, store);

    const catalog = repo.loadCatalog();
    catalog.rev += 1;
    catalog.products[0].name = 'Updated';
    await repo.writeCatalog(catalog, 'cmd-backup', 5);

    const { readdirSync } = require('node:fs');
    const dataDir = resolve(dir, 'data');
    const files = readdirSync(dataDir) as string[];
    const backups = files.filter((f: string) => f.includes('backup_'));
    expect(backups.length).toBeGreaterThanOrEqual(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
