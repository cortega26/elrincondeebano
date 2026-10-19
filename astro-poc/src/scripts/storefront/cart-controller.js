// Plan 245: the cart mutation rules extracted from initStorefront() in the
// storefront.js monolith — getQty/setQty/addBundleItems, the per-click delta
// helper, the cross-tab adoption path and the empty-cart flow. Factory with
// injected dependencies (createCartViewController pattern); storefront.js
// stays the composition root and keeps only DOM/bootstrap wiring.
//
// The moved bodies are frozen: they are byte-identical to the pre-extraction
// code (including the plan 219 persist-first/rebase rules and the plan 231
// read-only cross-tab adoption) and the composition root injects the same
// closures the inline functions used. Rules are pinned in
// test/storefront.cart-controller.spec.js before future edits. Do not batch
// the per-item renders of addBundleItems here (plan 250 owns that) and never
// let cross-tab adoption write an event back to storage.

export function createCartController({
  loadCart,
  saveCart,
  sanitizeCart,
  clampQty,
  getCartState,
  createCartItemFromProduct,
  sameCartProduct,
  normalizeId,
  parseNumber,
  getProductByIdFromSource,
  getProductFromCard,
  getProductCardById,
  adoptCartSnapshot,
  storefrontStorage,
  storageKeys,
  trackProductSignal,
  showCartSaveError,
  isOrderJustSent,
  clearLastOrderSentAt,
  log,
  updateBadge,
  renderCart,
  renderCompanionSuggestions,
  syncAllActionAreas,
  companionRules,
} = {}) {
  // The controller owns the in-memory snapshot; every mutation rebases from
  // persisted storage and persists before rendering.
  let cart = loadCart();

  function getCart() {
    return cart;
  }

  function setCart(nextCart) {
    cart = nextCart;
  }

  const getQty = (id, product = null) => {
    // Resolve old and current SKU identifiers for the same physical item.
    // A different tab may also have committed a deletion before this event.
    const candidate = product ? createCartItemFromProduct(product, 1) : null;
    const item = loadCart().find(
      (entry) => entry.id === id || (candidate && sameCartProduct(entry, candidate))
    );
    return item ? item.quantity : 0;
  };

  const setQty = (id, nextQty, fallbackProduct = null) => {
    // Rebase each shopper action on the current persisted cart, not a stale
    // in-memory snapshot. This prevents unrelated deleted items resurfacing.
    const persistedCart = loadCart();
    const wasStale = JSON.stringify(cart) !== JSON.stringify(persistedCart);
    const nextCart = persistedCart.map((item) => ({ ...item }));
    const quantity = clampQty(nextQty);
    const candidate = fallbackProduct ? createCartItemFromProduct(fallbackProduct, 1) : null;
    const index = nextCart.findIndex(
      (entry) => entry.id === id || (candidate && sameCartProduct(entry, candidate))
    );
    const previousState = getCartState(persistedCart);
    const previousQuantity = index >= 0 ? nextCart[index].quantity : 0;

    if (index < 0 && fallbackProduct?.stock === false) {
      return;
    }

    if (quantity <= 0) {
      if (index >= 0) {
        nextCart.splice(index, 1);
      }
    } else if (index >= 0) {
      if (quantity > previousQuantity && fallbackProduct?.stock === false) {
        return;
      }
      // Refresh legacy ID and display fields from the currently selected
      // catalog item when both IDs represent the same physical product.
      const refreshed = fallbackProduct
        ? createCartItemFromProduct(fallbackProduct, quantity)
        : null;
      nextCart[index] = refreshed || { ...nextCart[index], quantity };
    } else if (fallbackProduct) {
      const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
      if (nextItem) {
        nextCart.push(nextItem);
      }
    }

    // Render exactly what was persisted; never render an unnormalized cart
    // whose duplicates were removed only inside saveCart().
    const canonicalNextCart = sanitizeCart(nextCart);
    const changed = JSON.stringify(canonicalNextCart) !== JSON.stringify(persistedCart);
    if (!changed && !wasStale) {
      return;
    }
    if (changed && !saveCart(canonicalNextCart)) {
      log('warn', 'cart_save_failed', { reason: 'localStorage_quota' });
      showCartSaveError();
      return;
    }
    // Persist-first: no rollback of a mutated shared array is necessary.
    cart = canonicalNextCart;
    const nextState = getCartState(cart);
    updateBadge(cart, {
      animate: previousState.totalItems !== nextState.totalItems,
      totalItems: nextState.totalItems,
    });
    renderCart(cart, {
      animateTotal: previousState.totalAmount !== nextState.totalAmount,
      changedItemId: wasStale ? null : id,
      totalAmount: nextState.totalAmount,
    });
    renderCompanionSuggestions(cart, companionRules);
    syncAllActionAreas(cart, wasStale ? null : id);

    if (quantity > previousQuantity) {
      trackProductSignal(id, 'addedCount');
    }

    if (cart.length > 0 && isOrderJustSent()) {
      clearLastOrderSentAt();
    }
  };

  const addBundleItems = (bundleItems) => {
    if (!Array.isArray(bundleItems) || bundleItems.length === 0) {
      return false;
    }

    let added = false;
    bundleItems.forEach((item) => {
      const id = normalizeId(item?.id);
      if (!id) {
        return;
      }

      const fallbackProduct = {
        id,
        name: typeof item?.name === 'string' ? item.name : id,
        category: typeof item?.category === 'string' ? item.category : '',
        price: parseNumber(item?.price, 0),
        image: typeof item?.image === 'string' ? item.image : '',
      };

      const product =
        getProductByIdFromSource(id) ||
        getProductFromCard(getProductCardById(id)) ||
        fallbackProduct;
      setQty(id, Math.max(getQty(id, product), 0) + 1, product);
      added = true;
    });

    return added;
  };

  const updateQtyByDelta = (id, delta) => {
    const card = getProductCardById(id);
    const fallbackProduct = getProductFromCard(card);
    const current = getQty(id, fallbackProduct);
    const next = current + delta;
    setQty(id, next, fallbackProduct);
  };

  // Storage events can arrive after a newer write. Read the latest persisted
  // snapshot rather than replaying event.newValue; never write an event back.
  const adoptCrossTabEvent = (event) => {
    if (!event || (event.key !== storageKeys.cart && event.key !== null)) {
      return;
    }
    if (event.storageArea && event.storageArea !== globalThis.localStorage) {
      return;
    }
    // Read the current key even for a delayed clear() event: another tab may
    // have saved a newer cart already. Never fall back to a stale legacy alias.
    const canonicalRaw = globalThis.localStorage?.getItem(storageKeys.cart);
    const persisted = canonicalRaw == null ? [] : storefrontStorage.loadJson('cart', null);
    const latest = adoptCartSnapshot(cart, persisted);
    if (JSON.stringify(latest) === JSON.stringify(cart)) {
      return;
    }
    cart = latest;
    updateBadge(cart, {});
    renderCart(cart, {});
    renderCompanionSuggestions(cart, companionRules);
    syncAllActionAreas(cart);
  };

  const clearCart = () => {
    if (!saveCart([])) {
      showCartSaveError();
      return false;
    }
    cart = [];
    updateBadge(cart, { animate: true });
    renderCart(cart, { animateTotal: true });
    syncAllActionAreas(cart);
    return true;
  };

  return {
    getCart,
    setCart,
    getQty,
    setQty,
    addBundleItems,
    updateQtyByDelta,
    adoptCrossTabEvent,
    clearCart,
  };
}
