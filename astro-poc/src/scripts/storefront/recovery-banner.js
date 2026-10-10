// Legacy module path retained for the order-sent action and service onboarding.
// The intrusive cart-recovery banner was removed; persisted carts remain available
// through the navbar cart icon and its quantity badge.

export function createRecoveryBannerController({
  storefrontStorage,
  loadCart,
  saveCart,
  updateBadge,
  renderCart,
  syncAllActionAreas,
  showCartSaveError,
  hidePostSubmitToast,
} = {}) {
  function markOrderAsSent() {
    const cart = loadCart();
    if (cart.length === 0) {
      return;
    }

    if (!saveCart([])) {
      showCartSaveError();
      return;
    }

    storefrontStorage.saveJson('orderLastSentAt', Date.now());
    updateBadge([], { animate: true });
    renderCart([]);
    syncAllActionAreas([]);
    hidePostSubmitToast();
  }

  function initServiceOnboarding() {
    const dialog = document.getElementById('service-guide-dialog');
    if (!(dialog instanceof HTMLElement)) {
      return;
    }

    const triggerSelector = '[data-service-dialog-trigger]';
    const closeSelector = '[data-service-dialog-close]';

    const openDialog = () => {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.hasAttribute('open')) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }

      dialog.setAttribute('aria-hidden', 'false');
      document.body.classList.add('service-dialog-open');
    };

    const closeDialog = () => {
      if (typeof dialog.close === 'function' && dialog.hasAttribute('open')) {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }

      dialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
    };

    document.querySelectorAll(triggerSelector).forEach((trigger) => {
      trigger.addEventListener('click', openDialog);
    });
    document.querySelectorAll(closeSelector).forEach((trigger) => {
      trigger.addEventListener('click', closeDialog);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        closeDialog();
      }
    });
    dialog.addEventListener('close', () => {
      dialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
    });
    dialog.addEventListener('cancel', () => {
      dialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
    });
  }

  return {
    markOrderAsSent,
    initServiceOnboarding,
  };
}
