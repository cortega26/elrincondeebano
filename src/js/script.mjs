import { log } from './utils/logger.mts';
import { initializeBootstrapUI, showOffcanvas } from './modules/bootstrap.mjs';

import { memoize, debounce, scheduleIdle, cancelScheduledIdle } from './utils/async.mjs';
import { createCartManager } from './modules/cart.mjs';
import { registerServiceWorker } from './modules/service-worker-manager.mjs';
import {
  getSharedProductData,
  hydrateSharedProductDataFromInline,
  fetchProducts,
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

// Exported for use in modules
export const UTILITY_CLASSES = Object.freeze({
  hidden: 'is-hidden',
  flex: 'is-flex',
  block: 'is-block',
  contentVisible: 'has-content-visibility',
  containIntrinsic: 'has-contain-intrinsic',
});

let updateProductDisplay = null;
let initAppHasRun = false;

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
  updateQuantity,
  updateCartIcon,
} = cartManager;

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
        'col-6',
        'col-sm-6',
        'col-md-4',
        'col-lg-3',
        'mb-4',
        'fade-in-up',
        !stock ? 'agotado' : '',
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
        ['Agregar']
      );
      const quantityControl = renderQuantityControl(product, getCartItemQuantity);

      actionArea.appendChild(addToCartBtn);
      actionArea.appendChild(quantityControl);
      cardBody.appendChild(actionArea);

      setupActionArea(actionArea, product, { addToCart, updateQuantity, getCartItemQuantity });

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
      const actionArea = card.querySelector('.action-area');
      setupActionArea(actionArea, product, { addToCart, updateQuantity, getCartItemQuantity });
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

  const memoizedFilterProducts = memoize(filterProducts);

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

    const cartItems = getCart();
    let message = 'Mi pedido:\n\n';
    cartItems.forEach((item) => {
      const discountedPrice = item.price - (item.discount || 0);
      message += `${item.name}\n`;
      message += `Cantidad: ${item.quantity}\n`;
      message += `Precio unitario: $${discountedPrice.toLocaleString('es-CL')}\n`;
      message += `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}\n\n`;
    });

    const total = cartItems.reduce(
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

    const hydratedCount = hydratePreRenderedProducts(products);
    if (hydratedCount > 0) {
      visibleCount = hydratedCount;
      initialBatchSize = hydratedCount;
    } else if (products.length > 0) {
      initialBatchSize = INITIAL_BATCH_FALLBACK;
    }

    applyFilters();
    if (products.length > 0 && hydratedCount === 0) {
      appendInitialBatch();
    }
    updateLoadMoreVisibility();

    // Setup event listeners
    if (sortOptions) {
      sortOptions.addEventListener('change', () => {
        log('info', 'sort_changed', { criterion: sortOptions.value });
        userHasInteracted = true;
        updateProductDisplay();
      });
    }

    if (filterKeyword) {
      filterKeyword.addEventListener(
        'input',
        debounce(() => {
          if (filterKeyword.value.length > 2) {
            log('info', 'search_keyword', { keyword: filterKeyword.value });
            userHasInteracted = true;
          }
          debouncedUpdateProductDisplay();
        }, 300)
      );
    }

    const discountToggle = ensureDiscountToggle();
    if (discountToggle) {
      discountToggle.addEventListener('change', () => {
        log('info', 'discount_toggle_changed', { checked: discountToggle.checked });
        userHasInteracted = true;
        updateProductDisplay();
      });
    }

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

    setupDeferredLoading();
    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    document.getElementById('checkout-btn')?.addEventListener('click', () => {
      log('info', 'checkout_initiated');
      submitCart();
    });

    window.__APP_READY__ = true;

    // Defer fetching fresh data until main thread is idle
    scheduleIdle(async () => {
      try {
        const freshProducts = await fetchProducts();
        if (!freshProducts) return;

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

          updateProductDisplay();
        } else {
          // Silent background update logic could go here
          // For now, we just log that we have fresh data
          log('info', 'background_data_refresh_complete', { count: freshProducts.length });
        }
      } catch (err) {
        console.warn('Background fetch failed (non-fatal):', err);
      }

      logPerformanceMetrics();
    });

  } catch (error) {
    console.error('Fatal initialization error:', error);
    showErrorMessage('Error crítico al iniciar la aplicación.');
  }
};

// Start the application
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
