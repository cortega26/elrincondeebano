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

function makeProduct(id: string, price: number, discount = 0, rev = 1) {
  return {
    name: 'Test Product',
    description: '',
    price,
    discount,
    stock: true,
    category: '',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev,
    field_last_modified: {},
    id,
  };
}

test('ProductService.edit rejects discount > price', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 100, 0));

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { discount: 200 },
  });

  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(422);
  expect(result.error).toContain('Discount');
});

test('ProductService.edit allows discount == price (free product)', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 100, 0));

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { discount: 100 },
  });

  expect(result.ok).toBe(true);
  expect(result.statusCode).toBe(200);
  expect(result.product!.discount).toBe(100);
});

test('ProductService.edit allows discount == 0', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 5000, 0));

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { discount: 0 },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.discount).toBe(0);
});

test('ProductService.edit allows setting discount to 0 on product with existing discount', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 2000, 500, 1));

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { discount: 0 },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.discount).toBe(0);
});

test('ProductService.edit: price = 1, discount = 1 (free product corner case)', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 1, 0, 1));

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { discount: 1 },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.discount).toBe(1);
});
