/** @vitest-environment jsdom */
/* eslint-disable max-lines-per-function -- suite-level describe block (plan 265) */
// Plan 265 — characterization of the DOM wiring extracted from initStorefront()
// in storefront.js: the capture click delegate and each of its branches, the
// change listener, the cart-offcanvas events, the catalog controls and the
// cross-tab storage hookup.
//
// Follows plan 245: the wiring behaviors were frozen as skipped placeholder
// names BEFORE the extraction (first commit of this plan) and are now pinned
// against createDomHandlers with the composition-root dependencies injected as
// stubs. The pre-extraction behavior is the contract: the telemetry hops fall
// through, the branches keep their order and returns, and nothing here may
// improve or reorder a branch. The harness re-creates the storefront debounce
// 1:1 because the factory receives it injected (production passes the real
// helper); normalizeId is the real storefront-state primitive.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDomHandlers } from '../astro-poc/src/scripts/storefront/dom-handlers.js';
import { normalizeId } from '../astro-poc/src/scripts/storefront/storefront-state.js';

const PENDING_ORDER = { message: 'pending order' };
const REPEAT_ORDER = { items: [{ id: 'sku-1', quantity: 2 }] };

// 1:1 copy of the storefront.js debounce the composition root injects.
function productionDebounce(fn, wait = 120) {
  let timeoutId;
  return (...args) => {
    globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => {
      fn(...args);
    }, wait);
  };
}

function createHarness({
  cartController: cartOverrides = {},
  catalogController: catalogOverrides = {},
  ...overrides
} = {}) {
  const deps = {
    documentRef: document,
    windowRef: { addEventListener: vi.fn() },
    cartController: {
      getCart: vi.fn(() => []),
      setCart: vi.fn(),
      getQty: vi.fn(() => 0),
      setQty: vi.fn(),
      addBundleItems: vi.fn(() => false),
      updateQtyByDelta: vi.fn(),
      clearCart: vi.fn(),
      adoptCrossTabEvent: vi.fn(),
      ...cartOverrides,
    },
    catalogController: {
      resetVisibleLimit: vi.fn(),
      updateView: vi.fn(),
      loadMore: vi.fn(),
      ...catalogOverrides,
    },
    orderSubmitController: { takePendingOrder: vi.fn(() => PENDING_ORDER) },
    setCartOffcanvasState: vi.fn(),
    syncMobileCartShortcut: vi.fn(),
    getCartState: vi.fn(() => ({ totalAmount: 0 })),
    openCartOffcanvas: vi.fn(),
    trackAnalyticsEvent: vi.fn(),
    isMobileViewport: vi.fn(() => false),
    debounce: vi.fn((fn, wait = 120) => productionDebounce(fn, wait)),
    normalizeId: vi.fn(normalizeId),
    log: vi.fn(),
    getProductFromCard: vi.fn(() => null),
    getProductByIdFromSource: vi.fn(() => null),
    getProductCardById: vi.fn(() => null),
    submitCartOrder: vi.fn(),
    executeSendOrder: vi.fn(),
    markOrderAsSent: vi.fn(),
    hidePostSubmitToast: vi.fn(),
    closeOrderConfirmationDialog: vi.fn(),
    getSelectedPaymentValue: vi.fn(() => ''),
    savePreferredPayment: vi.fn(),
    saveSubstitutionPreference: vi.fn(),
    syncCheckoutState: vi.fn(),
    loadLastOrder: vi.fn(() => null),
    hydrateCartFromOrder: vi.fn(() => []),
    saveCart: vi.fn(() => true),
    showCartSaveError: vi.fn(),
    updateBadge: vi.fn(),
    renderCart: vi.fn(),
    renderCompanionSuggestions: vi.fn(),
    syncAllActionAreas: vi.fn(),
    companionRules: [],
    populateProfileForm: vi.fn(),
    saveProfile: vi.fn(),
    readProfileForm: vi.fn(() => ({})),
    setPreferredPayment: vi.fn(),
    ...overrides,
  };
  return { handlers: createDomHandlers(deps), deps };
}

function emit(handler, target) {
  const event = { target, preventDefault: vi.fn() };
  handler(event);
  return event;
}

