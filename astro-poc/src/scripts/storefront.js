import * as bootstrap from 'bootstrap';
import { createCatalogViewController } from './storefront/catalog-view.js';
import { createObservabilityModule } from './storefront/observability.js';
import { createPersonalizationEngine } from './storefront/personalization.js';
import {
  createStorefrontStorage,
  STOREFRONT_RUNTIME_CONTRACT,
} from './storefront/storage-contract.js';
import {
  clampQty,
  createCartItemFromProduct,
  getCartState,
  hydrateCartFromOrder,
  normalizeId,
  parseNumber,
  sanitizeCart,
} from './storefront/storefront-state.js';

const MAX_RECENT_ORDERS = 6;
const MAX_PERSONALIZED_ITEMS = 4;
const WHATSAPP_NUMBER = '56951118901';

if (typeof window !== 'undefined') {
  globalThis.bootstrap = bootstrap;
  globalThis.__APP_READY__ = false;
  globalThis.__STOREFRONT_RUNTIME_CONTRACT__ = STOREFRONT_RUNTIME_CONTRACT;
  window.__STOREFRONT_RUNTIME_CONTRACT__ = STOREFRONT_RUNTIME_CONTRACT;
  document.documentElement.dataset.storefrontRuntime = STOREFRONT_RUNTIME_CONTRACT.runtimeId;
  document.documentElement.dataset.storefrontStorageVersion = String(
    STOREFRONT_RUNTIME_CONTRACT.storageVersion
  );
}

function normalizeMetaValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMetaValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeMetaValue(nestedValue)])
    );
  }

  return value;
}

function log(level, message, meta = {}) {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...normalizeMetaValue(meta),
  });

  if (typeof console[level] === 'function') {
    console[level](entry);
    return;
  }

  console.log(entry);
}

function trackAnalyticsEvent(eventName, properties = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function') {
      window.__analyticsTrack(eventName, properties);
    }
  } catch {
    // Ignore analytics failures to avoid blocking storefront interactions.
  }
}

function isMobileViewport() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  return window.innerWidth <= 767;
}

function debounce(fn, wait = 120) {
  let timeoutId;
  return (...args) => {
    globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(parseNumber(value, 0));
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

function triggerTransientClass(element, className) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

const storefrontStorage = createStorefrontStorage({ log });
const observability = createObservabilityModule({ log });
const cartUiState = {
  isOffcanvasOpen: false,
};

function setCartOffcanvasState(nextOpen) {
  const isOpen = Boolean(nextOpen);
  cartUiState.isOffcanvasOpen = isOpen;
  document.documentElement.dataset.cartOpen = isOpen ? '1' : '0';
  document.body.classList.toggle('cart-offcanvas-open', isOpen);
}

function loadCart() {
  const cart = sanitizeCart(storefrontStorage.loadJson('cart', []));
  if (
    cart.length > 0 &&
    globalThis.localStorage?.getItem(STOREFRONT_RUNTIME_CONTRACT.storageKeys.cart) === null
  ) {
    storefrontStorage.saveJson('cart', cart);
  }
  return cart;
}

function saveCart(cart) {
  storefrontStorage.saveJson('cart', sanitizeCart(cart));
}

function loadProfile() {
  const profile = storefrontStorage.loadJson('profile', {});
  return {
    deliveryNote: typeof profile?.deliveryNote === 'string' ? profile.deliveryNote : '',
  };
}

function saveProfile(profile) {
  storefrontStorage.saveJson('profile', profile);
}

function loadRecentOrders() {
  const recentOrders = storefrontStorage.loadJson('recentOrders', []);
  return Array.isArray(recentOrders) ? recentOrders : [];
}

function saveRecentOrders(orders) {
  storefrontStorage.saveJson('recentOrders', orders.slice(0, MAX_RECENT_ORDERS));
}

function loadLastOrder() {
  return storefrontStorage.loadJson('lastOrder', null);
}

function saveLastOrder(order) {
  storefrontStorage.saveJson('lastOrder', order);
}

function loadProductSignals() {
  const signals = storefrontStorage.loadJson('productSignals', {});
  return signals && typeof signals === 'object' ? signals : {};
}

function saveProductSignals(signals) {
  storefrontStorage.saveJson('productSignals', signals);
}

function loadPreferredPayment() {
  return normalizeId(storefrontStorage.loadJson('preferredPayment', ''));
}

function savePreferredPayment(value) {
  if (value) {
    storefrontStorage.saveJson('preferredPayment', value);
  }
}

function loadSubstitutionPreference() {
  return normalizeId(storefrontStorage.loadJson('substitutionPreference', 'Preguntar antes'));
}

function saveSubstitutionPreference(value) {
  if (value) {
    storefrontStorage.saveJson('substitutionPreference', value);
  }
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
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openDialog();
    });
  });

  dialog.querySelectorAll(closeSelector).forEach((control) => {
    control.addEventListener('click', () => {
      closeDialog();
    });
  });

  dialog.addEventListener('close', () => {
    dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('service-dialog-open');
  });

  dialog.addEventListener('cancel', () => {
    dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('service-dialog-open');
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });
}

