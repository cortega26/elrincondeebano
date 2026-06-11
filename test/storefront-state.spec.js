import { describe, expect, it } from 'vitest';
import {
  MAX_CART_ITEM_QTY,
  clampQty,
  createCartItemFromProduct,
  getCartState,
  hydrateCartFromOrder,
  normalizeCartItem,
  normalizeId,
  parseNumber,
  sanitizeCart,
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
        image: 'pan.jpg',
        quantity: 3,
      });
    });

    it('returns null for invalid products', () => {
      expect(createCartItemFromProduct(null)).toBeNull();
      expect(createCartItemFromProduct({})).toBeNull();
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
});
