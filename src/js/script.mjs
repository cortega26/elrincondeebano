import { log, createCorrelationId } from './utils/logger.mts';
import { resolveProductDataUrl } from './utils/data-endpoint.mjs';
import { safeReload } from './utils/safe-reload.mjs';
import { memoize, debounce, scheduleIdle, cancelScheduledIdle } from './utils/async.mjs';
import {
  fetchWithRetry,
  normalizeProductVersion,
  getStoredProductVersion,
  setStoredProductVersion,
  ProductDataError,
} from './utils/product-data.mjs';
import {
  normaliseAssetPath,
  buildCfSrc,
  buildCfSrcset,
  buildStaticSrcset,
  resolveAvifSrcset,
} from './utils/image-srcset.mjs';
import { showOffcanvas } from './modules/bootstrap.mjs';

const PRODUCT_DATA_GLOBAL_KEY = '__PRODUCT_DATA__';
let sharedProductData = null;

const UTILITY_CLASSES = Object.freeze({
  hidden: 'is-hidden',
  flex: 'is-flex',
  block: 'is-block',
  contentVisible: 'has-content-visibility',
  containIntrinsic: 'has-contain-intrinsic',
});

const PRODUCT_IMAGE_SIZES = '(max-width: 575px) 200px, (max-width: 991px) 45vw, 280px';
const CART_IMAGE_WIDTHS = Object.freeze([80, 120, 160]);
function getSharedProductData() {
  if (typeof window !== 'undefined') {
    const payload = window[PRODUCT_DATA_GLOBAL_KEY];
    if (payload && Array.isArray(payload.products)) {
      return payload;
    }
  }
  if (sharedProductData && Array.isArray(sharedProductData.products)) {
    return sharedProductData;
  }
  return null;
}

function writeSharedProductData(products, metadata = {}, { force = false } = {}) {
  if (!Array.isArray(products)) {
    return null;
  }
  const payload = {
    products,
    version: metadata.version || null,
    source: metadata.source || null,
    updatedAt: metadata.updatedAt || Date.now(),
    isPartial: Boolean(metadata.isPartial),
    total: typeof metadata.total === 'number' ? metadata.total : null,
  };
  const existing = getSharedProductData();
  if (existing && !force) {
    const existingVersion = existing.version || null;
    const payloadVersion = payload.version || null;
    const shouldKeepExisting =
      (!payloadVersion && existingVersion) ||
      (!payloadVersion && !existingVersion) ||
      (payloadVersion && existingVersion === payloadVersion);
    if (shouldKeepExisting) {
      return existing;
    }
  }
  sharedProductData = payload;
  if (typeof window !== 'undefined') {
    window[PRODUCT_DATA_GLOBAL_KEY] = { ...payload };
  }
  return payload;
}

function ensureSharedProductData(products, metadata = {}) {
  return writeSharedProductData(products, metadata, { force: false });
}

function overwriteSharedProductData(products, metadata = {}) {
  return writeSharedProductData(products, metadata, { force: true });
}

// Service Worker Configuration and Initialization
const SERVICE_WORKER_CONFIG = {
  path: '/service-worker.js',
  scope: '/',
  updateCheckInterval: 5 * 60 * 1000, // 5 minutes
};

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function safeReadLocalStorage(key) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storage = window.localStorage ?? globalThis.localStorage ?? null;
    if (!storage) {
      return null;
    }
    return storage.getItem(key);
  } catch (error) {
    console.warn('Unable to access localStorage for key', key, error);
    return null;
  }
}

function shouldRegisterServiceWorker() {
  if (typeof window === 'undefined') {
    return false;
  }

  const disabledFlag = safeReadLocalStorage('ebano-sw-disabled');
  if (disabledFlag === 'true') {
    console.info('Service worker registration skipped by kill-switch flag.');
    return false;
  }

  const hostname = window.location?.hostname ?? '';
  const isLocalhost = LOCALHOST_HOSTNAMES.has(hostname);
  if (isLocalhost) {
    const enableLocalFlag = safeReadLocalStorage('ebano-sw-enable-local');
    const query = window.location?.search ?? '';
    const queryEnables = typeof query === 'string' && /(?:^|[?&])sw=on(?:&|$)/i.test(query);
    if (enableLocalFlag === 'true' || queryEnables) {
      return true;
    }
    console.info(
      'Service worker registration skipped on localhost. Set localStorage ebano-sw-enable-local=true to override.'
    );
    return false;
  }

  return true;
}

let serviceWorkerRegistrationSetup = false;
let initAppHasRun = false;

// Enhanced service worker registration with proper error handling and lifecycle management
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers are not supported in this browser');
    return;
  }

  if (!shouldRegisterServiceWorker()) {
    return;
  }

  if (serviceWorkerRegistrationSetup) {
    return;
  }

  serviceWorkerRegistrationSetup = true;

  const startRegistration = async () => {
    if (document.readyState !== 'complete') {
      return;
    }

    window.removeEventListener('load', startRegistration);

    try {
      await initializeServiceWorker();
    } catch (error) {
      console.error('Service Worker initialization failed:', error);
      showServiceWorkerError(
        'Failed to initialize service worker. Some features may not work offline.'
      );
    }
  };

  window.addEventListener('load', startRegistration);
  startRegistration();
}

function __resetServiceWorkerRegistrationForTest() {
  serviceWorkerRegistrationSetup = false;
}

// Initialize the service worker and set up event handlers
async function initializeServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_CONFIG.path, {
      scope: SERVICE_WORKER_CONFIG.scope,
    });

    console.log('ServiceWorker registered successfully:', registration.scope);

    // Set up update handling
    setupUpdateHandling(registration);

    // Set up periodic update checks
    setupPeriodicUpdateCheck(registration);

    // Handle controller changes
    setupControllerChangeHandling();

    // Set up offline/online detection
    setupConnectivityHandling();
  } catch (error) {
    console.error('ServiceWorker registration failed:', error);
    throw error;
  }
}

// Set up handling for service worker updates
function setupUpdateHandling(registration) {
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // Immediately activate the new service worker without a prompt
        newWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });
}

// Set up periodic checks for service worker updates
function setupPeriodicUpdateCheck(registration) {
  // Initial check
  checkForUpdates(registration);

  // Set up periodic checks
  setInterval(() => {
    checkForUpdates(registration);
  }, SERVICE_WORKER_CONFIG.updateCheckInterval);
}

// Check for service worker updates
async function checkForUpdates(registration) {
  try {
    try {
      await registration.update();
    } catch (error) {
      console.warn('Service worker update check failed:', error);
    }

    // Check if product data needs updating
    const url = resolveProductDataUrl();
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      const currentVersion = normalizeProductVersion(data.version);
      const storedVersion = getStoredProductVersion();

      if (!currentVersion) {
        return;
      }

      if (currentVersion !== storedVersion) {
        registration.active?.postMessage({
          type: 'INVALIDATE_PRODUCT_CACHE',
        });

        setStoredProductVersion(currentVersion);
        if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOKS__ === true) {
          window.__updateNotificationCount =
            typeof window.__updateNotificationCount === 'number'
              ? window.__updateNotificationCount + 1
              : 1;
          window.__lastUpdateVersion = currentVersion;
        }
        showUpdateNotification(null, 'New product data available');
      }
    }
  } catch (error) {
    console.warn('Update check failed:', error);
  }
}

