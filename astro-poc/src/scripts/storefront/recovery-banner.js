// Plan 116 (chunk 3): service onboarding dialog + cart recovery banner
// extracted from the storefront.js monolith. Factory with injected
// dependencies; storefront.js remains the composition root.

const RECOVERY_BANNER_TTL_MS = 3600000; // 1 hour

export function createRecoveryBannerController({
  storefrontStorage,
  loadCart,
  saveCart,
  updateBadge,
  renderCart,
  syncAllActionAreas,
  showCartSaveError,
  hidePostSubmitToast,
  isOrderJustSent,
} = {}) {
  function isRecoveryBannerDismissed() {
    const dismissedAt = storefrontStorage.loadJson('recoveryDismissed', 0);
    return dismissedAt > 0 && Date.now() - dismissedAt < RECOVERY_BANNER_TTL_MS;
  }

  function showRecoveryBanner() {
    const banner = document.getElementById('cart-recovery');
    if (!banner) {
      return;
    }
    banner.classList.remove('is-hidden');
    banner.setAttribute('aria-hidden', 'false');
  }

  function hideRecoveryBanner() {
    const banner = document.getElementById('cart-recovery');
    if (!banner) {
      return;
    }
    banner.classList.add('is-hidden');
    banner.setAttribute('aria-hidden', 'true');
  }

  function shouldShowRecoveryBanner(cart) {
    if (!Array.isArray(cart) || cart.length === 0) {
      return false;
    }
    if (isOrderJustSent()) {
      return false;
    }
    if (isRecoveryBannerDismissed()) {
      return false;
    }
    return true;
  }

  function dismissRecoveryBanner() {
    storefrontStorage.saveJson('recoveryDismissed', Date.now());
    hideRecoveryBanner();
  }

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
    showRecoveryBanner,
    hideRecoveryBanner,
    shouldShowRecoveryBanner,
    dismissRecoveryBanner,
    markOrderAsSent,
    initServiceOnboarding,
  };
}
