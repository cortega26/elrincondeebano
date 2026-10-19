/* eslint-disable max-lines-per-function -- suite-level describe block (plan 245) */
// Plan 245 — characterization of the cart mutation rules extracted from
// initStorefront() in storefront.js (getQty/setQty/addBundleItems, the
// cross-tab adoption, the empty-cart flow and the per-click delta helper).
//
// These rules were frozen as test names before the code moved (see the
// "characterize" commit) and are now pinned against createCartController with
// the real storefront-state primitives injected. The pre-extraction behavior
// is the contract: nothing here may improve, batch or reorder a rule.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCartController } from '../astro-poc/src/scripts/storefront/cart-controller.js';
import {
  adoptCartSnapshot,
  clampQty,
  createCartItemFromProduct,
  getCartState,
  normalizeId,
  parseNumber,
  sameCartProduct,
  sanitizeCart,
} from '../astro-poc/src/scripts/storefront/storefront-state.js';

const AGUA_PRODUCT = {
  id: 'sku-agua-500',
  name: 'Agua Mineral 500ml',
  category: 'aguas',
  price: 900,
  discount: 0,
  image: 'https://cdn.test/agua-mineral-500ml.avif',
  stock: true,
};

const AGUA_LEGACY_PRODUCT = { ...AGUA_PRODUCT, id: 'sku-legacy-agua' };

const OOS_PRODUCT = {
  id: 'sku-sin-stock',
  name: 'Producto Sin Stock',
  category: 'despensa',
  price: 1200,
  discount: 0,
  image: 'https://cdn.test/producto-sin-stock.avif',
  stock: false,
};

const PASTA_PRODUCT = {
  id: 'sku-pasta',
  name: 'Pasta 400g',
  category: 'despensa',
  price: 1500,
  discount: 0,
  image: 'https://cdn.test/pasta-400g.avif',
  stock: true,
};

function line(product, quantity) {
  return createCartItemFromProduct(product, quantity);
}

// Harness: in-memory fake storage (loadCart/saveCart round-trip like the real
// composition root) plus vi.fn side-effect deps. The state primitives are the
// real ones so the persist/sanitize/dedup rules are exercised, not re-stubbed.
function createHarness({ persisted = [], saveCartResult = true, deps: overrides = {} } = {}) {
  const storage = { persisted: persisted.map((item) => ({ ...item })) };
  const loadCart = vi.fn(() => storage.persisted.map((item) => ({ ...item })));
  const saveCart = vi.fn((nextCart) => {
    if (saveCartResult === false) {
      return false;
    }
    storage.persisted = nextCart.map((item) => ({ ...item }));
    return true;
  });

  const deps = {
    loadCart,
    saveCart,
    sanitizeCart,
    clampQty,
    getCartState,
    createCartItemFromProduct,
    sameCartProduct,
    normalizeId,
    parseNumber,
    getProductByIdFromSource: vi.fn(() => null),
    getProductFromCard: vi.fn(() => null),
    getProductCardById: vi.fn(() => null),
    adoptCartSnapshot,
    storefrontStorage: { loadJson: vi.fn(() => null) },
    storageKeys: { cart: 'cart' },
    trackProductSignal: vi.fn(),
    showCartSaveError: vi.fn(),
    isOrderJustSent: vi.fn(() => false),
    clearLastOrderSentAt: vi.fn(),
    log: vi.fn(),
    updateBadge: vi.fn(),
    renderCart: vi.fn(),
    renderCompanionSuggestions: vi.fn(),
    syncAllActionAreas: vi.fn(),
    companionRules: [],
    ...overrides,
  };

  const controller = createCartController(deps);
  return { controller, deps, storage, loadCart, saveCart };
}

