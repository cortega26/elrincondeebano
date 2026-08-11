import { test, expect } from 'vitest';
import { ProductService } from '../../src/domain/products/productService.ts';
import type { ProductCatalog } from '../../src/shared/schemas/product.ts';
import { generateProductId } from '../../src/shared/identity.ts';

function makeCatalog(rev = 0): ProductCatalog {
  return {
    version: '20260715-test',
    last_updated: '2026-07-15T00:00:00.000Z',
    rev,
    products: [],
  };
}

test('ProductService is disabled by default', () => {
  const service = new ProductService();
  expect(service.isEnabled).toBe(false);
});

test('ProductService enable/disable toggles', () => {
  const service = new ProductService();
  service.enable();
  expect(service.isEnabled).toBe(true);
  service.disable();
  expect(service.isEnabled).toBe(false);
});

test('ProductService.create adds a product', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog(10);
  const result = service.create(catalog, {
    name: 'Nuevo Producto',
    price: 5000,
    description: 'Descripción de prueba',
    category: 'cat1',
  });

  expect(result.ok).toBe(true);
  expect(result.statusCode).toBe(201);
  expect(result.product).toBeDefined();
  expect(result.product!.name).toBe('Nuevo Producto');
  expect(result.product!.price).toBe(5000);
  expect(result.product!.id).toBeDefined();
  expect(result.product!.rev).toBe(1);
  expect(catalog.products).toHaveLength(1);
});

test('ProductService.create assigns sequential order', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  catalog.products.push({
    name: 'First',
    description: '',
    price: 100,
    order: 5,
    rev: 1,
    discount: 0,
    stock: false,
    category: 'cat1',
    image_path: '',
    image_avif_path: '',
    is_archived: false,
    field_last_modified: {},
  });

  const result = service.create(catalog, { name: 'Second', price: 200, category: 'cat1' });
  expect(result.product!.order).toBe(6);
});

test('ProductService.create rejects invalid input', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const result = service.create(catalog, { name: '', price: -1 });
  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(422);
});

test('ProductService.create blocked when disabled', () => {
  const service = new ProductService();
  const catalog = makeCatalog();
  const result = service.create(catalog, { name: 'X', price: 100 });
  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(403);
});

test('ProductService.edit updates fields', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog(5);
  const id = generateProductId();
  catalog.products.push({
    name: 'Original',
    description: '',
    price: 1000,
    discount: 0,
    stock: true,
    category: 'cat1',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 3,
    field_last_modified: {},
    id,
  });

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 3,
    changes: { price: 1500, stock: false },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.price).toBe(1500);
  expect(result.product!.stock).toBe(false);
  expect(result.product!.name).toBe('Original'); // unchanged
  expect(result.changedFields).toContain('price');
  expect(result.changedFields).toContain('stock');
});

test('ProductService.edit rejects stale revision', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push({
    name: 'X',
    description: '',
    price: 100,
    discount: 0,
    stock: true,
    category: 'cat1',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 5,
    field_last_modified: {},
    id,
  });

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 3, // stale!
    changes: { price: 200 },
  });

  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(409);
  expect(result.error).toContain('Stale revision');
});

test('ProductService.edit rejects discount > price', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push({
    name: 'X',
    description: '',
    price: 100,
    discount: 0,
    stock: true,
    category: 'cat1',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 1,
    field_last_modified: {},
    id,
  });

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { discount: 200 },
  });

  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(422);
  expect(result.error).toContain('Discount');
});

test('ProductService.edit returns 404 for missing product', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const result = service.edit(catalog, {
    entityId: 'nonexistent-id',
    baseRevision: 0,
    changes: { name: 'New' },
  });

  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(404);
});

test('ProductService.edit blocked when disabled', () => {
  const service = new ProductService();
  const catalog = makeCatalog();
  const result = service.edit(catalog, { entityId: 'x', baseRevision: 0, changes: {} });
  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(403);
});

test('ProductService.edit archives a product', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push({
    name: 'X',
    description: '',
    price: 100,
    discount: 0,
    stock: true,
    category: 'cat1',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 1,
    field_last_modified: {},
    id,
  });

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { is_archived: true },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.is_archived).toBe(true);
  expect(result.changedFields).toContain('is_archived');
});

test('ProductService.edit preserves identity on rename', () => {
  const service = new ProductService();
  service.enable();

  const originalId = generateProductId();
  const catalog = makeCatalog();
  catalog.products.push({
    name: 'Original Name',
    description: 'Original Desc',
    price: 1000,
    discount: 0,
    stock: true,
    category: 'cat1',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 3,
    field_last_modified: {},
    id: originalId,
  });

  const result = service.edit(catalog, {
    entityId: originalId,
    baseRevision: 3,
    changes: { name: 'New Name', description: 'New Description' },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.id).toBe(originalId);
  expect(result.product!.name).toBe('New Name');
  expect(result.product!.description).toBe('New Description');
});

test('ProductService.edit advances rev and field metadata for discount-only edits (plan 059)', () => {
  const service = new ProductService();
  service.enable();
  const catalog = makeCatalog(10);
  catalog.products.push({
    id: 'descuentable-1',
    name: 'Descuentable',
    description: '',
    price: 1000,
    discount: 0,
    stock: true,
    category: 'x',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 1,
    field_last_modified: {},
  });

  const result = service.edit(catalog, {
    entityId: 'descuentable-1',
    baseRevision: 1,
    changes: { discount: 200 },
  });
  expect(result.ok).toBe(true);
  const product = catalog.products[0];
  expect(product.rev).toBe(2);
  expect(product.field_last_modified.discount?.rev).toBe(2);
  expect(product.field_last_modified.discount?.base_rev).toBe(1);

  // Stock-only edits also advance rev (same fix).
  const stockEdit = service.edit(catalog, {
    entityId: 'descuentable-1',
    baseRevision: 2,
    changes: { stock: false },
  });
  expect(stockEdit.ok).toBe(true);
  expect(catalog.products[0].rev).toBe(3);
  expect(catalog.products[0].field_last_modified.stock?.rev).toBe(3);
});
