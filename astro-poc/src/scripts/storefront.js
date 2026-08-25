// Plan 031 + 118: deep imports register ONLY the Bootstrap data APIs the
// markup relies on (collapse toggler, dropdowns, the injected dismissible
// alert banner) plus the programmatic Offcanvas — the full monolith
// (carousel/scrollspy/tooltip/modal + Popper) is excluded from the bundle.
// The barrel namespace and the globalThis.bootstrap exposure are gone.
import 'bootstrap/js/dist/collapse.js';
import 'bootstrap/js/dist/dropdown.js';
import 'bootstrap/js/dist/alert.js';
// CJS interop: dist modules export the class as module.exports
// (named imports come back undefined through Vite's interop).
import Offcanvas from 'bootstrap/js/dist/offcanvas.js';
import { createCatalogViewController } from './storefront/catalog-view.js';
import { createCartViewController } from './storefront/cart-view.js';
import { createOrderSubmitController } from './storefront/order-submit.js';
import { createRecoveryBannerController } from './storefront/recovery-banner.js';
import { createObservabilityModule } from './storefront/observability.js';
import { createPersonalizationEngine } from './storefront/personalization.js';
import { syncStorefrontServiceWorkerVersion } from './storefront/service-worker-sync.js';
import {
  createStorefrontStorage,
  STOREFRONT_RUNTIME_CONTRACT,
} from './storefront/storage-contract.js';
import { log } from '../lib/logger.js';
import { WHATSAPP_NUMBER, formatCurrency } from '../lib/formatting.js';
import {
  clampQty,
  createCartItemFromProduct,
  getCartState,
  hydrateCartFromOrder,
  hydrateSharedCart,
  normalizeId,
  parseNumber,
  sanitizeCart,
  toSharedCartPayload,
} from './storefront/storefront-state.js';

const MAX_RECENT_ORDERS = 6;
const MAX_PERSONALIZED_ITEMS = 4;

