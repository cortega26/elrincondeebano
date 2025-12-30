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
import { runAppBootstrap } from './modules/app-bootstrap.mjs';
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

  try {
    return runAppBootstrap({
      catalogManager,
      cartManager: {
        updateCartIcon,
        renderCart,
        setupCartInteraction: cartManager.setupCartInteraction,
      },
      submitCart,
      initializeBootstrapUI,
      getSharedProductData,
      normalizeString,
      log,
      setupOnlineStatus,
      utilityClasses: UTILITY_CLASSES,
      scheduleIdle,
      fetchProducts,
      logPerformanceMetrics,
      showOffcanvas,
    });

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
