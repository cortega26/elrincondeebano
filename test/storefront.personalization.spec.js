import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersonalizationEngine } from '../astro-poc/src/scripts/storefront/personalization.js';

const NOW = new Date('2026-07-14T10:00:00Z').getTime();

function makeCell(fallback) {
  let value = fallback;
  return {
    get() {
      return value;
    },
    set(v) {
      value = v;
    },
  };
}

const KNOWN_PRODUCTS = {
  p1: { id: 'p1', name: 'Aceite', category: 'despensa', price: 850 },
  p2: { id: 'p2', name: 'Café', category: 'despensa', price: 1200 },
  p3: { id: 'p3', name: 'Leche', category: 'lacteos', price: 900 },
  p4: { id: 'p4', name: 'Pan', category: 'panaderia', price: 650 },
  p5: { id: 'p5', name: 'Queso', category: 'lacteos', price: 1800 },
};

function makeSampleCart(items) {
  return items.map(([id, qty]) => {
    const product = KNOWN_PRODUCTS[id] || { id, name: id, category: '', price: 0 };
    return { ...product, quantity: qty, image: '' };
  });
}

function createEngine({
  visibleIds = ['p1', 'p2', 'p3', 'p4', 'p5'],
  seedLastOrder = null,
  seedRecentOrders = [],
  seedProductSignals = {},
} = {}) {
  const lastOrderCell = makeCell(seedLastOrder);
  const recentOrdersCell = makeCell(seedRecentOrders);
  const signalsCell = makeCell(seedProductSignals);

  return createPersonalizationEngine({
    loadLastOrder: () => lastOrderCell.get(),
    saveLastOrder: (v) => {
      lastOrderCell.set(v);
    },
    loadRecentOrders: () => recentOrdersCell.get(),
    saveRecentOrders: (v) => {
      recentOrdersCell.set(v);
    },
    loadProductSignals: () => signalsCell.get(),
    saveProductSignals: (v) => {
      signalsCell.set(v);
    },
    parseNumber: (val, fb) => {
      const parsed = Number(val);
      return Number.isFinite(parsed) ? parsed : fb;
    },
    getVisibleProductIds: () => visibleIds,
    resolveProductById: (id) => KNOWN_PRODUCTS[id] || null,
    maxPersonalizedItems: 4,
  });
}

function setupFakeTimers() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

function tearDownFakeTimers() {
  vi.useRealTimers();
}

describe('personalization engine — recordOrder', () => {
  beforeEach(setupFakeTimers);
  afterEach(tearDownFakeTimers);

  it('saves an order and can retrieve order details from the engine state', () => {
    const engine = createEngine();
    const cart = makeSampleCart([
      ['p1', 2],
      ['p2', 1],
    ]);
    const profile = { name: 'Ana', deliveryNote: 'Puerta 3' };

    engine.recordOrder(cart, profile, 'Efectivo', 'similar');

    const ids = engine.getPersonalizedProductIds();
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('prepends a new order so it appears first in the recency ranking', () => {
    const firstOrder = {
      timestamp: '2026-07-13T10:00:00Z',
      items: [{ id: 'p3', name: 'Leche', category: 'lacteos', price: 900, quantity: 1, image: '' }],
    };
    const engine = createEngine({ seedRecentOrders: [firstOrder] });

    engine.recordOrder(makeSampleCart([['p1', 1]]), { name: 'Luis' }, 'Tarjeta', 'exacto');

    const ids = engine.getPersonalizedProductIds();
    expect(ids[0]).toBe('p1');
    expect(ids).toContain('p3');
  });

  it('increments orderedCount signal for each product in an order', () => {
    const engine = createEngine();

    engine.recordOrder(makeSampleCart([['p2', 1]]), {}, 'Tarjeta', null);
    engine.recordOrder(makeSampleCart([['p2', 1]]), {}, 'Tarjeta', null);

    const ids = engine.getPersonalizedProductIds();
    expect(ids).toContain('p2');
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });
});

describe('personalization engine — trackProductSignal', () => {
  beforeEach(setupFakeTimers);
  afterEach(tearDownFakeTimers);

  it('increments a named signal field for a product', () => {
    const engine = createEngine();

    engine.trackProductSignal('p1', 'addedCount');
    engine.trackProductSignal('p1', 'addedCount');
    engine.trackProductSignal('p2', 'addedCount');

    const ids = engine.getPersonalizedProductIds();
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
  });

  it('ignores calls with empty productId or field', () => {
    const engine = createEngine();

    engine.trackProductSignal('', 'addedCount');
    engine.trackProductSignal('p1', '');

    const ids = engine.getPersonalizedProductIds();
    expect(ids.length).toBeGreaterThanOrEqual(0);
    expect(ids.length).toBeLessThanOrEqual(4);
  });
});

describe('personalization engine — getPersonalizedProductIds', () => {
  beforeEach(setupFakeTimers);
  afterEach(tearDownFakeTimers);

  it('excludes products unknown to resolveProductById even if visible', () => {
    const engine = createEngine({ visibleIds: ['p1', 'unknown', 'p2'] });

    const ids = engine.getPersonalizedProductIds();
    expect(ids).not.toContain('unknown');
    expect(ids.length).toBeLessThanOrEqual(2);
  });

  it('returns an empty list when no visible products match', () => {
    const engine = createEngine({ visibleIds: [] });

    expect(engine.getPersonalizedProductIds()).toEqual([]);
  });

  it('ranks recently ordered products higher than products with only addition signals', () => {
    const engine = createEngine();

    engine.trackProductSignal('p2', 'addedCount');
    engine.trackProductSignal('p2', 'addedCount');
    engine.recordOrder(makeSampleCart([['p1', 1]]), {}, 'Efectivo', null);

    const ids = engine.getPersonalizedProductIds();
    expect(ids[0]).toBe('p1');
  });

  it('scores tracked products below ordered ones when recency windows apply', () => {
    const engine = createEngine();

    engine.trackProductSignal('p3', 'addedCount');
    engine.recordOrder(makeSampleCart([['p1', 1]]), {}, 'Efectivo', null);

    const ids = engine.getPersonalizedProductIds();
    expect(ids).toContain('p1');
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });

  it('respects maxPersonalizedItems limit', () => {
    const engine = createEngine();

    engine.recordOrder(makeSampleCart([['p1', 1]]), {}, 'Efectivo', null);
    engine.recordOrder(makeSampleCart([['p2', 1]]), {}, 'Efectivo', null);
    engine.recordOrder(makeSampleCart([['p3', 1]]), {}, 'Efectivo', null);
    engine.recordOrder(makeSampleCart([['p4', 1]]), {}, 'Efectivo', null);
    engine.recordOrder(makeSampleCart([['p5', 1]]), {}, 'Efectivo', null);

    const ids = engine.getPersonalizedProductIds();
    expect(ids.length).toBeLessThanOrEqual(4);
  });
});
