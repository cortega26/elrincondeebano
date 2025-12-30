import { log } from './utils/logger.mts';
import { initializeBootstrapUI, showOffcanvas } from './modules/bootstrap.mjs';

import { memoize, debounce, scheduleIdle, cancelScheduledIdle } from './utils/async.mjs';
import { resolveAvifSrcset, buildStaticSrcset } from './utils/image-srcset.mjs';
import {
  fetchWithRetry,
  normalizeProductVersion,
  getStoredProductVersion,
  setStoredProductVersion,
} from './utils/product-data.mjs';
import { createCartManager } from './modules/cart.mjs';
import { createCatalogManager } from './modules/catalog-manager.mjs';
import {
  registerServiceWorker,
  shouldRegisterServiceWorker,
  __resetServiceWorkerRegistrationForTest,
} from './modules/service-worker-manager.mjs';
import { createCheckoutSubmission } from './modules/checkout.mjs';
import {
  getSharedProductData,
  hydrateSharedProductDataFromInline,
  fetchProducts,
  generateStableId,
  normalizeString,
} from './modules/product-data-manager.mjs';
import {
  createSafeElement,
  setupImageSkeletons,
  createProductPicture,
  createCartThumbnail,
  showErrorMessage,
  renderPriceHtml,
  renderQuantityControl,
  setupActionArea,
  toggleActionArea,
} from './modules/ui-components.mjs';
import { filterProducts } from './modules/product-filter.mjs';
import { setupOnlineStatus } from './modules/online-status.mjs';

// Exported for use in modules
export const UTILITY_CLASSES = Object.freeze({
  hidden: 'is-hidden',
  flex: 'is-flex',
  block: 'is-block',
  contentVisible: 'has-content-visibility',
  containIntrinsic: 'has-contain-intrinsic',
});

export { generateStableId };
export const __registerServiceWorkerForTest = registerServiceWorker;
export const __shouldRegisterServiceWorkerForTest = shouldRegisterServiceWorker;
export { __resetServiceWorkerRegistrationForTest };
export const __memoizeForTest = memoize;
export const __resolveAvifSrcsetForTest = resolveAvifSrcset;
export const __buildStaticSrcsetForTest = buildStaticSrcset;
export { fetchWithRetry };
export const __normalizeProductVersionForTest = normalizeProductVersion;
export const __getStoredProductVersionForTest = getStoredProductVersion;
export const __setStoredProductVersionForTest = setStoredProductVersion;
export { fetchProducts };

let updateProductDisplay = null;
let initAppHasRun = false;
let initAppPromise = null;

// Initialize the service worker when running in a browser environment
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  registerServiceWorker();
}

hydrateSharedProductDataFromInline();

// Performance Metrics
const logPerformanceMetrics = (
  perf = typeof window !== 'undefined' ? window.performance : undefined
) => {
  let fcpValue = 'unavailable';
  let domContentLoadedValue = 'unavailable';
  let loadTimeValue = 'unavailable';

  try {
    if (!perf || typeof perf.getEntriesByType !== 'function') {
      return;
    }

    const paintEntries = perf.getEntriesByType('paint') || [];
    const navigationEntries = perf.getEntriesByType('navigation') || [];

    const fcpEntry =
      paintEntries.find((entry) => entry?.name === 'first-contentful-paint') || paintEntries[0];
    if (fcpEntry && typeof fcpEntry.startTime === 'number') {
      fcpValue = fcpEntry.startTime;
    }

    const navigationEntry = navigationEntries[0];
    if (navigationEntry && typeof navigationEntry.domContentLoadedEventEnd === 'number') {
      domContentLoadedValue = navigationEntry.domContentLoadedEventEnd;
    } else if (perf.timing && typeof perf.timing.domContentLoadedEventEnd === 'number') {
      domContentLoadedValue = perf.timing.domContentLoadedEventEnd;
    }

    if (navigationEntry && typeof navigationEntry.loadEventEnd === 'number') {
      loadTimeValue = navigationEntry.loadEventEnd;
    } else if (perf.timing && typeof perf.timing.loadEventEnd === 'number') {
      loadTimeValue = perf.timing.loadEventEnd;
    }
  } catch (error) {
    console.warn('Performance metrics unavailable:', error);
  } finally {
    console.log('First Contentful Paint:', fcpValue);
    console.log('DOM Content Loaded:', domContentLoadedValue);
    console.log('Load Time:', loadTimeValue);
  }
};

