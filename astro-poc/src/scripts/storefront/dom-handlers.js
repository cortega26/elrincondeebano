// Plan 265: the DOM wiring extracted from initStorefront() in the
// storefront.js monolith — the capture click delegation and its branches, the
// change listener, the cart-offcanvas events, the catalog controls and the
// cross-tab storage hookup. Factory with injected dependencies
// (createCartController pattern); storefront.js stays the composition root,
// instantiates the factory and attaches the returned handlers in the original
// order — the click delegate still registers with capture:true.
//
// The moved bodies are frozen: they are byte-identical to the pre-extraction
// code except for the injected targets (`document` -> `documentRef`, `window`
// -> `windowRef`) and the callbacks the composition root now injects. The
// rules are pinned in test/storefront.dom-handlers.spec.js before future
// edits. The telemetry hops in the click delegation fall through on purpose —
// do not add returns; the branch order is the contract.

export function createDomHandlers({
  documentRef,
  windowRef,
  cartController,
  catalogController,
  orderSubmitController,
  setCartOffcanvasState,
  syncMobileCartShortcut,
  getCartState,
  openCartOffcanvas,
  trackAnalyticsEvent,
  isMobileViewport,
  debounce,
  normalizeId,
  log,
  getProductFromCard,
  getProductByIdFromSource,
  getProductCardById,
  submitCartOrder,
  executeSendOrder,
  markOrderAsSent,
  hidePostSubmitToast,
  closeOrderConfirmationDialog,
  getSelectedPaymentValue,
  savePreferredPayment,
  saveSubstitutionPreference,
  syncCheckoutState,
  loadLastOrder,
  hydrateCartFromOrder,
  saveCart,
  showCartSaveError,
  updateBadge,
  renderCart,
  renderCompanionSuggestions,
  syncAllActionAreas,
  companionRules,
  populateProfileForm,
  saveProfile,
  readProfileForm,
  setPreferredPayment,
} = {}) {
  const { getCart, setCart, getQty, setQty, addBundleItems, updateQtyByDelta, clearCart } =
    cartController;

  const syncCartShortcutState = () => {
    const currentCart = getCart();
    const { totalAmount } = getCartState(currentCart);
    syncMobileCartShortcut(currentCart, totalAmount);
  };

  const handleCartOffcanvasOpen = () => {
    setCartOffcanvasState(true);
    syncCartShortcutState();
  };

  const handleCartOffcanvasClose = () => {
    setCartOffcanvasState(false);
    syncCartShortcutState();
  };

  // Plan 245: storage events are adopted by the controller (latest persisted
  // snapshot, read-only — never a replayed event.newValue).
  const attachStorageListener = () => {
    if (typeof windowRef !== 'undefined' && typeof windowRef.addEventListener === 'function') {
      windowRef.addEventListener('storage', cartController.adoptCrossTabEvent);
    }
  };

  const repeatLastOrder = () => {
    const order = loadLastOrder();
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      return;
    }
    const nextCart = hydrateCartFromOrder(order);

    if (!saveCart(nextCart)) {
      showCartSaveError();
      return;
    }

    setCart(nextCart);
    updateBadge(nextCart, { animate: true });
    renderCart(nextCart, { animateTotal: true });
    renderCompanionSuggestions(nextCart, companionRules);
    syncAllActionAreas(nextCart);
    if (order.profile) {
      populateProfileForm(order.profile);
      saveProfile(readProfileForm());
    }
    if (order.payment) {
      setPreferredPayment(order.payment);
      savePreferredPayment(order.payment);
    }
    if (order.substitutionPreference) {
      saveSubstitutionPreference(order.substitutionPreference);
      const substitutionSelect = documentRef.getElementById('substitution-preference');
      if (substitutionSelect instanceof HTMLSelectElement) {
        substitutionSelect.value = order.substitutionPreference;
      }
    }
    syncCheckoutState(nextCart, getCartState(nextCart).totalAmount);
    openCartOffcanvas();
  };

  const onDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const cartIcon = target.closest('#cart-icon');
    if (cartIcon) {
      event.preventDefault();
      openCartOffcanvas();
      return;
    }

    const mobileCartShortcut = target.closest('#mobile-cart-shortcut');
    if (mobileCartShortcut) {
      event.preventDefault();
      trackAnalyticsEvent('mobile_cart_shortcut_click', {
        source: 'floating_shortcut',
      });
      openCartOffcanvas();
      return;
    }

    const notifyWhenBack = target.closest('[data-notify-whatsapp]');
    if (notifyWhenBack) {
      const sku = notifyWhenBack.getAttribute('data-notify-sku') || '';
      const name = notifyWhenBack.getAttribute('data-notify-name') || '';
      trackAnalyticsEvent('notify_when_back', {
        sku,
        name,
      });
    }

    const heroCta = target.closest('[data-home-hero-cta]');
    if (heroCta) {
      const href = heroCta.getAttribute('href') || '';
      trackAnalyticsEvent('home_hero_primary_cta_click', {
        destination: href || '/combos/',
      });
    }

    const repeatBtn = target.closest('[data-repeat-last-order]');
    if (repeatBtn) {
      event.preventDefault();
      repeatLastOrder();
      return;
    }

    const bundleBtn = target.closest('[data-bundle-payload]');
    if (bundleBtn) {
      event.preventDefault();
      try {
        const bundleItems = JSON.parse(bundleBtn.getAttribute('data-bundle-payload') || '[]');
        if (addBundleItems(bundleItems)) {
          openCartOffcanvas();
        }
      } catch (error) {
        log('warn', 'bundle_payload_parse_failed', { error });
      }
      return;
    }

    const addBtn = target.closest('.add-to-cart-btn');
    if (addBtn) {
      if (addBtn instanceof HTMLButtonElement && addBtn.disabled) {
        return;
      }
      event.preventDefault();
      const id = normalizeId(addBtn.getAttribute('data-id'));
      const card = addBtn.closest('.producto');
      const product = getProductFromCard(card);
      if (id && product && product.stock !== false) {
        addBtn.classList.add('is-added');
        globalThis.setTimeout(() => {
          addBtn.classList.remove('is-added');
        }, 280);
        setQty(id, Math.max(getQty(id, product), 0) + 1, product);
        if (isMobileViewport()) {
          trackAnalyticsEvent('mobile_add_to_cart', {
            id,
            name: product.name,
            price: product.price,
          });
        }
      }
      return;
    }

    const companionAddBtn = target.closest('[data-role="companion-add"]');
    if (companionAddBtn) {
      event.preventDefault();
      const id = normalizeId(companionAddBtn.getAttribute('data-id'));
      const product = getProductByIdFromSource(id) || getProductFromCard(getProductCardById(id));
      if (id && product && product.stock !== false) {
        setQty(id, Math.max(getQty(id, product), 0) + 1, product);
      }
      return;
    }

    const qtyBtn = target.closest('.quantity-btn');
    if (qtyBtn) {
      event.preventDefault();
      const id = normalizeId(qtyBtn.getAttribute('data-id'));
      const action = qtyBtn.getAttribute('data-action');
      if (id && action === 'increase') {
        updateQtyByDelta(id, 1);
      }
      if (id && action === 'decrease') {
        updateQtyByDelta(id, -1);
      }
      return;
    }

    const removeBtn = target.closest('.remove-item');
    if (removeBtn) {
      event.preventDefault();
      const id = normalizeId(removeBtn.getAttribute('data-id'));
      if (id) {
        setQty(id, 0);
      }
      return;
    }

    const emptyBtn = target.closest('#empty-cart');
    if (emptyBtn) {
      event.preventDefault();
      if (globalThis.confirm('¿Quieres vaciar el carrito completo?')) {
        clearCart();
      }
      return;
    }

    const submitBtn = target.closest('#submit-cart');
    if (submitBtn) {
      event.preventDefault();
      submitCartOrder(getCart());
      return;
    }

    const confirmSendBtn = target.closest('#order-confirm-send');
    if (confirmSendBtn) {
      event.preventDefault();
      const pending = orderSubmitController.takePendingOrder();
      executeSendOrder(pending);
      return;
    }

    const markSentBtn = target.closest('#order-mark-sent');
    if (markSentBtn) {
      event.preventDefault();
      markOrderAsSent();
      return;
    }

    const dismissToastBtn = target.closest('#order-toast-dismiss');
    if (dismissToastBtn) {
      event.preventDefault();
      hidePostSubmitToast();
      return;
    }

    const orderConfirmClose = target.closest('[data-order-confirm-close]');
    if (orderConfirmClose) {
      event.preventDefault();
      closeOrderConfirmationDialog();
      orderSubmitController.takePendingOrder();
    }
  };

  const onDocumentChange = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.id === 'sort-options' || target.id === 'filter-discount') {
      catalogController.resetVisibleLimit();
      catalogController.updateView();
      return;
    }

    if (target.matches('input[name="paymentMethod"]')) {
      const paymentError = documentRef.getElementById('payment-error');
      if (paymentError) {
        paymentError.textContent = '';
      }
      const selectedPayment = getSelectedPaymentValue();
      if (selectedPayment) {
        savePreferredPayment(selectedPayment);
      }
      const currentCart = getCart();
      const { totalAmount } = getCartState(currentCart);
      syncCheckoutState(currentCart, totalAmount);
      return;
    }

    if (target.id === 'substitution-preference' && target instanceof HTMLSelectElement) {
      saveSubstitutionPreference(target.value);
    }
  };

  const onKeywordInput = debounce(() => {
    catalogController.resetVisibleLimit();
    catalogController.updateView();
  });

  const onLoadMoreClick = () => {
    catalogController.loadMore();
  };

  const onClearClick = () => {
    const keywordField = documentRef.getElementById('filter-keyword');
    const sortField = documentRef.getElementById('sort-options');
    const discountField = documentRef.getElementById('filter-discount');
    if (keywordField instanceof HTMLInputElement) {
      keywordField.value = '';
      keywordField.focus();
    }
    if (sortField instanceof HTMLSelectElement) {
      sortField.value = 'original';
    }
    if (discountField instanceof HTMLInputElement) {
      discountField.checked = false;
    }
    catalogController.resetVisibleLimit();
    catalogController.updateView();
  };

  // Plan 215: el estado vacío reutiliza el Limpiar principal (resetea
  // búsqueda + orden + ofertas y devuelve el foco al campo de búsqueda).
  const onEmptyClearClick = () => {
    documentRef.getElementById('filter-clear')?.click();
  };

  return {
    handleCartOffcanvasOpen,
    handleCartOffcanvasClose,
    attachStorageListener,
    onDocumentClick,
    onDocumentChange,
    onKeywordInput,
    onLoadMoreClick,
    onClearClick,
    onEmptyClearClick,
  };
}
