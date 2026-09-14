import { describe, expect, it } from 'vitest';
import { mergeCarts } from '../astro-poc/src/scripts/storefront/storefront-state.js';

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

describe('mergeCarts cross-tab convergence (plan 179)', () => {
  it('unions ids with max-quantity wins and keeps local-only items', () => {
    const merged = mergeCarts([item('a', 1), item('b', 2)], [item('b', 3), item('c', 1)]);
    expect(byId(merged)).toEqual({ a: 1, b: 3, c: 1 });
  });

  it('never double-counts the same item in both tabs', () => {
    const merged = mergeCarts([item('b', 2)], [item('b', 2)]);
    expect(byId(merged)).toEqual({ b: 2 });
  });

  it('ignores malformed remote payloads, keeping the local cart intact', () => {
    const local = [item('a', 1)];
    expect(byId(mergeCarts(local, 'garbage'))).toEqual({ a: 1 });
    expect(byId(mergeCarts(local, null))).toEqual({ a: 1 });
    expect(byId(mergeCarts(local, [{ id: '', quantity: 5 }]))).toEqual({ a: 1 });
  });

  it('documents the limitation: remote removal does not propagate (no tombstones)', () => {
    // Deletion is intentionally not synced — a tombstone protocol is the
    // follow-up if operators report ghost items (plan 179 deferred note).
    const merged = mergeCarts([item('a', 1), item('b', 1)], [item('a', 1)]);
    expect(byId(merged)).toEqual({ a: 1, b: 1 });
  });
});