function getProductCardById(id) {
  return Array.from(document.querySelectorAll('.producto')).find(
    (card) => card instanceof HTMLElement && normalizeId(card.dataset.productId) === id
  );
}

function getSourceProductCards() {
  return Array.from(document.querySelectorAll('#product-container .producto')).filter(
    (card) => card instanceof HTMLElement
  );
}

function getProductFromCard(card) {
  if (!(card instanceof HTMLElement)) {
    return null;
  }

  const id = normalizeId(card.dataset.productId);
  if (!id) {
    return null;
  }

  const name = card.dataset.productName || id;
  const category = card.dataset.productCategory || '';
  const price = parseNumber(card.dataset.productFinalPrice, 0);
  const image = card.querySelector('.product-thumb')?.getAttribute('src') || '';

  return { id, name, category, price, image };
}

function getProductByIdFromSource(id) {
  return getProductFromCard(
    getSourceProductCards().find((card) => normalizeId(card.dataset.productId) === id)
  );
}

function updateBadge(cart, { animate = false } = {}) {
  const badge = document.getElementById('cart-count');
  if (!badge) {
    return;
  }
  const { totalItems } = getCartState(cart);
  badge.textContent = String(totalItems);
  badge.setAttribute('aria-label', `${totalItems} productos en el carrito`);
  if (animate) {
    triggerTransientClass(badge, 'cart-count-bump');
  }
}

function toggleActionArea(actionArea, quantity) {
  if (!(actionArea instanceof HTMLElement)) {
    return;
  }
  const addBtn = actionArea.querySelector('.add-to-cart-btn');
  const qtyControl = actionArea.querySelector('.quantity-control');
  const qtyValue = actionArea.querySelector('.quantity-value');

  if (quantity > 0) {
    addBtn?.classList.add('is-hidden');
    qtyControl?.classList.remove('is-hidden');
    qtyControl?.classList.add('is-flex');
    if (qtyValue) {
      qtyValue.textContent = String(quantity);
    }
  } else {
    addBtn?.classList.remove('is-hidden');
    qtyControl?.classList.add('is-hidden');
    qtyControl?.classList.remove('is-flex');
    if (qtyValue) {
      qtyValue.textContent = '1';
    }
  }
}

function syncAllActionAreas(cart) {
  const quantities = new Map(cart.map((item) => [item.id, item.quantity]));
  document.querySelectorAll('.action-area[data-pid]').forEach((actionArea) => {
    const id = normalizeId(actionArea.getAttribute('data-pid'));
    const quantity = quantities.get(id) || 0;
    toggleActionArea(actionArea, quantity);
  });
}

function getProfileElements() {
  return {
    deliveryNoteInput: document.getElementById('delivery-note'),
    substitutionSelect: document.getElementById('substitution-preference'),
  };
}

function readProfileForm() {
  const { deliveryNoteInput } = getProfileElements();
  return {
    deliveryNote:
      deliveryNoteInput instanceof HTMLTextAreaElement ? deliveryNoteInput.value.trim() : '',
  };
}

