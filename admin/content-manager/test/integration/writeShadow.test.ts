import { test, expect } from 'vitest';
import { ProductRepository } from '../../src/server/repositories/productRepository.ts';
import { ProductService } from '../../src/domain/products/productService.ts';
import { IdempotencyStore } from '../../src/server/services/idempotencyStore.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function cloneToTemp(): string {
  const target = resolve(
    tmpdir(),
    `cm-write-shadow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  mkdirSync(target, { recursive: true });
  mkdirSync(resolve(target, 'data'), { recursive: true });

  writeFileSync(
    resolve(target, 'data', 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 3,
      products: [
        {
          name: 'Alpha',
          description: 'First product',
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
          id: 'test-id-1',
        },
        {
          name: 'Beta',
          description: 'Second product',
          price: 2000,
          discount: 500,
          stock: true,
          category: 'cat1',
          image_path: '',
          image_avif_path: '',
          order: 1,
          is_archived: false,
          rev: 2,
          field_last_modified: {},
          id: 'test-id-2',
        },
        {
          name: 'Gamma',
          description: 'Third product',
          price: 3000,
          discount: 0,
          stock: false,
          category: 'cat2',
          image_path: '',
          image_avif_path: '',
          order: 2,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
          id: 'test-id-3',
        },
      ],
    })
  );

  return target;
}

test('Write shadow: create product and verify persistence', async () => {
  const dir = cloneToTemp(); // use fixture data as source
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  const originalCount = catalog.products.length;
  const originalRev = catalog.rev;

  const result = service.create(catalog, {
    name: 'Shadow Product',
    price: 9999,
    description: 'Created during write shadow test',
    category: 'cat1',
  });

  expect(result.ok).toBe(true);
  expect(result.product).toBeDefined();
  expect(result.product!.id).toBeDefined();
  expect(result.product!.name).toBe('Shadow Product');

  catalog.rev += 1;
  const baseRev = originalRev;

  const writeResult = await repo.writeCatalog(catalog, `shadow-create-${Date.now()}`, baseRev);
  expect(writeResult.ok).toBe(true);

  const reloaded = repo.loadCatalog();
  expect(reloaded.products.length).toBe(originalCount + 1);

  rmSync(dir, { recursive: true, force: true });
});

test('Write shadow: edit product and verify revision change', async () => {
  const dir = cloneToTemp();
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  const firstProduct = catalog.products[0];
  const originalRev = firstProduct.rev;
  const catalogRev = catalog.rev;

  const result = service.edit(catalog, {
    entityId: firstProduct.id ?? firstProduct.name,
    baseRevision: originalRev,
    changes: { name: 'Shadow Renamed', description: 'Modified by shadow test' },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.name).toBe('Shadow Renamed');
  expect(result.product!.id).toBe(firstProduct.id);

  catalog.rev += 1;
  const writeResult = await repo.writeCatalog(catalog, `shadow-edit-${Date.now()}`, catalogRev);
  expect(writeResult.ok).toBe(true);

  rmSync(dir, { recursive: true, force: true });
});

test('Write shadow: archive product', async () => {
  const dir = cloneToTemp();
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  const target = catalog.products.find((p) => !p.is_archived);
  if (!target) return; // skip if all archived

  const catalogRev = catalog.rev;

  const result = service.edit(catalog, {
    entityId: target.id ?? target.name,
    baseRevision: target.rev,
    changes: { is_archived: true },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.is_archived).toBe(true);

  catalog.rev += 1;
  const writeResult = await repo.writeCatalog(catalog, `shadow-archive-${Date.now()}`, catalogRev);
  expect(writeResult.ok).toBe(true);

  const reloaded = repo.loadCatalog();
  const archived = reloaded.products.find((p) => p.id === target.id);
  expect(archived?.is_archived).toBe(true);

  rmSync(dir, { recursive: true, force: true });
});

test('Write shadow: reorder products', async () => {
  const dir = cloneToTemp();
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  if (catalog.products.length < 2) return;

  const ids = catalog.products.map((p) => p.id!).filter(Boolean);
  if (ids.length < 2) return;

  const baseRev = catalog.rev;
  const reorderResult = service.reorder(catalog, ids.reverse());

  expect(reorderResult.ok).toBe(true);
  expect(reorderResult.reordered).toBeGreaterThanOrEqual(1);

  catalog.rev += 1;
  const writeResult = await repo.writeCatalog(catalog, `shadow-reorder-${Date.now()}`, baseRev);
  expect(writeResult.ok).toBe(true);

  rmSync(dir, { recursive: true, force: true });
});

test('Write shadow: bulk discount operation', async () => {
  const dir = cloneToTemp();
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  const ids = catalog.products.map((p) => p.id!).filter(Boolean);
  if (ids.length === 0) return;

  const baseRev = catalog.rev;
  const preview = service.bulkPreview(catalog, {
    action: 'set_discount_percent',
    value: 10,
    product_ids: ids,
  });

  expect(preview.ok).toBe(true);
  expect(preview.changes.length).toBeGreaterThan(0);

  const applyResult = service.bulkApply(catalog, {
    action: 'set_discount_percent',
    value: 10,
    product_ids: ids,
  });

  expect(applyResult.ok).toBe(true);
  expect(applyResult.changed).toBeGreaterThan(0);

  catalog.rev += 1;
  const writeResult = await repo.writeCatalog(catalog, `shadow-bulk-${Date.now()}`, baseRev);
  expect(writeResult.ok).toBe(true);

  rmSync(dir, { recursive: true, force: true });
});

test('Write shadow: stale revision returns 409', async () => {
  const dir = cloneToTemp();
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  if (catalog.products.length === 0) return;

  const target = catalog.products[0];
  const result = service.edit(catalog, {
    entityId: target.id ?? target.name,
    baseRevision: 99999, // very stale
    changes: { name: 'SHOULD NOT APPLY' },
  });

  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(409);

  // Verify catalog not written
  const reread = repo.loadCatalog();
  expect(reread.products[0].name).toBe(target.name);

  rmSync(dir, { recursive: true, force: true });
});

test('Write shadow: idempotent command ID', async () => {
  const dir = cloneToTemp();
  const store = new IdempotencyStore();
  const repo = new ProductRepository({ repoRoot: dir }, store);
  const service = new ProductService();
  service.enable();

  const catalog = repo.loadCatalog();
  const baseRev = catalog.rev;

  service.create(catalog, { name: 'Idempotent Test', price: 500, category: 'cat1' });
  catalog.rev += 1;

  const writeResult1 = await repo.writeCatalog(catalog, 'dup-cmd', baseRev);
  expect(writeResult1.ok).toBe(true);

  // Second write with same command ID should return cached result
  const writeResult2 = await repo.writeCatalog(catalog, 'dup-cmd', baseRev);
  expect(writeResult2.ok).toBe(true);

  // Only one product added
  const reloaded = repo.loadCatalog();
  const idempotents = reloaded.products.filter((p) => p.name === 'Idempotent Test');
  expect(idempotents.length).toBe(1);

  rmSync(dir, { recursive: true, force: true });
});
