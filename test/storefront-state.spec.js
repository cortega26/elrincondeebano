/* eslint-disable max-lines-per-function -- suite-level describe block (plan 026) */
import { describe, expect, it } from 'vitest';
import {
  MAX_CART_ITEM_QTY,
  SHARED_CART_VERSION,
  clampQty,
  createCartItemFromProduct,
  getCartState,
  hydrateCartFromOrder,
  hydrateSharedCart,
  normalizeCartItem,
  normalizeId,
  parseNumber,
  parseSharedCartPayload,
  sanitizeCart,
  toSharedCartPayload,
} from '../astro-poc/src/scripts/storefront/storefront-state.js';

describe('storefront-state cart primitives', () => {
  describe('parseNumber', () => {
    it('returns finite numbers and numeric strings', () => {
      expect(parseNumber(42)).toBe(42);
      expect(parseNumber('3.14')).toBeCloseTo(3.14);
      expect(parseNumber(0)).toBe(0);
    });

    it('returns fallback for non-finite values', () => {
      expect(parseNumber(NaN)).toBe(0);
      expect(parseNumber(Infinity)).toBe(0);
      expect(parseNumber(-Infinity)).toBe(0);
      expect(parseNumber(undefined)).toBe(0);
      expect(parseNumber('abc', 9)).toBe(9);
    });
  });

  describe('clampQty', () => {
    it('clamps quantities into the allowed cart range', () => {
      expect(clampQty(-1)).toBe(0);
      expect(clampQty('5')).toBe(5);
      expect(clampQty(MAX_CART_ITEM_QTY + 1)).toBe(MAX_CART_ITEM_QTY);
    });
  });

  describe('normalizeId', () => {
    it('normalizes strings and numbers while rejecting other values', () => {
      expect(normalizeId('  prod-1  ')).toBe('prod-1');
      expect(normalizeId(42)).toBe('42');
      expect(normalizeId(null)).toBe('');
      expect(normalizeId({})).toBe('');
      expect(normalizeId([])).toBe('');
    });
  });

  describe('normalizeCartItem', () => {
    const validItem = {
      id: 'prod-1',
      name: 'Leche',
      category: 'Lacteos',
      price: 1500,
      discount: 0,
      image: 'leche.jpg',
      quantity: 2,
    };

    it('normalizes valid cart items', () => {
      expect(normalizeCartItem(validItem)).toEqual(validItem);
    });

    it('rejects invalid id or quantity values', () => {
      expect(normalizeCartItem({ ...validItem, id: '' })).toBeNull();
      expect(normalizeCartItem({ ...validItem, quantity: 0 })).toBeNull();
      expect(normalizeCartItem(null)).toBeNull();
    });

    it('fills optional display fields and clamps quantity', () => {
      expect(normalizeCartItem({ id: 'prod-1', quantity: 999 })).toEqual({
        id: 'prod-1',
        name: 'prod-1',
        category: '',
        price: 0,
        discount: 0,
        image: '',
        quantity: MAX_CART_ITEM_QTY,
      });
    });
  });

  describe('sanitizeCart', () => {
    it('filters invalid items from arrays', () => {
      const result = sanitizeCart([
        { id: 'prod-1', quantity: 1 },
        { id: '', quantity: 1 },
        null,
        { id: 'prod-2', quantity: 0 },
        { id: 'prod-3', quantity: 2 },
      ]);

      expect(result.map((item) => item.id)).toEqual(['prod-1', 'prod-3']);
    });

    it('returns an empty cart for non-array input', () => {
      expect(sanitizeCart(null)).toEqual([]);
      expect(sanitizeCart({})).toEqual([]);
      expect(sanitizeCart('[]')).toEqual([]);
    });
  });

  describe('getCartState', () => {
    it('calculates item and amount totals from sanitized cart data', () => {
      expect(
        getCartState([
          { id: 'a', price: 1000, quantity: 2 },
          { id: 'b', price: 500, quantity: 1 },
          { id: '', price: 9999, quantity: 9 },
        ])
      ).toEqual({ totalItems: 3, totalAmount: 2500 });
    });
  });

  describe('createCartItemFromProduct', () => {
    it('creates cart items from product-like objects', () => {
      expect(
        createCartItemFromProduct(
          { id: 'p1', name: 'Pan', category: 'Panaderia', price: 800, image: 'pan.jpg' },
          3
        )
      ).toEqual({
        id: 'p1',
        name: 'Pan',
        category: 'Panaderia',
        price: 800,
        discount: 0,
        image: 'pan.jpg',
        quantity: 3,
      });
    });

    it('propagates discount from product', () => {
      expect(
        createCartItemFromProduct({
          id: 'p1',
          name: 'Pan',
          category: 'Panaderia',
          price: 1000,
          discount: 200,
          image: 'pan.jpg',
          quantity: 1,
        })
      ).toMatchObject({ id: 'p1', price: 1000, discount: 200 });
    });

    it('returns null for invalid products', () => {
      expect(createCartItemFromProduct(null)).toBeNull();
      expect(createCartItemFromProduct({})).toBeNull();
    });
  });

  describe('normalizeCartItem with discount', () => {
    it('extracts discount when present', () => {
      const item = normalizeCartItem({
        id: 'prod-1',
        name: 'Test',
        price: 1000,
        discount: 200,
        quantity: 1,
      });
      expect(item).not.toBeNull();
      expect(item.discount).toBe(200);
    });

    it('defaults discount to 0 when absent', () => {
      const item = normalizeCartItem({ id: 'prod-1', price: 1000, quantity: 1 });
      expect(item).not.toBeNull();
      expect(item.discount).toBe(0);
    });
  });

  describe('sanitizeCart with discount', () => {
    it('preserves discount when sanitizing items', () => {
      const result = sanitizeCart([
        { id: 'a', price: 1000, discount: 200, quantity: 2 },
        { id: 'b', price: 500, discount: 0, quantity: 1 },
        { id: 'c', price: 3000, discount: 500, quantity: 3 },
      ]);

      expect(result.map((item) => ({ id: item.id, discount: item.discount }))).toEqual([
        { id: 'a', discount: 200 },
        { id: 'b', discount: 0 },
        { id: 'c', discount: 500 },
      ]);
    });
  });

  describe('getCartState with discount', () => {
    it('applies discounts when calculating totalAmount', () => {
      const state = getCartState([
        { id: 'a', price: 1000, discount: 200, quantity: 2 },
        { id: 'b', price: 500, discount: 0, quantity: 1 },
      ]);
      expect(state.totalItems).toBe(3);
      // a: (1000 - 200) * 2 = 1600, b: (500 - 0) * 1 = 500 → total 2100
      expect(state.totalAmount).toBe(2100);
    });

    it('clamps effective price to zero when discount exceeds price', () => {
      const state = getCartState([{ id: 'a', price: 1000, discount: 1500, quantity: 2 }]);
      expect(state.totalAmount).toBe(0);
    });
  });

  describe('hydrateCartFromOrder', () => {
    it('hydrates valid saved order items into cart items', () => {
      const cart = hydrateCartFromOrder({
        items: [
          { id: 'p1', name: 'Leche', category: 'L', price: 1200, image: 'l.jpg', quantity: 2 },
          { id: '', name: 'Invalid', quantity: 2 },
          { id: 'p2', name: 'Pan', category: 'P', price: 800, image: 'p.jpg', quantity: 1 },
        ],
      });

      expect(cart.map((item) => item.id)).toEqual(['p1', 'p2']);
    });

    it('returns an empty cart for invalid saved orders', () => {
      expect(hydrateCartFromOrder(null)).toEqual([]);
      expect(hydrateCartFromOrder({ items: null })).toEqual([]);
      expect(hydrateCartFromOrder({})).toEqual([]);
    });
  });

  describe('toSharedCartPayload', () => {
    it('serializes identity and quantity only, omitting commercial fields', () => {
      const payload = toSharedCartPayload([
        {
          id: 'p1',
          name: 'Leche',
          category: 'Lacteos',
          price: 1500,
          discount: 300,
          image: 'leche.jpg',
          quantity: 2,
        },
      ]);

      expect(payload).toEqual({
        version: SHARED_CART_VERSION,
        items: [{ id: 'p1', quantity: 2 }],
      });
      expect(JSON.stringify(payload)).not.toContain('Leche');
      expect(JSON.stringify(payload)).not.toContain('1500');
      expect(JSON.stringify(payload)).not.toContain('discount');
      expect(JSON.stringify(payload)).not.toContain('leche.jpg');
    });

    it('merges duplicate ids deterministically and clamps quantities', () => {
      const payload = toSharedCartPayload([
        { id: 'b', price: 500, quantity: 1 },
        { id: 'a', price: 800, quantity: 999 },
        { id: 'b', price: 0, quantity: 2 },
      ]);

      expect(payload.items).toEqual([
        { id: 'a', quantity: MAX_CART_ITEM_QTY },
        { id: 'b', quantity: 3 },
      ]);
    });

    it('returns null for empty or invalid carts', () => {
      expect(toSharedCartPayload([])).toBeNull();
      expect(toSharedCartPayload(null)).toBeNull();
      expect(toSharedCartPayload([{ id: '', quantity: 1 }])).toBeNull();
    });
  });

  describe('parseSharedCartPayload', () => {
    it('parses versioned payloads with capped and deduplicated items', () => {
      const items = parseSharedCartPayload({
        version: SHARED_CART_VERSION,
        items: [
          { id: 'p1', quantity: 1 },
          { id: 'p2', quantity: 999 },
          { id: 'p1', quantity: 3 },
          { id: 'p3', quantity: 0 },
          { id: '', quantity: 5 },
        ],
      });

      expect(items).toEqual([
        { id: 'p1', quantity: 1 },
        { id: 'p2', quantity: MAX_CART_ITEM_QTY },
      ]);
    });

    it('reads legacy array links by id and quantity only', () => {
      const items = parseSharedCartPayload([
        { id: 'p1', name: 'Fake', price: 1, discount: 2, image: 'x.jpg', quantity: 2 },
        { id: 'p2', name: 'Also Fake', price: 9999, quantity: 1 },
      ]);

      expect(items).toEqual([
        { id: 'p1', quantity: 2 },
        { id: 'p2', quantity: 1 },
      ]);
    });

    it('rejects malformed, non-array and unsupported-version payloads', () => {
      expect(parseSharedCartPayload(null)).toEqual([]);
      expect(parseSharedCartPayload('[]')).toEqual([]);
      expect(parseSharedCartPayload({})).toEqual([]);
      expect(parseSharedCartPayload({ version: 2, items: [{ id: 'p1', quantity: 1 }] })).toEqual(
        []
      );
      expect(parseSharedCartPayload({ version: SHARED_CART_VERSION, items: 'nope' })).toEqual([]);
    });
  });

  describe('hydrateSharedCart', () => {
    const catalog = new Map([
      ['p1', { id: 'p1', name: 'Leche', category: 'Lacteos', price: 1500, image: 'l.jpg' }],
      ['p2', { id: 'p2', name: 'Pan', category: 'Panaderia', price: 800, discount: 100 }],
      ['gone', null],
      ['soldout', { id: 'soldout', name: 'Agotado', price: 100, stock: false }],
    ]);
    const resolve = (id) => catalog.get(id) ?? null;

    it('rehydrates items from catalog values, ignoring forged commercial fields', () => {
      const items = hydrateSharedCart(
        {
          version: SHARED_CART_VERSION,
          items: [
            { id: 'p1', name: 'Fake', price: 999999, discount: 0, quantity: 2 },
            { id: 'p2', quantity: 1 },
          ],
        },
        resolve
      );

      expect(items).toEqual([
        expect.objectContaining({ id: 'p1', name: 'Leche', price: 1500, quantity: 2 }),
        expect.objectContaining({ id: 'p2', name: 'Pan', price: 800, discount: 100, quantity: 1 }),
      ]);
    });

    it('drops missing and out-of-stock products', () => {
      const items = hydrateSharedCart(
        {
          version: SHARED_CART_VERSION,
          items: [
            { id: 'p1', quantity: 1 },
            { id: 'gone', quantity: 1 },
            { id: 'soldout', quantity: 1 },
          ],
        },
        resolve
      );

      expect(items.map((item) => item.id)).toEqual(['p1']);
    });

    it('returns an empty cart for invalid payloads or missing resolver', () => {
      expect(hydrateSharedCart(null, resolve)).toEqual([]);
      expect(hydrateSharedCart({ version: 99, items: [] }, resolve)).toEqual([]);
      expect(hydrateSharedCart([{ id: 'p1', quantity: 1 }], null)).toEqual([]);
    });

    it('supports legacy array links through the same catalog hydration', () => {
      const items = hydrateSharedCart([{ id: 'p1', price: 1, quantity: 2 }], resolve);
      expect(items).toEqual([expect.objectContaining({ id: 'p1', price: 1500, quantity: 2 })]);
    });
  });
});