function populateProfileForm(profile) {
  const { deliveryNoteInput, substitutionSelect } = getProfileElements();
  if (deliveryNoteInput instanceof HTMLTextAreaElement) {
    deliveryNoteInput.value = profile.deliveryNote || '';
  }
  if (substitutionSelect instanceof HTMLSelectElement) {
    substitutionSelect.value = loadSubstitutionPreference();
  }
}

function setPreferredPayment(value) {
  const preferred = normalizeId(value);
  const paymentInputs = Array.from(document.querySelectorAll('input[name="paymentMethod"]'));
  paymentInputs.forEach((input) => {
    input.checked = input instanceof HTMLInputElement && input.value === preferred;
  });
}

function getSelectedPaymentValue() {
  const selected = document.querySelector('input[name="paymentMethod"]:checked');
  return selected instanceof HTMLInputElement ? selected.value : '';
}

function getSelectedSubstitutionPreference() {
  const select = document.getElementById('substitution-preference');
  return select instanceof HTMLSelectElement ? select.value : 'Preguntar antes';
}

function setRepeatButtonsState(order) {
  document.querySelectorAll('[data-repeat-last-order]').forEach((button) => {
    const enabled = !!(order && Array.isArray(order.items) && order.items.length > 0);
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  });
}

function syncProfileSummary(profile, lastOrder) {
  const hasSavedNote = !!profile.deliveryNote;
  const hasLastOrder = !!(
    lastOrder &&
    Array.isArray(lastOrder.items) &&
    lastOrder.items.length > 0
  );

  const title = createElement('strong');
  const detail = createElement('span');

  if (hasSavedNote || hasLastOrder) {
    title.textContent = hasLastOrder
      ? 'Tu último pedido quedó guardado en este dispositivo.'
      : 'Tu nota también puede quedar guardada para el próximo pedido.';
    detail.textContent = hasSavedNote
      ? `Nota guardada: "${profile.deliveryNote}".`
      : 'Puedes repetir el pedido en un toque o ajustar cantidades antes de enviarlo por WhatsApp.';
    document.querySelectorAll('[data-home-profile-copy]').forEach((content) => {
      if (content instanceof HTMLElement) {
        content.replaceChildren(title.cloneNode(true), detail.cloneNode(true));
      }
    });
    return;
  }

  title.textContent = 'Tu último pedido puede quedar listo en un toque.';
  detail.textContent =
    'Si quieres, deja una nota para el pedido y úsala también en la próxima compra.';
  document.querySelectorAll('[data-home-profile-copy]').forEach((content) => {
    if (content instanceof HTMLElement) {
      content.replaceChildren(title.cloneNode(true), detail.cloneNode(true));
    }
  });
}

const personalizationEngine = createPersonalizationEngine({
  loadLastOrder,
  saveLastOrder,
  loadRecentOrders,
  saveRecentOrders,
  loadProductSignals,
  saveProductSignals,
  parseNumber,
  getVisibleProductIds: () =>
    getSourceProductCards()
      .map((card) => normalizeId(card.dataset.productId))
      .filter(Boolean),
  resolveProductById: (productId) => getProductByIdFromSource(productId),
  maxPersonalizedItems: MAX_PERSONALIZED_ITEMS,
});

function renderPersonalizedProducts() {
  const containers = Array.from(
    document.querySelectorAll(
      '[data-home-personalized-grid], #home-personalized-grid-desktop, #home-personalized-grid-mobile'
    )
  ).filter((container) => container instanceof HTMLElement);
  const notes = Array.from(document.querySelectorAll('[data-home-personalized-note]')).filter(
    (note) => note instanceof HTMLElement
  );

  if (containers.length === 0) {
    return;
  }

  const personalizedIds = personalizationEngine.getPersonalizedProductIds();
  if (personalizedIds.length === 0) {
    notes.forEach((note) => {
      note.textContent =
        'Tus frecuentes aparecerán aquí. Mientras tanto, dejamos una selección útil para resolver rápido.';
    });
    return;
  }

  const sourceCards = personalizedIds
    .map((productId) =>
      getSourceProductCards().find((card) => normalizeId(card.dataset.productId) === productId)
    )
    .filter(Boolean);

  if (sourceCards.length === 0) {
    return;
  }

  containers.forEach((container) => {
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const fragment = document.createDocumentFragment();
    sourceCards.forEach((sourceCard) => {
      const clone = sourceCard.cloneNode(true);
      if (clone instanceof HTMLElement) {
        clone.classList.remove('is-hidden');
      }
      fragment.appendChild(clone);
    });
    container.replaceChildren(fragment);
  });

  notes.forEach((note) => {
    note.textContent =
      'Esta selección se adapta a lo que ya agregaste o pediste desde este dispositivo.';
  });
}

