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
  function trackProductSignal(productId, field) {
    if (!productId || !field) {
      return;
    }

    const signals = loadProductSignals();
    const current =
      signals[productId] && typeof signals[productId] === 'object' ? signals[productId] : {};
    current[field] = parseNumber(current[field], 0) + 1;
    current.lastSeenAt = new Date().toISOString();
    signals[productId] = current;
    saveProductSignals(signals);
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

  function scoreProductId(productId) {
    const signals = loadProductSignals();
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
      ranked.set(productId, (ranked.get(productId) || 0) + scoreProductId(productId));
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
  };
}