function clickHandler(handler, selector) {
  return emit(handler, document.querySelector(selector));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('storefront DOM handlers — pinned wiring rules (plan 265)', () => {
  describe('click delegation — generic guards', () => {
    it('ignores click events whose target is not an Element', () => {
      const { handlers, deps } = createHarness();
      const event = { target: document.createTextNode('hola'), preventDefault: vi.fn() };

      handlers.onDocumentClick(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(deps.openCartOffcanvas).not.toHaveBeenCalled();
      expect(deps.trackAnalyticsEvent).not.toHaveBeenCalled();
    });

    it('a branch that returns stops the delegation so later branches never run', () => {
      document.body.innerHTML =
        '<div id="cart-icon"><button class="add-to-cart-btn" data-id="sku-1">+</button></div>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '.add-to-cart-btn');

      expect(deps.openCartOffcanvas).toHaveBeenCalledTimes(1);
      // The add-to-cart branch would have resolved the card product first.
      expect(deps.getProductFromCard).not.toHaveBeenCalled();
      expect(deps.cartController.setQty).not.toHaveBeenCalled();
    });
  });

  describe('click delegation — cart openers', () => {
    it('#cart-icon click (or a nested child) prevents default and opens the cart offcanvas', () => {
      document.body.innerHTML = '<a id="cart-icon" href="#"><span id="cart-icon-icon"></span></a>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '#cart-icon-icon');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.openCartOffcanvas).toHaveBeenCalledTimes(1);
    });

    it('#mobile-cart-shortcut click prevents default, tracks mobile_cart_shortcut_click with source floating_shortcut, and opens the cart offcanvas', () => {
      document.body.innerHTML = '<button id="mobile-cart-shortcut">Carrito</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '#mobile-cart-shortcut');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('mobile_cart_shortcut_click', {
        source: 'floating_shortcut',
      });
      expect(deps.openCartOffcanvas).toHaveBeenCalledTimes(1);
    });
  });

  describe('click delegation — telemetry hops that fall through', () => {
    it('[data-notify-whatsapp] click tracks notify_when_back with the sku and name attributes', () => {
      document.body.innerHTML =
        '<button data-notify-whatsapp data-notify-sku="sku-1" data-notify-name="Agua">Avisame</button>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '[data-notify-whatsapp]');

      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('notify_when_back', {
        sku: 'sku-1',
        name: 'Agua',
      });
    });

    it('[data-notify-whatsapp] click without attributes tracks empty sku and name strings', () => {
      document.body.innerHTML = '<button data-notify-whatsapp>Avisame</button>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '[data-notify-whatsapp]');

      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('notify_when_back', {
        sku: '',
        name: '',
      });
    });

    it('[data-home-hero-cta] click tracks home_hero_primary_cta_click with the href as destination', () => {
      document.body.innerHTML = '<a data-home-hero-cta href="/ofertas/">Ofertas</a>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '[data-home-hero-cta]');

      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('home_hero_primary_cta_click', {
        destination: '/ofertas/',
      });
    });

    it('[data-home-hero-cta] click without href falls back to the /combos/ destination', () => {
      document.body.innerHTML = '<button data-home-hero-cta>Combos</button>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '[data-home-hero-cta]');

      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('home_hero_primary_cta_click', {
        destination: '/combos/',
      });
    });

    it('the telemetry hops neither prevent default nor return — the delegation continues', () => {
      document.body.innerHTML = `
        <a data-notify-whatsapp data-notify-sku="sku-1" data-notify-name="Agua">
          <span data-home-hero-cta href="/ofertas/">Avisame</span>
        </a>`;
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '[data-home-hero-cta]');

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('notify_when_back', {
        sku: 'sku-1',
        name: 'Agua',
      });
      expect(deps.trackAnalyticsEvent).toHaveBeenCalledWith('home_hero_primary_cta_click', {
        destination: '/ofertas/',
      });
      // Fall-through order: notify first, hero second.
      expect(deps.trackAnalyticsEvent.mock.invocationCallOrder[0]).toBeLessThan(
        deps.trackAnalyticsEvent.mock.invocationCallOrder[1]
      );
    });
  });

  describe('click delegation — repeat last order', () => {
    function mountRepeat({ execute = true } = {}) {
      document.body.innerHTML = `
        <button data-repeat-last-order>Repetir</button>
        <select id="substitution-preference">
          <option value="no-sustituir">No sustituir</option>
          <option value="sustituir">Sustituir</option>
        </select>`;
      const nextCart = [{ id: 'sku-1', quantity: 2, price: 1000 }];
      const harness = createHarness({
        loadLastOrder: vi.fn(() => REPEAT_ORDER),
        hydrateCartFromOrder: vi.fn(() => nextCart),
        saveCart: vi.fn(() => execute),
        getCartState: vi.fn(() => ({ totalAmount: 2000 })),
      });
      return { ...harness, nextCart };
    }

    it('[data-repeat-last-order] click prevents default and repeats the stored last order', () => {
      const { handlers, deps, nextCart } = mountRepeat();

      const event = clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.loadLastOrder).toHaveBeenCalledTimes(1);
      expect(deps.hydrateCartFromOrder).toHaveBeenCalledWith(REPEAT_ORDER);
      expect(deps.saveCart).toHaveBeenCalledWith(nextCart);
    });

    it('repeat does nothing when there is no stored order or it has no items', () => {
      document.body.innerHTML = '<button data-repeat-last-order>Repetir</button>';
      const { handlers, deps } = createHarness({ loadLastOrder: vi.fn(() => null) });

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.hydrateCartFromOrder).not.toHaveBeenCalled();
      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.cartController.setCart).not.toHaveBeenCalled();
      expect(deps.openCartOffcanvas).not.toHaveBeenCalled();
    });

    it('repeat surfaces the save error and stops when persisting the hydrated cart fails', () => {
      const { handlers, deps } = mountRepeat({ execute: false });

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.showCartSaveError).toHaveBeenCalledTimes(1);
      expect(deps.cartController.setCart).not.toHaveBeenCalled();
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(deps.openCartOffcanvas).not.toHaveBeenCalled();
    });

    it('repeat hydrates the cart, updates the badge with animation, renders the cart and the companion suggestions', () => {
      const { handlers, deps, nextCart } = mountRepeat();

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.cartController.setCart).toHaveBeenCalledWith(nextCart);
      expect(deps.updateBadge).toHaveBeenCalledWith(nextCart, { animate: true });
      expect(deps.renderCart).toHaveBeenCalledWith(nextCart, { animateTotal: true });
      expect(deps.renderCompanionSuggestions).toHaveBeenCalledWith(nextCart, deps.companionRules);
    });

    it('repeat syncs all action areas and the checkout state with the hydrated totals', () => {
      const { handlers, deps, nextCart } = mountRepeat();

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.syncAllActionAreas).toHaveBeenCalledWith(nextCart);
      expect(deps.syncCheckoutState).toHaveBeenCalledWith(nextCart, 2000);
    });

    it('repeat restores the stored profile, payment and substitution preference', () => {
      const order = {
        ...REPEAT_ORDER,
        profile: { name: 'Ana' },
        payment: 'efectivo',
        substitutionPreference: 'sustituir',
      };
      document.body.innerHTML = `
        <button data-repeat-last-order>Repetir</button>
        <select id="substitution-preference">
          <option value="no-sustituir">No sustituir</option>
          <option value="sustituir">Sustituir</option>
        </select>`;
      const { handlers, deps } = createHarness({
        loadLastOrder: vi.fn(() => order),
        hydrateCartFromOrder: vi.fn(() => []),
      });

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.populateProfileForm).toHaveBeenCalledWith(order.profile);
      expect(deps.setPreferredPayment).toHaveBeenCalledWith('efectivo');
      expect(deps.saveSubstitutionPreference).toHaveBeenCalledWith('sustituir');
    });

    it('repeat persists the restored profile and payment and writes the substitution select', () => {
      const order = {
        ...REPEAT_ORDER,
        profile: { name: 'Ana' },
        payment: 'efectivo',
        substitutionPreference: 'sustituir',
      };
      document.body.innerHTML = `
        <button data-repeat-last-order>Repetir</button>
        <select id="substitution-preference">
          <option value="no-sustituir">No sustituir</option>
          <option value="sustituir">Sustituir</option>
        </select>`;
      const { handlers, deps } = createHarness({
        loadLastOrder: vi.fn(() => order),
        hydrateCartFromOrder: vi.fn(() => []),
        readProfileForm: vi.fn(() => ({ name: 'Ana' })),
      });

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.saveProfile).toHaveBeenCalledWith({ name: 'Ana' });
      expect(deps.savePreferredPayment).toHaveBeenCalledWith('efectivo');
      expect(document.getElementById('substitution-preference').value).toBe('sustituir');
    });

    it('repeat opens the cart offcanvas at the end', () => {
      const { handlers, deps } = mountRepeat();

      clickHandler(handlers.onDocumentClick, '[data-repeat-last-order]');

      expect(deps.openCartOffcanvas).toHaveBeenCalledTimes(1);
      // The offcanvas opens after the hydrated cart was rendered.
      expect(deps.cartController.setCart.mock.invocationCallOrder[0]).toBeLessThan(
        deps.openCartOffcanvas.mock.invocationCallOrder[0]
      );
    });
  });

  describe('click delegation — bundles', () => {
    const BUNDLE_PAYLOAD = '[{"id":"sku-1"},{"id":"sku-2"}]';

    it('[data-bundle-payload] click parses the payload and adds every bundled item', () => {
      document.body.innerHTML = `<button data-bundle-payload='${BUNDLE_PAYLOAD}'>Combo</button>`;
      const { handlers, deps } = createHarness({
        cartController: { addBundleItems: vi.fn(() => true) },
      });

      const event = clickHandler(handlers.onDocumentClick, '[data-bundle-payload]');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.cartController.addBundleItems).toHaveBeenCalledWith([
        { id: 'sku-1' },
        { id: 'sku-2' },
      ]);
    });

    it('bundle click opens the offcanvas only when at least one item was added', () => {
      document.body.innerHTML = `<button data-bundle-payload='${BUNDLE_PAYLOAD}'>Combo</button>`;
      const added = createHarness({ cartController: { addBundleItems: vi.fn(() => true) } });
      clickHandler(added.handlers.onDocumentClick, '[data-bundle-payload]');
      expect(added.deps.openCartOffcanvas).toHaveBeenCalledTimes(1);

      const empty = createHarness({ cartController: { addBundleItems: vi.fn(() => false) } });
      clickHandler(empty.handlers.onDocumentClick, '[data-bundle-payload]');
      expect(empty.deps.openCartOffcanvas).not.toHaveBeenCalled();
    });

    it('bundle click with invalid JSON logs bundle_payload_parse_failed and swallows the error', () => {
      document.body.innerHTML = '<button data-bundle-payload="{not-json">Combo</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '[data-bundle-payload]');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.log).toHaveBeenCalledWith('warn', 'bundle_payload_parse_failed', {
        error: expect.any(Error),
      });
      expect(deps.cartController.addBundleItems).not.toHaveBeenCalled();
    });

    it('bundle click with an empty payload adds nothing and does not open the offcanvas', () => {
      document.body.innerHTML = '<button data-bundle-payload="[]">Combo</button>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '[data-bundle-payload]');

      expect(deps.cartController.addBundleItems).toHaveBeenCalledWith([]);
      expect(deps.openCartOffcanvas).not.toHaveBeenCalled();
    });

    it('bundle click never falls through to the add-to-cart branch', () => {
      document.body.innerHTML =
        '<button class="add-to-cart-btn" data-bundle-payload="{not-json" data-id="sku-1">Combo</button>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '.add-to-cart-btn');

      expect(deps.cartController.setQty).not.toHaveBeenCalled();
      expect(deps.getProductFromCard).not.toHaveBeenCalled();
      expect(deps.normalizeId).not.toHaveBeenCalled();
    });
  });

  describe('click delegation — add to cart', () => {
    const PRODUCT = { id: 'sku-1', name: 'Agua 500ml', price: 900, stock: true };

    function mountAddToCart(buttonAttrs = 'data-id="sku-1"', overrides = {}) {
      document.body.innerHTML = `<div class="producto"><button class="add-to-cart-btn" ${buttonAttrs}>+</button></div>`;
      return createHarness({ getProductFromCard: vi.fn(() => PRODUCT), ...overrides });
    }

    it('.add-to-cart-btn click prevents default and increments the qty resolved from the card product', () => {
      const { handlers, deps } = mountAddToCart('data-id="sku-1"', {
        cartController: { getQty: vi.fn(() => 2) },
      });

      const event = clickHandler(handlers.onDocumentClick, '.add-to-cart-btn');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.normalizeId).toHaveBeenCalledWith('sku-1');
      expect(deps.getProductFromCard).toHaveBeenCalledWith(document.querySelector('.producto'));
      expect(deps.cartController.setQty).toHaveBeenCalledWith('sku-1', 3, PRODUCT);
    });

    it('add-to-cart adds is-added and removes it after the 280ms feedback window', () => {
      vi.useFakeTimers();
      const { handlers } = mountAddToCart();
      const button = document.querySelector('.add-to-cart-btn');

      clickHandler(handlers.onDocumentClick, '.add-to-cart-btn');

      expect(button.classList.contains('is-added')).toBe(true);
      vi.advanceTimersByTime(279);
      expect(button.classList.contains('is-added')).toBe(true);
      vi.advanceTimersByTime(1);
      expect(button.classList.contains('is-added')).toBe(false);
    });

    it('add-to-cart ignores disabled buttons before doing anything', () => {
      const { handlers, deps } = mountAddToCart('data-id="sku-1" disabled');

      const event = clickHandler(handlers.onDocumentClick, '.add-to-cart-btn');

      // The disabled guard returns BEFORE preventDefault runs.
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(deps.getProductFromCard).not.toHaveBeenCalled();
      expect(deps.cartController.setQty).not.toHaveBeenCalled();
    });

    it('add-to-cart does nothing without an id or without a resolvable product', () => {
      document.body.innerHTML = `
        <div class="producto"><button class="add-to-cart-btn" id="no-id">+</button></div>
        <div class="producto"><button class="add-to-cart-btn" data-id="sku-2" id="no-product">+</button></div>`;
      const { handlers, deps } = createHarness({ getProductFromCard: vi.fn(() => null) });

      emit(handlers.onDocumentClick, document.getElementById('no-id'));
      emit(handlers.onDocumentClick, document.getElementById('no-product'));

      expect(deps.cartController.setQty).not.toHaveBeenCalled();
      expect(document.getElementById('no-id').classList.contains('is-added')).toBe(false);
      expect(document.getElementById('no-product').classList.contains('is-added')).toBe(false);
    });

    it('add-to-cart ignores products flagged out of stock', () => {
      const { handlers, deps } = mountAddToCart('data-id="sku-1"', {
        getProductFromCard: vi.fn(() => ({ ...PRODUCT, stock: false })),
      });

      clickHandler(handlers.onDocumentClick, '.add-to-cart-btn');

      expect(deps.cartController.setQty).not.toHaveBeenCalled();
      expect(document.querySelector('.add-to-cart-btn').classList.contains('is-added')).toBe(false);
    });

    it('add-to-cart tracks mobile_add_to_cart only on the mobile viewport', () => {
      const mobile = mountAddToCart('data-id="sku-1"', { isMobileViewport: vi.fn(() => true) });
      clickHandler(mobile.handlers.onDocumentClick, '.add-to-cart-btn');
      expect(mobile.deps.trackAnalyticsEvent).toHaveBeenCalledWith('mobile_add_to_cart', {
        id: 'sku-1',
        name: 'Agua 500ml',
        price: 900,
      });

      const desktop = mountAddToCart('data-id="sku-1"', { isMobileViewport: vi.fn(() => false) });
      clickHandler(desktop.handlers.onDocumentClick, '.add-to-cart-btn');
      expect(desktop.deps.trackAnalyticsEvent).not.toHaveBeenCalled();
    });
  });

  describe('click delegation — companion suggestions', () => {
    const SOURCE_PRODUCT = { id: 'sku-9', name: 'Del catálogo', price: 1000, stock: true };
    const CARD_PRODUCT = { id: 'sku-9', name: 'De la tarjeta', price: 1000, stock: true };

    it('[data-role="companion-add"] click prevents default and increments the qty', () => {
      document.body.innerHTML = '<button data-role="companion-add" data-id="sku-9">+</button>';
      const { handlers, deps } = createHarness({
        getProductByIdFromSource: vi.fn(() => SOURCE_PRODUCT),
      });

      const event = clickHandler(handlers.onDocumentClick, '[data-role="companion-add"]');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.getProductByIdFromSource).toHaveBeenCalledWith('sku-9');
      expect(deps.cartController.setQty).toHaveBeenCalledWith('sku-9', 1, SOURCE_PRODUCT);
    });

    it('companion add prefers the live catalog product over the card product', () => {
      document.body.innerHTML = '<button data-role="companion-add" data-id="sku-9">+</button>';
      const fromSource = createHarness({
        getProductByIdFromSource: vi.fn(() => SOURCE_PRODUCT),
        getProductCardById: vi.fn(() => ({ id: 'sku-9' })),
      });
      clickHandler(fromSource.handlers.onDocumentClick, '[data-role="companion-add"]');
      expect(fromSource.deps.getProductCardById).not.toHaveBeenCalled();
      expect(fromSource.deps.getProductFromCard).not.toHaveBeenCalled();
      expect(fromSource.deps.cartController.setQty).toHaveBeenCalledWith(
        'sku-9',
        1,
        SOURCE_PRODUCT
      );

      const fromCard = createHarness({
        getProductByIdFromSource: vi.fn(() => null),
        getProductCardById: vi.fn(() => ({ id: 'sku-9', node: true })),
        getProductFromCard: vi.fn(() => CARD_PRODUCT),
      });
      clickHandler(fromCard.handlers.onDocumentClick, '[data-role="companion-add"]');
      expect(fromCard.deps.getProductCardById).toHaveBeenCalledWith('sku-9');
      expect(fromCard.deps.getProductFromCard).toHaveBeenCalledWith({ id: 'sku-9', node: true });
      expect(fromCard.deps.cartController.setQty).toHaveBeenCalledWith('sku-9', 1, CARD_PRODUCT);
    });

    it('companion add does nothing without an id, without a product or when out of stock', () => {
      document.body.innerHTML = `
        <button data-role="companion-add" id="no-id">+</button>
        <button data-role="companion-add" data-id="sku-9" id="with-id">+</button>`;
      let sourceProduct = null;
      const { handlers, deps } = createHarness({
        getProductByIdFromSource: vi.fn(() => sourceProduct),
      });

      emit(handlers.onDocumentClick, document.getElementById('no-id'));
      emit(handlers.onDocumentClick, document.getElementById('with-id'));
      expect(deps.cartController.setQty).not.toHaveBeenCalled();

      sourceProduct = { ...SOURCE_PRODUCT, stock: false };
      emit(handlers.onDocumentClick, document.getElementById('with-id'));
      expect(deps.cartController.setQty).not.toHaveBeenCalled();
    });
  });

  describe('click delegation — quantity and remove', () => {
    it('.quantity-btn increase calls updateQtyByDelta with +1 for the resolved id', () => {
      document.body.innerHTML =
        '<button class="quantity-btn" data-id="sku-1" data-action="increase">+</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '.quantity-btn');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.cartController.updateQtyByDelta).toHaveBeenCalledWith('sku-1', 1);
    });

    it('.quantity-btn decrease calls updateQtyByDelta with -1 for the resolved id', () => {
      document.body.innerHTML =
        '<button class="quantity-btn" data-id="sku-1" data-action="decrease">-</button>';
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '.quantity-btn');

      expect(deps.cartController.updateQtyByDelta).toHaveBeenCalledWith('sku-1', -1);
    });

    it('quantity-btn with an unknown action or without an id does nothing', () => {
      document.body.innerHTML = `
        <button class="quantity-btn" data-id="sku-1" data-action="reset" id="unknown">r</button>
        <button class="quantity-btn" data-action="increase" id="no-id">+</button>`;
      const { handlers, deps } = createHarness();

      emit(handlers.onDocumentClick, document.getElementById('unknown'));
      emit(handlers.onDocumentClick, document.getElementById('no-id'));

      expect(deps.cartController.updateQtyByDelta).not.toHaveBeenCalled();
    });

    it('.remove-item click sets the item qty to zero', () => {
      document.body.innerHTML = '<button class="remove-item" data-id="sku-1">Quitar</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '.remove-item');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.cartController.setQty).toHaveBeenCalledWith('sku-1', 0);
    });
  });

  describe('click delegation — cart and order actions', () => {
    it('#empty-cart click asks for confirmation and clears the cart when accepted', () => {
      document.body.innerHTML = '<button id="empty-cart">Vaciar</button>';
      const confirm = vi.fn(() => true);
      vi.stubGlobal('confirm', confirm);
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '#empty-cart');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledWith('¿Quieres vaciar el carrito completo?');
      expect(deps.cartController.clearCart).toHaveBeenCalledTimes(1);
    });

    it('#empty-cart click keeps the cart when the confirmation is declined', () => {
      document.body.innerHTML = '<button id="empty-cart">Vaciar</button>';
      vi.stubGlobal(
        'confirm',
        vi.fn(() => false)
      );
      const { handlers, deps } = createHarness();

      clickHandler(handlers.onDocumentClick, '#empty-cart');

      expect(deps.cartController.clearCart).not.toHaveBeenCalled();
    });

    it('#submit-cart click prevents default and submits the current cart', () => {
      document.body.innerHTML = '<button id="submit-cart">Enviar</button>';
      const cart = [{ id: 'sku-1', quantity: 1 }];
      const { handlers, deps } = createHarness({
        cartController: { getCart: vi.fn(() => cart) },
      });

      const event = clickHandler(handlers.onDocumentClick, '#submit-cart');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.submitCartOrder).toHaveBeenCalledWith(cart);
    });

    it('#order-confirm-send click executes the pending order taken from the submit controller', () => {
      document.body.innerHTML = '<button id="order-confirm-send">Enviar pedido</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '#order-confirm-send');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.executeSendOrder).toHaveBeenCalledWith(PENDING_ORDER);
      expect(deps.orderSubmitController.takePendingOrder.mock.invocationCallOrder[0]).toBeLessThan(
        deps.executeSendOrder.mock.invocationCallOrder[0]
      );
    });

    it('#order-mark-sent click marks the order as sent', () => {
      document.body.innerHTML = '<button id="order-mark-sent">Ya lo pedí</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '#order-mark-sent');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.markOrderAsSent).toHaveBeenCalledTimes(1);
    });

    it('#order-toast-dismiss click hides the post-submit toast', () => {
      document.body.innerHTML = '<button id="order-toast-dismiss">Cerrar</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '#order-toast-dismiss');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.hidePostSubmitToast).toHaveBeenCalledTimes(1);
    });

    it('[data-order-confirm-close] click closes the confirmation dialog and drops the pending order', () => {
      document.body.innerHTML = '<button data-order-confirm-close>Cancelar</button>';
      const { handlers, deps } = createHarness();

      const event = clickHandler(handlers.onDocumentClick, '[data-order-confirm-close]');

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.closeOrderConfirmationDialog).toHaveBeenCalledTimes(1);
      expect(deps.orderSubmitController.takePendingOrder).toHaveBeenCalledTimes(1);
      expect(deps.closeOrderConfirmationDialog.mock.invocationCallOrder[0]).toBeLessThan(
        deps.orderSubmitController.takePendingOrder.mock.invocationCallOrder[0]
      );
    });
  });

  describe('document change delegate', () => {
    it('ignores change events whose target is not an Element', () => {
      const { handlers, deps } = createHarness();
      const event = { target: document.createTextNode('hola'), preventDefault: vi.fn() };

      handlers.onDocumentChange(event);

      expect(deps.catalogController.updateView).not.toHaveBeenCalled();
      expect(deps.savePreferredPayment).not.toHaveBeenCalled();
      expect(deps.saveSubstitutionPreference).not.toHaveBeenCalled();
    });

    it('#sort-options change resets the visible limit and re-renders the catalog', () => {
      document.body.innerHTML =
        '<select id="sort-options"><option value="original">Original</option></select>';
      const { handlers, deps } = createHarness();

      emit(handlers.onDocumentChange, document.getElementById('sort-options'));

      expect(deps.catalogController.resetVisibleLimit).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.updateView).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.resetVisibleLimit.mock.invocationCallOrder[0]).toBeLessThan(
        deps.catalogController.updateView.mock.invocationCallOrder[0]
      );
    });

    it('#filter-discount change resets the visible limit and re-renders the catalog', () => {
      document.body.innerHTML = '<input type="checkbox" id="filter-discount">';
      const { handlers, deps } = createHarness();

      emit(handlers.onDocumentChange, document.getElementById('filter-discount'));

      expect(deps.catalogController.resetVisibleLimit).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.updateView).toHaveBeenCalledTimes(1);
    });

    it('paymentMethod change clears the payment error text', () => {
      document.body.innerHTML = `
        <div id="payment-error">Elegí un medio de pago</div>
        <input type="radio" name="paymentMethod" value="efectivo">`;
      const { handlers } = createHarness();

      emit(handlers.onDocumentChange, document.querySelector('input[name="paymentMethod"]'));

      expect(document.getElementById('payment-error').textContent).toBe('');
    });

    it('paymentMethod change persists the selected payment when one is selected', () => {
      document.body.innerHTML = '<input type="radio" name="paymentMethod" value="efectivo">';
      let selectedPayment = '';
      const { handlers, deps } = createHarness({
        getSelectedPaymentValue: vi.fn(() => selectedPayment),
      });
      const input = document.querySelector('input[name="paymentMethod"]');

      emit(handlers.onDocumentChange, input);
      expect(deps.savePreferredPayment).not.toHaveBeenCalled();

      selectedPayment = 'transferencia';
      emit(handlers.onDocumentChange, input);
      expect(deps.savePreferredPayment).toHaveBeenCalledWith('transferencia');
    });

    it('paymentMethod change syncs the checkout state with the current cart totals', () => {
      document.body.innerHTML = '<input type="radio" name="paymentMethod" value="efectivo">';
      const cart = [{ id: 'sku-1', quantity: 1 }];
      const { handlers, deps } = createHarness({
        cartController: { getCart: vi.fn(() => cart) },
        getCartState: vi.fn(() => ({ totalAmount: 1500 })),
      });

      emit(handlers.onDocumentChange, document.querySelector('input[name="paymentMethod"]'));

      expect(deps.syncCheckoutState).toHaveBeenCalledWith(cart, 1500);
    });

    it('#substitution-preference select change persists the selected preference', () => {
      document.body.innerHTML = `
        <select id="substitution-preference">
          <option value="no-sustituir">No sustituir</option>
          <option value="sustituir">Sustituir</option>
        </select>`;
      const { handlers, deps } = createHarness();
      const select = document.getElementById('substitution-preference');
      select.value = 'sustituir';

      emit(handlers.onDocumentChange, select);

      expect(deps.saveSubstitutionPreference).toHaveBeenCalledWith('sustituir');
    });

    it('#substitution-preference change on a non-select element is ignored', () => {
      document.body.innerHTML = '<div id="substitution-preference"></div>';
      const { handlers, deps } = createHarness();

      emit(handlers.onDocumentChange, document.getElementById('substitution-preference'));

      expect(deps.saveSubstitutionPreference).not.toHaveBeenCalled();
    });

    it('a change on any other element does nothing', () => {
      document.body.innerHTML = '<div id="otro"></div>';
      const { handlers, deps } = createHarness();

      emit(handlers.onDocumentChange, document.getElementById('otro'));

      expect(deps.catalogController.resetVisibleLimit).not.toHaveBeenCalled();
      expect(deps.catalogController.updateView).not.toHaveBeenCalled();
      expect(deps.savePreferredPayment).not.toHaveBeenCalled();
      expect(deps.saveSubstitutionPreference).not.toHaveBeenCalled();
      expect(deps.syncCheckoutState).not.toHaveBeenCalled();
    });
  });

  describe('catalog controls', () => {
    it('keyword input applies the catalog filter through the injected debounce helper', () => {
      vi.useFakeTimers();
      const { handlers, deps } = createHarness();

      expect(deps.debounce).toHaveBeenCalledTimes(1);
      expect(deps.debounce.mock.calls[0][0]).toBeInstanceOf(Function);

      handlers.onKeywordInput();
      expect(deps.catalogController.updateView).not.toHaveBeenCalled();

      vi.advanceTimersByTime(120);
      expect(deps.catalogController.resetVisibleLimit).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.updateView).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.resetVisibleLimit.mock.invocationCallOrder[0]).toBeLessThan(
        deps.catalogController.updateView.mock.invocationCallOrder[0]
      );
    });

    it('rapid keyword inputs collapse into a single catalog update per debounce window', () => {
      vi.useFakeTimers();
      const { handlers, deps } = createHarness();

      handlers.onKeywordInput();
      handlers.onKeywordInput();
      handlers.onKeywordInput();

      vi.advanceTimersByTime(119);
      expect(deps.catalogController.updateView).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(deps.catalogController.resetVisibleLimit).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.updateView).toHaveBeenCalledTimes(1);
    });

    it('#catalog-load-more click loads the next catalog page', () => {
      const { handlers, deps } = createHarness();

      handlers.onLoadMoreClick();

      expect(deps.catalogController.loadMore).toHaveBeenCalledTimes(1);
    });

    it('#filter-clear click clears the keyword, resets the sort to original and unchecks the discount filter', () => {
      document.body.innerHTML = `
        <input id="filter-keyword" value="leche">
        <select id="sort-options">
          <option value="original">Original</option>
          <option value="price-asc">Precio</option>
        </select>
        <input type="checkbox" id="filter-discount" checked>`;
      const { handlers } = createHarness();
      document.getElementById('sort-options').value = 'price-asc';

      handlers.onClearClick();

      expect(document.getElementById('filter-keyword').value).toBe('');
      expect(document.getElementById('sort-options').value).toBe('original');
      expect(document.getElementById('filter-discount').checked).toBe(false);
    });

    it('#filter-clear click focuses the keyword input and re-renders the catalog', () => {
      document.body.innerHTML = '<input id="filter-keyword" value="leche">';
      const { handlers, deps } = createHarness();

      handlers.onClearClick();

      expect(document.activeElement).toBe(document.getElementById('filter-keyword'));
      expect(deps.catalogController.resetVisibleLimit).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.updateView).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.resetVisibleLimit.mock.invocationCallOrder[0]).toBeLessThan(
        deps.catalogController.updateView.mock.invocationCallOrder[0]
      );
    });

    it('#filter-clear click tolerates missing fields and still resets and re-renders', () => {
      const { handlers, deps } = createHarness();

      expect(() => handlers.onClearClick()).not.toThrow();
      expect(deps.catalogController.resetVisibleLimit).toHaveBeenCalledTimes(1);
      expect(deps.catalogController.updateView).toHaveBeenCalledTimes(1);
    });

    it('#catalog-empty-clear click triggers the main clear button', () => {
      document.body.innerHTML = '<button id="filter-clear">Limpiar</button>';
      const { handlers } = createHarness();
      const mainClear = document.getElementById('filter-clear');
      const listener = vi.fn();
      mainClear.addEventListener('click', listener);

      handlers.onEmptyClearClick();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('#catalog-empty-clear click is a no-op when the main clear button is absent', () => {
      const { handlers } = createHarness();

      expect(() => handlers.onEmptyClearClick()).not.toThrow();
    });
  });

  describe('cart offcanvas events', () => {
    it('show/shown offcanvas events mark the offcanvas open and sync the mobile cart shortcut', () => {
      const cart = [{ id: 'sku-1', quantity: 1 }];
      const { handlers, deps } = createHarness({
        cartController: { getCart: vi.fn(() => cart) },
        getCartState: vi.fn(() => ({ totalAmount: 2000 })),
      });

      handlers.handleCartOffcanvasOpen();

      expect(deps.setCartOffcanvasState).toHaveBeenCalledWith(true);
      expect(deps.syncMobileCartShortcut).toHaveBeenCalledWith(cart, 2000);
    });

    it('hide/hidden offcanvas events mark the offcanvas closed and sync the mobile cart shortcut', () => {
      const cart = [{ id: 'sku-1', quantity: 1 }];
      const { handlers, deps } = createHarness({
        cartController: { getCart: vi.fn(() => cart) },
        getCartState: vi.fn(() => ({ totalAmount: 2000 })),
      });

      handlers.handleCartOffcanvasClose();

      expect(deps.setCartOffcanvasState).toHaveBeenCalledWith(false);
      expect(deps.syncMobileCartShortcut).toHaveBeenCalledWith(cart, 2000);
    });

    it('the mobile shortcut sync renders from the current cart and its total amount', () => {
      const cart = [{ id: 'sku-9', quantity: 3 }];
      const { handlers, deps } = createHarness({
        cartController: { getCart: vi.fn(() => cart) },
        getCartState: vi.fn(() => ({ totalItems: 3, totalAmount: 4500 })),
      });

      handlers.handleCartOffcanvasOpen();

      expect(deps.getCartState).toHaveBeenCalledWith(cart);
      expect(deps.syncMobileCartShortcut).toHaveBeenCalledWith(cart, 4500);
    });
  });

  describe('cross-tab storage hookup', () => {
    it('the storage listener is attached to the injected window and delegates to cartController.adoptCrossTabEvent', () => {
      const { handlers, deps } = createHarness();

      handlers.attachStorageListener();

      expect(deps.windowRef.addEventListener).toHaveBeenCalledWith(
        'storage',
        deps.cartController.adoptCrossTabEvent
      );
    });

    it('storage events delivered on the injected window reach the cart controller', () => {
      const { handlers, deps } = createHarness();

      handlers.attachStorageListener();
      const [type, listener] = deps.windowRef.addEventListener.mock.calls[0];
      expect(type).toBe('storage');

      const event = { key: 'cart' };
      listener(event);

      expect(deps.cartController.adoptCrossTabEvent).toHaveBeenCalledWith(event);
    });

    it('the hookup is skipped when the injected window cannot register listeners', () => {
      const noApi = createHarness({ windowRef: {} });
      expect(() => noApi.handlers.attachStorageListener()).not.toThrow();
      expect(noApi.deps.cartController.adoptCrossTabEvent).not.toHaveBeenCalled();

      const missing = createHarness({ windowRef: undefined });
      expect(() => missing.handlers.attachStorageListener()).not.toThrow();
      expect(missing.deps.cartController.adoptCrossTabEvent).not.toHaveBeenCalled();
    });
  });
});
