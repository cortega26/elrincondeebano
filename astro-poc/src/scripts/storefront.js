import * as bootstrap from 'bootstrap';
import { createCatalogViewController } from './storefront/catalog-view.js';
import { createObservabilityModule } from './storefront/observability.js';
import { createPersonalizationEngine } from './storefront/personalization.js';
import { syncStorefrontServiceWorkerVersion } from './storefront/service-worker-sync.js';
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
const MOBILE_CART_SHORTCUT_REVEAL_DELAY_MS = 280;

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

function readStorefrontExperience() {
  const script = document.getElementById('storefront-experience-data');
  if (!(script instanceof HTMLScriptElement)) {
    return {};
  }

  try {
    return JSON.parse(script.textContent || '{}');
  } catch {
    return {};
  }
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
let mobileCartShortcutRevealTimeoutId = 0;

function clearMobileCartShortcutRevealTimeout() {
  if (!mobileCartShortcutRevealTimeoutId) {
    return;
  }

  globalThis.clearTimeout(mobileCartShortcutRevealTimeoutId);
  mobileCartShortcutRevealTimeoutId = 0;
}

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
  const stock = card.dataset.productStock !== 'false';

  return { id, name, category, price, image, stock };
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
  const cartButton = document.getElementById('cart-icon');
  if (cartButton) {
    cartButton.setAttribute(
      'aria-label',
      `Carrito de compras — ${totalItems} ${totalItems === 1 ? 'producto' : 'productos'}`
    );
  }
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

function getOrderItemCount(order) {
  if (!order || !Array.isArray(order.items)) {
    return 0;
  }

  return order.items.reduce(
    (total, item) => total + Math.max(parseNumber(item?.quantity, 1), 1),
    0
  );
}

function formatOrderItemLabel(count) {
  return count === 1 ? '1 producto' : `${count} productos`;
}

function setRepeatButtonsState(order) {
  const itemCount = getOrderItemCount(order);
  document.querySelectorAll('[data-repeat-last-order]').forEach((button) => {
    const enabled = itemCount > 0;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.textContent = enabled
      ? `Repetir ${formatOrderItemLabel(itemCount)}`
      : 'Repetir último pedido';
    button.setAttribute(
      'aria-label',
      enabled
        ? `Repetir pedido anterior con ${formatOrderItemLabel(itemCount)}`
        : 'Repetir último pedido'
    );
  });
}

function syncProfileSummary(profile, lastOrder) {
  const hasSavedNote = !!profile.deliveryNote;
  const itemCount = getOrderItemCount(lastOrder);
  const hasLastOrder = itemCount > 0;

  const title = createElement('strong');
  const detail = createElement('span');

  if (hasSavedNote || hasLastOrder) {
    title.textContent = hasLastOrder
      ? 'Repite tu último pedido en un toque.'
      : 'Tu nota también puede quedar guardada para el próximo pedido.';
    detail.textContent = hasSavedNote
      ? `Nota guardada: "${profile.deliveryNote}".`
      : `${formatOrderItemLabel(itemCount)} listos para volver al carrito y ajustar antes de enviar.`;

    if (hasSavedNote && hasLastOrder) {
      detail.textContent = `${formatOrderItemLabel(itemCount)} listos para repetir. Nota guardada: "${profile.deliveryNote}".`;
    }

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

function getCompanionProducts(cart, companionRules) {
  if (!Array.isArray(cart) || cart.length === 0 || !Array.isArray(companionRules)) {
    return [];
  }

  const categoriesInCart = new Set(cart.map((item) => normalizeSearchText(item.category)));
  const idsInCart = new Set(cart.map((item) => normalizeId(item.id)));
  const suggested = [];
  const seen = new Set();

  companionRules.forEach((rule) => {
    const sourceCategories = Array.isArray(rule?.sourceCategories) ? rule.sourceCategories : [];
    const applies = sourceCategories.some((category) =>
      categoriesInCart.has(normalizeSearchText(category))
    );
    if (!applies) {
      return;
    }

    const targets = Array.isArray(rule?.targets) ? rule.targets : [];
    targets.forEach((target) => {
      const product = getSourceProductCards()
        .map((card) => getProductFromCard(card))
        .find((entry) => {
          if (!entry || entry.stock === false) {
            return false;
          }
          return (
            normalizeSearchText(entry.category) === normalizeSearchText(target?.category) &&
            normalizeSearchText(entry.name) === normalizeSearchText(target?.name)
          );
        });

      if (!product || idsInCart.has(product.id) || seen.has(product.id)) {
        return;
      }

      seen.add(product.id);
      suggested.push(product);
    });
  });

  return suggested.slice(0, 3);
}

function renderCompanionSuggestions(cart, companionRules) {
  const section = document.getElementById('cart-companions');
  const list = document.getElementById('cart-companion-items');
  if (!(section instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    return;
  }

  const suggestions = getCompanionProducts(cart, companionRules);
  list.replaceChildren();

  if (suggestions.length === 0) {
    section.classList.add('is-hidden');
    return;
  }

  const fragment = document.createDocumentFragment();
  suggestions.forEach((item) => {
    const row = createElement('div', { className: 'cart-companion-card' });
    const copy = createElement('div', { className: 'cart-companion-card__copy' });
    copy.appendChild(createElement('strong', { text: item.name }));
    copy.appendChild(
      createElement('span', {
        className: 'cart-companion-card__meta',
        text: `${item.category} · ${formatCurrency(item.price)}`,
      })
    );

    const button = createElement('button', {
      className: 'btn btn-outline-dark cart-companion-card__action',
      text: 'Agregar',
      attrs: {
        type: 'button',
        'data-id': item.id,
        'data-role': 'companion-add',
        'aria-label': `Agregar ${item.name} al pedido`,
      },
    });

    row.appendChild(copy);
    row.appendChild(button);
    fragment.appendChild(row);
  });

  list.appendChild(fragment);
  section.classList.remove('is-hidden');
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

  if (isEmpty) {
    clearMobileCartShortcutRevealTimeout();
    shortcut.classList.add('is-hidden');
    shortcut.setAttribute('aria-hidden', 'true');
    shortcut.textContent = 'Ver pedido';
    shortcut.setAttribute('aria-label', 'Carrito vacio');
    return;
  }

  shortcut.textContent = `Ver pedido · ${totalItems} · ${formatCurrency(totalAmount)}`;
  shortcut.setAttribute(
    'aria-label',
    `Ver pedido, ${totalItems} productos, total ${formatCurrency(totalAmount)}`
  );

  if (shouldHide) {
    clearMobileCartShortcutRevealTimeout();
    shortcut.classList.add('is-hidden');
    shortcut.setAttribute('aria-hidden', 'true');
    return;
  }

  if (!shortcut.classList.contains('is-hidden')) {
    shortcut.setAttribute('aria-hidden', 'false');
    return;
  }

  clearMobileCartShortcutRevealTimeout();
  mobileCartShortcutRevealTimeoutId = globalThis.setTimeout(() => {
    mobileCartShortcutRevealTimeoutId = 0;

    if (cartUiState.isOffcanvasOpen || shortcut.textContent === 'Ver pedido') {
      return;
    }

    shortcut.classList.remove('is-hidden');
    shortcut.setAttribute('aria-hidden', 'false');
  }, MOBILE_CART_SHORTCUT_REVEAL_DELAY_MS);
}

function renderCart(cart, { animateTotal = false } = {}) {
  const container = document.getElementById('cart-items');
  const totalElement = document.getElementById('cart-total');

  if (!(container instanceof HTMLElement) || !(totalElement instanceof HTMLElement)) {
    return;
  }

  container.replaceChildren();

  if (cart.length === 0) {
    if (isOrderJustSent()) {
      const sentWrapper = createElement('div', { className: 'cart-post-send' });
      const sentIcon = createElement('div', { className: 'cart-post-send__icon' });
      sentIcon.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      const sentTitle = createElement('h3', {
        className: 'cart-post-send__title',
        text: '¡Pedido enviado!',
      });
      const sentBody = createElement('div', { className: 'cart-post-send__body' });
      const sentP1 = document.createElement('p');
      sentP1.textContent =
        'Recibirás una respuesta por WhatsApp para confirmar el horario de entrega dentro del edificio.';
      const sentP2 = document.createElement('p');
      sentP2.textContent =
        'Si no recibes respuesta en 30 minutos, escríbenos directamente al mismo chat.';
      sentBody.appendChild(sentP1);
      sentBody.appendChild(sentP2);
      sentWrapper.appendChild(sentIcon);
      sentWrapper.appendChild(sentTitle);
      sentWrapper.appendChild(sentBody);
      container.appendChild(sentWrapper);
    } else {
      const emptyMessage = createElement('div', {
        className: 'alert alert-info mb-0 cart-empty-message',
        text: 'Tu carrito está vacío. Agrega productos antes de realizar el pedido.',
        attrs: {
          role: 'status',
          tabindex: '-1',
        },
      });
      container.appendChild(emptyMessage);
    }
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
        className: 'remove-item cart-item__remove',
        attrs: {
          type: 'button',
          'data-id': item.id,
          'aria-label': `Eliminar ${item.name ?? 'producto'} del carrito`,
        },
      });
      removeBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>' +
        '<span aria-hidden="true">Quitar</span>';

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
    clearButton: document.getElementById('filter-clear'),
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

// --- Order Confirmation Flow ---

let pendingOrderData = null;

const STORAGE_SENT_KEY = 'orderLastSentAt';
const STORAGE_RECOVERY_KEY = 'recoveryDismissed';
const RECOVERY_BANNER_TTL_MS = 3600000; // 1 hour
const SENT_STATE_TTL_MS = 86400000; // 24 hours

function getStoredJson(key, fallback) {
  return storefrontStorage.loadJson(key, fallback);
}

function saveStoredJson(key, value) {
  storefrontStorage.saveJson(key, value);
}

function isOrderJustSent() {
  const sentAt = getStoredJson(STORAGE_SENT_KEY, 0);
  return sentAt > 0 && Date.now() - sentAt < SENT_STATE_TTL_MS;
}

function clearLastOrderSentAt() {
  saveStoredJson(STORAGE_SENT_KEY, 0);
}

function isRecoveryBannerDismissed() {
  const dismissedAt = getStoredJson(STORAGE_RECOVERY_KEY, 0);
  return dismissedAt > 0 && Date.now() - dismissedAt < RECOVERY_BANNER_TTL_MS;
}

function buildOrderConfirmSummary(
  cart,
  totalAmount,
  selectedPayment,
  substitutionPreference,
  deliveryNote
) {
  const container = document.getElementById('order-confirm-summary');
  if (!container) {
    return;
  }

  container.replaceChildren();

  cart.forEach((item) => {
    const subtotal = item.price * item.quantity;
    const row = createElement('div', { className: 'order-confirm__summary-row' });
    const info = createElement('div', { className: 'order-confirm__summary-item' });
    info.appendChild(
      createElement('div', { className: 'order-confirm__summary-item-name', text: item.name })
    );
    info.appendChild(
      createElement('div', {
        className: 'order-confirm__summary-item-meta',
        text: `${item.quantity} × ${formatCurrency(item.price)}`,
      })
    );
    const total = createElement('span', {
      className: 'order-confirm__summary-item-total',
      text: formatCurrency(subtotal),
    });
    row.appendChild(info);
    row.appendChild(total);
    container.appendChild(row);
  });

  const totalRow = createElement('div', { className: 'order-confirm__summary-total-row' });
  totalRow.appendChild(createElement('span', { text: 'Total' }));
  totalRow.appendChild(
    createElement('span', {
      className: 'order-confirm__summary-total-amount',
      text: formatCurrency(totalAmount),
    })
  );
  container.appendChild(totalRow);

  const metaDiv = createElement('div', { className: 'order-confirm__summary-meta' });
  const addMetaLine = (label, value) => {
    const line = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = label;
    line.appendChild(strong);
    line.appendChild(document.createTextNode(value));
    metaDiv.appendChild(line);
  };
  addMetaLine('Pago: ', selectedPayment);
  if (deliveryNote) {
    addMetaLine('Nota: ', `“${deliveryNote}”`);
  }
  addMetaLine('Stock: ', substitutionPreference);
  container.appendChild(metaDiv);
}

function buildWhatsAppMessageText(
  cart,
  totalAmount,
  selectedPayment,
  substitutionPreference,
  deliveryNote
) {
  const lines = [];
  lines.push('🛒 *Nuevo Pedido - El Rincón de Ébano*');
  lines.push('');

  cart.forEach((item) => {
    const subtotal = item.price * item.quantity;
    lines.push(`*${item.name}*`);
    lines.push(
      `   ${item.quantity} × $${item.price.toLocaleString('es-CL')} = $${subtotal.toLocaleString('es-CL')}`
    );
    lines.push('');
  });

  lines.push('_ _ _ _ _ _ _ _ _ _ _ _ _ _ _');
  lines.push('');
  lines.push(`*Total:* $${totalAmount.toLocaleString('es-CL')}`);
  lines.push(`*Pago:* ${selectedPayment}`);
  lines.push(`*Stock:* ${substitutionPreference}`);
  if (deliveryNote) {
    lines.push(`📝 *Nota:* ${deliveryNote}`);
  }

  return lines.join('\n');
}

function showOrderConfirmationDialog() {
  const dialog = document.getElementById('order-confirm-dialog');
  if (!dialog) {
    return;
  }
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
  dialog.setAttribute('aria-hidden', 'false');
  document.body.classList.add('service-dialog-open');
}

function closeOrderConfirmationDialog() {
  const dialog = document.getElementById('order-confirm-dialog');
  if (!dialog) {
    return;
  }
  if (typeof dialog.close === 'function') {
    dialog.close();
  }
  dialog.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('service-dialog-open');
}

function executeSendOrder(pending) {
  if (!pending) {
    return;
  }

  const { message, cart, selectedPayment, profile, substitutionPreference } = pending;

  personalizationEngine.recordOrder(cart, profile, selectedPayment, substitutionPreference);

  syncProfileSummary(profile, loadLastOrder());
  setRepeatButtonsState(loadLastOrder());
  renderPersonalizedProducts();

  const encodedMessage = encodeURIComponent(message);
  trackAnalyticsEvent('whatsapp_checkout_submit', {
    items: cart.length,
    totalAmount: getCartState(cart).totalAmount,
    paymentMethod: selectedPayment,
    source: isMobileViewport() ? 'mobile' : 'desktop',
  });

  globalThis.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`, '_blank');

  closeOrderConfirmationDialog();
  showPostSubmitToast();
}

function showPostSubmitToast() {
  const toast = document.getElementById('order-sent-toast');
  if (!toast) {
    return;
  }
  toast.classList.remove('is-hidden');
  toast.setAttribute('aria-hidden', 'false');
  globalThis.setTimeout(hidePostSubmitToast, 6000);
}

function hidePostSubmitToast() {
  const toast = document.getElementById('order-sent-toast');
  if (!toast) {
    return;
  }
  toast.classList.add('is-hidden');
  toast.setAttribute('aria-hidden', 'true');
}

// --- Cart Recovery Banner ---

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

function markOrderAsSent() {
  const cart = loadCart();
  if (cart.length === 0) {
    return;
  }

  const profile = readProfileForm();
  const selectedPayment = getSelectedPaymentValue();
  const substitutionPreference = getSelectedSubstitutionPreference();

  personalizationEngine.recordOrder(cart, profile, selectedPayment, substitutionPreference);

  saveCart([]);
  saveStoredJson(STORAGE_SENT_KEY, Date.now());
  updateBadge([], { animate: true });
  renderCart([]);
  syncAllActionAreas([]);
  hidePostSubmitToast();
}

function submitCartOrder(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return;
  }

  const paymentError = document.getElementById('payment-error');
  if (paymentError) {
    paymentError.textContent = '';
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

  const { totalAmount } = getCartState(cart);
  const profile = readProfileForm();
  const substitutionPreference = getSelectedSubstitutionPreference();

  saveProfile(profile);
  savePreferredPayment(selectedPayment);
  saveSubstitutionPreference(substitutionPreference);

  const message = buildWhatsAppMessageText(
    cart,
    totalAmount,
    selectedPayment,
    substitutionPreference,
    profile.deliveryNote
  );

  pendingOrderData = {
    message,
    cart,
    totalAmount,
    selectedPayment,
    profile,
    substitutionPreference,
  };

  buildOrderConfirmSummary(
    cart,
    totalAmount,
    selectedPayment,
    substitutionPreference,
    profile.deliveryNote
  );
  buildWhatsAppPreview(
    cart,
    totalAmount,
    selectedPayment,
    substitutionPreference,
    profile.deliveryNote
  );
  showOrderConfirmationDialog();
}

function buildWhatsAppPreview(
  cart,
  totalAmount,
  selectedPayment,
  substitutionPreference,
  deliveryNote
) {
  const preview = document.getElementById('order-confirm-preview');
  if (!preview) {
    return;
  }
  preview.textContent = buildWhatsAppMessageText(
    cart,
    totalAmount,
    selectedPayment,
    substitutionPreference,
    deliveryNote
  );
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
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });
    await syncStorefrontServiceWorkerVersion({
      registration,
      runtimeContract: STOREFRONT_RUNTIME_CONTRACT,
      log,
    });
  } catch (error) {
    log('warn', 'service_worker_registration_failed', { error });
  }
}

function initStorefront() {
  observability.initObservability({ enabled: true, slowEndpointMs: 1200 });
  storefrontStorage.migrateLegacyState();
  const storefrontExperience = readStorefrontExperience();
  const companionRules = Array.isArray(storefrontExperience?.companionRules)
    ? storefrontExperience.companionRules
    : [];

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

    if (index < 0 && fallbackProduct?.stock === false) {
      return;
    }

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
    renderCompanionSuggestions(cart, companionRules);
    // Keep quick-order cards stable while the shopper is actively editing quantities.
    syncAllActionAreas(cart);

    if (quantity > previousQuantity) {
      personalizationEngine.trackProductSignal(id, 'addedCount');
    }

    if (cart.length > 0 && isOrderJustSent()) {
      clearLastOrderSentAt();
    }
  };

  const addBundleItems = (bundleItems) => {
    if (!Array.isArray(bundleItems) || bundleItems.length === 0) {
      return false;
    }

    let added = false;
    bundleItems.forEach((item) => {
      const id = normalizeId(item?.id);
      if (!id) {
        return;
      }

      const fallbackProduct = {
        id,
        name: typeof item?.name === 'string' ? item.name : id,
        category: typeof item?.category === 'string' ? item.category : '',
        price: parseNumber(item?.price, 0),
        image: typeof item?.image === 'string' ? item.image : '',
      };

      const product =
        getProductByIdFromSource(id) ||
        getProductFromCard(getProductCardById(id)) ||
        fallbackProduct;
      setQty(id, Math.max(getQty(id), 0) + 1, product);
      added = true;
    });

    return added;
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
    renderCompanionSuggestions(cart, companionRules);
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
        destination: href || '/combos/',
      });
    }

    const repeatBtn = target.closest('[data-repeat-last-order]');
    if (repeatBtn) {
      event.preventDefault();
      repeatLastOrder();
      return;
    }

    const bundleBtn = target.closest('[data-bundle-payload]');
    if (bundleBtn) {
      event.preventDefault();
      try {
        const bundleItems = JSON.parse(bundleBtn.getAttribute('data-bundle-payload') || '[]');
        if (addBundleItems(bundleItems)) {
          openCartOffcanvas();
        }
      } catch (error) {
        log('warn', 'bundle_payload_parse_failed', { error });
      }
      return;
    }

    const reviewRecoveryBtn = target.closest('#cart-recovery-review');
    if (reviewRecoveryBtn) {
      event.preventDefault();
      hideRecoveryBanner();
      openCartOffcanvas();
      return;
    }

    const dismissRecoveryBtn = target.closest('#cart-recovery-dismiss');
    if (dismissRecoveryBtn) {
      event.preventDefault();
      hideRecoveryBanner();
      saveStoredJson(STORAGE_RECOVERY_KEY, Date.now());
      return;
    }

    const addBtn = target.closest('.add-to-cart-btn');
    if (addBtn) {
      if (addBtn instanceof HTMLButtonElement && addBtn.disabled) {
        return;
      }
      event.preventDefault();
      const id = normalizeId(addBtn.getAttribute('data-id'));
      const card = addBtn.closest('.producto');
      const product = getProductFromCard(card);
      if (id && product && product.stock !== false) {
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

    const companionAddBtn = target.closest('[data-role="companion-add"]');
    if (companionAddBtn) {
      event.preventDefault();
      const id = normalizeId(companionAddBtn.getAttribute('data-id'));
      const product = getProductByIdFromSource(id) || getProductFromCard(getProductCardById(id));
      if (id && product && product.stock !== false) {
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
      return;
    }

    const confirmSendBtn = target.closest('#order-confirm-send');
    if (confirmSendBtn) {
      event.preventDefault();
      const pending = pendingOrderData;
      pendingOrderData = null;
      executeSendOrder(pending);
      return;
    }

    const markSentBtn = target.closest('#order-mark-sent');
    if (markSentBtn) {
      event.preventDefault();
      markOrderAsSent();
      return;
    }

    const dismissToastBtn = target.closest('#order-toast-dismiss');
    if (dismissToastBtn) {
      event.preventDefault();
      hidePostSubmitToast();
      return;
    }

    const orderConfirmClose = target.closest('[data-order-confirm-close]');
    if (orderConfirmClose) {
      event.preventDefault();
      closeOrderConfirmationDialog();
      pendingOrderData = null;
    }
  };

  // Register the click delegate before the rest of the hydration work finishes
  // so the hero CTA is protected even when Chrome users click as soon as the
  // page paints.
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

  const clearBtn = document.getElementById('filter-clear');
  clearBtn?.addEventListener('click', () => {
    const keywordField = document.getElementById('filter-keyword');
    const sortField = document.getElementById('sort-options');
    const discountField = document.getElementById('filter-discount');
    if (keywordField instanceof HTMLInputElement) {
      keywordField.value = '';
      keywordField.focus();
    }
    if (sortField instanceof HTMLSelectElement) {
      sortField.value = 'original';
    }
    if (discountField instanceof HTMLInputElement) {
      discountField.checked = false;
    }
    catalogController.resetVisibleLimit();
    catalogController.updateView();
  });

  hydrateProfilePersistence();
  updateBadge(cart);
  renderCart(cart);
  renderCompanionSuggestions(cart, companionRules);
  syncAllActionAreas(cart);

  if (shouldShowRecoveryBanner(cart)) {
    showRecoveryBanner();
  }

  renderPersonalizedProducts();
  initServiceOnboarding();

  // Order confirmation dialog events
  const orderConfirmDialog = document.getElementById('order-confirm-dialog');
  if (orderConfirmDialog) {
    orderConfirmDialog.addEventListener('close', () => {
      orderConfirmDialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
      pendingOrderData = null;
    });
    orderConfirmDialog.addEventListener('cancel', () => {
      orderConfirmDialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
      pendingOrderData = null;
    });
    orderConfirmDialog.addEventListener('click', (event) => {
      if (event.target === orderConfirmDialog) {
        closeOrderConfirmationDialog();
        pendingOrderData = null;
      }
    });
  }
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
