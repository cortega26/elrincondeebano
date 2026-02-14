const CART_STORAGE_KEY = 'astro-poc-cart';
const MAX_QTY = 50;
const WHATSAPP_NUMBER = '56951118901';
const CATALOG_PAGE_SIZE = 24;

if (typeof window !== 'undefined') {
  globalThis.__APP_READY__ = false;
}

let catalogVisibleLimit = CATALOG_PAGE_SIZE;
let catalogMatchedCount = 0;
let catalogObserver = null;

function debounce(fn, wait = 120) {
  let timeoutId;
  return (...args) => {
    globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampQty(value) {
  return Math.min(Math.max(parseNumber(value, 0), 0), MAX_QTY);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(parseNumber(value, 0));
}

function normalizeId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  return String(value).trim();
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function createElement(tagName, { className = '', text = '', attrs = {} } = {}) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      element.setAttribute(key, String(value));
    }
  });
  return element;
}

function loadCart() {
  try {
    const stored = globalThis.localStorage.getItem(CART_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => {
        const id = normalizeId(item?.id);
        const quantity = clampQty(item?.quantity);
        if (!id || quantity <= 0) {
          return null;
        }
        return {
          id,
          name: typeof item?.name === 'string' ? item.name : id,
          price: parseNumber(item?.price, 0),
          image: typeof item?.image === 'string' ? item.image : '',
          quantity,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveCart(cart) {
  try {
    globalThis.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Ignore persistence failures.
  }
}

function getProductCardById(id) {
  return Array.from(document.querySelectorAll('.producto')).find(
    (card) => card instanceof HTMLElement && normalizeId(card.dataset.productId) === id
  );
}

function getProductFromCard(card) {
  if (!card) {
    return null;
  }

  const id = normalizeId(card.dataset.productId);
  if (!id) {
    return null;
  }

  const name = card.dataset.productName || id;
  const price = parseNumber(card.dataset.productFinalPrice, 0);
  const image = card.querySelector('.product-thumb')?.getAttribute('src') || '';

  return { id, name, price, image };
}

function getCartState(cart) {
  const totalItems = cart.reduce((total, item) => total + clampQty(item.quantity), 0);
  const totalAmount = cart.reduce((total, item) => total + parseNumber(item.price, 0) * clampQty(item.quantity), 0);
  return { totalItems, totalAmount };
}

function updateBadge(cart) {
  const badge = document.getElementById('cart-count');
  if (!badge) {
    return;
  }
  const { totalItems } = getCartState(cart);
  badge.textContent = String(totalItems);
  badge.setAttribute('aria-label', `${totalItems} productos en el carrito`);
}

function toggleActionArea(actionArea, quantity) {
  if (!actionArea) {
    return;
  }
  const addBtn = actionArea.querySelector('.add-to-cart-btn');
  const qtyControl = actionArea.querySelector('.quantity-control');
  const qtyInput = actionArea.querySelector('.quantity-input');

  if (quantity > 0) {
    addBtn?.classList.add('is-hidden');
    qtyControl?.classList.remove('is-hidden');
    qtyControl?.classList.add('is-flex');
    if (qtyInput) {
      qtyInput.value = String(quantity);
    }
  } else {
    addBtn?.classList.remove('is-hidden');
    qtyControl?.classList.add('is-hidden');
    qtyControl?.classList.remove('is-flex');
    if (qtyInput) {
      qtyInput.value = '1';
    }
  }
}

function syncAllActionAreas(cart) {
  const quantities = new Map(cart.map((item) => [item.id, item.quantity]));
  const actionAreas = document.querySelectorAll('.action-area[data-pid]');
  actionAreas.forEach((actionArea) => {
    const id = normalizeId(actionArea.getAttribute('data-pid'));
    const quantity = quantities.get(id) || 0;
    toggleActionArea(actionArea, quantity);
  });
}

function syncCheckoutState(cart, totalAmount) {
  const isEmpty = cart.length === 0;
  const submitBtn = document.getElementById('submit-cart');
  const emptyBtn = document.getElementById('empty-cart');
  const paymentError = document.getElementById('payment-error');
  const paymentInputs = Array.from(document.querySelectorAll('input[name="paymentMethod"]'));

  const creditContainer = document.getElementById('payment-credit-container');
  const creditInput = document.getElementById('payment-credit');
  const allowCredit = totalAmount >= 30000;
  if (creditContainer) {
    creditContainer.classList.toggle('d-none', !allowCredit);
  }
  if (!allowCredit && creditInput && creditInput.checked) {
    creditInput.checked = false;
  }

  paymentInputs.forEach((input) => {
    input.disabled = isEmpty;
    if (isEmpty) {
      input.checked = false;
    }
  });

  const hasPayment = !!document.querySelector('input[name="paymentMethod"]:checked');
  if (submitBtn) {
    const shouldDisable = isEmpty;
    submitBtn.disabled = shouldDisable;
    submitBtn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
  }
  if (emptyBtn) {
    emptyBtn.disabled = isEmpty;
    emptyBtn.setAttribute('aria-disabled', isEmpty ? 'true' : 'false');
  }
  if (paymentError && (isEmpty || hasPayment)) {
    paymentError.textContent = '';
  }
}

function renderCart(cart) {
  const container = document.getElementById('cart-items');
  const totalElement = document.getElementById('cart-total');

  if (!container || !totalElement) {
    return;
  }

  container.innerHTML = '';

  if (cart.length === 0) {
    const emptyMessage = createElement('div', {
      className: 'alert alert-info mb-0 cart-empty-message',
      text: 'Tu carrito está vacío. Agrega productos antes de realizar el pedido.',
      attrs: {
        role: 'status',
        tabindex: '-1',
      },
    });
    container.appendChild(emptyMessage);
  } else {
    const fragment = document.createDocumentFragment();
    cart.forEach((item) => {
      const line = createElement('div', {
        className: 'cart-item mb-3 d-flex align-items-start',
        attrs: { 'data-id': item.id },
      });

      const content = createElement('div', { className: 'cart-item-content flex-grow-1' });
      const name = createElement('div', { className: 'fw-bold mb-1', text: item.name });
      content.appendChild(name);

      const qtyRow = createElement('div', {
        className: 'cart-qty-row mb-2 d-flex align-items-center',
        attrs: { role: 'group', 'aria-label': 'Selección de cantidad' },
      });

      const decreaseBtn = createElement('button', {
        className: 'quantity-btn cart-item-qty-btn',
        text: '-',
        attrs: {
          type: 'button',
          'data-action': 'decrease',
          'data-id': item.id,
          'aria-label': 'Disminuir cantidad',
        },
      });
      const quantity = createElement('span', {
        className: 'mx-2 item-quantity',
        text: String(item.quantity),
        attrs: { 'aria-label': 'Cantidad' },
      });
      const increaseBtn = createElement('button', {
        className: 'quantity-btn cart-item-qty-btn',
        text: '+',
        attrs: {
          type: 'button',
          'data-action': 'increase',
          'data-id': item.id,
          'aria-label': 'Aumentar cantidad',
        },
      });

      qtyRow.appendChild(decreaseBtn);
      qtyRow.appendChild(quantity);
      qtyRow.appendChild(increaseBtn);
      content.appendChild(qtyRow);

      content.appendChild(
        createElement('div', {
          className: 'text-muted small',
          text: `Precio: ${formatCurrency(item.price)}`,
        })
      );
      content.appendChild(
        createElement('div', {
          className: 'fw-bold',
          text: `Subtotal: ${formatCurrency(item.price * item.quantity)}`,
        })
      );

      const removeBtn = createElement('button', {
        className: 'btn btn-sm btn-danger remove-item mt-2',
        text: 'Eliminar',
        attrs: {
          type: 'button',
          'data-id': item.id,
          'aria-label': 'Eliminar producto',
        },
      });
      content.appendChild(removeBtn);

      const thumbWrapper = createElement('div', { className: 'cart-item-thumb ms-3 flex-shrink-0' });
      const thumb = createElement('img', {
        className: 'cart-item-thumb-img',
        attrs: {
          src: item.image,
          alt: item.name,
          loading: 'lazy',
          decoding: 'async',
        },
      });
      thumbWrapper.appendChild(thumb);

      line.appendChild(content);
      line.appendChild(thumbWrapper);
      fragment.appendChild(line);
    });
    container.appendChild(fragment);
  }

  const { totalAmount } = getCartState(cart);
  totalElement.textContent = `Total: ${formatCurrency(totalAmount)}`;
  syncCheckoutState(cart, totalAmount);
}

function openCartOffcanvas() {
  const offcanvasElement = document.getElementById('cartOffcanvas');
  if (!offcanvasElement) {
    return;
  }
  if (globalThis.bootstrap?.Offcanvas) {
    const instance = globalThis.bootstrap.Offcanvas.getOrCreateInstance(offcanvasElement);
    instance.show();
    return;
  }
  offcanvasElement.classList.add('show');
  offcanvasElement.style.visibility = 'visible';
  offcanvasElement.style.transform = 'none';
}

function updateCatalogView() {
  const container = document.getElementById('product-container');
  const sortSelect = document.getElementById('sort-options');
  const searchInput = document.getElementById('filter-keyword');
  const discountCheckbox = document.getElementById('filter-discount');
  const loadMoreBtn = document.getElementById('catalog-load-more');
  const resultsStatus = document.getElementById('catalog-results-status');
  const emptyState = document.getElementById('catalog-empty-state');
  if (!container) {
    return;
  }

  const products = Array.from(container.querySelectorAll('.producto'));
  const sortValue = sortSelect?.value || 'original';
  const keyword = normalizeSearchText(searchInput?.value || '');
  const discountOnly = !!discountCheckbox?.checked;

  const sortedProducts = [...products].sort((a, b) => {
    const aOrder = parseNumber(a.dataset.productOrder, 0);
    const bOrder = parseNumber(b.dataset.productOrder, 0);
    const aName = normalizeSearchText(a.dataset.productName || '');
    const bName = normalizeSearchText(b.dataset.productName || '');
    const aPrice = parseNumber(a.dataset.productFinalPrice, 0);
    const bPrice = parseNumber(b.dataset.productFinalPrice, 0);

    switch (sortValue) {
      case 'name-asc':
        return aName.localeCompare(bName, 'es');
      case 'name-desc':
        return bName.localeCompare(aName, 'es');
      case 'price-asc':
        return aPrice - bPrice;
      case 'price-desc':
        return bPrice - aPrice;
      default:
        return aOrder - bOrder;
    }
  });

  sortedProducts.forEach((item) => container.appendChild(item));

  const matchingProducts = [];
  sortedProducts.forEach((item) => {
    const name = normalizeSearchText(item.dataset.productName || '');
    const hasDiscount = parseNumber(item.dataset.productDiscount, 0) > 0;
    const keywordMatch = !keyword || name.includes(keyword);
    const discountMatch = !discountOnly || hasDiscount;
    if (keywordMatch && discountMatch) {
      matchingProducts.push(item);
    }
  });

  catalogMatchedCount = matchingProducts.length;
  const matchingSet = new Set(matchingProducts);
  matchingProducts.forEach((item, index) => {
    const isVisible = index < catalogVisibleLimit;
    item.classList.toggle('is-hidden', !isVisible);
  });

  sortedProducts.forEach((item) => {
    if (!matchingSet.has(item)) {
      item.classList.add('is-hidden');
    }
  });

  container.setAttribute('data-total-products', String(catalogMatchedCount));

  if (resultsStatus) {
    resultsStatus.textContent = `${catalogMatchedCount} productos encontrados`;
  }

  if (emptyState) {
    emptyState.classList.toggle('d-none', catalogMatchedCount > 0);
  }

  if (loadMoreBtn) {
    const hasMore = catalogMatchedCount > catalogVisibleLimit;
    loadMoreBtn.classList.toggle('d-none', !hasMore);
    const remaining = Math.max(catalogMatchedCount - catalogVisibleLimit, 0);
    loadMoreBtn.textContent = hasMore
      ? `Cargar más productos (${remaining} restantes)`
      : 'Cargar más productos';
  }
}

function resetCatalogVisibleLimit() {
  catalogVisibleLimit = CATALOG_PAGE_SIZE;
}

function loadMoreCatalogProducts() {
  if (catalogVisibleLimit >= catalogMatchedCount) {
    return;
  }
  catalogVisibleLimit = Math.min(catalogVisibleLimit + CATALOG_PAGE_SIZE, catalogMatchedCount);
  updateCatalogView();
}

function setupCatalogPagination() {
  const sentinel = document.getElementById('catalog-sentinel');
  if (!sentinel || typeof globalThis.IntersectionObserver !== 'function') {
    return;
  }

  if (catalogObserver) {
    catalogObserver.disconnect();
  }

  catalogObserver = new globalThis.IntersectionObserver(
    (entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (inView) {
        loadMoreCatalogProducts();
      }
    },
    { rootMargin: '240px 0px' }
  );

  catalogObserver.observe(sentinel);
}

function submitCartOrder(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return;
  }

  const paymentError = document.getElementById('payment-error');
  const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
  if (!selectedPayment) {
    if (paymentError) {
      paymentError.textContent = 'Por favor seleccione un método de pago';
    }
    const firstPayment = document.querySelector('input[name="paymentMethod"]');
    firstPayment?.focus();
    return;
  }

  if (paymentError) {
    paymentError.textContent = '';
  }

  const lines = ['Mi pedido:', ''];
  cart.forEach((item) => {
    const subtotal = item.price * item.quantity;
    lines.push(item.name);
    lines.push(`Cantidad: ${item.quantity}`);
    lines.push(`Precio unitario: $${item.price.toLocaleString('es-CL')}`);
    lines.push(`Subtotal: $${subtotal.toLocaleString('es-CL')}`);
    lines.push('');
  });

  const { totalAmount } = getCartState(cart);
  lines.push(`Total: $${totalAmount.toLocaleString('es-CL')}`);
  lines.push(`Método de pago: ${selectedPayment.value}`);

  const message = lines.join('\n');

  const encodedMessage = encodeURIComponent(message);
  globalThis.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`, '_blank');
}

function setupOnlineStatusIndicator() {
  const indicator = document.getElementById('offline-indicator');
  if (!indicator) {
    return;
  }

  const update = () => {
    indicator.classList.toggle('is-hidden', globalThis.navigator.onLine !== false);
  };

  globalThis.addEventListener('online', update);
  globalThis.addEventListener('offline', update);
  update();
}

async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
  } catch (error) {
    console.warn('Service Worker registration failed:', error);
  }
}

function initStorefront() {
  let cart = loadCart();

  const getQty = (id) => {
    const item = cart.find((entry) => entry.id === id);
    return item ? item.quantity : 0;
  };

  const setQty = (id, nextQty, fallbackProduct = null) => {
    const quantity = clampQty(nextQty);
    const index = cart.findIndex((entry) => entry.id === id);

    if (quantity <= 0) {
      if (index >= 0) {
        cart.splice(index, 1);
      }
    } else if (index >= 0) {
      cart[index].quantity = quantity;
    } else if (fallbackProduct) {
      cart.push({
        id: fallbackProduct.id,
        name: fallbackProduct.name,
        price: fallbackProduct.price,
        image: fallbackProduct.image,
        quantity,
      });
    }

    saveCart(cart);
    updateBadge(cart);
    renderCart(cart);
    syncAllActionAreas(cart);
  };

  const updateQtyByDelta = (id, delta) => {
    const current = getQty(id);
    const next = current + delta;
    const card = getProductCardById(id);
    const fallbackProduct = getProductFromCard(card);
    setQty(id, next, fallbackProduct);
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

    const addBtn = target.closest('.add-to-cart-btn');
    if (addBtn) {
      event.preventDefault();
      const id = normalizeId(addBtn.getAttribute('data-id'));
      const card = addBtn.closest('.producto');
      const product = getProductFromCard(card);
      if (id && product) {
        setQty(id, Math.max(getQty(id), 0) + 1, product);
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
      if (globalThis.confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
        cart = [];
        saveCart(cart);
        updateBadge(cart);
        renderCart(cart);
        syncAllActionAreas(cart);
      }
      return;
    }

    const submitBtn = target.closest('#submit-cart');
    if (submitBtn) {
      event.preventDefault();
      submitCartOrder(cart);
    }
  };

  // Use capture mode to avoid losing clicks if another script stops propagation.
  document.addEventListener('click', onDocumentClick, true);

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target instanceof HTMLInputElement && target.matches('.quantity-input')) {
      const id = normalizeId(target.getAttribute('data-id'));
      if (!id) {
        return;
      }
      const card = target.closest('.producto');
      const product = getProductFromCard(card);
      setQty(id, target.value, product);
      return;
    }

    if (target.id === 'sort-options' || target.id === 'filter-discount') {
      resetCatalogVisibleLimit();
      updateCatalogView();
      return;
    }

    if (target.matches('input[name="paymentMethod"]')) {
      const paymentError = document.getElementById('payment-error');
      if (paymentError) {
        paymentError.textContent = '';
      }
      const { totalAmount } = getCartState(cart);
      syncCheckoutState(cart, totalAmount);
    }
  });

  const keywordInput = document.getElementById('filter-keyword');
  keywordInput?.addEventListener(
    'input',
    debounce(() => {
      resetCatalogVisibleLimit();
      updateCatalogView();
    })
  );

  const loadMoreBtn = document.getElementById('catalog-load-more');
  loadMoreBtn?.addEventListener('click', () => {
    loadMoreCatalogProducts();
  });

  updateBadge(cart);
  renderCart(cart);
  syncAllActionAreas(cart);
  resetCatalogVisibleLimit();
  updateCatalogView();
  setupCatalogPagination();
  setupOnlineStatusIndicator();
  registerServiceWorker();

  document.documentElement.dataset.enhancementsInit = '1';
  globalThis.__APP_READY__ = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStorefront);
} else {
  initStorefront();
}