function syncCheckoutState(cart, totalAmount) {
  const isEmpty = cart.length === 0;
  const submitBtn = document.getElementById('submit-cart');
  const emptyBtn = document.getElementById('empty-cart');
  const paymentError = document.getElementById('payment-error');
  const paymentHint = document.getElementById('payment-threshold-hint');
  const paymentInputs = Array.from(document.querySelectorAll('input[name="paymentMethod"]'));

  const creditContainer = document.getElementById('payment-credit-container');
  const creditInput = document.getElementById('payment-credit');
  const allowCredit = totalAmount >= 30000;
  if (creditContainer) {
    creditContainer.classList.toggle('d-none', !allowCredit);
  }
  if (!allowCredit && creditInput instanceof HTMLInputElement && creditInput.checked) {
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
    const shouldDisable = isEmpty || !hasPayment;
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

  if (paymentHint) {
    if (isEmpty) {
      paymentHint.textContent = 'Tarjeta disponible desde CLP 30.000 en el total del pedido.';
    } else if (allowCredit) {
      paymentHint.textContent = 'Tu total ya permite pagar con tarjeta de credito.';
    } else {
      const missing = Math.max(30000 - totalAmount, 0);
      paymentHint.textContent = `Te faltan ${formatCurrency(missing)} para habilitar pago con tarjeta.`;
    }
  }
}

function syncMobileCartShortcut(cart, totalAmount) {
  const shortcut = document.getElementById('mobile-cart-shortcut');
  if (!(shortcut instanceof HTMLButtonElement)) {
    return;
  }

  const { totalItems } = getCartState(cart);
  const isEmpty = totalItems <= 0;
  const shouldHide = isEmpty || cartUiState.isOffcanvasOpen;

  shortcut.classList.toggle('is-hidden', shouldHide);
  shortcut.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');

  if (isEmpty) {
    shortcut.textContent = 'Ver pedido';
    shortcut.setAttribute('aria-label', 'Carrito vacio');
    return;
  }

  shortcut.textContent = `Ver pedido · ${totalItems} · ${formatCurrency(totalAmount)}`;
  shortcut.setAttribute(
    'aria-label',
    `Ver pedido, ${totalItems} productos, total ${formatCurrency(totalAmount)}`
  );
}

function renderCart(cart, { animateTotal = false } = {}) {
  const container = document.getElementById('cart-items');
  const totalElement = document.getElementById('cart-total');

  if (!(container instanceof HTMLElement) || !(totalElement instanceof HTMLElement)) {
    return;
  }

  container.replaceChildren();

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
        className: 'cart-item',
        attrs: { 'data-id': item.id },
      });

      const thumbWrapper = createElement('div', { className: 'cart-item-thumb flex-shrink-0' });
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

      const content = createElement('div', { className: 'cart-item-content flex-grow-1' });
      const name = createElement('div', { className: 'fw-bold cart-item__title', text: item.name });
      content.appendChild(name);

      const meta = createElement('div', { className: 'cart-item__meta' });
      meta.appendChild(
        createElement('span', {
          className: 'cart-item__price-line',
          text: `Unitario: ${formatCurrency(item.price)}`,
        })
      );
      meta.appendChild(
        createElement('span', {
          className: 'cart-item__subtotal',
          text: `Subtotal: ${formatCurrency(item.price * item.quantity)}`,
        })
      );
      content.appendChild(meta);

      const qtyRow = createElement('div', {
        className: 'cart-qty-row',
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
        className: 'quantity-value item-quantity',
        text: String(item.quantity),
        attrs: { 'aria-label': 'Cantidad', 'aria-live': 'polite', 'aria-atomic': 'true' },
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

      const removeBtn = createElement('button', {
        className: 'btn btn-sm btn-outline-danger remove-item cart-item__remove',
        text: 'Eliminar',
        attrs: {
          type: 'button',
          'data-id': item.id,
          'aria-label': 'Eliminar producto',
        },
      });

      const actions = createElement('div', { className: 'cart-item__actions' });
      actions.appendChild(qtyRow);
      actions.appendChild(removeBtn);
      content.appendChild(actions);

      line.appendChild(thumbWrapper);
      line.appendChild(content);
      fragment.appendChild(line);
    });
    container.appendChild(fragment);
  }

  const { totalAmount } = getCartState(cart);
  totalElement.textContent = `Total: ${formatCurrency(totalAmount)}`;
  if (animateTotal) {
    triggerTransientClass(totalElement, 'cart-total-bump');
  }
  syncCheckoutState(cart, totalAmount);
  syncMobileCartShortcut(cart, totalAmount);
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
  setCartOffcanvasState(true);
  offcanvasElement.classList.add('show');
  offcanvasElement.style.visibility = 'visible';
  offcanvasElement.style.transform = 'none';
}

