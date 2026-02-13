import { log } from '../utils/logger.mts';

export function createCatalogManager({
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
} = /** @type {Record<string, any>} */ ({})) {
  const INITIAL_BATCH_FALLBACK = 12;
  const SUBSEQUENT_BATCH_SIZE = 12;

  let products = [];
  let filteredProducts = [];
  let visibleCount = 0;
  let initialBatchSize = INITIAL_BATCH_FALLBACK;
  let loadMoreButton = null;
  let catalogSentinel = null;
  let sentinelObserver = null;
  let pendingIdleUpdate = null;

  const filterFn =
    typeof filterProducts === 'function'
      ? filterProducts
      : (items) => (Array.isArray(items) ? items : []);
  const memoizedFilterProducts = typeof memoize === 'function' ? memoize(filterFn) : filterFn;

  const ensureDiscountToggle = () => {
    const toggle = /** @type {HTMLInputElement | null} */ (
      document.getElementById('filter-discount')
    );
    if (toggle) return toggle;
    if (typeof createSafeElement !== 'function') return null;

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

  const lazyLoadImages = () => {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = /** @type {HTMLImageElement} */ (entry.target);
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

      /** @type {NodeListOf<HTMLImageElement>} */ (document.querySelectorAll('img.lazyload')).forEach((img) =>
        imageObserver.observe(img)
      );
    } else {
      /** @type {NodeListOf<HTMLImageElement>} */ (document.querySelectorAll('img.lazyload')).forEach((img) => {
        if (img.dataset.src) img.src = img.dataset.src;
        if (img.dataset.srcset) img.srcset = img.dataset.srcset;
        if (img.dataset.sizes) img.sizes = img.dataset.sizes;
        img.classList.remove('lazyload');
      });
    }
  };

  const renderProducts = (productsToRender, { reset = false } = {}) => {
    if (!productContainer || typeof createSafeElement !== 'function') {
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

      const pictureElement =
        typeof createProductPicture === 'function'
          ? createProductPicture({
              imagePath: image_path,
              avifPath: image_avif_path,
              alt: name,
              eager: false,
            })
          : null;
      if (pictureElement) {
        cardElement.appendChild(pictureElement);
      }

      const cardBody = createSafeElement('div', { class: 'card-body d-flex flex-column' });
      cardBody.appendChild(
        createSafeElement('h3', { class: 'card-title mb-2', id: titleId }, [name])
      );
      cardBody.appendChild(createSafeElement('p', { class: 'card-text mb-3' }, [description]));
      if (typeof renderPriceHtml === 'function') {
        const priceContainer = renderPriceHtml(price, discount);
        priceContainer.classList.add('mb-3');
        cardBody.appendChild(priceContainer);
      }

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
          'aria-label': `Agregar ${name} al carrito`,
        },
        ['Agregar']
      );
      const quantityControl =
        typeof renderQuantityControl === 'function'
          ? renderQuantityControl(product, getCartItemQuantity)
          : null;

      actionArea.appendChild(addToCartBtn);
      if (quantityControl) {
        actionArea.appendChild(quantityControl);
      }
      cardBody.appendChild(actionArea);

      if (typeof setupActionArea === 'function') {
        setupActionArea(actionArea, product, { addToCart, updateQuantity, getCartItemQuantity });
      }

      cardElement.appendChild(cardBody);
      productElement.appendChild(cardElement);
      fragment.appendChild(productElement);
    });

    productContainer.appendChild(fragment);
    lazyLoadImages();
    return productsToRender.length;
  };

  const hydratePreRenderedProducts = (productList) => {
    if (!productContainer || typeof setupActionArea !== 'function') {
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

  const applyFilters = () => {
    const criterion = sortOptions?.value || 'original';
    const keyword = filterKeyword?.value?.trim?.() || '';
    const discountOnly =
      /** @type {HTMLInputElement | null} */ (document.getElementById('filter-discount'))
        ?.checked || false;
    filteredProducts = memoizedFilterProducts(products, keyword, criterion, discountOnly);
  };

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

  const setupDeferredLoading = () => {
    loadMoreButton = document.getElementById('catalog-load-more');
    catalogSentinel = document.getElementById('catalog-sentinel');
    if (loadMoreButton) {
      loadMoreButton.addEventListener('click', () => {
        appendNextBatch();
      });
    }
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

  const updateProductDisplay = () => {
    try {
      applyFilters();
      resetProductList();
      if (!filteredProducts.length) {
        updateLoadMoreVisibility();
        return;
      }
      appendInitialBatch();
    } catch (error) {
      log('error', 'catalog_update_display_failed', { error });
      if (typeof showErrorMessage === 'function') {
        showErrorMessage(
          'Error al actualizar la visualización de productos. Por favor, intenta más tarde.'
        );
      }
    }
  };

  const createDebouncedUpdate = () => {
    if (
      typeof debounce !== 'function' ||
      typeof scheduleIdle !== 'function' ||
      typeof cancelScheduledIdle !== 'function'
    ) {
      return updateProductDisplay;
    }
    return debounce(() => {
      cancelScheduledIdle(pendingIdleUpdate);
      pendingIdleUpdate = scheduleIdle(() => {
        updateProductDisplay();
        pendingIdleUpdate = null;
      }, 400);
    }, 150);
  };

  const bindFilterEvents = ({ log, onUserInteraction } = /** @type {Record<string, any>} */ ({})) => {
    const debouncedUpdateProductDisplay = createDebouncedUpdate();

    if (sortOptions) {
      sortOptions.addEventListener('change', () => {
        if (typeof log === 'function') {
          log('info', 'sort_changed', { criterion: sortOptions.value });
        }
        if (typeof onUserInteraction === 'function') {
          onUserInteraction();
        }
        updateProductDisplay();
      });
    }

    if (filterKeyword) {
      const handler = typeof debounce === 'function'
        ? debounce(() => {
            if (filterKeyword.value.length > 2 && typeof log === 'function') {
              log('info', 'search_keyword', { keyword: filterKeyword.value });
            }
            if (typeof onUserInteraction === 'function' && filterKeyword.value.length > 2) {
              onUserInteraction();
            }
            debouncedUpdateProductDisplay();
          }, 300)
        : () => {
            debouncedUpdateProductDisplay();
          };
      filterKeyword.addEventListener('input', handler);
    }

    const discountToggle = ensureDiscountToggle();
    if (discountToggle) {
      discountToggle.addEventListener('change', () => {
        if (typeof log === 'function') {
          log('info', 'discount_toggle_changed', { checked: discountToggle.checked });
        }
        if (typeof onUserInteraction === 'function') {
          onUserInteraction();
        }
        updateProductDisplay();
      });
    }
  };

  const initialize = (initialProducts = []) => {
    products = Array.isArray(initialProducts) ? initialProducts : [];
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
    return { hydratedCount, initialBatchSize };
  };

  const setProducts = (nextProducts) => {
    products = Array.isArray(nextProducts) ? nextProducts : [];
  };

  return {
    bindFilterEvents,
    initialize,
    setProducts,
    updateProductDisplay,
    setupDeferredLoading,
  };
}
