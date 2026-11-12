// Plan 282: the embedded cart price index is built from the same catalog the
// cards are rendered from, plus out-of-stock products (flag 0) that never get
// a card. These tests use the real catalog fixture, not hand-made products.
import { describe, expect, it } from 'vitest';
import catalog from '../data/product_data.json';
import { getCartPriceIndex, getProductSku, getProductsWithSku } from '../astro-poc/src/lib/catalog.ts';

const products = catalog.products || [];

function expectedPrice(product) {
  return typeof product.price === 'number' ? product.price : 0;
}

function expectedDiscount(product) {
  return typeof product.discount === 'number' ? product.discount : 0;
}

describe('getCartPriceIndex (plan 282)', () => {
  it('indexes every rendered card sku with its live price and discount', () => {
    const index = getCartPriceIndex();
    const rendered = getProductsWithSku();

    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.some(({ sku }) => /-2$/.test(sku))).toBe(false);

    for (const { sku, product } of rendered) {
      expect(index[sku], `missing index entry for ${sku}`).toEqual([
        expectedPrice(product),
        expectedDiscount(product),
        1,
      ]);
    }
  });

  it('indexes every non-archived out-of-stock product with flag 0', () => {
    const index = getCartPriceIndex();
    const dormant = products.filter(
      (product) => product && product.is_archived !== true && product.stock === false
    );

    expect(dormant.length).toBeGreaterThan(0);
    for (const product of dormant) {
      const sku = getProductSku(product);
      expect(index[sku], `missing dormant entry for ${sku}`).toEqual([
        expectedPrice(product),
        expectedDiscount(product),
        0,
      ]);
    }
  });

  it('does not index archived products unless a live product shares the key', () => {
    const index = getCartPriceIndex();
    const liveKeys = new Set(getProductsWithSku().map(({ sku }) => sku));
    const archived = products.filter((product) => product && product.is_archived === true);

    expect(archived.length).toBeGreaterThan(0);
    for (const product of archived) {
      const sku = getProductSku(product);
      if (!liveKeys.has(sku)) {
        expect(index[sku], `archived product ${sku} leaked into the index`).toBeUndefined();
      }
    }
  });

  it('has one key per live + dormant non-archived product (no duplicates)', () => {
    const index = getCartPriceIndex();
    const expectedKeys = new Set(getProductsWithSku().map(({ sku }) => sku));
    for (const product of products) {
      if (!product || product.is_archived === true || product.stock !== false) {
        continue;
      }
      expectedKeys.add(getProductSku(product));
    }

    expect(Object.keys(index).sort()).toEqual([...expectedKeys].sort());
  });
});