async function runUpdateCheckForTest() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return null;
  }
  if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOKS__ === true) {
    const overrideVersion = normalizeProductVersion(window.__TEST_UPDATE_VERSION__);
    if (overrideVersion) {
      const storedVersion = getStoredProductVersion();
      const updated = overrideVersion !== storedVersion;
      if (updated) {
        setStoredProductVersion(overrideVersion);
        window.__updateNotificationCount =
          typeof window.__updateNotificationCount === 'number'
            ? window.__updateNotificationCount + 1
            : 1;
        window.__lastUpdateVersion = overrideVersion;
        showUpdateNotification(null, 'New product data available');
      }
      return { updated, currentVersion: overrideVersion, storedVersion };
    }
  }
  let registration = null;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    registration = null;
  }
  if (!registration) {
    try {
      registration = await navigator.serviceWorker.getRegistration();
    } catch {
      registration = null;
    }
  }
  if (!registration) {
    return null;
  }
  return checkForUpdates(registration);
}

// Set up handling for service worker controller changes
function setupControllerChangeHandling() {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      if (typeof window !== 'undefined' && window.__DISABLE_SW_RELOAD__ === true) {
        refreshing = true;
        return;
      }
      refreshing = true;
      window.location.reload();
    }
  });
}

// Set up handling for online/offline connectivity
function setupConnectivityHandling() {
  const offlineIndicator = document.getElementById('offline-indicator');
  if (!offlineIndicator) {
    return;
  }
  const updateOnlineStatus = () => {
    const hidden = navigator.onLine;
    offlineIndicator.classList.toggle(UTILITY_CLASSES.hidden, hidden);
    offlineIndicator.classList.toggle(UTILITY_CLASSES.block, !hidden);

    if (!hidden) {
      showConnectivityNotification('You are currently offline. Some features may be limited.');
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  if (!navigator.onLine) {
    updateOnlineStatus();
  }
}

// Notifications are lazy-loaded to reduce initial JS
let __notificationsModulePromise = null;
function __loadNotifications() {
  if (!__notificationsModulePromise) {
    __notificationsModulePromise = import('./modules/notifications.mjs');
  }
  return __notificationsModulePromise;
}

function showUpdateNotification(serviceWorker, message = 'Una versión está disponible') {
  __loadNotifications().then((m) => m.showUpdateNotification(serviceWorker, message));
}

function showServiceWorkerError(message) {
  __loadNotifications().then((m) => m.showServiceWorkerError(message));
}

function showConnectivityNotification(message) {
  __loadNotifications().then((m) => m.showConnectivityNotification(message));
}

// Initialize the service worker when running in a browser environment
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  registerServiceWorker();
}

// Utility functions are defined in ./utils/async.mjs

// Normalize strings for robust comparisons (remove accents, spaces, punctuation, lowercased)
const normalizeString = (str) => {
  if (!str) return '';
  try {
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  } catch {
    return String(str).toLowerCase();
  }
};

// Add this utility function for generating stable product IDs
const DEFAULT_CATEGORY = 'General';
const DEFAULT_PRODUCT_NAME_PREFIX = 'Producto';

const generateStableId = (product, index = 0) => {
  const hasValidShape = product && typeof product === 'object';
  const rawName = hasValidShape && typeof product.name === 'string' ? product.name.trim() : '';
  const rawCategory =
    hasValidShape && typeof product.category === 'string' ? product.category.trim() : '';

  const safeName = rawName.length > 0 ? rawName : `${DEFAULT_PRODUCT_NAME_PREFIX}-${index + 1}`;
  const safeCategory = rawCategory.length > 0 ? rawCategory : DEFAULT_CATEGORY;

  const baseString = `${safeName}-${safeCategory}`.toLowerCase();

  let hash = 0;
  for (let i = 0; i < baseString.length; i += 1) {
    const charCode = baseString.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash &= hash; // Convert to 32-bit integer
  }

  const needsFallbackSuffix = rawName.length === 0 || rawCategory.length === 0;
  const suffix = needsFallbackSuffix ? `-${index}` : '';

  return `pid-${Math.abs(hash)}${suffix}`;
};

const sanitizeHTML = (unsafe) => {
  const element = document.createElement('div');
  element.textContent = unsafe;
  return element.innerHTML;
};

const INLINE_PRODUCT_SCRIPT_ID = 'product-data';

const parseInlineProductData = () => {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    const script = document.getElementById(INLINE_PRODUCT_SCRIPT_ID);
    if (!script || !script.textContent) {
      return null;
    }
    const payload = script.textContent.trim();
    if (!payload) {
      return null;
    }
    const parsed = JSON.parse(payload);
    if (!parsed) {
      return null;
    }
    if (Array.isArray(parsed.initialProducts)) {
      return parsed;
    }
    if (Array.isArray(parsed.products)) {
      return { ...parsed, initialProducts: parsed.products };
    }
    return null;
  } catch (error) {
    log('warn', 'inline_product_parse_failure', { error: error.message });
    return null;
  }
};

const transformProduct = (product, index) => {
  if (!product || typeof product !== 'object') {
    return null;
  }

  const id =
    typeof product.id === 'string' && product.id.trim().length > 0
      ? product.id.trim()
      : generateStableId(product, index);

  const originalIndex =
    typeof product.originalIndex === 'number'
      ? product.originalIndex
      : typeof product.order === 'number'
        ? product.order
        : index;

  const safeName =
    typeof product.name === 'string' && product.name.trim().length > 0
      ? product.name
      : `${DEFAULT_PRODUCT_NAME_PREFIX} ${index + 1}`;

  const safeDescription = typeof product.description === 'string' ? product.description : '';
  const safeCategory =
    typeof product.category === 'string' && product.category.trim().length > 0
      ? product.category
      : DEFAULT_CATEGORY;
  const safeImagePath = typeof product.image_path === 'string' ? product.image_path : '';
  const safeImageAvifPath =
    typeof product.image_avif_path === 'string' ? product.image_avif_path : '';

  return {
    ...product,
    id,
    name: sanitizeHTML(safeName),
    description: sanitizeHTML(safeDescription),
    category: sanitizeHTML(safeCategory),
    categoryKey: product.categoryKey || normalizeString(safeCategory),
    image_path: safeImagePath,
    image_avif_path: safeImageAvifPath,
    originalIndex,
  };
};

const transformProducts = (products = []) =>
  products.map((product, index) => transformProduct(product, index)).filter(Boolean);

