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
    category: 'test-category',
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

test('ProductService.edit rejects lowering price below the existing discount', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 1000, 800, 1));

  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { price: 500 },
  });

  expect(result.ok).toBe(false);
  expect(result.statusCode).toBe(422);
  expect(result.error).toContain('Price');
  expect(catalog.products[0].price).toBe(1000); // unchanged — no partial mutation
});

test('ProductService.edit allows a simultaneous price+discount edit that stays valid', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 1000, 800, 1));

  // Price drops to 500 and discount drops to 400 in the same request — the
  // final state is valid even though price alone would fail against the
  // stale (pre-edit) discount of 800.
  const result = service.edit(catalog, {
    entityId: id,
    baseRevision: 1,
    changes: { price: 500, discount: 400 },
  });

  expect(result.ok).toBe(true);
  expect(result.product!.price).toBe(500);
  expect(result.product!.discount).toBe(400);
});

test('ProductService.bulkPreview clamps set_discount_percent to price', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 1000, 0, 1));

  const preview = service.bulkPreview(catalog, {
    action: 'set_discount_percent',
    value: 150,
    product_ids: [id],
  });

  expect(preview.ok).toBe(true);
  expect(preview.changes).toHaveLength(1);
  expect(preview.changes[0].new_value).toBe(1000);
});

test('ProductService.bulkApply clamps set_discount_percent to price', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  catalog.products.push(makeProduct(id, 1000, 0, 1));

  const result = service.bulkApply(catalog, {
    action: 'set_discount_percent',
    value: 150,
    product_ids: [id],
  });

  expect(result.ok).toBe(true);
  expect(catalog.products[0].discount).toBe(1000);
});

// ── plan 102: no-op bulk applies must not bump rev or inflate the count ─────

test('ProductService.bulkApply counts zero and mutates nothing on no-op actions', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const id = generateProductId();
  const product = makeProduct(id, 1000, 100, 1);
  const revBefore = product.rev;
  catalog.products.push(product);

  // Same discount % as already applied (10% of 1000 = 100): no-op.
  const result = service.bulkApply(catalog, {
    action: 'set_discount_percent',
    value: 10,
    product_ids: [id],
  });

  expect(result.ok).toBe(false); // "No changes to apply"
  expect(result.changed).toBe(0);
  expect(product.discount).toBe(100);
  expect(product.rev).toBe(revBefore);
});

test('ProductService.bulkApply applies only changed products and matches the preview count', () => {
  const service = new ProductService();
  service.enable();

  const catalog = makeCatalog();
  const changedId = generateProductId();
  const noopId = generateProductId();
  const changed = makeProduct(changedId, 2000, 0, 1);
  const noop = makeProduct(noopId, 1000, 100, 1);
  const noopRevBefore = noop.rev;
  catalog.products.push(changed, noop);

  // 10% discount: product A (2000, 0) changes to 200; product B (1000, 100)
  // already has 10% — no-op.
  const result = service.bulkApply(catalog, {
    action: 'set_discount_percent',
    value: 10,
    product_ids: [changedId, noopId],
  });

  expect(result.ok).toBe(true);
  expect(result.changed).toBe(1);
  expect(result.changes).toHaveLength(1);
  expect(result.changes[0].product_id).toBe(changedId);
  expect(changed.discount).toBe(200);
  expect(changed.rev).toBe(changed.rev + 0); // bumped exactly once by the apply
  expect(noop.discount).toBe(100);
  expect(noop.rev).toBe(noopRevBefore);
});
