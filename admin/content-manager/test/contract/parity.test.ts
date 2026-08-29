import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { productCatalogSchema } from '../../src/shared/schemas/product.ts';
import { productSchema } from '../../src/shared/schemas/product.ts';

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
const goldenPath = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'plans',
  'fixtures',
  '055',
  'golden',
  'python_roundtrip.json'
);

test('TypeScript schema parses all fixture products', () => {
  const raw = readFileSync(fixturePath, 'utf-8');
  const data = JSON.parse(raw);

  const result = productCatalogSchema.safeParse(data);
  expect(result.success).toBe(true);
  if (!result.success) return;

  expect(result.data.products.length).toBeGreaterThanOrEqual(1);

  // Plan 154: productSchema is the WRITE strict schema — raster images without AVIF
  // companion are rejected on write (they still load via productCatalogSchema's lenient
  // read path, which uses productReadSchema). The fixture contains two such legacy
  // products; they must parse on read but fail on strict write.
  for (const product of result.data.products) {
    const readOk = result.success;
    expect(readOk).toBe(true);
    const pr = productSchema.safeParse(product);
    const requiresAvif =
      typeof product.image_path === 'string' &&
      /\.(webp|png|jpe?g)$/i.test(product.image_path) &&
      (!product.image_avif_path || String(product.image_avif_path).trim() === '');
    if (requiresAvif) {
      expect(pr.success).toBe(false);
      if (!pr.success) {
        expect(pr.error.issues.some((i) => i.path.join('.') === 'image_avif_path')).toBe(true);
      }
    } else {
      expect(pr.success).toBe(true);
    }
  }
});

test('TypeScript output matches Python golden', () => {
  const fixtureRaw = readFileSync(fixturePath, 'utf-8');
  const fixtureData = JSON.parse(fixtureRaw);

  const goldenRaw = readFileSync(goldenPath, 'utf-8');
  const goldenProducts = JSON.parse(goldenRaw) as Array<Record<string, unknown>>;

  const tsResult = productCatalogSchema.safeParse(fixtureData);
  if (!tsResult.success) throw new Error('Fixture validation failed');

  const tsProducts = tsResult.data.products;

  for (let i = 0; i < tsProducts.length; i++) {
    const ts = tsProducts[i] as Record<string, unknown>;
    const py = goldenProducts[i];

    expect(ts.name).toBe(py.name);
    expect(ts.description).toBe(py.description);
    expect(ts.price).toBe(py.price);
    expect(ts.discount).toBe(py.discount);
    expect(ts.stock).toBe(py.stock);
    expect(ts.is_archived).toBe(py.is_archived);
    expect(ts.order).toBe(py.order);
    expect(ts.rev).toBe(py.rev);
  }
});