function hydrateSharedProductDataFromInline() {
  const existing = getSharedProductData();
  if (existing) {
    return existing;
  }
  const inlineData = parseInlineProductData();
  if (!inlineData || !Array.isArray(inlineData.initialProducts)) {
    return null;
  }
  const transformed = transformProducts(inlineData.initialProducts);
  return ensureSharedProductData(transformed, {
    version: inlineData.version || null,
    source: 'inline',
    isPartial: true,
    total:
      typeof inlineData.totalProducts === 'number' ? inlineData.totalProducts : transformed.length,
  });
}

hydrateSharedProductDataFromInline();

// Modify the fetchProducts function
const fetchProducts = async () => {
  const correlationId = createCorrelationId();
  const inlineData = parseInlineProductData();
  const inlineSource = inlineData?.initialProducts || null;
  const inlineVersion = normalizeProductVersion(inlineData?.version);
  const inlineTotal =
    typeof inlineData?.totalProducts === 'number' ? inlineData.totalProducts : null;
  const inlineProducts = Array.isArray(inlineSource) ? transformProducts(inlineSource) : null;
  const hasInlineProducts = Array.isArray(inlineProducts);
  const storedVersion = getStoredProductVersion();

  if (hasInlineProducts) {
    if (inlineVersion) {
      setStoredProductVersion(inlineVersion);
    }
    ensureSharedProductData(inlineProducts, {
      version: inlineVersion || null,
      source: 'inline',
      isPartial: true,
      total: inlineTotal ?? inlineProducts.length,
    });
    log('info', 'fetch_products_inline_bootstrap', { correlationId, count: inlineProducts.length });
  }

  try {
    const versionForUrl = storedVersion || inlineVersion || null;
    const url = resolveProductDataUrl({ version: versionForUrl });
    const response = await fetchWithRetry(
      url,
      { cache: 'no-store', headers: { Accept: 'application/json' } },
      2,
      300,
      correlationId
    );
    const data = await response.json();
    const transformed = transformProducts(data.products || []);
    const networkVersion = normalizeProductVersion(data.version);
    overwriteSharedProductData(transformed, {
      version: networkVersion,
      source: 'network',
      isPartial: false,
      total: transformed.length,
    });
    if (networkVersion) {
      setStoredProductVersion(networkVersion);
    }
    log('info', 'fetch_products_success', {
      correlationId,
      count: transformed.length,
      source: 'network',
    });
    return transformed;
  } catch (error) {
    if (hasInlineProducts) {
      ensureSharedProductData(inlineProducts, {
        version: inlineVersion || null,
        source: 'inline-fallback',
        isPartial: true,
        total: inlineTotal ?? inlineProducts.length,
      });
      log('warn', 'fetch_products_network_fallback_inline', {
        correlationId,
        error: error.message,
        runbook: 'docs/operations/RUNBOOK.md#product-data',
      });
      return inlineProducts;
    }
    log('error', 'fetch_products_failure', {
      correlationId,
      error: error.message,
      runbook: 'docs/operations/RUNBOOK.md#product-data',
    });
    showErrorMessage(
      `Error al cargar los productos. Por favor, verifique su conexión a internet e inténtelo de nuevo. (Error: ${error.message})`
    );
    if (error instanceof ProductDataError) {
      throw error;
    }
    throw new ProductDataError(error.message, { cause: error, correlationId });
  }
};