if (typeof window !== 'undefined') {
  globalThis.__APP_READY__ = false;
  globalThis.__STOREFRONT_RUNTIME_CONTRACT__ = STOREFRONT_RUNTIME_CONTRACT;
  window.__STOREFRONT_RUNTIME_CONTRACT__ = STOREFRONT_RUNTIME_CONTRACT;
  document.documentElement.dataset.storefrontRuntime = STOREFRONT_RUNTIME_CONTRACT.runtimeId;
  document.documentElement.dataset.storefrontStorageVersion = String(
    STOREFRONT_RUNTIME_CONTRACT.storageVersion
  );
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
function setCartOffcanvasState(nextOpen) {
  const isOpen = Boolean(nextOpen);
  cartUiState.isOffcanvasOpen = isOpen;
  document.documentElement.dataset.cartOpen = isOpen ? '1' : '0';
  document.body.classList.toggle('cart-offcanvas-open', isOpen);
}

function loadCart() {
  const cart = sanitizeCart(storefrontStorage.loadJson('cart', []));
  // Si hay datos en la key legacy pero no en la canónica, migrar
  if (cart.length === 0) {
    const legacyRaw = globalThis.localStorage?.getItem('cart');
    if (legacyRaw) {
      try {
        const legacyCart = sanitizeCart(JSON.parse(legacyRaw));
        if (legacyCart.length > 0) {
          storefrontStorage.saveJson('cart', legacyCart);
          return legacyCart;
        }
      } catch {
        /* ignorar JSON inválido */
      }
    }
    return [];
  }
  // Mantener la key legacy sincronizada durante la transición (write-through)
  try {
    const serialized = JSON.stringify(cart);
    globalThis.localStorage?.setItem('cart', serialized);
  } catch {
    /* ignorar error de quota en la key legacy */
  }
  return cart;
}

function saveCart(cart) {
  const sanitized = sanitizeCart(cart);
  const saved = storefrontStorage.saveJson('cart', sanitized);
  try {
    var serialized = JSON.stringify(sanitized);
    globalThis.localStorage?.setItem('cart', serialized);
  } catch (_e) {
    /* ignorar error de quota en la key legacy */
  }
  return saved;
}

function showCartSaveError() {
  const existing = document.getElementById('cart-save-error');
  if (existing) return;
  const toast = createElement('div', {
    className: 'alert alert-warning alert-dismissible fade show position-fixed bottom-0 end-0 m-3',
    attrs: { id: 'cart-save-error', role: 'alert', style: 'z-index: 9999; max-width: 400px;' },
  });
  toast.innerHTML =
    '<strong>No se pudo guardar el carrito.</strong> Libera espacio en tu navegador e intenta de nuevo.<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>';
  document.body.appendChild(toast);
}

// Carrito compartible por URL
function encodeCart(cart) {
  try {
    const payload = toSharedCartPayload(cart);
    if (!payload) return '';
    return btoa(encodeURIComponent(JSON.stringify(payload)));
  } catch {
    return '';
  }
}

function decodeCart(encoded) {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

function getShareableCartUrl(cart) {
  if (!cart || cart.length === 0) return null;
  const encoded = encodeCart(cart);
  if (!encoded) return null;
  const url = new URL(globalThis.location.href);
  url.hash = 'cart=' + encoded;
  return url.toString();
}

function shareCart(cart) {
  const url = getShareableCartUrl(cart);
  if (!url) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(function () {});
  }
}

function loadCartFromUrl() {
  var hash = globalThis.location.hash;
  var match = hash.match(/^#?cart=(.+)$/);
  if (!match) return false;

  try {
    var raw = decodeCart(match[1]);
    if (!raw) return false;
    var hydrated = hydrateSharedCart(raw, function (id) {
      return getProductByIdFromSource(id) || getProductFromCard(getProductCardById(id));
    });
    if (hydrated.length === 0) return false;

    var currentCart = loadCart();
    if (currentCart.length > 0) {
      // Plan 117: never refuse silently — the link looks broken otherwise.
      var existing = document.getElementById('shared-cart-refused');
      if (!existing) {
        var toast = createElement('div', {
          className:
            'alert alert-warning alert-dismissible fade show position-fixed bottom-0 end-0 m-3',
          attrs: {
            id: 'shared-cart-refused',
            role: 'alert',
            style: 'z-index: 9999; max-width: 400px;',
          },
        });
        toast.innerHTML =
          '<strong>Enlace de carrito no aplicado.</strong> Ya tienes productos en tu carrito.<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>';
        document.body.appendChild(toast);
      }
      return false;
    }

    if (!saveCart(hydrated)) {
      return false;
    }
    history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search);
    return true;
  } catch (e) {
    return false;
  }
}
// Fin ---

// Notificaciones de stock
function getFavorites() {
  // Plan 117: route through the storage abstraction (safe-parse, slot key).
  return storefrontStorage.loadJson('favorites', []);
}

function checkStockNotifications() {
  const favorites = getFavorites();
  if (favorites.length === 0) return;

  const products = Array.from(document.querySelectorAll('.producto')).map(function (el) {
    return {
      id: el.dataset.productId || '',
      name: el.dataset.productName || '',
      stock: el.dataset.productStock === 'true',
    };
  });

  const inStock = products.filter(function (p) {
    return favorites.indexOf(p.id) >= 0 && p.stock;
  });

  if (inStock.length === 0) return;

  const existing = document.getElementById('stock-notification-banner');
  if (existing) existing.remove();

  const banner = createElement('div', {
    className: 'alert alert-success alert-dismissible fade show stock-notification-banner',
    attrs: { id: 'stock-notification-banner', role: 'alert', 'aria-live': 'polite' },
  });

  const headerRow = createElement('div', { className: 'd-flex align-items-center gap-2 mb-1' });
  const strong = document.createElement('strong');
  strong.textContent = '¡Productos disponibles de nuevo!';
  headerRow.appendChild(strong);
  banner.appendChild(headerRow);

  const body = createElement('div', { className: 'stock-notification-body' });
  const names = inStock
    .map(function (p) {
      return p.name;
    })
    .join(', ');
  const verb = inStock.length === 1 ? 'está' : 'están';
  const plural = inStock.length === 1 ? '' : 's';
  const pronoun = inStock.length === 1 ? 'o' : 'os';
  body.textContent =
    names + ' ' + verb + ' disponible' + plural + '. ¡Agrégal' + pronoun + ' a tu pedido!';
  banner.appendChild(body);

  const closeBtn = createElement('button', {
    className: 'btn-close',
    attrs: { type: 'button', 'data-bs-dismiss': 'alert', 'aria-label': 'Cerrar' },
  });
  banner.appendChild(closeBtn);

  const target = document.querySelector('main') || document.body;
  target.insertBefore(banner, target.firstChild);
}

// Fin ---

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
  storefrontStorage.saveJson('preferredPayment', value);
}

function loadSubstitutionPreference() {
  return normalizeId(storefrontStorage.loadJson('substitutionPreference', 'Preguntar antes'));
}

function saveSubstitutionPreference(value) {
  storefrontStorage.saveJson('substitutionPreference', value);
}

function getProductCardById(id) {
  return Array.from(document.querySelectorAll('.producto')).find(
    (card) => card instanceof HTMLElement && normalizeId(card.dataset.productId) === id
  );
}

let productCardCache = null;

