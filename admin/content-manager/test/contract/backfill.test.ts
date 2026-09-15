// Plan 196: backfill is import-safe (main-guarded) and routes through the
// canonical atomic writer. Importing the module must never touch the
// catalog — previously it read (and could write) at import time.
import { test, expect, beforeAll, describe } from 'vitest';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { backfillCatalogIds, stableProductId } from '../../scripts/backfill-product-ids.ts';

function makeCatalog() {
  return {
    products: [
      { name: 'Arroz', description: 'Grano' },
      { name: 'Pera', description: '' },
      { id: 'keep-me', name: 'Fijo', description: '' },
    ],
  };
}

test('stableProductId is deterministic and well-formed', () => {
  const first = stableProductId('Arroz', 'Grano');
  expect(first).toMatch(/^p-[0-9a-f]{12}$/);
  expect(stableProductId('Arroz', 'Grano')).toBe(first);
  expect(stableProductId('Arroz', 'Otro')).not.toBe(first);
});

test('backfillCatalogIds assigns missing ids without touching the rest', () => {
  const catalog = makeCatalog();
  const { added } = backfillCatalogIds(catalog);
  expect(added).toBe(2);
  expect(catalog.products[0].id).toMatch(/^p-[0-9a-f]{12}$/);
  expect(catalog.products[1].id).toMatch(/^p-[0-9a-f]{12}$/);
  expect(catalog.products[2].id).toBe('keep-me');
  // Idempotent: a second pass adds nothing.
  expect(backfillCatalogIds(catalog).added).toBe(0);
});

test('backfillCatalogIds throws on collision instead of writing', () => {
  const catalog = makeCatalog();
  catalog.products.push({ name: 'Arroz', description: 'Grano' });
  expect(() => backfillCatalogIds(catalog)).toThrow(/Collision/);
});

describe('module import purity', () => {
  let mtimeBefore = 0;
  beforeAll(async () => {
    mtimeBefore = statSync(resolve(process.cwd(), '..', '..', 'data', 'product_data.json')).mtimeMs;
    await import('../../scripts/backfill-product-ids.ts');
  });

  test('importing the module performs no catalog I/O', () => {
    const mtimeAfter = statSync(
      resolve(process.cwd(), '..', '..', 'data', 'product_data.json')
    ).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