const createSafeElement = (tag, attributes = {}, children = []) => {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'text') {
      element.textContent = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  children.forEach((child) => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  return element;
};

const markImageLoaded = (img) => {
  if (!img) return;
  img.classList.remove('is-loading');
  img.classList.add('is-loaded');
};

const setupImageSkeleton = (img) => {
  if (!img || !img.classList.contains('product-thumb')) {
    return;
  }
  img.classList.add('is-loading');
  if (img.complete && img.naturalWidth > 0) {
    markImageLoaded(img);
    return;
  }
  img.addEventListener('load', () => markImageLoaded(img), { once: true });
  img.addEventListener('error', () => img.classList.remove('is-loading'), { once: true });
};

const setupImageSkeletons = (root = document) => {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('img.product-thumb').forEach(setupImageSkeleton);
};

const createProductPicture = ({ imagePath, avifPath, alt, eager = false }) => {
  const sizes = PRODUCT_IMAGE_SIZES;
  const pictureChildren = [];
  const avifSrcset = resolveAvifSrcset(avifPath);
  if (avifSrcset) {
    pictureChildren.push(
      createSafeElement('source', {
        type: 'image/avif',
        srcset: avifSrcset,
        sizes,
      })
    );
  }
  const fallbackSrc = buildCfSrc(imagePath, { width: 320 }) || normaliseAssetPath(imagePath);
  const fallbackSrcset = buildCfSrcset(imagePath);
  const imgAttrs = {
    src: fallbackSrc || '',
    alt: alt || '',
    class: 'card-img-top product-thumb is-loading',
    loading: eager ? 'eager' : 'lazy',
    fetchpriority: eager ? 'high' : 'auto',
    decoding: 'async',
    width: '400',
    height: '400',
    sizes,
  };
  if (fallbackSrcset) {
    imgAttrs.srcset = fallbackSrcset;
  }
  const imgElement = createSafeElement('img', imgAttrs);
  setupImageSkeleton(imgElement);
  pictureChildren.push(imgElement);
  return createSafeElement('picture', {}, pictureChildren);
};

const createCartThumbnail = ({ imagePath, avifPath, alt }) => {
  const sizes = '100px';
  const sources = [];
  const avifSrcset = resolveAvifSrcset(avifPath, CART_IMAGE_WIDTHS);
  if (avifSrcset) {
    sources.push(
      createSafeElement('source', {
        type: 'image/avif',
        srcset: avifSrcset,
        sizes,
      })
    );
  }
  const fallbackSrc =
    buildCfSrc(imagePath, { width: CART_IMAGE_WIDTHS[1] }) || normaliseAssetPath(imagePath);
  const fallbackSrcset = buildCfSrcset(imagePath, {}, CART_IMAGE_WIDTHS);
  const imgAttrs = {
    src: fallbackSrc || '',
    alt: alt || '',
    class: 'cart-item-thumb-img',
    loading: 'lazy',
    decoding: 'async',
    width: '100',
    height: '100',
    sizes,
  };
  if (fallbackSrcset) {
    imgAttrs.srcset = fallbackSrcset;
  }
  const imgElement = createSafeElement('img', imgAttrs);
  return createSafeElement('picture', {}, [...sources, imgElement]);
};

const showErrorMessage = (message) => {
  const errorMessage = createSafeElement('div', { class: 'error-message', role: 'alert' }, [
    createSafeElement('p', {}, [message]),
    createSafeElement('button', { class: 'retry-button' }, ['Intentar nuevamente']),
  ]);
  const productContainer = document.getElementById('product-container');
  if (productContainer) {
    productContainer.innerHTML = '';
    productContainer.appendChild(errorMessage);
    const retryButton = errorMessage.querySelector('.retry-button');
    if (retryButton) {
      retryButton.addEventListener('click', safeReload);
    }
  } else {
    console.error('Contenedor de productos no encontrado');
  }
};

// Basic cart helpers (exposed for tests)
  let cart = [];
  let updateProductDisplay = null;
try {
  cart = JSON.parse(globalThis.localStorage?.getItem('cart')) || [];
} catch {
  cart = [];
}

const getCartItemQuantity = (productId) => {
  const item = cart.find((item) => item.id === productId);
  return item ? item.quantity : 0;
};

const updateCartIcon = () => {
  const cartCount = document.getElementById('cart-count');
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  if (cartCount) {
    if (cartCount.dataset.initialized !== '1') {
      cartCount.dataset.initialized = '1';
    }
    cartCount.textContent = String(totalItems);
    cartCount.setAttribute('aria-label', `${totalItems} items in cart`);
  }
};

const restartAnimationClass = (element, className, timeoutMs = 400) => {
  if (!element || !className) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  const cleanup = () => element.classList.remove(className);
  element.addEventListener('animationend', cleanup, { once: true });
  setTimeout(cleanup, timeoutMs);
};

const bumpCartBadge = () => {
  const badge = document.getElementById('cart-count');
  restartAnimationClass(badge, 'cart-count-bump', 500);
};

const bumpCartTotal = () => {
  const total = document.getElementById('cart-total');
  restartAnimationClass(total, 'cart-total-bump', 500);
};

const pulseAddToCartButton = (productId) => {
  if (!productId) return;
  const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
  const button = actionArea?.querySelector('.add-to-cart-btn');
  restartAnimationClass(button, 'is-added', 350);
};

const saveCart = () => {
  try {
    globalThis.localStorage?.setItem('cart', JSON.stringify(cart));
  } catch (error) {
    console.error('Error al guardar el carrito:', error);
    showErrorMessage('Error al guardar el carrito. Tus cambios podrían no persistir.');
  }
};

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

const toggleActionArea = (btn, quantityControl, showQuantity) => {
  if (!btn || !quantityControl) return;
  const showButton = !showQuantity;
  btn.classList.toggle(UTILITY_CLASSES.hidden, !showButton);
  btn.classList.toggle(UTILITY_CLASSES.flex, showButton);

  quantityControl.classList.toggle(UTILITY_CLASSES.hidden, !showQuantity);
  quantityControl.classList.toggle(UTILITY_CLASSES.flex, showQuantity);
};

const renderCart = () => {
  const cartItems = document.getElementById('cart-items');
  const cartTotal = document.getElementById('cart-total');
  if (!cartItems || !cartTotal) return;

  cartItems.innerHTML = '';
  let total = 0;

  cart.forEach((item) => {
    const discountedPrice = item.price - (item.discount || 0);

    const itemElement = createSafeElement('div', {
      class: 'cart-item mb-3 d-flex align-items-start',
      'aria-label': `Cart item: ${item.name}`,
    });

    const contentContainer = createSafeElement('div', {
      class: 'cart-item-content flex-grow-1',
    });

    contentContainer.appendChild(createSafeElement('div', { class: 'fw-bold mb-1' }, [item.name]));

    const quantityContainer = createSafeElement('div', { class: 'mb-2' });
    const decreaseBtn = createSafeElement(
      'button',
      {
        class: 'btn btn-sm btn-secondary decrease-quantity',
        'data-id': item.id,
        'aria-label': `Disminuir cantidad de ${item.name}`,
      },
      ['-']
    );
    const increaseBtn = createSafeElement(
      'button',
      {
        class: 'btn btn-sm btn-secondary increase-quantity',
        'data-id': item.id,
        'aria-label': `Aumentar cantidad de ${item.name}`,
      },
      ['+']
    );
    const quantitySpan = createSafeElement(
      'span',
      {
        class: 'mx-2 item-quantity',
        'aria-label': `Cantidad de ${item.name}`,
      },
      [item.quantity.toString()]
    );
    quantityContainer.appendChild(decreaseBtn);
    quantityContainer.appendChild(quantitySpan);
    quantityContainer.appendChild(increaseBtn);
    contentContainer.appendChild(quantityContainer);

    contentContainer.appendChild(
      createSafeElement('div', { class: 'text-muted small' }, [
        `Precio: $${discountedPrice.toLocaleString('es-CL')}`,
      ])
    );
    contentContainer.appendChild(
      createSafeElement('div', { class: 'fw-bold' }, [
        `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}`,
      ])
    );

    const removeBtn = createSafeElement(
      'button',
      {
        class: 'btn btn-sm btn-danger remove-item mt-2',
        'data-id': item.id,
        'aria-label': `Eliminar ${item.name} del carrito`,
      },
      ['Eliminar']
    );
    contentContainer.appendChild(removeBtn);

    const isSubcategoryPage =
      typeof window !== 'undefined' && window.location.pathname.includes('/pages/');
    let adjustedImagePath;
    if (isSubcategoryPage) {
      adjustedImagePath = `../${(item.image_path || '').replace(/^\//, '')}`;
    } else {
      adjustedImagePath = item.image_path;
    }

    const thumbnailContainer = createSafeElement('div', {
      class: 'cart-item-thumb ms-3 flex-shrink-0',
    });
    const thumbnailPicture = createCartThumbnail({
      imagePath: item.thumbnail_path || adjustedImagePath,
      avifPath: item.image_avif_path,
      alt: item.name,
    });
    const fallbackImg = thumbnailPicture.querySelector('img');
    if (fallbackImg) {
      if (!fallbackImg.getAttribute('src') && adjustedImagePath) {
        fallbackImg.setAttribute('src', adjustedImagePath);
      }
      if (Array.isArray(item.thumbnail_variants)) {
        const parts = item.thumbnail_variants
          .filter((v) => v && v.url && v.width)
          .map((v) => `${v.url} ${v.width}w`);
        if (parts.length) {
          fallbackImg.setAttribute('srcset', parts.join(', '));
          fallbackImg.setAttribute('sizes', '100px');
        }
      } else if (!fallbackImg.getAttribute('sizes')) {
        fallbackImg.setAttribute('sizes', '100px');
      }
    }
    thumbnailContainer.appendChild(thumbnailPicture);

    itemElement.appendChild(contentContainer);
    itemElement.appendChild(thumbnailContainer);
    cartItems.appendChild(itemElement);

    total += discountedPrice * item.quantity;
  });

  cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
  cartTotal.setAttribute('aria-label', `Total: $${total.toLocaleString('es-CL')}`);

  const creditOption = document.getElementById('payment-credit-container');
  if (creditOption) {
    if (total >= 30000) {
      creditOption.classList.remove('d-none');
    } else {
      creditOption.classList.add('d-none');
      const creditInput = creditOption.querySelector('input');
      if (creditInput) {
        creditInput.checked = false;
      }
    }
  }
};

const addToCart = (product, quantity) => {
  try {
    const existingItem = cart.find((item) => item.id === product.id);
    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + quantity, 50);
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        discount: product.discount,
        image_path: product.image_path,
        image_avif_path: product.image_avif_path,
        quantity: Math.min(quantity, 50),
        category: product.category,
        stock: product.stock,
      });
    }
    saveCart();
    updateCartIcon();
    bumpCartBadge();
    pulseAddToCartButton(product.id);
    renderCart(product.id);
    bumpCartTotal();
      try {
        if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function')
          window.__analyticsTrack('add_to_cart', {
            id: product.id,
            q: quantity,
            price: product.price,
          });
      } catch (error) {
        // Ignore analytics tracking failures.
      }
    const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
    if (quantityInput) {
      quantityInput.value = Math.max(getCartItemQuantity(product.id), 1);
    }
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    showErrorMessage('Error al agregar el artículo al carrito. Por favor, intenta nuevamente.');
  }
};