function getProductCardMap() {
  if (productCardCache) {
    return productCardCache;
  }
  productCardCache = new Map();
  document.querySelectorAll('#product-container .producto').forEach((card) => {
    if (card instanceof HTMLElement) {
      const id = normalizeId(card.dataset.productId);
      if (id) productCardCache.set(id, card);
    }
  });
  return productCardCache;
}

let companionProductCache = null;

function getCompanionProductMap() {
  if (companionProductCache) {
    return companionProductCache;
  }
  companionProductCache = new Map();
  getProductCardMap().forEach((card) => {
    const product = getProductFromCard(card);
    if (product && product.id) {
      companionProductCache.set(product.id, product);
    }
  });
  return companionProductCache;
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
  // Store the ORIGINAL price: the cart pipeline (getCartState, renders,
  // WhatsApp summary) computes effectivePrice = price - discount everywhere,
  // so a final price here would double-apply the discount.
  const price = parseNumber(card.dataset.productPrice, 0);
  const discount = parseNumber(card.dataset.productDiscount, 0);
  const image = card.querySelector('.product-thumb, .strip-card__img')?.getAttribute('src') || '';
  const stock = card.dataset.productStock !== 'false';

  return { id, name, category, price, discount, image, stock };
}

function getProductByIdFromSource(id) {
  const card = getProductCardMap().get(id);
  return card ? getProductFromCard(card) : null;
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
  getVisibleProductIds: () => [...getProductCardMap().keys()].filter(Boolean),
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

  const cardMap = getProductCardMap();
  const sourceCards = personalizedIds.map((productId) => cardMap.get(productId)).filter(Boolean);

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

  // Plan 120: the category->product map is rule-invariant — build it once
  // per call (was rebuilt inside the rules loop on every cart interaction).
  var productByKey = new Map();
  getCompanionProductMap().forEach(function (product) {
    if (product && product.stock !== false) {
      var key = normalizeSearchText(product.category) + '::' + normalizeSearchText(product.name);
      if (!productByKey.has(key)) {
        productByKey.set(key, product);
      }
    }
  });

  companionRules.forEach((rule) => {
    const sourceCategories = Array.isArray(rule?.sourceCategories) ? rule.sourceCategories : [];
    const applies = sourceCategories.some((category) =>
      categoriesInCart.has(normalizeSearchText(category))
    );
    if (!applies) {
      return;
    }

    const targets = Array.isArray(rule?.targets) ? rule.targets : [];
    targets.forEach(function (target) {
      var key =
        normalizeSearchText(target?.category || '') +
        '::' +
        normalizeSearchText(target?.name || '');
      var product = productByKey.get(key);

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
    shortcut.classList.add('is-hidden');
    shortcut.setAttribute('aria-hidden', 'true');
    return;
  }

  if (!shortcut.classList.contains('is-hidden')) {
    shortcut.setAttribute('aria-hidden', 'false');
    return;
  }

  // Follow-up (Auditoría 9): the deferred reveal (280ms timer) was
  // re-armed on every re-sync, so a non-empty cart could keep the shortcut
  // hidden indefinitely (and e2e raced it). Reveal synchronously — the
  // offcanvas-open guard above is the only case that keeps it hidden.
  shortcut.classList.remove('is-hidden');
  shortcut.setAttribute('aria-hidden', 'false');
}

// Plan 116: renderCart/order-submit moved to storefront/*.js modules — the
// controllers are built in initStorefront and bound here so callers stay
// unchanged (storefront.js remains the composition root).
let renderCart = () => {};
let submitCartOrder = () => {};
let buildWhatsAppMessageText = () => '';
let markOrderAsSent = () => {};
let showRecoveryBanner = () => {};
let hideRecoveryBanner = () => {};
let shouldShowRecoveryBanner = () => false;

function openCartOffcanvas() {
  const offcanvasElement = document.getElementById('cartOffcanvas');
  if (!offcanvasElement) {
    return;
  }
  const instance = Offcanvas.getOrCreateInstance(offcanvasElement);
  instance.show();
  setCartOffcanvasState(true);
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
    onViewUpdated: () => {
      productCardCache = null;
      companionProductCache = null;
    },
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

const STORAGE_SENT_KEY = 'orderLastSentAt';
// --- Order Confirmation Flow ---

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
  // Cargar carrito desde URL y notificar stock
  const urlLoaded = loadCartFromUrl();
  if (urlLoaded) cart = loadCart();
  checkStockNotifications();
  const initialProfile = loadProfile();
  const lastOrder = loadLastOrder();
  const catalogController = createCatalogController();
  const cartViewController = createCartViewController({
    createElement,
    formatCurrency,
    getCartState,
    triggerTransientClass,
    syncCheckoutState,
    syncMobileCartShortcut,
    shareCart,
    isOrderJustSent,
    renderCompanionSuggestions,
    companionRules,
  });
  renderCart = cartViewController.renderCart;
  const orderSubmitController = createOrderSubmitController({
    createElement,
    formatCurrency,
    getCartState,
    getSelectedPaymentValue,
    readProfileForm,
    getSelectedSubstitutionPreference,
    saveProfile,
    savePreferredPayment,
    saveSubstitutionPreference,
    buildWhatsAppPreview,
    showOrderConfirmationDialog,
  });
  submitCartOrder = orderSubmitController.submitCartOrder;
  buildWhatsAppMessageText = orderSubmitController.buildWhatsAppMessageText;
  const recoveryBannerController = createRecoveryBannerController({
    storefrontStorage,
    loadCart,
    saveCart,
    updateBadge,
    renderCart,
    syncAllActionAreas,
    showCartSaveError,
    hidePostSubmitToast,
    isOrderJustSent,
  });
  markOrderAsSent = recoveryBannerController.markOrderAsSent;
  showRecoveryBanner = recoveryBannerController.showRecoveryBanner;
  hideRecoveryBanner = recoveryBannerController.hideRecoveryBanner;
  shouldShowRecoveryBanner = recoveryBannerController.shouldShowRecoveryBanner;
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

    let _removedItem = null;

    if (quantity <= 0) {
      if (index >= 0) {
        _removedItem = cart.splice(index, 1)[0] || null;
      }
    } else if (index >= 0) {
      // Verificar stock antes de incrementar
      if (quantity > cart[index].quantity && fallbackProduct?.stock === false) {
        return;
      }
      cart[index].quantity = quantity;
    } else if (fallbackProduct) {
      const nextItem = createCartItemFromProduct(fallbackProduct, quantity);
      if (nextItem) {
        cart.push(nextItem);
      }
    }

    const nextState = getCartState(cart);
    const saved = saveCart(cart);
    if (!saved) {
      log('warn', 'cart_save_failed', { reason: 'localStorage_quota' });
      // Restaurar estado anterior
      if (_removedItem) {
        cart.splice(index, 0, _removedItem);
      } else if (index >= 0 && previousQuantity > 0) {
        cart[index].quantity = previousQuantity;
      } else if (index >= 0 && previousQuantity <= 0) {
        cart.splice(index, 1);
      }
      if (previousQuantity <= 0 && index < 0 && fallbackProduct) {
        cart.pop();
      }
      showCartSaveError();
      return;
    }
    updateBadge(cart, { animate: previousState.totalItems !== nextState.totalItems });
    renderCart(cart, {
      animateTotal: previousState.totalAmount !== nextState.totalAmount,
      changedItemId: id,
    });
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
    const nextCart = hydrateCartFromOrder(order);

    if (!saveCart(nextCart)) {
      showCartSaveError();
      return;
    }

    cart = nextCart;
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
      recoveryBannerController.dismissRecoveryBanner();
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
        if (!saveCart([])) {
          showCartSaveError();
          return;
        }
        cart = [];
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
      const pending = orderSubmitController.takePendingOrder();
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
      orderSubmitController.takePendingOrder();
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
  recoveryBannerController.initServiceOnboarding();

  // Order confirmation dialog events
  const orderConfirmDialog = document.getElementById('order-confirm-dialog');
  if (orderConfirmDialog) {
    orderConfirmDialog.addEventListener('close', () => {
      orderConfirmDialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
      orderSubmitController.takePendingOrder();
    });
    orderConfirmDialog.addEventListener('cancel', () => {
      orderConfirmDialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('service-dialog-open');
      orderSubmitController.takePendingOrder();
    });
    orderConfirmDialog.addEventListener('click', (event) => {
      if (event.target === orderConfirmDialog) {
        closeOrderConfirmationDialog();
        orderSubmitController.takePendingOrder();
      }
    });
  }
  catalogController.resetVisibleLimit();
  catalogController.updateView();
  catalogController.setupPagination();
  setupOnlineStatusIndicator();
  registerServiceWorker();

  setupBackToTop();

  document.documentElement.dataset.storefrontRuntime = STOREFRONT_RUNTIME_CONTRACT.runtimeId;
  document.documentElement.dataset.storefrontStorageVersion = String(
    STOREFRONT_RUNTIME_CONTRACT.storageVersion
  );
  document.documentElement.dataset.enhancementsInit = '1';
  globalThis.__APP_READY__ = true;
}

function setupBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SCROLL_THRESHOLD = 300;

  function toggleVisibility() {
    const shouldShow = window.scrollY > SCROLL_THRESHOLD;
    btn.classList.toggle('is-visible', shouldShow);
  }

  window.addEventListener('scroll', toggleVisibility, { passive: true });
  toggleVisibility();

  btn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'instant' : 'smooth',
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStorefront);
} else {
  initStorefront();
}
