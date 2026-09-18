export function createPersonalizationEngine({
  loadLastOrder,
  saveLastOrder,
  loadRecentOrders,
  saveRecentOrders,
  loadProductSignals,
  saveProductSignals,
  parseNumber,
  getVisibleProductIds,
  resolveProductById,
  maxPersonalizedItems = 4,
} = {}) {
  // Plan 187: coalesce signal writes — every quantity click used to parse,
  // mutate, and rewrite the whole signals object synchronously. Mutations
  // now accumulate on a pending object flushed on a trailing timer (plus
  // page-hide), with readers seeing the merged view so behavior is unchanged.
  let pendingSignals = null;
  let flushTimer = null;

  function currentSignals() {
    if (!pendingSignals) {
      const loaded = loadProductSignals();
      pendingSignals = loaded && typeof loaded === 'object' ? loaded : {};
    }
    return pendingSignals;
  }

  function flushProductSignals() {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pendingSignals) {
      return;
    }
    const pending = pendingSignals;
    pendingSignals = null;
    try {
      // Merge over a fresh base so a concurrent tab's signals are not
      // clobbered — last-writer-wins only per product entry, not per file.
      const base = loadProductSignals();
      const merged = base && typeof base === 'object' ? { ...base, ...pending } : { ...pending };
      saveProductSignals(merged);
    } catch {
      // Signals are advisory: a failed flush must never break the shopper's
      // click (previously the synchronous save could throw into setQty).
    }
  }

  function scheduleFlush() {
    if (flushTimer !== null) {
      return;
    }
    if (typeof setTimeout !== 'function') {
      flushProductSignals();
      return;
    }
    flushTimer = setTimeout(flushProductSignals, 500);
    if (
      flushTimer !== null &&
      typeof flushTimer === 'object' &&
      typeof flushTimer.unref === 'function'
    ) {
      flushTimer.unref();
    }
  }

  // Never lose the trailing batch to an unload (guarded for non-DOM/test envs).
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushProductSignals();
    });
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', flushProductSignals);
    }
  }

  function trackProductSignal(productId, field) {
    if (!productId || !field) {
      return;
    }

    const signals = currentSignals();
    const current =
      signals[productId] && typeof signals[productId] === 'object' ? signals[productId] : {};
    current[field] = parseNumber(current[field], 0) + 1;
    current.lastSeenAt = new Date().toISOString();
    signals[productId] = current;
    scheduleFlush();
  }

  function recordOrder(cart, profile, payment, substitutionPreference) {
    const timestamp = new Date().toISOString();
    const order = {
      timestamp,
      payment,
      substitutionPreference,
      profile,
      items: cart.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
      })),
    };

    saveLastOrder(order);
    saveRecentOrders([order, ...loadRecentOrders()]);

    // Persist any coalesced add-signals first so the fresh load below sees
    // them; order persistence itself stays synchronous (never debounced).
    flushProductSignals();
    const signals = loadProductSignals();
    order.items.forEach((item) => {
      const current =
        signals[item.id] && typeof signals[item.id] === 'object' ? signals[item.id] : {};
      current.orderedCount = parseNumber(current.orderedCount, 0) + 1;
      current.lastOrderedAt = timestamp;
      signals[item.id] = current;
    });
    saveProductSignals(signals);
  }

  function scoreProductId(productId, signals) {
    const signal =
      signals[productId] && typeof signals[productId] === 'object' ? signals[productId] : {};
    let score = parseNumber(signal.addedCount, 0) * 2 + parseNumber(signal.orderedCount, 0) * 5;

    if (signal.lastSeenAt) {
      const age = Date.now() - new Date(signal.lastSeenAt).getTime();
      if (Number.isFinite(age) && age < 1000 * 60 * 60 * 24 * 7) {
        score += 2;
      }
    }

    if (signal.lastOrderedAt) {
      const age = Date.now() - new Date(signal.lastOrderedAt).getTime();
      if (Number.isFinite(age) && age < 1000 * 60 * 60 * 24 * 14) {
        score += 3;
      }
    }

    return score;
  }

  function getPersonalizedProductIds() {
    const ranked = new Map();
    const lastOrder = loadLastOrder();
    const recentOrders = loadRecentOrders();
    const signals = currentSignals();

    if (lastOrder && Array.isArray(lastOrder.items)) {
      lastOrder.items.forEach((item, index) => {
        ranked.set(item.id, (ranked.get(item.id) || 0) + 12 - index);
      });
    }

    recentOrders.forEach((order, orderIndex) => {
      if (!Array.isArray(order?.items)) {
        return;
      }

      order.items.forEach((item) => {
        ranked.set(item.id, (ranked.get(item.id) || 0) + Math.max(6 - orderIndex, 1));
      });
    });

    getVisibleProductIds().forEach((productId) => {
      if (!productId) {
        return;
      }
      ranked.set(productId, (ranked.get(productId) || 0) + scoreProductId(productId, signals));
    });

    return [...ranked.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([productId]) => productId)
      .filter((productId) => !!resolveProductById(productId))
      .slice(0, maxPersonalizedItems);
  }

  return {
    trackProductSignal,
    recordOrder,
    getPersonalizedProductIds,
    // Plan 187: test seam + explicit flush point (page-hide uses it too).
    flushProductSignals,
  };
}
