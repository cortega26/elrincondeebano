/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  readStorefrontSlot,
  writeStorefrontSlot,
} from '../astro-poc/src/scripts/storefront/storage-contract.js';
import { createPersonalizationEngine } from '../astro-poc/src/scripts/storefront/personalization.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function countingStorage() {
  const data = new Map();
  const probeWrites = [];
  return {
    probeWrites,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      if (key === '__astro_poc_storage_probe__') probeWrites.push(key);
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('storage probe caching (plan 187)', () => {
  it('probes availability once per storage object, not per operation', () => {
    const storage = countingStorage();
    const opts = { storage };
    writeStorefrontSlot('cart', [{ id: 'a', quantity: 1 }], opts);
    readStorefrontSlot('cart', [], opts);
    writeStorefrontSlot('cart', [{ id: 'a', quantity: 2 }], opts);
    readStorefrontSlot('cart', [], opts);
    expect(storage.probeWrites).toHaveLength(1);
  });

  it('probes a fresh storage object independently', () => {
    const first = countingStorage();
    const second = countingStorage();
    writeStorefrontSlot('cart', [], { storage: first });
    writeStorefrontSlot('cart', [], { storage: second });
    expect(first.probeWrites).toHaveLength(1);
    expect(second.probeWrites).toHaveLength(1);
  });
});

describe('signal write coalescing (plan 187)', () => {
  function createEngine({ visibleIds = [], resolveProductById = () => null } = {}) {
    const saved = [];
    const engine = createPersonalizationEngine({
      loadLastOrder: () => null,
      saveLastOrder: () => {},
      loadRecentOrders: () => [],
      saveRecentOrders: () => {},
      loadProductSignals: () => ({}),
      saveProductSignals: (value) => {
        saved.push(value);
      },
      parseNumber: (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback),
      getVisibleProductIds: () => visibleIds,
      resolveProductById,
    });
    return { engine, saved };
  }

  it('coalesces rapid signal writes into one save', () => {
    const { engine, saved } = createEngine();
    engine.trackProductSignal('p1', 'addedCount');
    engine.trackProductSignal('p1', 'addedCount');
    engine.trackProductSignal('p2', 'addedCount');
    expect(saved).toHaveLength(0);
    engine.flushProductSignals();
    expect(saved).toHaveLength(1);
    expect(saved[0].p1.addedCount).toBe(2);
    expect(saved[0].p2.addedCount).toBe(1);
  });

  it('flushes on an explicit call and stays consistent for readers meanwhile', () => {
    const { engine, saved } = createEngine({
      visibleIds: ['p1'],
      resolveProductById: (id) => ({ id }),
    });
    engine.trackProductSignal('p1', 'addedCount');
    // Readers see pending signals before any save happens.
    expect(engine.getPersonalizedProductIds()).toContain('p1');
    engine.flushProductSignals();
    expect(saved).toHaveLength(1);
    engine.flushProductSignals();
    expect(saved).toHaveLength(1);
  });
});
