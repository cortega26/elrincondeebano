/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getProductCardById,
  getProductCardMap,
  invalidateProductCardCache,
} from '../astro-poc/src/scripts/storefront/card-registry.js';

function addCard(id, container) {
  const el = document.createElement('div');
  el.className = 'producto';
  el.dataset.productId = id;
  container.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  invalidateProductCardCache();
});

afterEach(() => {
  document.body.innerHTML = '';
  invalidateProductCardCache();
});

describe('card registry (plan 187)', () => {
  it('routes repeated lookups through the cached map', () => {
    const container = document.createElement('div');
    container.id = 'product-container';
    document.body.appendChild(container);
    const a = addCard('a1', container);
    addCard('b2', container);

    expect(getProductCardById('a1')).toBe(a);
    expect(getProductCardMap().size).toBe(2);

    const spy = vi.spyOn(document, 'querySelectorAll');
    try {
      getProductCardById('a1');
      getProductCardById('b2');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('falls back document-wide for cards outside the container', () => {
    const outside = addCard('x9', document.body);
    expect(getProductCardById('x9')).toBe(outside);
    expect(getProductCardById('missing')).toBeUndefined();
  });

  it('never returns detached cards after a re-render', () => {
    const container = document.createElement('div');
    container.id = 'product-container';
    document.body.appendChild(container);
    addCard('a1', container);
    expect(getProductCardById('a1')).not.toBeUndefined();

    // Re-render detaches the old nodes without invalidating the cache.
    document.body.innerHTML = '';
    expect(getProductCardById('a1')).toBeUndefined();
  });
});
