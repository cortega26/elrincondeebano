// Plan 013 Step 4: money-path characterization — order totals computed from
// real catalog fixtures plus storage-contract round-trips. Locks behavior;
// pricing logic itself is out of scope and untouched.
import { describe, expect, it } from 'vitest';
import catalog from '../data/product_data.json';
import {
  createCartItemFromProduct,
  getCartState,
  hydrateCartFromOrder,
  hydrateSharedCart,
  toSharedCartPayload,
} from '../astro-poc/src/scripts/storefront/storefront-state.js';
import { createStorefrontStorage } from '../astro-poc/src/scripts/storefront/storage-contract.js';

function createMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function inStockProducts() {
  return catalog.products.filter((p) => p.stock !== false && p.id);
}

function expectedTotal(items) {
  return items.reduce((sum, item) => {
    const effective = Math.max(0, Number(item.price) - Number(item.discount || 0));
    return sum + effective * Number(item.quantity);
  }, 0);
}

describe('order totals from catalog fixtures (plan 013)', () => {
  it('totals a mixed fixture cart: regular, discounted, and multi-quantity lines', () => {
    const products = inStockProducts();
    const regular = products.find((p) => Number(p.discount || 0) === 0);
    const discounted = products.find((p) => Number(p.discount || 0) > 0);
    expect(regular).toBeTruthy();
    expect(discounted).toBeTruthy();

    const cart = [createCartItemFromProduct(regular, 2), createCartItemFromProduct(discounted, 3)];
    expect(cart.every(Boolean)).toBe(true);
    const state = getCartState(cart);
    expect(state.totalItems).toBe(5);
    expect(state.totalAmount).toBe(expectedTotal(cart));
    // Independently recomputed from fixture fields.
    const manual =
      Math.max(0, regular.price - (regular.discount || 0)) * 2 +
      Math.max(0, discounted.price - (discounted.discount || 0)) * 3;
    expect(state.totalAmount).toBe(manual);
  });

  it('never yields a negative effective line even for a fully-discounted fixture', () => {
    const products = inStockProducts();
    const victim = { ...products[0], price: 1000, discount: 1500 };
    const cart = [createCartItemFromProduct(victim, 2)];
    expect(getCartState(cart).totalAmount).toBe(0);
  });

  it('order recovery preserves the fixture total end to end', () => {
    const products = inStockProducts().slice(0, 4);
    const cart = products.map((p, i) => createCartItemFromProduct(p, i + 1));
    const before = getCartState(cart);
    const recovered = hydrateCartFromOrder({ items: cart });
    expect(getCartState(recovered)).toEqual(before);
  });
});

describe('storage-contract round-trips preserve totals (plan 013)', () => {
  it('save/load cart round-trip keeps totalAmount', () => {
    const products = inStockProducts().slice(0, 3);
    const cart = products.map((p) => createCartItemFromProduct(p, 2));
    const storage = createStorefrontStorage({ storage: createMemoryStorage() });
    expect(storage.saveJson('cart', cart)).toBe(true);
    const loaded = storage.loadJson('cart', []);
    expect(getCartState(loaded)).toEqual(getCartState(cart));
  });

  it('shared-cart links rehydrate prices from the catalog, ignoring forged fields', () => {
    const products = inStockProducts();
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const target = products.find((p) => Number(p.discount || 0) > 0) ?? products[0];
    const legacyPayload = [
      { id: String(target.id), name: 'Forged', price: 999999, discount: 0, quantity: 2 },
    ];
    const items = hydrateSharedCart(legacyPayload, (id) => byId.get(id) ?? null);
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(target.price);
    expect(items[0].discount).toBe(target.discount ?? 0);
    expect(getCartState(items).totalAmount).toBe(
      Math.max(0, target.price - (target.discount || 0)) * 2
    );
  });

  it('shared-cart payload round-trip keeps identity, quantity, and total', () => {
    const products = inStockProducts().slice(0, 3);
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const cart = products.map((p, i) => createCartItemFromProduct(p, i + 1));
    const payload = toSharedCartPayload(cart);
    expect(payload).toBeTruthy();
    const rehydrated = hydrateSharedCart(payload, (id) => byId.get(id) ?? null);
    expect(getCartState(rehydrated)).toEqual(getCartState(cart));
  });
});
