// Plan 187: card lookup registry extracted from the storefront.js monolith
// (plan-116 direction) — map-first lookups with a document-wide fallback,
// unit-testable without booting the storefront. The map covers
// #product-container (invalidated on every catalog view update); cards from
// other grids resolve through the fallback scan.
import { normalizeId } from './storefront-state.js';

let productCardCache = null;

export function getProductCardMap() {
  if (productCardCache) {
    return productCardCache;
  }
  productCardCache = new Map();
  document.querySelectorAll('#product-container .producto').forEach((card) => {
    if (card instanceof HTMLElement) {
      const id = normalizeId(card.dataset.productId);
      if (id) productCardCache.set(id, card);
    }
  });
  return productCardCache;
}

export function invalidateProductCardCache() {
  productCardCache = null;
}

export function getProductCardById(id) {
  const normalized = normalizeId(id);
  const cached = getProductCardMap().get(normalized);
  if (cached instanceof HTMLElement && cached.isConnected) {
    return cached;
  }
  return Array.from(document.querySelectorAll('.producto')).find(
    (card) => card instanceof HTMLElement && normalizeId(card.dataset.productId) === normalized
  );
}