function expectPersistBeforeRender(deps) {
  expect(deps.saveCart).toHaveBeenCalledTimes(1);
  expect(deps.renderCart).toHaveBeenCalledTimes(1);
  expect(deps.saveCart.mock.invocationCallOrder[0]).toBeLessThan(
    deps.renderCart.mock.invocationCallOrder[0]
  );
  // Render exactly what was persisted: the render payload is the sanitized
  // cart handed to saveCart, not the unnormalized working copy.
  expect(deps.renderCart.mock.calls[0][0]).toEqual(deps.saveCart.mock.calls[0][0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cart controller — pinned cart mutation rules (plan 245)', () => {
  describe('getQty', () => {
    it('re-reads the persisted cart (a removal from another tab reads as 0), not the in-memory snapshot', () => {
      const { controller, storage } = createHarness({ persisted: [line(AGUA_PRODUCT, 2)] });
      // Stale in-memory snapshot: another tab already changed storage.
      controller.setCart([line(AGUA_LEGACY_PRODUCT, 7)]);

      expect(controller.getQty('sku-agua-500')).toBe(2);

      storage.persisted = [];
      expect(controller.getQty('sku-agua-500')).toBe(0);
    });

    it('resolves a legacy/current SKU pair through the fallback product identity', () => {
      const { controller } = createHarness({ persisted: [line(AGUA_LEGACY_PRODUCT, 2)] });
      controller.setCart([]);

      expect(controller.getQty('sku-agua-500', AGUA_PRODUCT)).toBe(2);
      expect(controller.getQty('sku-unknown')).toBe(0);
      expect(controller.getQty('sku-unknown', PASTA_PRODUCT)).toBe(0);
    });
  });

  describe('setQty — rebase from persisted storage', () => {
    it('rebases each mutation on the persisted cart so items removed in another tab never come back', () => {
      const { controller, deps, storage } = createHarness({
        persisted: [line(AGUA_PRODUCT, 1), line(PASTA_PRODUCT, 1)],
      });
      // Stale snapshot still carries a third line that another tab deleted.
      controller.setCart([line(AGUA_PRODUCT, 1), line(PASTA_PRODUCT, 1), line(OOS_PRODUCT, 1)]);
      storage.persisted = [line(AGUA_PRODUCT, 1), line(PASTA_PRODUCT, 1)];

      controller.setQty('sku-agua-500', 2, AGUA_PRODUCT);

      expectPersistBeforeRender(deps);
      expect(deps.saveCart.mock.calls[0][0]).toEqual([
        line(AGUA_PRODUCT, 2),
        line(PASTA_PRODUCT, 1),
      ]);
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 2), line(PASTA_PRODUCT, 1)]);
      // wasStale: the targeted single-item render path is disabled.
      expect(deps.renderCart.mock.calls[0][1]).toMatchObject({ changedItemId: null });
    });

    it('a stale in-memory snapshot with no net change still re-renders without writing', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 1)] });
      controller.setCart([line(AGUA_PRODUCT, 1), line(PASTA_PRODUCT, 1)]);

      controller.setQty('sku-agua-500', 1, AGUA_PRODUCT);

      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.renderCart).toHaveBeenCalledTimes(1);
      expect(deps.renderCart.mock.calls[0][0]).toEqual([line(AGUA_PRODUCT, 1)]);
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 1)]);
    });

    it('a no-op mutation on a fresh snapshot neither persists nor re-renders', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 1)] });
      controller.setCart([line(AGUA_PRODUCT, 1)]);

      controller.setQty('sku-agua-500', 1, AGUA_PRODUCT);

      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(deps.updateBadge).not.toHaveBeenCalled();
    });
  });

  describe('setQty — stock guard', () => {
    it('blocks adding a line for an out-of-stock fallback product', () => {
      const { controller, deps } = createHarness({ persisted: [] });
      controller.setCart([]);

      controller.setQty('sku-sin-stock', 1, OOS_PRODUCT);

      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([]);
    });

    it('blocks increasing an existing line from an out-of-stock fallback product', () => {
      const { controller, deps } = createHarness({ persisted: [line(OOS_PRODUCT, 1)] });
      controller.setCart([line(OOS_PRODUCT, 1)]);

      controller.setQty('sku-sin-stock', 2, OOS_PRODUCT);

      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([line(OOS_PRODUCT, 1)]);
    });

    it('still allows decreasing or removing an out-of-stock product', () => {
      const { controller, deps } = createHarness({ persisted: [line(OOS_PRODUCT, 2)] });
      controller.setCart([line(OOS_PRODUCT, 2)]);

      controller.setQty('sku-sin-stock', 1, OOS_PRODUCT);
      expect(deps.saveCart).toHaveBeenLastCalledWith([line(OOS_PRODUCT, 1)]);

      controller.setQty('sku-sin-stock', 0, OOS_PRODUCT);
      expect(deps.saveCart).toHaveBeenLastCalledWith([]);
      expect(controller.getCart()).toEqual([]);
    });
  });

  describe('setQty — persistence and side effects', () => {
    it('persists the sanitized cart BEFORE rendering and renders exactly what was persisted', () => {
      // Corrupt persisted snapshot: two rows for the same SKU. The mutation
      // must persist the sanitized projection and render that, never the raw
      // working copy whose duplicates only saveCart() would remove.
      const { controller, deps } = createHarness({
        persisted: [line(AGUA_PRODUCT, 1), line(AGUA_PRODUCT, 1)],
      });
      controller.setCart([line(AGUA_PRODUCT, 1), line(AGUA_PRODUCT, 1)]);

      controller.setQty('sku-agua-500', 2, AGUA_PRODUCT);

      expectPersistBeforeRender(deps);
      expect(deps.saveCart.mock.calls[0][0]).toEqual([line(AGUA_PRODUCT, 2)]);
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 2)]);
    });

    it('removes the line when the clamped quantity reaches zero and clamps to the quantity range', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 1)] });
      controller.setCart([line(AGUA_PRODUCT, 1)]);

      controller.setQty('sku-agua-500', -5, AGUA_PRODUCT);
      expect(deps.saveCart).toHaveBeenLastCalledWith([]);

      controller.setQty('sku-agua-500', 1, AGUA_PRODUCT);
      controller.setQty('sku-agua-500', 999, AGUA_PRODUCT);
      expect(deps.saveCart).toHaveBeenLastCalledWith([line(AGUA_PRODUCT, 50)]);
    });

    it('a quota failure logs cart_save_failed, surfaces the save error and leaves state untouched', () => {
      const { controller, deps, storage, saveCart } = createHarness({
        persisted: [line(AGUA_PRODUCT, 1)],
        saveCartResult: false,
      });
      controller.setCart([line(AGUA_PRODUCT, 1)]);

      controller.setQty('sku-agua-500', 2, AGUA_PRODUCT);

      expect(saveCart).toHaveBeenCalledWith([line(AGUA_PRODUCT, 2)]);
      expect(deps.log).toHaveBeenCalledWith('warn', 'cart_save_failed', {
        reason: 'localStorage_quota',
      });
      expect(deps.showCartSaveError).toHaveBeenCalledTimes(1);
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(deps.updateBadge).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 1)]);
      expect(storage.persisted).toEqual([line(AGUA_PRODUCT, 1)]);
    });

    it('emits the addedCount telemetry signal only for quantity increases', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 2)] });
      controller.setCart([line(AGUA_PRODUCT, 2)]);

      controller.setQty('sku-agua-500', 3, AGUA_PRODUCT);
      expect(deps.trackProductSignal).toHaveBeenCalledTimes(1);
      expect(deps.trackProductSignal).toHaveBeenCalledWith('sku-agua-500', 'addedCount');

      controller.setQty('sku-agua-500', 2, AGUA_PRODUCT);
      controller.setQty('sku-agua-500', 0, AGUA_PRODUCT);
      expect(deps.trackProductSignal).toHaveBeenCalledTimes(1);
    });

    it('clears the just-sent marker only when the resulting cart is non-empty and an order was just sent', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 1)] });
      deps.isOrderJustSent.mockReturnValue(true);
      controller.setCart([line(AGUA_PRODUCT, 1)]);

      controller.setQty('sku-agua-500', 2, AGUA_PRODUCT);
      expect(deps.clearLastOrderSentAt).toHaveBeenCalledTimes(1);

      deps.clearLastOrderSentAt.mockClear();
      controller.setQty('sku-agua-500', 0, AGUA_PRODUCT);
      expect(controller.getCart()).toEqual([]);
      expect(deps.clearLastOrderSentAt).not.toHaveBeenCalled();
    });
  });

  describe('addBundleItems', () => {
    it('flushes once per bundle: one save, badge, render and sync (plan 269 replaced the per-item renders)', () => {
      const { controller, deps } = createHarness({ persisted: [] });
      deps.getProductByIdFromSource.mockImplementation((id) =>
        id === AGUA_PRODUCT.id ? AGUA_PRODUCT : null
      );

      const added = controller.addBundleItems([
        { id: AGUA_PRODUCT.id, name: AGUA_PRODUCT.name },
        {
          id: PASTA_PRODUCT.id,
          name: PASTA_PRODUCT.name,
          category: PASTA_PRODUCT.category,
          price: PASTA_PRODUCT.price,
          image: PASTA_PRODUCT.image,
        },
      ]);

      expect(added).toBe(true);
      expectPersistBeforeRender(deps);
      expect(deps.updateBadge).toHaveBeenCalledTimes(1);
      expect(deps.renderCompanionSuggestions).toHaveBeenCalledTimes(1);
      expect(deps.syncAllActionAreas).toHaveBeenCalledTimes(1);
      // Batched flush renders/syncs the full cart, not a per-item scope.
      expect(deps.renderCart.mock.calls[0][1]).toMatchObject({ changedItemId: null });
      expect(deps.syncAllActionAreas.mock.calls[0][1]).toBe(null);
      expect(deps.saveCart.mock.calls[0][0]).toEqual([
        line(AGUA_PRODUCT, 1),
        line(PASTA_PRODUCT, 1),
      ]);
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 1), line(PASTA_PRODUCT, 1)]);
    });

    it('accumulates a duplicated id inside the bundle on the working copy (merge max-wins), single persist', () => {
      const { controller, deps } = createHarness({ persisted: [] });
      deps.getProductByIdFromSource.mockImplementation((id) =>
        id === AGUA_PRODUCT.id ? AGUA_PRODUCT : null
      );

      const added = controller.addBundleItems([
        { id: AGUA_PRODUCT.id },
        { id: AGUA_PRODUCT.id },
      ]);

      expect(added).toBe(true);
      expect(deps.saveCart).toHaveBeenCalledTimes(1);
      expect(deps.saveCart.mock.calls[0][0]).toEqual([line(AGUA_PRODUCT, 2)]);
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 2)]);
      // Per-item telemetry: two increases, one persist.
      expect(deps.trackProductSignal).toHaveBeenCalledTimes(2);
    });

    it('applies the per-item stock guard and the quantity cap without aborting the rest of the bundle', () => {
      const cappedLine = line(PASTA_PRODUCT, 50);
      const { controller, deps } = createHarness({ persisted: [cappedLine] });
      controller.setCart([cappedLine]);
      deps.getProductByIdFromSource.mockImplementation((id) => {
        if (id === OOS_PRODUCT.id) return OOS_PRODUCT;
        if (id === PASTA_PRODUCT.id) return PASTA_PRODUCT;
        return null;
      });

      const added = controller.addBundleItems([{ id: OOS_PRODUCT.id }, { id: PASTA_PRODUCT.id }]);

      expect(added).toBe(true);
      // The out-of-stock line never lands and the capped line stays at 50, so
      // nothing changed: no flush at all.
      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([cappedLine]);

      // Adding a fresh in-stock item in the same bundle does flush once.
      deps.getProductByIdFromSource.mockImplementation((id) => {
        if (id === OOS_PRODUCT.id) return OOS_PRODUCT;
        if (id === AGUA_PRODUCT.id) return AGUA_PRODUCT;
        return null;
      });
      expect(
        controller.addBundleItems([{ id: OOS_PRODUCT.id }, { id: AGUA_PRODUCT.id }])
      ).toBe(true);
      expect(deps.saveCart).toHaveBeenCalledTimes(1);
      expect(controller.getCart()).toEqual([cappedLine, line(AGUA_PRODUCT, 1)]);
      expect(deps.trackProductSignal).toHaveBeenCalledTimes(1);
      expect(deps.trackProductSignal).toHaveBeenCalledWith(AGUA_PRODUCT.id, 'addedCount');
    });

    it('a save failure in the batch surfaces the error, touches nothing and never renders', () => {
      const { controller, deps, storage } = createHarness({
        persisted: [line(AGUA_PRODUCT, 1)],
        saveCartResult: false,
      });
      controller.setCart([line(AGUA_PRODUCT, 1)]);
      deps.getProductByIdFromSource.mockImplementation((id) =>
        id === AGUA_PRODUCT.id ? AGUA_PRODUCT : null
      );

      expect(controller.addBundleItems([{ id: AGUA_PRODUCT.id }, { id: PASTA_PRODUCT.id }])).toBe(
        true
      );

      expect(deps.saveCart).toHaveBeenCalledTimes(1);
      expect(deps.log).toHaveBeenCalledWith('warn', 'cart_save_failed', {
        reason: 'localStorage_quota',
      });
      expect(deps.showCartSaveError).toHaveBeenCalledTimes(1);
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(deps.updateBadge).not.toHaveBeenCalled();
      expect(deps.syncAllActionAreas).not.toHaveBeenCalled();
      expect(deps.trackProductSignal).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 1)]);
      expect(storage.persisted).toEqual([line(AGUA_PRODUCT, 1)]);
    });

    it('clears the just-sent marker once when the batched cart ends non-empty', () => {
      const { controller, deps } = createHarness({ persisted: [] });
      deps.isOrderJustSent.mockReturnValue(true);
      deps.getProductByIdFromSource.mockImplementation((id) =>
        id === AGUA_PRODUCT.id ? AGUA_PRODUCT : null
      );

      controller.addBundleItems([{ id: AGUA_PRODUCT.id }, { id: PASTA_PRODUCT.id }]);

      expect(deps.clearLastOrderSentAt).toHaveBeenCalledTimes(1);
    });

    it('returns false and touches nothing for empty or malformed payloads', () => {
      const { controller, deps } = createHarness({ persisted: [] });

      expect(controller.addBundleItems([])).toBe(false);
      expect(controller.addBundleItems(null)).toBe(false);
      expect(controller.addBundleItems('nope')).toBe(false);

      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(deps.renderCart).not.toHaveBeenCalled();
    });

    it('skips entries without an id and returns false when nothing was added', () => {
      const { controller, deps } = createHarness({ persisted: [] });

      expect(controller.addBundleItems([{ name: 'sin id' }, { id: '   ' }])).toBe(false);
      expect(deps.saveCart).not.toHaveBeenCalled();

      deps.getProductByIdFromSource.mockImplementation((id) =>
        id === AGUA_PRODUCT.id ? AGUA_PRODUCT : null
      );
      expect(
        controller.addBundleItems([
          { id: AGUA_PRODUCT.id, name: AGUA_PRODUCT.name },
          { name: 'sin id' },
        ])
      ).toBe(true);
      expect(deps.saveCart).toHaveBeenCalledTimes(1);
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 1)]);
    });

    it('prefers the live catalog product, then the card product, then the payload fallback', () => {
      const cardElement = {};
      const cardProduct = { ...PASTA_PRODUCT, name: 'Pasta desde tarjeta' };
      const { controller, deps } = createHarness({ persisted: [] });
      deps.getProductByIdFromSource.mockImplementation((id) =>
        id === AGUA_PRODUCT.id ? AGUA_PRODUCT : null
      );
      deps.getProductCardById.mockImplementation((id) =>
        id === PASTA_PRODUCT.id ? cardElement : null
      );
      deps.getProductFromCard.mockImplementation((card) =>
        card === cardElement ? cardProduct : null
      );

      controller.addBundleItems([
        { id: AGUA_PRODUCT.id },
        { id: PASTA_PRODUCT.id },
        { id: 'sku-from-payload', name: 'Desde payload', price: 700, category: 'extras' },
      ]);

      const saved = deps.saveCart.mock.calls.at(-1)[0];
      expect(saved).toEqual([
        expect.objectContaining({ id: AGUA_PRODUCT.id, name: AGUA_PRODUCT.name }),
        expect.objectContaining({ id: PASTA_PRODUCT.id, name: 'Pasta desde tarjeta' }),
        expect.objectContaining({
          id: 'sku-from-payload',
          name: 'Desde payload',
          price: 700,
          category: 'extras',
          quantity: 1,
        }),
      ]);
    });
  });

  describe('clearCart and cross-tab adoption', () => {
    it('clearCart persists an empty cart first, then syncs badge, render and action areas', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 2)] });
      controller.setCart([line(AGUA_PRODUCT, 2)]);

      expect(controller.clearCart()).toBe(true);

      expectPersistBeforeRender(deps);
      expect(deps.saveCart).toHaveBeenCalledWith([]);
      expect(deps.updateBadge).toHaveBeenCalledWith([], { animate: true });
      expect(deps.renderCart).toHaveBeenCalledWith([], { animateTotal: true });
      expect(deps.syncAllActionAreas).toHaveBeenCalledWith([]);
      expect(controller.getCart()).toEqual([]);
    });

    it('clearCart surfaces the save error and keeps the cart when the write fails', () => {
      const { controller, deps, storage } = createHarness({
        persisted: [line(AGUA_PRODUCT, 2)],
        saveCartResult: false,
      });
      controller.setCart([line(AGUA_PRODUCT, 2)]);

      expect(controller.clearCart()).toBe(false);

      expect(deps.showCartSaveError).toHaveBeenCalledTimes(1);
      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 2)]);
      expect(storage.persisted).toEqual([line(AGUA_PRODUCT, 2)]);
    });

    it('cross-tab events adopt the latest persisted canonical snapshot and re-render only on change', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 1)] });
      vi.stubGlobal('localStorage', { getItem: vi.fn(() => '["present"]') });

      // No change: same snapshot as the in-memory cart.
      deps.storefrontStorage.loadJson.mockReturnValue([line(AGUA_PRODUCT, 1)]);
      controller.adoptCrossTabEvent({ key: 'cart' });
      expect(deps.renderCart).not.toHaveBeenCalled();

      // Newer snapshot from another tab: adopt and re-render every surface.
      deps.storefrontStorage.loadJson.mockReturnValue([line(AGUA_PRODUCT, 3)]);
      controller.adoptCrossTabEvent({ key: 'cart' });
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 3)]);
      expect(deps.updateBadge).toHaveBeenCalledWith([line(AGUA_PRODUCT, 3)], {});
      expect(deps.renderCart).toHaveBeenCalledWith([line(AGUA_PRODUCT, 3)], {});
      expect(deps.renderCompanionSuggestions).toHaveBeenCalledWith([line(AGUA_PRODUCT, 3)], []);
      expect(deps.syncAllActionAreas).toHaveBeenCalledWith([line(AGUA_PRODUCT, 3)]);
      expect(deps.saveCart).not.toHaveBeenCalled();

      // A cleared canonical key (null raw) adopts the empty snapshot.
      vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
      controller.adoptCrossTabEvent({ key: 'cart' });
      expect(controller.getCart()).toEqual([]);
      expect(deps.saveCart).not.toHaveBeenCalled();
    });

    it('cross-tab events ignore foreign keys and foreign storage areas and never write back', () => {
      const { controller, deps } = createHarness({ persisted: [line(AGUA_PRODUCT, 1)] });
      const fakeArea = { name: 'other-tab' };
      vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });

      controller.adoptCrossTabEvent(null);
      controller.adoptCrossTabEvent({ key: 'favorites' });
      controller.adoptCrossTabEvent({ key: 'cart', storageArea: fakeArea });
      controller.adoptCrossTabEvent({ storageArea: fakeArea });

      expect(deps.renderCart).not.toHaveBeenCalled();
      expect(deps.saveCart).not.toHaveBeenCalled();
      expect(controller.getCart()).toEqual([line(AGUA_PRODUCT, 1)]);
    });
  });
});
