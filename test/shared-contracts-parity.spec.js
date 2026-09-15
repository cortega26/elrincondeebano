import { describe, expect, it } from 'vitest';
import { generateStableId, computeDiscountMeta } from '../tools/utils/product-mapper.js';
import { generateStableSku } from '../astro-poc/src/lib/product-identity.ts';
import {
  computeProductCardData,
  discountPercentInt,
} from '../astro-poc/src/lib/product-card-helpers.ts';

// Plan 195: cross-runtime parity — tools (CJS) and the storefront (TS) cannot
// share implementations, so identical inputs must produce identical outputs,
// pinned here. Malformed inputs (missing name/category) diverge by
// construction (garbage-in) and are pinned only for well-formed products.
function cardProduct(price, discount) {
  return {
    name: 'Arroz',
    description: '',
    category: 'abarrotes',
    price,
    discount,
    image_path: '',
    image_avif_path: '',
  };
}

describe('stable-id parity (tools djb2 == storefront djb2)', () => {
  const cases = [
    ['Arroz', 'abarrotes'],
    ['Café de Grano', 'Bebidas'],
    ['Leche Descremada 1L', 'Lácteos'],
    ['Jugo Piña', 'Jugos y Néctares'],
  ];
  for (const [name, category] of cases) {
    it(`agrees on ${name} / ${category}`, () => {
      expect(generateStableId({ name, category })).toBe(generateStableSku({ name, category }));
    });
  }

  it('ids are stable across calls', () => {
    const product = { name: 'Arroz', category: 'abarrotes' };
    expect(generateStableId(product)).toBe(generateStableId(product));
    expect(generateStableSku(product)).toBe(generateStableSku(product));
  });
});

describe('discount precision pins per surface (plan 195/D4)', () => {
  it('integer formula agrees across tools and storefront', () => {
    const table = [
      [799, 100, 13],
      [1000, 100, 10],
      [4500, 500, 11],
      [100, 0, 0],
    ];
    for (const [price, discount, expected] of table) {
      expect(discountPercentInt(price, discount)).toBe(expected);
      expect(computeDiscountMeta({ price, discount }).discountPercent).toBe(expected);
      expect(computeProductCardData(cardProduct(price, discount), 0).discountPercent).toBe(
        expected
      );
    }
  });
});
