const initFooter = () => {
  const yearSpan = document.getElementById('current-year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
};

const normalizeCatalogProducts = (payload, normalizeString) => {
  if (!payload?.products?.length) {
    return [];
  }
  return payload.products.map((product, index) => ({
    ...product,
    originalIndex: typeof product.originalIndex === 'number' ? product.originalIndex : index,
    categoryKey: product.categoryKey || normalizeString(product.category),
  }));
};

const applyCategoryFilter = (products, normalizeString) => {
  const mainElement = document.querySelector('main');
  const currentCategory = mainElement?.dataset?.category || '';
  if (!currentCategory) {
    return { products, currentCategory: '' };
  }
  const normCurrent = normalizeString(currentCategory);
  const filtered = products
    .filter((product) => (product.categoryKey || normalizeString(product.category)) === normCurrent)
    .map((product, index) => ({
      ...product,
      originalIndex: typeof product.originalIndex === 'number' ? product.originalIndex : index,
    }));
  return { products: filtered, currentCategory };
};

const registerCartIcon = (showOffcanvas) => {
  const cartIcon = document.getElementById('cart-icon');
  if (!cartIcon) return;
  cartIcon.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      showOffcanvas('#cartOffcanvas');
    } catch (error) {
      console.error('Failed to open cart offcanvas:', error);
    }
  });
};

const registerCheckoutButtons = (submitCart, log) => {
  const submitButtons = ['checkout-btn', 'submit-cart'];
  submitButtons.forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (typeof log === 'function') {
        log('info', 'checkout_initiated');
      }
      submitCart();
    });
  });
};

export function runAppBootstrap({
  catalogManager,
  cartManager,
  submitCart,
  initializeBootstrapUI,
  getSharedProductData,
  normalizeString,
  log,
  setupOnlineStatus,
  utilityClasses,
  scheduleIdle,
  fetchProducts,
  logPerformanceMetrics,
  showOffcanvas,
} = {}) {
  initFooter();
  if (typeof initializeBootstrapUI === 'function') {
    initializeBootstrapUI();
  }

  const bootstrapPayload =
    typeof getSharedProductData === 'function' ? getSharedProductData() : null;
  const initialProducts = normalizeCatalogProducts(bootstrapPayload, normalizeString);
  const bootstrapTotal =
    typeof bootstrapPayload?.total === 'number' ? bootstrapPayload.total : null;
  const hasPartialBootstrap =
    Boolean(bootstrapPayload?.isPartial) ||
    (typeof bootstrapTotal === 'number' && bootstrapTotal > initialProducts.length);
  const { products, currentCategory } = applyCategoryFilter(initialProducts, normalizeString);

  catalogManager.initialize(products);

  let userHasInteracted = false;
  catalogManager.bindFilterEvents({
    log,
    onUserInteraction: () => {
      userHasInteracted = true;
    },
  });

  if (typeof showOffcanvas === 'function') {
    registerCartIcon(showOffcanvas);
  }

  if (typeof cartManager?.updateCartIcon === 'function') {
    cartManager.updateCartIcon();
  }
  if (typeof cartManager?.renderCart === 'function') {
    cartManager.renderCart();
  }
  if (typeof cartManager?.setupCartInteraction === 'function') {
    cartManager.setupCartInteraction();
  }

  catalogManager.setupDeferredLoading();
  if (typeof setupOnlineStatus === 'function') {
    setupOnlineStatus({ indicatorId: 'offline-indicator', utilityClasses });
  }

  if (typeof submitCart === 'function') {
    registerCheckoutButtons(submitCart, log);
  }

  if (typeof window !== 'undefined') {
    window.__APP_READY__ = true;
  }

  if (typeof scheduleIdle !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    scheduleIdle(async () => {
      try {
        const freshProducts =
          typeof fetchProducts === 'function' ? await fetchProducts() : null;
        if (!freshProducts) {
          return;
        }

        const shouldRefresh =
          (!userHasInteracted && (!products || products.length === 0)) || hasPartialBootstrap;
        if (shouldRefresh) {
          let nextProducts = freshProducts.map((p, i) => ({
            ...p,
            originalIndex: i,
            categoryKey: p.categoryKey || normalizeString(p.category),
          }));

          if (currentCategory) {
            const normCurrent = normalizeString(currentCategory);
            nextProducts = nextProducts
              .filter(
                (p) => (p.categoryKey || normalizeString(p.category)) === normCurrent
              )
              .map((p, i) => ({
                ...p,
                originalIndex: i,
              }));
          }

          catalogManager.setProducts(nextProducts);
          catalogManager.updateProductDisplay();
        } else if (typeof log === 'function') {
          log('info', 'background_data_refresh_complete', { count: freshProducts.length });
        }
      } catch (err) {
        console.warn('Background fetch failed (non-fatal):', err);
      } finally {
        if (typeof logPerformanceMetrics === 'function') {
          logPerformanceMetrics();
        }
        resolve();
      }
    });
  });
}
