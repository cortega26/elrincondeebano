import { describe, expect, it } from 'vitest';
import { adoptCartSnapshot } from '../astro-poc/src/scripts/storefront/storefront-state.js';

function item(id, quantity, extra = {}) {
  return {
    id,
    name: `Product ${id}`,
    category: 'test',
    price: 1000,
    discount: 0,
    image: '',
    quantity,
    ...extra,
  };
}

function byId(cart) {
  return Object.fromEntries(cart.map((entry) => [entry.id, entry.quantity]));
}

describe('cross-tab cart snapshot convergence (fix: removed items stay removed)', () => {
  it('respects removal from the authoritative persisted snapshot', () => {
    const local = [item('deleted', 2), item('kept', 1)];
    const persisted = [item('kept', 1)];
    expect(byId(adoptCartSnapshot(local, persisted))).toEqual({ kept: 1 });
  });

  it('respects an explicitly emptied cart even if the local copy has products', () => {
    expect(adoptCartSnapshot([item('ghost', 1)], [])).toEqual([]);
  });

  it('accepts the newest quantities and additions instead of maximum-quantity wins', () => {
    const local = [item('a', 5), item('stale', 1)];
    const persisted = [item('a', 2), item('b', 1)];
    expect(byId(adoptCartSnapshot(local, persisted))).toEqual({ a: 2, b: 1 });
  });

  it('keeps the local state if the persisted snapshot is malformed', () => {
    const local = [item('safe', 1)];
    expect(byId(adoptCartSnapshot(local, 'garbage'))).toEqual({ safe: 1 });
    expect(byId(adoptCartSnapshot(local, null))).toEqual({ safe: 1 });
  });
});
