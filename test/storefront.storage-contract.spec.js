import { describe, expect, it } from 'vitest';
import {
  createStorefrontStorage,
  migrateLegacyStorefrontState,
  STOREFRONT_RUNTIME_CONTRACT,
  STOREFRONT_STORAGE_KEYS,
} from '../astro-poc/src/scripts/storefront/storage-contract.js';

function createMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe('storefront storage contract', () => {
  it('declares the Astro storefront as the canonical runtime contract', () => {
    expect(STOREFRONT_RUNTIME_CONTRACT).toMatchObject({
      runtimeId: 'astro-poc-storefront',
      runtimeEntry: 'astro-poc/src/scripts/storefront.js',
      storageVersion: 1,
      cacheVersion: 2,
    });
    expect(STOREFRONT_RUNTIME_CONTRACT.storageKeys.cart).toBe('astro-poc-cart');
    expect(STOREFRONT_RUNTIME_CONTRACT.legacyAliases.cart).toEqual(['cart']);
  });

  it('migrates the legacy cart key into the canonical key without discarding the legacy payload', () => {
    const legacyCart = [{ id: 'pid-1', name: 'Aceite', price: 1000, quantity: 2 }];
    const storage = createMemoryStorage({
      cart: JSON.stringify(legacyCart),
    });

    const result = migrateLegacyStorefrontState({ storage });

    expect(result.available).toBe(true);
    expect(result.migrated).toEqual([
      {
        slot: 'cart',
        from: 'cart',
        to: STOREFRONT_STORAGE_KEYS.cart,
      },
    ]);
    expect(JSON.parse(storage.getItem(STOREFRONT_STORAGE_KEYS.cart))).toEqual(legacyCart);
    expect(JSON.parse(storage.getItem('cart'))).toEqual(legacyCart);
  });

  it('does not overwrite canonical cart state when a legacy alias is still present', () => {
    const canonicalCart = [{ id: 'pid-1', name: 'Aceite', price: 1000, quantity: 1 }];
    const legacyCart = [{ id: 'pid-2', name: 'Arroz', price: 1200, quantity: 3 }];
    const storage = createMemoryStorage({
      [STOREFRONT_STORAGE_KEYS.cart]: JSON.stringify(canonicalCart),
      cart: JSON.stringify(legacyCart),
    });

    const result = migrateLegacyStorefrontState({ storage });

    expect(result.migrated).toEqual([]);
    expect(JSON.parse(storage.getItem(STOREFRONT_STORAGE_KEYS.cart))).toEqual(canonicalCart);
  });

  it('keeps alias reads compatible until a device has written the canonical key', () => {
    const legacyCart = [{ id: 'pid-3', name: 'Leche', price: 900, quantity: 4 }];
    const storage = createMemoryStorage({
      cart: JSON.stringify(legacyCart),
    });
    const contract = createStorefrontStorage({ storage });

    expect(contract.loadJson('cart', [])).toEqual(legacyCart);

    contract.saveJson('cart', [{ id: 'pid-4', name: 'Pan', price: 700, quantity: 1 }]);

    expect(JSON.parse(storage.getItem(STOREFRONT_STORAGE_KEYS.cart))).toEqual([
      { id: 'pid-4', name: 'Pan', price: 700, quantity: 1 },
    ]);
  });
});