export { logPerformanceMetrics };

const cartManager = createCartManager({
  createSafeElement,
  createCartThumbnail,
  toggleActionArea,
  showErrorMessage: (message) => showErrorMessage(message),
  getUpdateProductDisplay: () => updateProductDisplay,
});

const {
  addToCart,
  getCartItemQuantity,
  getCart,
  removeFromCart,
  renderCart,
  resetCart,
  updateQuantity,
  updateCartIcon,
} = cartManager;

export { addToCart, removeFromCart, updateQuantity, updateCartIcon };
export const __getCart = getCart;
export const __resetCart = resetCart;

// Global error handling: be conservative during initial render
if (typeof window !== 'undefined') {
  window.__APP_READY__ = false;

  window.addEventListener('error', (event) => {
    const target = event.target || event.srcElement;
    const isResourceError = !!(
      target &&
      (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')
    );
    const hasRuntimeError = !!event.error;

    // Ignore resource errors and non-runtime errors
    if (isResourceError || !hasRuntimeError) {
      console.warn('Ignored non-fatal error:', {
        tag: target && target.tagName,
        src: target && (target.src || target.href || target.currentSrc),
      });
      return;
    }

    // Only show banner after the app is ready; otherwise just log
    if (!window.__APP_READY__) {
      console.error('Runtime error before app ready:', event.error);
      return;
    }
    console.error('Unhandled JS error:', event.error);
    showErrorMessage('Ocurrió un error inesperado. Por favor, recarga la página.');
  });

  // Avoid noisy CSP warnings breaking UX
  window.addEventListener('securitypolicyviolation', (e) => {
    console.warn('CSP violation (logged only):', {
      blockedURI: e.blockedURI,
      violatedDirective: e.violatedDirective,
      sourceFile: e.sourceFile,
    });
  });
}

// Main function to initialize the application
const initApp = async () => {
  if (initAppPromise) {
    return initAppPromise;
  }

  initAppPromise = (async () => {
    if (initAppHasRun) {
      return;
    }
    initAppHasRun = true;
    console.log('Initializing app...');

  const productContainer = document.getElementById('product-container');
  const sortOptions = document.getElementById('sort-options');
  const filterKeyword = document.getElementById('filter-keyword');
  const cartCountElement = document.getElementById('cart-count');
  const cartItemsElement = document.getElementById('cart-items');
  const cartTotalElement = document.getElementById('cart-total');

  const essentialElements = {
    '#product-container': productContainer,
    '#sort-options': sortOptions,
    '#filter-keyword': filterKeyword,
    '#cart-count': cartCountElement,
    '#cart-items': cartItemsElement,
    '#cart-total': cartTotalElement,
  };

  const missingSelectors = Object.entries(essentialElements)
    .filter(([, element]) => !element)
    .map(([selector]) => selector);

  if (missingSelectors.length) {
    log('warn', 'init_app_missing_dom', {
      missingSelectors,
      location: typeof window !== 'undefined' ? window.location?.pathname : 'unknown',
    });
    return;
  }

  setupImageSkeletons(document);

  const catalogManager = createCatalogManager({
    productContainer,
    sortOptions,
    filterKeyword,
    createSafeElement,
    createProductPicture,
    renderPriceHtml,
    renderQuantityControl,
    setupActionArea,
    addToCart,
    updateQuantity,
    getCartItemQuantity,
    filterProducts,
    memoize,
    debounce,
    scheduleIdle,
    cancelScheduledIdle,
    showErrorMessage,
  });

  updateProductDisplay = catalogManager.updateProductDisplay;

  const { submitCart } = createCheckoutSubmission({
    getCart,
    renderCart,
    showOffcanvas,
  });

  let products = [];
  let userHasInteracted = false;

  function initFooter() {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }
  }

  try {
    initFooter();
    // Initialize Bootstrap UI components
    initializeBootstrapUI();

    const bootstrapPayload = getSharedProductData();
    if (bootstrapPayload?.products?.length) {
      products = bootstrapPayload.products.map((product, index) => ({
        ...product,
        originalIndex: typeof product.originalIndex === 'number' ? product.originalIndex : index,
        categoryKey: product.categoryKey || normalizeString(product.category),
      }));
    }

    const mainElement = document.querySelector('main');
    const currentCategory = mainElement?.dataset?.category || '';
    if (currentCategory) {
      const normCurrent = normalizeString(currentCategory);
      products = products
        .filter(
          (product) => (product.categoryKey || normalizeString(product.category)) === normCurrent
        )
        .map((product, index) => ({
          ...product,
          originalIndex: typeof product.originalIndex === 'number' ? product.originalIndex : index,
        }));
    }

    catalogManager.initialize(products);

    catalogManager.bindFilterEvents({
      log,
      onUserInteraction: () => {
        userHasInteracted = true;
      },
    });

    // Setup Cart Interactions
    const cartIcon = document.getElementById('cart-icon');
    if (cartIcon) {
      cartIcon.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          showOffcanvas('#cartOffcanvas');
        } catch (error) {
          console.error('Failed to open cart offcanvas:', error);
        }
      });
    }

    // Initialize Cart Icon State
    updateCartIcon();
    renderCart();

    // Setup Cart Interaction Listeners (delegation)
    if (typeof cartManager.setupCartInteraction === 'function') {
      cartManager.setupCartInteraction();
    }

    catalogManager.setupDeferredLoading();
    setupOnlineStatus({ indicatorId: 'offline-indicator', utilityClasses: UTILITY_CLASSES });

    const submitButtons = ['checkout-btn', 'submit-cart'];
    submitButtons.forEach((id) => {
      document.getElementById(id)?.addEventListener('click', () => {
        log('info', 'checkout_initiated');
        submitCart();
      });
    });

    window.__APP_READY__ = true;

    // Defer fetching fresh data until main thread is idle
    const idleCompletion = new Promise((resolve) => {
      scheduleIdle(async () => {
        try {
          const freshProducts = await fetchProducts();
          if (!freshProducts) {
            return;
          }

          // If user hasn't interacted, we can safely update everything
          if (!userHasInteracted && (!products || products.length === 0)) {
            products = freshProducts.map((p, i) => ({
              ...p,
              originalIndex: i,
              categoryKey: p.categoryKey || normalizeString(p.category),
            }));

            if (currentCategory) {
              const normCurrent = normalizeString(currentCategory);
              products = products
                .filter(
                  (p) => (p.categoryKey || normalizeString(p.category)) === normCurrent
                )
                .map((p, i) => ({
                  ...p,
                  originalIndex: i,
                }));
            }

            catalogManager.setProducts(products);
            updateProductDisplay();
          } else {
            // Silent background update logic could go here
            // For now, we just log that we have fresh data
            log('info', 'background_data_refresh_complete', { count: freshProducts.length });
          }
        } catch (err) {
          console.warn('Background fetch failed (non-fatal):', err);
        } finally {
          logPerformanceMetrics();
          resolve();
        }
      });
    });

    return idleCompletion;

  } catch (error) {
    console.error('Fatal initialization error:', error);
    showErrorMessage('Error crítico al iniciar la aplicación.');
  }
  })();

  return initAppPromise;
};

export { initApp };

// Start the application
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
