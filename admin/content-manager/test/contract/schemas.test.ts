import { test, expect } from 'vitest';
import {
  productSchema,
  productReadSchema,
  productCatalogSchema,
} from '../../src/shared/schemas/product.ts';
import { categoryRegistrySchema } from '../../src/shared/schemas/category.ts';
import { storefrontExperienceSchema } from '../../src/shared/schemas/storefront.ts';

test('productSchema accepts a valid product', () => {
  const product = {
    name: 'Test Product',
    description: 'A test product',
    price: 1000,
    discount: 100,
    stock: true,
    category: 'Test',
    image_path: 'assets/images/test.webp',
    image_avif_path: 'assets/images/test.avif',
    order: 1,
    is_archived: false,
    rev: 5,
    field_last_modified: {
      name: {
        ts: '2026-07-15T00:00:00.000Z',
        by: 'admin',
        rev: 5,
        base_rev: 4,
        changeset_id: null,
      },
    },
  };

  const result = productSchema.safeParse(product);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.name).toBe('Test Product');
    expect(result.data.discounted_price).toBeUndefined();
  }
});

test('productSchema rejects missing name', () => {
  const result = productSchema.safeParse({ price: 1000, description: 'x' });
  expect(result.success).toBe(false);
});

test('productSchema rejects price <= 0', () => {
  const result = productSchema.safeParse({ name: 'x', description: 'x', price: 0 });
  expect(result.success).toBe(false);
});

test('productSchema (write, strict) rejects discount > price', () => {
  const result = productSchema.safeParse({
    name: 'x',
    description: 'x',
    price: 100,
    discount: 150,
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.message.includes('Discount'))).toBe(true);
    expect(result.error.issues.some((i) => i.path.join('.') === 'discount')).toBe(true);
  }
});

test('productSchema (write, strict) allows discount === price', () => {
  const result = productSchema.safeParse({
    name: 'x',
    description: 'x',
    price: 100,
    discount: 100,
    category: 'cat1',
  });
  expect(result.success).toBe(true);
});

test('productSchema (write, strict) rejects an empty category', () => {
  const result = productSchema.safeParse({
    name: 'x',
    description: 'x',
    price: 100,
    category: '',
  });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((i) => i.path.join('.') === 'category')).toBe(true);
  }
});

test('productReadSchema (read, lenient) accepts an empty category — legacy data must still load', () => {
  const result = productReadSchema.safeParse({
    name: 'x',
    description: 'x',
    price: 100,
    category: '',
  });
  expect(result.success).toBe(true);
});

test('productReadSchema (read, lenient) accepts discount > price — legacy data must still load', () => {
  const result = productReadSchema.safeParse({
    name: 'x',
    description: 'x',
    price: 100,
    discount: 200,
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.discount).toBe(200);
    expect(result.data.price).toBe(100);
  }
});

test('productSchema preserves unknown forward-compatible fields', () => {
  const product = {
    name: 'Test',
    description: 'Test',
    price: 1000,
    category: 'cat1',
    brand: 'BrandX',
    thumbnail_path: 'assets/thumbs/x.webp',
  };

  const result = productSchema.safeParse(product);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.brand).toBe('BrandX');
    expect(result.data.thumbnail_path).toBe('assets/thumbs/x.webp');
  }
});

test('productCatalogSchema validates full catalog', () => {
  const catalog = {
    version: '20260715-000000',
    last_updated: '2026-07-15T00:00:00.000Z',
    rev: 42,
    products: [
      { name: 'P1', description: 'Desc', price: 1000 },
      { name: 'P2', description: 'Desc', price: 2000, discount: 500 },
    ],
  };

  const result = productCatalogSchema.safeParse(catalog);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.products).toHaveLength(2);
    expect(result.data.rev).toBe(42);
  }
});

test('productCatalogSchema (read, lenient) still loads a catalog with discount > price', () => {
  const catalog = {
    version: '20260715-000000',
    last_updated: '2026-07-15T00:00:00.000Z',
    rev: 1,
    products: [{ name: 'Legacy', description: 'Desc', price: 100, discount: 300 }],
  };

  const result = productCatalogSchema.safeParse(catalog);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.products[0].discount).toBe(300);
  }
});

test('categoryRegistrySchema validates fixture data', () => {
  const data = {
    nav_groups: [{ id: 'g1', active: true, sort_order: 0 }],
    categories: [{ id: 'c1', key: 'cat1', slug: 'cat-1', active: true, sort_order: 0 }],
  };

  const result = categoryRegistrySchema.safeParse(data);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.nav_groups).toHaveLength(1);
    expect(result.data.categories).toHaveLength(1);
  }
});

test('categoryRegistrySchema requires key on categories', () => {
  const result = categoryRegistrySchema.safeParse({
    categories: [{ id: 'c1', slug: 'x' }],
  });
  expect(result.success).toBe(false);
});