const removeFromCart = (productId) => {
  try {
    cart = cart.filter((item) => item.id !== productId);
    saveCart();
    updateCartIcon();
    renderCart();
    bumpCartTotal();
      try {
        if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function')
          window.__analyticsTrack('remove_from_cart', { id: productId });
      } catch (error) {
        // Ignore analytics tracking failures.
      }
    const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
    if (actionArea) {
      const btn = actionArea.querySelector('.add-to-cart-btn');
      const qc = actionArea.querySelector('.quantity-control');
      toggleActionArea(btn, qc, false);
    }
  } catch (error) {
    console.error('Error al eliminar del carrito:', error);
    showErrorMessage('Error al eliminar el artículo del carrito. Por favor, intenta nuevamente.');
  }
};

const updateQuantity = (product, change) => {
  try {
    const item = cart.find((item) => item.id === product.id);
    const newQuantity = item ? item.quantity + change : 1;
    const actionArea = document.querySelector(`.action-area[data-pid="${product.id}"]`);
    const btn = actionArea?.querySelector('.add-to-cart-btn');
    const qc = actionArea?.querySelector('.quantity-control');
    let usedAddToCart = false;

    if (newQuantity <= 0) {
      removeFromCart(product.id);
      toggleActionArea(btn, qc, false);
    } else if (newQuantity <= 50) {
      if (item) {
        item.quantity = newQuantity;
      } else {
        addToCart(product, 1);
        usedAddToCart = true;
        toggleActionArea(btn, qc, true);
      }
      saveCart();
      updateCartIcon();
      if (change > 0 && !usedAddToCart) {
        bumpCartBadge();
      }
      renderCart(product.id);
      bumpCartTotal();

      const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
      if (quantityInput) {
        quantityInput.value = newQuantity;
        quantityInput.classList.add('quantity-changed');
        setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
      }
    }
  } catch (error) {
    console.error('Error al actualizar cantidad:', error);
    showErrorMessage('Error al actualizar la cantidad. Por favor, intenta nuevamente.');
  }
};