function createCatalogController() {
  return createCatalogViewController({
    container: document.getElementById('product-container'),
    sortSelect: document.getElementById('sort-options'),
    searchInput: document.getElementById('filter-keyword'),
    discountCheckbox: document.getElementById('filter-discount'),
    loadMoreButton: document.getElementById('catalog-load-more'),
    resultsStatus: document.getElementById('catalog-results-status'),
    emptyState: document.getElementById('catalog-empty-state'),
    sentinel: document.getElementById('catalog-sentinel'),
    normalizeSearchText,
    parseNumber,
  });
}

function hydrateProfilePersistence() {
  const saveProfileFields = debounce(() => {
    const profile = readProfileForm();
    saveProfile(profile);
    syncProfileSummary(profile, loadLastOrder());
  }, 160);

  const { deliveryNoteInput, substitutionSelect } = getProfileElements();
  [deliveryNoteInput].forEach((element) => {
    if (element instanceof HTMLElement) {
      element.addEventListener('input', saveProfileFields);
    }
  });

  if (substitutionSelect instanceof HTMLSelectElement) {
    substitutionSelect.addEventListener('change', () => {
      saveSubstitutionPreference(substitutionSelect.value);
    });
  }
}

function submitCartOrder(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return;
  }

  const paymentError = document.getElementById('payment-error');
  const submitFeedback = document.getElementById('submit-feedback');
  if (submitFeedback) {
    submitFeedback.textContent = '';
  }
  const selectedPayment = getSelectedPaymentValue();
  if (!selectedPayment) {
    if (paymentError) {
      paymentError.textContent = 'Selecciona un método de pago antes de enviar el pedido.';
    }
    const firstPayment = document.querySelector('input[name="paymentMethod"]');
    firstPayment?.focus();
    return;
  }

  if (paymentError) {
    paymentError.textContent = '';
  }

  const profile = readProfileForm();
  const substitutionPreference = getSelectedSubstitutionPreference();
  saveProfile(profile);
  savePreferredPayment(selectedPayment);
  saveSubstitutionPreference(substitutionPreference);
  personalizationEngine.recordOrder(cart, profile, selectedPayment, substitutionPreference);

  const lines = ['Hola, quiero confirmar este pedido:', ''];

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
  lines.push(`Método de pago: ${selectedPayment}`);
  lines.push(`Si no hay stock: ${substitutionPreference}`);
  if (profile.deliveryNote) {
    lines.push(`Nota de entrega: ${profile.deliveryNote}`);
  }

  const message = lines.join('\n');
  syncProfileSummary(profile, loadLastOrder());
  setRepeatButtonsState(loadLastOrder());
  renderPersonalizedProducts();

  const encodedMessage = encodeURIComponent(message);
  trackAnalyticsEvent('whatsapp_checkout_submit', {
    items: cart.length,
    totalAmount,
    paymentMethod: selectedPayment,
    source: isMobileViewport() ? 'mobile' : 'desktop',
  });
  if (submitFeedback) {
    submitFeedback.textContent =
      'Abriremos WhatsApp con el resumen listo. Solo revisa y presiona enviar para confirmar.';
  }
  globalThis.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`, '_blank');
}

function initHomeExperienceTelemetry() {
  document.querySelectorAll('[data-home-merchandising]').forEach((element) => {
    if (!(element instanceof HTMLDetailsElement)) {
      return;
    }

    element.addEventListener('toggle', () => {
      trackAnalyticsEvent('mobile_merchandising_toggle', {
        expanded: element.open,
      });
    });
  });
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
    log('warn', 'service_worker_registration_failed', { error });
  }
}

function initStorefront() {
  observability.initObservability({ enabled: true, slowEndpointMs: 1200 });
  storefrontStorage.migrateLegacyState();

  let cart = loadCart();
  const initialProfile = loadProfile();
  const lastOrder = loadLastOrder();
  const catalogController = createCatalogController();
  const cartOffcanvas = document.getElementById('cartOffcanvas');

  const syncCartShortcutState = () => {
    const { totalAmount } = getCartState(cart);
    syncMobileCartShortcut(cart, totalAmount);
  };

  setCartOffcanvasState(
    cartOffcanvas instanceof HTMLElement && cartOffcanvas.classList.contains('show')
  );

  populateProfileForm(initialProfile);
  setPreferredPayment(loadPreferredPayment());
  syncProfileSummary(initialProfile, lastOrder);
  setRepeatButtonsState(lastOrder);
  initHomeExperienceTelemetry();

  if (cartOffcanvas instanceof HTMLElement) {
    const handleOpen = () => {
      setCartOffcanvasState(true);
      syncCartShortcutState();
    };
    const handleClose = () => {
      setCartOffcanvasState(false);
      syncCartShortcutState();
    };

    cartOffcanvas.addEventListener('show.bs.offcanvas', handleOpen);
    cartOffcanvas.addEventListener('shown.bs.offcanvas', handleOpen);
    cartOffcanvas.addEventListener('hide.bs.offcanvas', handleClose);
    cartOffcanvas.addEventListener('hidden.bs.offcanvas', handleClose);
  }

  const getQty = (id) => {
    const item = cart.find((entry) => entry.id === id);
    return item ? item.quantity : 0;
  };

  const setQty = (id, nextQty, fallbackProduct = null) => {
    const quantity = clampQty(nextQty);
    const index = cart.findIndex((entry) => entry.id === id);
    const previousState = getCartState(cart);
    const previousQuantity = index >= 0 ? cart[index].quantity : 0;

    if (quantity <= 0) {
      if (index >= 0) {
        cart.splice(index, 1);
      }
    } else if (index >= 0) {
      cart[index].quantity = quantity;
    } else if (fallbackProduct) {
      const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
      if (nextItem) {
        cart.push(nextItem);
      }
    }

    const nextState = getCartState(cart);
    saveCart(cart);
    updateBadge(cart, { animate: previousState.totalItems !== nextState.totalItems });
    renderCart(cart, { animateTotal: previousState.totalAmount !== nextState.totalAmount });
    // Keep quick-order cards stable while the shopper is actively editing quantities.
    syncAllActionAreas(cart);

    if (quantity > previousQuantity) {
      personalizationEngine.trackProductSignal(id, 'addedCount');
    }
  };

  const addProductById = (id, quantity = 1) => {
    const product = getProductByIdFromSource(id) || getProductFromCard(getProductCardById(id));
    if (!product) {
      return;
    }
    setQty(id, Math.max(getQty(id), 0) + quantity, product);
  };

  const updateQtyByDelta = (id, delta) => {
    const current = getQty(id);
    const next = current + delta;
    const card = getProductCardById(id);
    const fallbackProduct = getProductFromCard(card);
    setQty(id, next, fallbackProduct);
  };

  const repeatLastOrder = () => {
    const order = loadLastOrder();
    if (!order || !Array.isArray(order.items) || order.items.length === 0) {
      return;
    }
    cart = hydrateCartFromOrder(order);

    saveCart(cart);
    updateBadge(cart, { animate: true });
    renderCart(cart, { animateTotal: true });
    syncAllActionAreas(cart);
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
      const substitutionSelect = document.getElementById('substitution-preference');
      if (substitutionSelect instanceof HTMLSelectElement) {
        substitutionSelect.value = order.substitutionPreference;
      }
    }
    syncCheckoutState(cart, getCartState(cart).totalAmount);
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

    const heroCta = target.closest('[data-home-hero-cta]');
    if (heroCta) {
      const href = heroCta.getAttribute('href') || '';
      trackAnalyticsEvent('home_hero_primary_cta_click', {
        destination: href || '#home-quick-order-heading',
      });
      if (href.startsWith('#')) {
        const scrollTarget = document.getElementById(href.slice(1));
        if (scrollTarget) {
          // Prevent native smooth-scroll: Chrome animates anchor navigation even without
          // scroll-behavior:smooth, causing the catalog IntersectionObserver to fire
          // loadMore() mid-flight, which expands the catalog and pushes the target section
          // far below where the scroll lands.
          event.preventDefault();
          catalogController.disconnect();
          const targetTop = scrollTarget.getBoundingClientRect().top + globalThis.scrollY;
          const scrollPaddingTop =
            parseFloat(globalThis.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
          globalThis.scrollTo({
            top: Math.max(0, targetTop - scrollPaddingTop),
            behavior: 'instant',
          });
          catalogController.setupPagination();
          return;
        }
      }
    }

    const repeatBtn = target.closest('[data-repeat-last-order]');
    if (repeatBtn) {
      event.preventDefault();
      repeatLastOrder();
      return;
    }

    const bundleBtn = target.closest('[data-bundle-items]');
    if (bundleBtn) {
      event.preventDefault();
      const bundleItems = String(bundleBtn.getAttribute('data-bundle-items') || '')
        .split(',')
        .map((value) => normalizeId(value))
        .filter(Boolean);
      bundleItems.forEach((productId) => addProductById(productId, 1));
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
        addBtn.classList.add('is-added');
        globalThis.setTimeout(() => {
          addBtn.classList.remove('is-added');
        }, 280);
        setQty(id, Math.max(getQty(id), 0) + 1, product);
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
        cart = [];
        saveCart(cart);
        updateBadge(cart, { animate: true });
        renderCart(cart, { animateTotal: true });
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

  document.addEventListener('click', onDocumentClick, true);

  document.addEventListener('change', (event) => {
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
      const paymentError = document.getElementById('payment-error');
      if (paymentError) {
        paymentError.textContent = '';
      }
      const selectedPayment = getSelectedPaymentValue();
      if (selectedPayment) {
        savePreferredPayment(selectedPayment);
      }
      const { totalAmount } = getCartState(cart);
      syncCheckoutState(cart, totalAmount);
      return;
    }

    if (target.id === 'substitution-preference' && target instanceof HTMLSelectElement) {
      saveSubstitutionPreference(target.value);
    }
  });

  const keywordInput = document.getElementById('filter-keyword');
  keywordInput?.addEventListener(
    'input',
    debounce(() => {
      catalogController.resetVisibleLimit();
      catalogController.updateView();
    })
  );

  const loadMoreBtn = document.getElementById('catalog-load-more');
  loadMoreBtn?.addEventListener('click', () => {
    catalogController.loadMore();
  });

  hydrateProfilePersistence();
  updateBadge(cart);
  renderCart(cart);
  syncAllActionAreas(cart);
  renderPersonalizedProducts();
  initServiceOnboarding();
  catalogController.resetVisibleLimit();
  catalogController.updateView();
  catalogController.setupPagination();
  setupOnlineStatusIndicator();
  registerServiceWorker();

  document.documentElement.dataset.storefrontRuntime = STOREFRONT_RUNTIME_CONTRACT.runtimeId;
  document.documentElement.dataset.storefrontStorageVersion = String(
    STOREFRONT_RUNTIME_CONTRACT.storageVersion
  );
  document.documentElement.dataset.enhancementsInit = '1';
  globalThis.__APP_READY__ = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStorefront);
} else {
  initStorefront();
}