test('storefrontExperienceSchema validates complete experience', () => {
  const data = {
    trustBar: {
      highlights: [{ label: 'Env', value: 'Ok' }],
      statusItems: [{ label: 'Status', value: 'Open' }],
    },
    home: {
      primaryCategories: ['cat1'],
      secondaryCategories: [],
      fallbackQuickPicks: [],
      featuredStaples: [{ category: 'cat1', name: 'Prod1' }],
    },
    bundles: [
      {
        id: 'b1',
        title: 'Bundle 1',
        description: 'A bundle',
        items: [{ category: 'cat1', name: 'Prod1' }],
        bundlePrice: 1000,
      },
    ],
    companionRules: [],
  };

  const result = storefrontExperienceSchema.safeParse(data);
  expect(result.success).toBe(true);
});

test('storefrontExperienceSchema rejects missing trustBar', () => {
  const result = storefrontExperienceSchema.safeParse({});
  expect(result.success).toBe(false);
});

// ── plan 092: image path validation ──────────────────────────────────────────

test('productSchema validates image paths', () => {
  const base = {
    name: 'X',
    description: '',
    price: 1000,
    discount: 0,
    stock: true,
    category: 'cat1',
    is_archived: false,
    rev: 1,
    field_last_modified: {},
  };
  // Plan 154: raster images require AVIF companion — without it the write schema rejects
  expect(productSchema.safeParse({ ...base, image_path: 'assets/images/a.webp' }).success).toBe(
    false
  );
  expect(productSchema.safeParse({ ...base, image_path: 'assets/images/a b.webp' }).success).toBe(
    false
  );
  // With AVIF companion, raster is accepted
  expect(
    productSchema.safeParse({
      ...base,
      image_path: 'assets/images/a.webp',
      image_avif_path: 'assets/images/a.avif',
    }).success
  ).toBe(true);
  expect(
    productSchema.safeParse({
      ...base,
      image_path: 'assets/images/a b.webp',
      image_avif_path: 'assets/images/a b.avif',
    }).success
  ).toBe(true);
  expect(productSchema.safeParse({ ...base, image_path: 'images/a.webp' }).success).toBe(false);
  expect(productSchema.safeParse({ ...base, image_path: 'assets/a.webp' }).success).toBe(false);
  expect(productSchema.safeParse({ ...base, image_path: 'assets/images/a.txt' }).success).toBe(
    false
  );
  expect(productSchema.safeParse({ ...base, image_path: '' }).success).toBe(true);
  // Non-raster (avif itself) does not require companion
  expect(productSchema.safeParse({ ...base, image_path: 'assets/images/a.avif' }).success).toBe(
    true
  );
  expect(
    productSchema.safeParse({ ...base, image_avif_path: 'assets/images/a.avif' }).success
  ).toBe(true);
  expect(
    productSchema.safeParse({ ...base, image_avif_path: 'assets/images/a.webp' }).success
  ).toBe(false);
});

test('productSchema requires AVIF companion for raster images (plan 154)', () => {
  const base = {
    name: 'X',
    description: '',
    price: 1000,
    stock: true,
    category: 'cat1',
    is_archived: false,
    rev: 1,
    field_last_modified: {},
  };
  const rasterWithoutAvif = productSchema.safeParse({
    ...base,
    image_path: 'assets/images/bebidas/Sin Stock.webp',
    image_avif_path: '',
  });
  expect(rasterWithoutAvif.success).toBe(false);
  if (!rasterWithoutAvif.success) {
    expect(rasterWithoutAvif.error.issues.some((i) => i.path.join('.') === 'image_avif_path')).toBe(
      true
    );
  }
  const rasterWithAvif = productSchema.safeParse({
    ...base,
    image_path: 'assets/images/bebidas/Sin Stock.webp',
    image_avif_path: 'assets/images/bebidas/Sin Stock.avif',
  });
  expect(rasterWithAvif.success).toBe(true);
});

test('fieldMetadataSchema enforces strict shape (plan 154)', () => {
  const base = {
    name: 'X',
    description: '',
    price: 1000,
    category: 'cat1',
    stock: true,
    is_archived: false,
    rev: 1,
  };
  // Valid metadata passes
  expect(
    productSchema.safeParse({
      ...base,
      field_last_modified: {
        price: {
          ts: '2026-07-15T00:00:00.000Z',
          by: 'admin',
          rev: 1,
          base_rev: 0,
          changeset_id: null,
        },
      },
    }).success
  ).toBe(true);
  // Missing required ts/by/rev fails on write
  expect(
    productSchema.safeParse({
      ...base,
      field_last_modified: {
        price: { ts: 'invalid', by: '', rev: -1 } as unknown as Record<string, unknown>,
      },
    }).success
  ).toBe(false);
});