const emptyCart = () => {
  try {
    cart = [];
    saveCart();
    updateCartIcon();
    renderCart();
    if (typeof updateProductDisplay === 'function') {
      updateProductDisplay();
    }
  } catch (error) {
    console.error('Error al vaciar el carrito:', error);
    showErrorMessage('Error al vaciar el carrito. Por favor, inténtelo de nuevo.');
  }
};

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

  // Ensure discount-only toggle exists in the filter UI
  const ensureDiscountToggle = () => {
    const toggle = document.getElementById('filter-discount');
    if (toggle) return toggle;

    const filterSection = document.querySelector(
      'section[aria-label*="filtrado"], section[aria-label*="Opciones de filtrado"]'
    );
    const filterSectionRow = filterSection ? filterSection.querySelector('.row') : null;
    if (!filterSectionRow) return null;

    const col = createSafeElement('div', { class: 'col-12 mt-2' });
    const formCheck = createSafeElement('div', { class: 'form-check form-switch' });
    const input = createSafeElement('input', {
      class: 'form-check-input',
      type: 'checkbox',
      id: 'filter-discount',
      'aria-label': 'Mostrar solo productos con descuento',
    });
    const label = createSafeElement(
      'label',
      { class: 'form-check-label', for: 'filter-discount' },
      ['Solo productos con descuento']
    );
    formCheck.appendChild(input);
    formCheck.appendChild(label);
    col.appendChild(formCheck);
    filterSectionRow.appendChild(col);
    return input;
  };

  const INITIAL_BATCH_FALLBACK = 12;
  const SUBSEQUENT_BATCH_SIZE = 12;

  let products = [];
  let filteredProducts = [];
  let visibleCount = 0;
  let initialBatchSize = INITIAL_BATCH_FALLBACK;
  let loadMoreButton = null;
  let catalogSentinel = null;
  let sentinelObserver = null;
  let userHasInteracted = false;

  const updateOnlineStatus = () => {
    const offlineIndicator = document.getElementById('offline-indicator');
    if (offlineIndicator) {
      const hidden = navigator.onLine;
      offlineIndicator.classList.toggle(UTILITY_CLASSES.hidden, hidden);
      offlineIndicator.classList.toggle(UTILITY_CLASSES.block, !hidden);
    }
    if (!navigator.onLine) {
      console.log('App is offline. Using cached data if available.');
    }
  };

  function initFooter() {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear();
    }
  }

  const DEFAULT_CURRENCY_CODE = 'CLP';
  let hasLoggedCurrencyFallback = false;

  const normalizeCurrencyCode = (currencyCode) => {
    if (typeof currencyCode !== 'string') {
      return DEFAULT_CURRENCY_CODE;
    }
    const trimmed = currencyCode.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(trimmed)) {
      return trimmed;
    }
    return DEFAULT_CURRENCY_CODE;
  };

  const createCurrencyFormatter = (currencyCode) => {
    const fallbackCode = normalizeCurrencyCode(currencyCode);
    try {
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: fallbackCode,
        minimumFractionDigits: 0,
      });
    } catch (error) {
      if (!hasLoggedCurrencyFallback) {
        const message =
          error && typeof error.message === 'string'
            ? error.message
            : 'Unknown currency formatter failure';
        console.warn('Falling back to CLP currency formatter', {
          currencyCode,
          message,
        });
        hasLoggedCurrencyFallback = true;
      }
      return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: DEFAULT_CURRENCY_CODE,
        minimumFractionDigits: 0,
      });
    }
  };

  const renderPriceHtml = (price, discount, currencyCode = DEFAULT_CURRENCY_CODE) => {
    const numericPrice = Number(price) || 0;
    const numericDiscount = Number(discount) || 0;
    const formatter = createCurrencyFormatter(currencyCode);

    const formattedPrice = formatter.format(numericPrice);

    if (numericDiscount) {
      const discountedPrice = Math.max(numericPrice - numericDiscount, 0);
      const formattedDiscountedPrice = formatter.format(discountedPrice);

      return createSafeElement('div', { class: 'precio-container' }, [
        createSafeElement(
          'span',
          { class: 'precio-descuento', 'aria-label': 'Precio con descuento' },
          [formattedDiscountedPrice]
        ),
        createSafeElement('span', { class: 'precio-original', 'aria-label': 'Precio original' }, [
          createSafeElement('span', { class: 'tachado' }, [formattedPrice]),
        ]),
      ]);
    }

    return createSafeElement('div', { class: 'precio-container' }, [
      createSafeElement('span', { class: 'precio', 'aria-label': 'Precio' }, [formattedPrice]),
    ]);
  };

  const renderQuantityControl = (product) => {
    const quantityControl = createSafeElement('div', {
      class: `quantity-control ${UTILITY_CLASSES.hidden}`,
      role: 'group',
      'aria-label': 'Seleccionar cantidad',
      'aria-live': 'polite',
    });
    const minusBtn = createSafeElement(
      'button',
      {
        class: 'quantity-btn',
        type: 'button',
        'data-action': 'decrease',
        'aria-label': 'Decrease quantity',
      },
      ['-']
    );
    const plusBtn = createSafeElement(
      'button',
      {
        class: 'quantity-btn',
        type: 'button',
        'data-action': 'increase',
        'aria-label': 'Increase quantity',
      },
      ['+']
    );
    const input = createSafeElement('input', {
      type: 'number',
      class: 'quantity-input',
      value: Math.max(getCartItemQuantity(product.id), 1),
      min: '1',
      max: '50',
      'aria-label': 'Quantity',
      'data-id': product.id,
    });

    quantityControl.appendChild(minusBtn);
    quantityControl.appendChild(input);
    quantityControl.appendChild(plusBtn);

    return quantityControl;
  };

  function setupActionArea(actionArea, product) {
    if (!actionArea) {
      return;
    }
    const addToCartBtn = actionArea.querySelector('.add-to-cart-btn');
    const quantityControl = actionArea.querySelector('.quantity-control');
    const quantityInput = quantityControl?.querySelector('.quantity-input');
    const minusBtn =
      quantityControl?.querySelector('.quantity-btn[data-action="decrease"]') ||
      quantityControl?.querySelector('.quantity-btn');
    const plusBtn =
      quantityControl?.querySelector('.quantity-btn[data-action="increase"]') ||
      quantityControl?.querySelectorAll('.quantity-btn')?.[1];

    const bind = (element, event, handler) => {
      if (!element) {
        return;
      }
      if (element.dataset.listenerAttached === 'true') {
        return;
      }
      element.addEventListener(event, handler);
      element.dataset.listenerAttached = 'true';
    };

    bind(addToCartBtn, 'click', () => {
      addToCart(product, 1);
      toggleActionArea(addToCartBtn, quantityControl, true);
    });

    bind(minusBtn, 'click', () => updateQuantity(product, -1));
    bind(plusBtn, 'click', () => updateQuantity(product, 1));
    bind(quantityInput, 'change', (event) => {
      const newQuantity = parseInt(event.target.value, 10);
      if (!Number.isFinite(newQuantity)) {
        event.target.value = Math.max(getCartItemQuantity(product.id), 1);
        return;
      }
      const currentQuantity = getCartItemQuantity(product.id);
      updateQuantity(product, newQuantity - currentQuantity);
    });

    const currentQuantity = getCartItemQuantity(product.id);
    if (quantityInput) {
      quantityInput.value = currentQuantity > 0 ? currentQuantity : 1;
    }
    toggleActionArea(addToCartBtn, quantityControl, currentQuantity > 0);
  }

  const getCartItemQuantity = (productId) => {
    const item = cart.find((item) => item.id === productId);
    return item ? item.quantity : 0;
  };

  const renderProducts = (productsToRender, { reset = false } = {}) => {
    if (!productContainer) {
      return 0;
    }
    if (reset) {
      productContainer.innerHTML = '';
    }

    const fragment = document.createDocumentFragment();

    productsToRender.forEach((product) => {
      const { id, name, description, image_path, image_avif_path, price, discount, stock } =
        product;

    const productClasses = [
      'producto',
      'col-12',
      'col-sm-6',
      'col-md-4',
      'col-lg-3',
      'mb-4',
      'fade-in-up',
      !stock ? 'agotado' : '',
      UTILITY_CLASSES.contentVisible,
      UTILITY_CLASSES.containIntrinsic,
    ]
      .filter(Boolean)
        .join(' ');

      const titleId = `product-title-${id}`;
      const productElement = createSafeElement('article', {
        class: productClasses,
        'data-product-id': id,
        'aria-labelledby': titleId,
      });

      const cardElement = createSafeElement('div', { class: 'card h-100' });

      if (discount && Number(discount) > 0) {
        const pct = Math.round((Number(discount) / Number(price)) * 100);
        const badge = createSafeElement(
          'span',
          { class: 'discount-badge badge bg-danger', 'aria-label': 'Producto en oferta' },
          [`-${isFinite(pct) ? pct : 0}%`]
        );
        cardElement.appendChild(badge);
      }

      const pictureElement = createProductPicture({
        imagePath: image_path,
        avifPath: image_avif_path,
        alt: name,
        eager: false,
      });
      cardElement.appendChild(pictureElement);

      const cardBody = createSafeElement('div', { class: 'card-body d-flex flex-column' });
      cardBody.appendChild(
        createSafeElement('h3', { class: 'card-title mb-2', id: titleId }, [name])
      );
      cardBody.appendChild(createSafeElement('p', { class: 'card-text mb-3' }, [description]));
      const priceContainer = renderPriceHtml(price, discount);
      priceContainer.classList.add('mb-3');
      cardBody.appendChild(priceContainer);

      const actionArea = createSafeElement('div', {
        class: 'action-area mt-auto',
        'data-pid': id,
        role: 'group',
        'aria-label': `Acciones de compra para ${name}`,
      });
      const addToCartBtn = createSafeElement(
        'button',
        {
          class: 'btn btn-primary add-to-cart-btn mt-2',
          type: 'button',
          'data-id': id,
          'aria-label': `Add ${name} to cart`,
        },
        ['Agregar al carrito']
      );
      const quantityControl = renderQuantityControl(product);

      actionArea.appendChild(addToCartBtn);
      actionArea.appendChild(quantityControl);
      cardBody.appendChild(actionArea);

      setupActionArea(actionArea, product);

      cardElement.appendChild(cardBody);
      productElement.appendChild(cardElement);
      fragment.appendChild(productElement);
    });

    productContainer.appendChild(fragment);
    lazyLoadImages();
    return productsToRender.length;
  };

  const hydratePreRenderedProducts = (productList) => {
    if (!productContainer) {
      return 0;
    }
    const cards = productContainer.querySelectorAll('[data-product-id]');
    if (!cards.length) {
      return 0;
    }
    const map = new Map(productList.map((item) => [item.id, item]));
    let hydrated = 0;
    cards.forEach((card) => {
      const productId = card.getAttribute('data-product-id');
      if (!productId || !map.has(productId)) {
        return;
      }
      const product = map.get(productId);
      card.classList.add(UTILITY_CLASSES.contentVisible, UTILITY_CLASSES.containIntrinsic);
      const actionArea = card.querySelector('.action-area');
      setupActionArea(actionArea, product);
      hydrated += 1;
    });
    return hydrated;
  };

  const resetProductList = () => {
    if (productContainer) {
      productContainer.innerHTML = '';
    }
    visibleCount = 0;
  };

  const applyFilters = () => {
    const criterion = sortOptions?.value || 'original';
    const keyword = filterKeyword?.value?.trim?.() || '';
    const discountOnly = document.getElementById('filter-discount')?.checked || false;
    filteredProducts = memoizedFilterProducts(products, keyword, criterion, discountOnly);
  };

  const appendBatch = (size) => {
    if (!Array.isArray(filteredProducts) || filteredProducts.length === 0) {
      updateLoadMoreVisibility();
      return false;
    }
    const start = visibleCount;
    if (start >= filteredProducts.length) {
      updateLoadMoreVisibility();
      return false;
    }
    const nextProducts = filteredProducts.slice(start, start + size);
    if (!nextProducts.length) {
      updateLoadMoreVisibility();
      return false;
    }
    renderProducts(nextProducts);
    visibleCount += nextProducts.length;
    updateLoadMoreVisibility();
    return true;
  };

  const appendInitialBatch = () => {
    const batchSize = initialBatchSize || INITIAL_BATCH_FALLBACK;
    return appendBatch(batchSize);
  };

  const appendNextBatch = () => appendBatch(SUBSEQUENT_BATCH_SIZE);

  const updateLoadMoreVisibility = () => {
    const hasMore = visibleCount < filteredProducts.length;
    if (loadMoreButton) {
      loadMoreButton.classList.toggle('d-none', !hasMore);
      loadMoreButton.disabled = !hasMore;
    }
    if (sentinelObserver && catalogSentinel) {
      sentinelObserver.disconnect();
      if (hasMore) {
        sentinelObserver.observe(catalogSentinel);
      }
    }
  };

  const setupDeferredLoading = () => {
    loadMoreButton = document.getElementById('catalog-load-more');
    catalogSentinel = document.getElementById('catalog-sentinel');
    if (loadMoreButton) {
      loadMoreButton.addEventListener('click', () => {
        appendNextBatch();
      });
    }
    // Guard: some test/browser environments may lack IntersectionObserver
    if (catalogSentinel && typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      sentinelObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              appendNextBatch();
            }
          });
        },
        { rootMargin: '200px' }
      );
    }
    updateLoadMoreVisibility();
  };

  const lazyLoadImages = () => {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              if (img.dataset.srcset) img.srcset = img.dataset.srcset;
              if (img.dataset.sizes) img.sizes = img.dataset.sizes;
              img.classList.remove('lazyload');
              observer.unobserve(img);
            }
          });
        },
        { rootMargin: '100px' }
      );

      document.querySelectorAll('img.lazyload').forEach((img) => imageObserver.observe(img));
    } else {
      // Fallback: eagerly set sources without observing (avoids runtime errors)
      document.querySelectorAll('img.lazyload').forEach((img) => {
        if (img.dataset.src) img.src = img.dataset.src;
        if (img.dataset.srcset) img.srcset = img.dataset.srcset;
        if (img.dataset.sizes) img.sizes = img.dataset.sizes;
        img.classList.remove('lazyload');
      });
    }
  };

  // MUCH MORE CONSERVATIVE fuzzy matching - only for obvious typos
  function simpleTypoFix(query, text) {
    if (!query || !text || query.length < 3) return false;

    const normalizeText = (str) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents only
        .trim();

    const normalizedQuery = normalizeText(query);
    const normalizedText = normalizeText(text);

    // First try exact match (same as original)
    if (normalizedText.includes(normalizedQuery)) {
      return true;
    }

    // ONLY try typo correction if query is 4+ characters
    // and the difference is just 1-2 characters
    if (normalizedQuery.length >= 4) {
      // Check if it's a simple 1-character typo
      // Like "choclate" vs "chocolate" or "galetas" vs "galletas"
      return isSimpleTypo(normalizedQuery, normalizedText);
    }

    return false;
  }

  // Very strict typo detection - only catches obvious single-character mistakes
  function isSimpleTypo(query, text) {
    const words = text.split(/\s+/);

    return words.some((word) => {
      if (Math.abs(word.length - query.length) > 1) return false;

      // Count character differences
      let differences = 0;
      const minLen = Math.min(word.length, query.length);

      // Too short to safely compare
      if (minLen < 4) return false;

      // Check for single character insertion/deletion
      if (word.length === query.length) {
        // Same length - check for substitution
        for (let i = 0; i < word.length; i++) {
          if (word[i] !== query[i]) differences++;
          if (differences > 1) return false; // More than 1 difference
        }
        return differences === 1;
      } else {
        // Different length - check for insertion/deletion
        return isOneCharacterDifference(query, word);
      }
    });
  }

  // Check if two words differ by exactly one character (insertion/deletion)
  function isOneCharacterDifference(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length - shorter.length !== 1) return false;

    let shifts = 0;
    let i = 0,
      j = 0;

    while (i < shorter.length && j < longer.length) {
      if (shorter[i] === longer[j]) {
        i++;
        j++;
      } else {
        shifts++;
        if (shifts > 1) return false; // More than one shift needed
        j++; // Skip the extra character in longer string
      }
    }

    return true;
  }

  // REPLACE your filterProducts function with this CONSERVATIVE version:
  const filterProducts = (products, keyword, sortCriterion, discountOnly = false) => {
    const trimmedKeyword = keyword.trim();

    return products
      .filter((product) => {
        if (!product.stock) return false;
        if (discountOnly && !(product.discount && Number(product.discount) > 0)) return false;

        // If no keyword, show all (same as original behavior)
        if (!trimmedKeyword) return true;

        // Try EXACT matching first (exactly like original)
        const exactMatch =
          product.name.toLowerCase().includes(trimmedKeyword.toLowerCase()) ||
          product.description.toLowerCase().includes(trimmedKeyword.toLowerCase());

        if (exactMatch) return true;

        // ONLY try typo fix for longer queries and only for name field
        if (trimmedKeyword.length >= 4) {
          return simpleTypoFix(trimmedKeyword, product.name);
        }

        return false;
      })
      .sort((a, b) => sortProducts(a, b, sortCriterion));
  };

  const sortProducts = (a, b, criterion) => {
    if (!criterion || criterion === 'original') {
      return a.originalIndex - b.originalIndex;
    }
    const [property, order] = criterion.split('-');
    const valueA = property === 'price' ? a.price - (a.discount || 0) : a.name.toLowerCase();
    const valueB = property === 'price' ? b.price - (b.discount || 0) : b.name.toLowerCase();
    return order === 'asc'
      ? valueA < valueB
        ? -1
        : valueA > valueB
          ? 1
          : 0
      : valueB < valueA
        ? -1
        : valueB > valueA
          ? 1
          : 0;
  };

  const memoizedFilterProducts = memoize(filterProducts);

  updateProductDisplay = () => {
    try {
      applyFilters();
      resetProductList();
      if (!filteredProducts.length) {
        updateLoadMoreVisibility();
        return;
      }
      appendInitialBatch();
    } catch (error) {
      console.error('Error al actualizar visualización de productos:', error);
      showErrorMessage(
        'Error al actualizar la visualización de productos. Por favor, intenta más tarde.'
      );
    }
  };

  let pendingIdleUpdate = null;
  const debouncedUpdateProductDisplay = debounce(() => {
    cancelScheduledIdle(pendingIdleUpdate);
    pendingIdleUpdate = scheduleIdle(() => {
      updateProductDisplay();
      pendingIdleUpdate = null;
    }, 400);
  }, 150);

  const submitCart = () => {
    const paymentError = document.getElementById('payment-error');
    const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
    if (!selectedPayment) {
      if (paymentError) {
        paymentError.textContent = 'Por favor seleccione un método de pago';
      }
      const firstPayment = document.querySelector('input[name="paymentMethod"]');
      if (firstPayment && typeof firstPayment.focus === 'function') {
        firstPayment.focus();
      }
      return;
    }
    if (paymentError) {
      paymentError.textContent = '';
    }

    let message = 'Mi pedido:\n\n';
    cart.forEach((item) => {
      const discountedPrice = item.price - (item.discount || 0);
      message += `${item.name}\n`;
      message += `Cantidad: ${item.quantity}\n`;
      message += `Precio unitario: $${discountedPrice.toLocaleString('es-CL')}\n`;
      message += `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}\n\n`;
    });

    const total = cart.reduce(
      (sum, item) => sum + (item.price - (item.discount || 0)) * item.quantity,
      0
    );
    message += `Total: $${total.toLocaleString('es-CL')}\n`;
    message += `Método de pago: ${selectedPayment.value}`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/56951118901?text=${encodedMessage}`, '_blank');
  };

  try {
    initFooter();

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

    const hydratedCount = hydratePreRenderedProducts(products);
    if (hydratedCount > 0) {
      visibleCount = hydratedCount;
      initialBatchSize = hydratedCount;
    } else {
      visibleCount = 0;
    }

    setupDeferredLoading();
    applyFilters();
    updateLoadMoreVisibility();
    if (visibleCount === 0 && filteredProducts.length) {
      appendInitialBatch();
    }

    const fetchPromise = fetchProducts();

    sortOptions.addEventListener('change', () => {
      userHasInteracted = true;
      debouncedUpdateProductDisplay();
    });
    filterKeyword.addEventListener('input', () => {
      userHasInteracted = true;
      debouncedUpdateProductDisplay();
    });

    const discountToggle = ensureDiscountToggle();
    if (discountToggle) {
      discountToggle.addEventListener('change', () => {
        userHasInteracted = true;
        debouncedUpdateProductDisplay();
      });
    }

    const networkProducts = await fetchPromise;

    if (!Array.isArray(networkProducts) || networkProducts.length === 0) {
      if (!products.length) {
        showErrorMessage('No hay productos disponibles. Por favor, intenta más tarde.');
        return;
      }
    } else {
      products = networkProducts.map((product, index) => ({
        ...product,
        originalIndex: typeof product.originalIndex === 'number' ? product.originalIndex : index,
        categoryKey: product.categoryKey || normalizeString(product.category),
      }));
      if (currentCategory) {
        const normCurrent = normalizeString(currentCategory);
        products = products
          .filter(
            (product) => (product.categoryKey || normalizeString(product.category)) === normCurrent
          )
          .map((product, index) => ({
            ...product,
            originalIndex:
              typeof product.originalIndex === 'number' ? product.originalIndex : index,
          }));
      }
    }

    applyFilters();
    if (userHasInteracted || visibleCount === 0) {
      resetProductList();
      if (filteredProducts.length) {
        appendInitialBatch();
      } else {
        updateLoadMoreVisibility();
      }
    } else {
      updateLoadMoreVisibility();
    }

    if (typeof window !== 'undefined') window.__APP_READY__ = true;

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    const cartIcon = document.getElementById('cart-icon');
    const emptyCartBtn = document.getElementById('empty-cart');
    const submitCartBtn = document.getElementById('submit-cart');

    if (cartIcon) {
      cartIcon.addEventListener('click', async () => {
        renderCart();
        const cartOffcanvasElement = document.getElementById('cartOffcanvas');
        try {
          await showOffcanvas('#cartOffcanvas');
          if (cartOffcanvasElement) {
            cartOffcanvasElement.dataset.bsFallback = '0';
          }
        } catch (error) {
          console.error('Bootstrap Offcanvas no está disponible', error);
          if (cartOffcanvasElement) {
            cartOffcanvasElement.dataset.bsFallback = '1';
            cartOffcanvasElement.classList.add('show');
            cartOffcanvasElement.removeAttribute('aria-hidden');
          }
        }
      });
    }

    if (emptyCartBtn) {
      emptyCartBtn.addEventListener('click', emptyCart);
    }
    if (submitCartBtn) {
      submitCartBtn.addEventListener('click', submitCart);
    }

    if (cartItemsElement) {
      cartItemsElement.addEventListener('click', (e) => {
        const target = e.target;
        const productId = target.closest('[data-id]')?.dataset.id;

        if (!productId) return;

        if (target.classList.contains('decrease-quantity')) {
          updateQuantity({ id: productId }, -1);
        } else if (target.classList.contains('increase-quantity')) {
          updateQuantity({ id: productId }, 1);
        } else if (target.classList.contains('remove-item')) {
          removeFromCart(productId);
        }
      });
    }

    updateCartIcon();

    if ('performance' in window) {
      window.addEventListener('load', () => {
        logPerformanceMetrics();
      });
    }
  } catch (error) {
    console.error('Error al inicializar productos:', error);
    showErrorMessage('Error al cargar productos. Por favor, inténtelo más tarde.');
  }
};

// Run the application when the DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function () {
    // Register service worker first
    registerServiceWorker();

    if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOKS__ === true) {
      window.__runUpdateCheck = runUpdateCheckForTest;
    }

    // Then initialize the app
    initApp().catch((error) => {
      console.error('Error al inicializar la aplicación:', error);
      showErrorMessage('Error al inicializar la aplicación. Por favor, actualice la página.');
    });
  });
}
function __getCart() {
  return cart;
}

function __resetCart() {
  cart = [];
}

export {
  generateStableId,
  fetchProducts,
  fetchWithRetry,
  initApp,
  addToCart,
  removeFromCart,
  updateQuantity,
  updateCartIcon,
  showUpdateNotification,
  showServiceWorkerError,
  showConnectivityNotification,
  registerServiceWorker as __registerServiceWorkerForTest,
  shouldRegisterServiceWorker as __shouldRegisterServiceWorkerForTest,
  __resetServiceWorkerRegistrationForTest,
  memoize as __memoizeForTest,
  resolveAvifSrcset as __resolveAvifSrcsetForTest,
  buildStaticSrcset as __buildStaticSrcsetForTest,
  normalizeProductVersion as __normalizeProductVersionForTest,
  getStoredProductVersion as __getStoredProductVersionForTest,
  setStoredProductVersion as __setStoredProductVersionForTest,
  __getCart,
  __resetCart,
  logPerformanceMetrics,
};
