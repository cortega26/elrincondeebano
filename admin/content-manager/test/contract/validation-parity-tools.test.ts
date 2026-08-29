import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

import { productSchema, productCatalogSchema } from '../../src/shared/schemas/product.ts';

const require = createRequire(import.meta.url);
const { validateProduct } = require('../../../../tools/utils/product-contract.js') as {
  validateProduct: (
    product: unknown,
    index: number,
    opts?: { knownCategoryKeys?: Set<string> }
  ) => string[];
};

const fixturePath = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'plans',
  'fixtures',
  '055',
  'product_catalog.json'
);
const categoryFixturePath = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'plans',
  'fixtures',
  '055',
  'category_registry.json'
);

test('parity: admin zod ⊇ tools validator — fixture corpus agreement (plan 154)', () => {
  const raw = readFileSync(fixturePath, 'utf-8');
  const data = JSON.parse(raw) as { products: unknown[] };
  const catRaw = readFileSync(categoryFixturePath, 'utf-8');
  const catData = JSON.parse(catRaw);
  const knownKeys = new Set(
    (catData.categories as Array<{ key: string }>)
      .map((c) => String(c.key).trim().toLowerCase())
      .filter(Boolean)
  );

  // Catalog-level: both should accept fixture catalog via lenient read
  const zodCatalog = productCatalogSchema.safeParse(data);
  expect(zodCatalog.success).toBe(true);

  for (const product of data.products as Array<Record<string, unknown>>) {
    const zodRes = productSchema.safeParse(product);
    const toolsErrors = validateProduct(product, 0, { knownCategoryKeys: knownKeys });
    const toolsValid = toolsErrors.length === 0;
    const zodValid = zodRes.success;

    // ⊇ means: if tools rejects, zod must also reject. If zod accepts, tools may still reject? No, superset means zod rejects at least those tools rejects.
    // For fixture, we expect exact agreement because fixture was designed before AVIF rule:
    // 2 products missing AVIF should be rejected by both, rest accepted by both.
    expect(zodValid).toBe(toolsValid);
  }
});

test('parity: synthetic corpus — admin and tools agree on accept/reject', () => {
  const knownKeys = new Set(['abarrotes', 'bebidas']);

  const cases: Array<{ product: Record<string, unknown>; shouldBeValid: boolean }> = [
    {
      product: {
        name: 'Valid',
        description: 'ok',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'abarrotes',
        image_path: 'assets/images/abarrotes/valid.webp',
        image_avif_path: 'assets/images/abarrotes/valid.avif',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {},
      },
      shouldBeValid: true,
    },
    {
      product: {
        name: 'Raster missing AVIF',
        description: 'ok',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'abarrotes',
        image_path: 'assets/images/abarrotes/raster.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {},
      },
      shouldBeValid: false,
    },
    {
      product: {
        name: 'Invalid_price',
        description: 'ok',
        price: 0,
        discount: 0,
        stock: true,
        category: 'abarrotes',
        image_path: '',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {},
      },
      shouldBeValid: false,
    },
    {
      product: {
        name: 'Bad category chars',
        description: 'ok',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'bad/category',
        image_path: '',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {},
      },
      shouldBeValid: false,
    },
    {
      product: {
        name: 'Bad field metadata',
        description: 'ok',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'abarrotes',
        image_path: '',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {
          price: { ts: 'not-a-date', by: '', rev: -1, base_rev: null, changeset_id: '' },
        },
      },
      shouldBeValid: false,
    },
  ];

  for (const { product, shouldBeValid } of cases) {
    const zodRes = productSchema.safeParse(product);
    const toolsErrors = validateProduct(product, 0, { knownCategoryKeys: knownKeys });
    const toolsValid = toolsErrors.length === 0;
    expect(zodRes.success).toBe(shouldBeValid);
    expect(toolsValid).toBe(shouldBeValid);
    // Superset check: if tools rejects, zod must also reject
    if (!toolsValid) expect(zodRes.success).toBe(false);
  }
});

test('parity: tools unknown-category vs zod — tools stricter, zod lenient is documented divergence', () => {
  const knownKeys = new Set(['abarrotes']);
  const product = {
    name: 'Unknown cat',
    description: 'ok',
    price: 1000,
    discount: 0,
    stock: true,
    category: 'inexistente',
    image_path: '',
    image_avif_path: '',
    order: 0,
    is_archived: false,
    rev: 0,
    field_last_modified: {},
  };
  const zodRes = productSchema.safeParse(product);
  // Zod only checks regex/max, not existence in registry — will accept unknown string
  expect(zodRes.success).toBe(true);
  const toolsErrors = validateProduct(product, 0, { knownCategoryKeys: knownKeys });
  expect(toolsErrors.some((e) => e.includes('unknown category'))).toBe(true);
  // This divergence is explicit: unknown-category is enforced at sync-data / tools layer,
  // not in the leaf product zod schema. Parity for fixture corpus still holds because fixtures use known categories.
});
