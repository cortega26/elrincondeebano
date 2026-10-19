/* eslint-disable max-lines-per-function -- suite-level describe block (plan 026) */
import { describe, expect, it } from 'vitest';
import {
  MAX_CART_ITEM_QTY,
  SHARED_CART_VERSION,
  clampQty,
  createCartItemFromProduct,
  decodeCart,
  encodeCart,
  getCartState,
  hydrateCartFromOrder,
  hydrateSharedCart,
  normalizeCartItem,
  normalizeId,
  parseNumber,
  parseSharedCartPayload,
  refreshCartItemsFromCatalog,
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

    it('collapses duplicate SKU lines without inflating cart quantities', () => {
      const duplicated = [
        { id: 'sku', name: 'Royal Guard', price: 5900, quantity: 1 },
        { id: 'another', price: 1000, quantity: 1 },
        { id: 'sku', name: 'Royal Guard', price: 5900, quantity: 3 },
        { id: 'sku', name: 'Royal Guard', price: 5900, quantity: 2 },
      ];

      const normalized = sanitizeCart(duplicated);
      expect(normalized.map((item) => [item.id, item.quantity])).toEqual([
        ['sku', 3],
        ['another', 1],
      ]);
      expect(getCartState(duplicated)).toEqual({ totalItems: 4, totalAmount: 18700 });
      expect(sanitizeCart(normalized)).toEqual(normalized);
    });

    it('coalesces identical products even when a legacy row has a different ID', () => {
      const cart = sanitizeCart([
        {
          id: 'legacy-royal',
          name: 'Royal Guard • Cerveza Lager',
          category: 'Cervezas',
          price: 5900,
          discount: 0,
          image: '/assets/images/cervezas/Royal%20Guard%20lata%20350cc.webp',
          quantity: 1,
        },
        {
          id: 'p-a9fa2c67f826',
          name: 'Royal Guard • Cerveza Lager',
          category: 'Cervezas',
          price: 5900,
          discount: 0,
          image: '/assets/images/cervezas/Royal Guard lata 350cc.avif',
          quantity: 3,
        },
      ]);

      expect(cart).toHaveLength(1);
      expect(cart[0]).toMatchObject({ id: 'p-a9fa2c67f826', quantity: 3 });
      expect(getCartState(cart)).toEqual({ totalItems: 3, totalAmount: 17700 });
    });

    it('keeps genuine variations with the same displayed name separate', () => {
      const cart = sanitizeCart([
        {
          id: 'cola-returnable',
          name: 'Coca-Cola 2L',
          category: 'Bebidas',
          image: '/images/cola-retornable.webp',
          price: 3000,
          quantity: 1,
        },
        {
          id: 'cola-disposable',
          name: 'Coca-Cola 2L',
          category: 'Bebidas',
          image: '/images/cola-desechable.webp',
          price: 3000,
          quantity: 2,
        },
      ]);

      expect(cart.map((item) => item.id)).toEqual(['cola-returnable', 'cola-disposable']);
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

    it('preserves discounts so repeated orders keep their effective total', () => {
      const cart = hydrateCartFromOrder({
        items: [
          { id: 'p1', name: 'Leche', category: 'L', price: 1200, discount: 300, quantity: 2 },
          { id: 'p2', name: 'Pan', category: 'P', price: 800, discount: 0, quantity: 1 },
        ],
      });

      expect(cart.map((item) => ({ id: item.id, discount: item.discount }))).toEqual([
        { id: 'p1', discount: 300 },
        { id: 'p2', discount: 0 },
      ]);
      expect(getCartState(cart)).toEqual({ totalItems: 3, totalAmount: 2600 });
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

    it('collapses duplicate ids by max and clamps quantities', () => {
      const payload = toSharedCartPayload([
        { id: 'b', price: 500, quantity: 1 },
        { id: 'a', price: 800, quantity: 999 },
        { id: 'b', price: 0, quantity: 2 },
      ]);

      expect(payload.items).toEqual([
        { id: 'a', quantity: MAX_CART_ITEM_QTY },
        { id: 'b', quantity: 2 },
      ]);
    });

    it('returns null for empty or invalid carts', () => {
      expect(toSharedCartPayload([])).toBeNull();
      expect(toSharedCartPayload(null)).toBeNull();
      expect(toSharedCartPayload([{ id: '', quantity: 1 }])).toBeNull();
    });
  });

  describe('parseSharedCartPayload', () => {
    it('parses versioned payloads collapsing duplicate ids by max', () => {
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
        { id: 'p1', quantity: 3 },
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

  // Plan 231: the producer (encodeCart) is the half the e2e T11 only forged
  // by hand — these tests pin it against the production decoder.
  describe('encodeCart / decodeCart', () => {
    const catalog = new Map([
      ['p1', { id: 'p1', name: 'Leche', category: 'Lacteos', price: 1500, quantity: 1 }],
      ['p2', { id: 'p2', name: 'Pan', category: 'Panaderia', price: 800, discount: 100 }],
      ['p3', { id: 'p3', name: 'Café', category: 'Varios', price: 2400 }],
    ]);
    const resolve = (id) => catalog.get(id) ?? null;

    it('round-trips a 3-item cart: encode → decode → hydrateSharedCart', () => {
      const cart = [
        { id: 'p1', name: 'Leche', category: 'Lacteos', price: 1500, discount: 0, quantity: 2 },
        { id: 'p2', name: 'Pan', category: 'Panaderia', price: 800, discount: 100, quantity: 1 },
        { id: 'p3', name: 'Café', category: 'Varios', price: 2400, discount: 0, quantity: 3 },
      ];

      const encoded = encodeCart(cart);
      expect(encoded).not.toBe('');
      expect(decodeCart(encoded)).toEqual(toSharedCartPayload(cart));
      expect(decodeCart(encoded)).toEqual({
        version: SHARED_CART_VERSION,
        items: [
          { id: 'p1', quantity: 2 },
          { id: 'p2', quantity: 1 },
          { id: 'p3', quantity: 3 },
        ],
      });

      const hydrated = hydrateSharedCart(decodeCart(encoded), resolve);
      expect(hydrated.map((item) => ({ id: item.id, quantity: item.quantity }))).toEqual([
        { id: 'p1', quantity: 2 },
        { id: 'p2', quantity: 1 },
        { id: 'p3', quantity: 3 },
      ]);
    });

    it('keeps unicode ids intact via encodeURIComponent before btoa', () => {
      // Names never travel (identity/quantity only), but an id with
      // accents/emoji would make a raw btoa(JSON.stringify(...)) throw.
      const cart = [{ id: 'p-ünïcode-✨', name: 'Nova Clásica ✨', price: 1000, quantity: 1 }];
      const encoded = encodeCart(cart);

      expect(encoded).not.toBe('');
      expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(decodeCart(encoded)).toEqual({
        version: SHARED_CART_VERSION,
        items: [{ id: 'p-ünïcode-✨', quantity: 1 }],
      });
    });

    it('returns "" for empty or unusable carts (no shareable URL payload)', () => {
      expect(encodeCart([])).toBe('');
      expect(encodeCart(null)).toBe('');
      expect(encodeCart([{ id: '', quantity: 1 }])).toBe('');
    });

    it('returns null for malformed input (not base64 / not JSON)', () => {
      expect(decodeCart('not base64!!')).toBeNull();
      expect(decodeCart('')).toBeNull();
      expect(decodeCart(btoa(encodeURIComponent('just text')))).toBeNull();
      // Valid encoding, wrong payload shape: the decoder yields it and the
      // trusted consumer rejects it.
      const wrongShape = decodeCart(
        btoa(encodeURIComponent(JSON.stringify({ version: 99, items: [] })))
      );
      expect(wrongShape).toEqual({ version: 99, items: [] });
      expect(hydrateSharedCart(wrongShape, resolve)).toEqual([]);
    });
  });

  describe('refreshCartItemsFromCatalog', () => {
    const liveProduct = {
      id: 'p1',
      name: 'Leche',
      category: 'Lacteos',
      price: 1500,
      discount: 0,
      image: 'leche-live.jpg',
    };
    const resolve = (id) => (id === liveProduct.id ? liveProduct : null);

    function persisted(overrides = {}) {
      return {
        id: 'p1',
        name: 'Leche',
        category: 'Lacteos',
        price: 1200,
        discount: 0,
        image: 'leche.jpg',
        quantity: 2,
        ...overrides,
      };
    }

    it('refreshes the price from the live catalog and keeps the quantity', () => {
      const { cart, changed } = refreshCartItemsFromCatalog([persisted()], resolve);
      expect(changed).toBe(true);
      expect(cart).toEqual([{ ...liveProduct, quantity: 2 }]);
    });

    it('refreshes a changed discount from the live catalog', () => {
      const discounted = { ...liveProduct, discount: 300 };
      const { cart, changed } = refreshCartItemsFromCatalog(
        [persisted({ price: 1500, image: 'leche-live.jpg' })],
        (id) => (id === 'p1' ? discounted : null)
      );
      expect(changed).toBe(true);
      expect(cart[0]).toMatchObject({ price: 1500, discount: 300, quantity: 2 });
    });

    it('refreshes name and image changes from the live catalog', () => {
      const renamed = { ...liveProduct, name: 'Leche entera', image: 'leche-nueva.jpg' };
      const { cart, changed } = refreshCartItemsFromCatalog(
        [persisted({ price: 1500 })],
        (id) => (id === 'p1' ? renamed : null)
      );
      expect(changed).toBe(true);
      expect(cart[0]).toMatchObject({
        name: 'Leche entera',
        image: 'leche-nueva.jpg',
        quantity: 2,
      });
    });

    it('keeps unresolved lines untouched and never drops, adds or reorders lines', () => {
      const unknown = {
        id: 'gone',
        name: 'Producto histórico',
        category: 'Varios',
        price: 999,
        discount: 5,
        image: 'gone.jpg',
        quantity: 7,
      };
      const { cart, changed } = refreshCartItemsFromCatalog([persisted(), unknown], resolve);
      expect(changed).toBe(true);
      expect(cart).toHaveLength(2);
      expect(cart[0].id).toBe('p1');
      expect(cart[1]).toEqual(unknown);
    });

    it('keeps the line when the resolver returns an unusable record', () => {
      const stale = persisted();
      const { cart, changed } = refreshCartItemsFromCatalog([stale], () => ({}));
      expect(changed).toBe(false);
      expect(cart[0]).toBe(stale);
    });

    it('reports changed: false when every field already matches the catalog', () => {
      const current = { ...liveProduct, quantity: 4 };
      const result = refreshCartItemsFromCatalog([current], resolve);
      expect(result.changed).toBe(false);
      expect(result.cart[0]).toEqual(current);
      expect(result.cart[0].quantity).toBe(4);
    });

    it('is pure: does not mutate the input and is idempotent', () => {
      const input = [persisted()];
      const snapshot = structuredClone(input);

      const first = refreshCartItemsFromCatalog(input, resolve);
      expect(first.changed).toBe(true);
      expect(input).toEqual(snapshot);

      const second = refreshCartItemsFromCatalog(first.cart, resolve);
      expect(second.changed).toBe(false);
      expect(second.cart).toEqual(first.cart);
      expect(input).toEqual(snapshot);
    });
  });
});
