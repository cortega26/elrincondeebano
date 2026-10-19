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
// test/storefront.cart-controller.spec.js before future edits. Plan 269
// batches addBundleItems' per-item flushes into ONE save/render/badge/sync
// (the measurement showed the extra flushes dominated the bundle click);
// setQty keeps its per-call flush. Never let cross-tab adoption write an
// event back to storage.

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

  // Plan 269: the mutation half of setQty, extracted so addBundleItems can
  // accumulate several items on one working copy before a single flush. The
  // body is byte-for-byte the old inline logic; it only operates on the
  // caller-provided array and reports what happened.
  const mutateCartLine = (workingCart, id, nextQty, fallbackProduct) => {
    const quantity = clampQty(nextQty);
    const candidate = fallbackProduct ? createCartItemFromProduct(fallbackProduct, 1) : null;
    const index = workingCart.findIndex(
      (entry) => entry.id === id || (candidate && sameCartProduct(entry, candidate))
    );
    const previousQuantity = index >= 0 ? workingCart[index].quantity : 0;

    // Same two stock guards the inline body had (adding a missing line and
    // increasing an existing one), hoisted into one condition.
    const outOfStock = fallbackProduct?.stock === false;
    if (outOfStock && (index < 0 || quantity > previousQuantity)) {
      return { blocked: true, quantity: previousQuantity, previousQuantity };
    }

    if (quantity <= 0) {
      if (index >= 0) {
        workingCart.splice(index, 1);
      }
    } else if (index >= 0) {
      // Refresh legacy ID and display fields from the currently selected
      // catalog item when both IDs represent the same physical product.
      const refreshed = fallbackProduct
        ? createCartItemFromProduct(fallbackProduct, quantity)
        : null;
      workingCart[index] = refreshed || { ...workingCart[index], quantity };
    } else if (fallbackProduct) {
      const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
      if (nextItem) {
        workingCart.push(nextItem);
      }
    }

    return { blocked: false, quantity, previousQuantity };
  };

  // Plan 269: persist the sanitized cart, then push the agreed render payloads.
  // scopeId mirrors the old per-item arguments: the item id for a live single
  // mutation, null for a stale snapshot or a batched flush (full sweep).
  const flushCart = (canonicalNextCart, { previousState, scopeId }) => {
    cart = canonicalNextCart;
    const nextState = getCartState(cart);
    updateBadge(cart, {
      animate: previousState.totalItems !== nextState.totalItems,
      totalItems: nextState.totalItems,
    });
    renderCart(cart, {
      animateTotal: previousState.totalAmount !== nextState.totalAmount,
      changedItemId: scopeId,
      totalAmount: nextState.totalAmount,
    });
    renderCompanionSuggestions(cart, companionRules);
    syncAllActionAreas(cart, scopeId);
  };

  const setQty = (id, nextQty, fallbackProduct = null) => {
    // Rebase each shopper action on the current persisted cart, not a stale
    // in-memory snapshot. This prevents unrelated deleted items resurfacing.
    const persistedCart = loadCart();
    const wasStale = JSON.stringify(cart) !== JSON.stringify(persistedCart);
    const nextCart = persistedCart.map((item) => ({ ...item }));
    const previousState = getCartState(persistedCart);
    const { blocked, quantity, previousQuantity } = mutateCartLine(
      nextCart,
      id,
      nextQty,
      fallbackProduct
    );

    if (blocked) {
      return;
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
    flushCart(canonicalNextCart, { previousState, scopeId: wasStale ? null : id });

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

    // Plan 269: one rebase + one working copy for the whole bundle — a
    // duplicate id accumulates sequentially and the sanitized result is
    // persisted exactly once (save → badge → render → sync below).
    const persistedCart = loadCart();
    const wasStale = JSON.stringify(cart) !== JSON.stringify(persistedCart);
    const previousState = getCartState(persistedCart);
    const workingCart = persistedCart.map((item) => ({ ...item }));
    let added = false;
    const signals = [];

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

      // getQty's read, pointed at the working copy (storage has not been
      // written yet): the same-id-twice bundle accumulates on the first add.
      const candidate = createCartItemFromProduct(product, 1);
      const index = workingCart.findIndex(
        (entry) => entry.id === id || (candidate && sameCartProduct(entry, candidate))
      );
      const currentQty = index >= 0 ? workingCart[index].quantity : 0;

      const { blocked, quantity, previousQuantity } = mutateCartLine(
        workingCart,
        id,
        Math.max(currentQty, 0) + 1,
        product
      );
      if (!blocked && quantity > previousQuantity) {
        signals.push(id);
      }
      added = true;
    });

    if (!added) {
      return false;
    }

    const canonicalNextCart = sanitizeCart(workingCart);
    const changed = JSON.stringify(canonicalNextCart) !== JSON.stringify(persistedCart);
    if (changed || wasStale) {
      if (changed && !saveCart(canonicalNextCart)) {
        log('warn', 'cart_save_failed', { reason: 'localStorage_quota' });
        showCartSaveError();
        return true;
      }
      // Batched flush: the old path synced per item with its own id; the full
      // sweep (null) yields the same final quantities on every action area.
      flushCart(canonicalNextCart, { previousState, scopeId: null });

      signals.forEach((id) => {
        trackProductSignal(id, 'addedCount');
      });

      if (cart.length > 0 && isOrderJustSent()) {
        clearLastOrderSentAt();
      }
    }

    return true;
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
