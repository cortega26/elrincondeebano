/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createRecoveryBannerController } from '../astro-poc/src/scripts/storefront/recovery-banner.js';

// This module keeps order-completion and service-onboarding responsibilities;
// the disruptive cart recovery banner was deliberately removed site-wide.
describe('storefront order-completion controller', () => {
  let storageData;
  let storefrontStorage;

  beforeEach(() => {
    storageData = new Map();
    storefrontStorage = {
      loadJson: vi.fn((key, fallback) =>
        storageData.has(key) ? storageData.get(key) : fallback
      ),
      saveJson: vi.fn((key, value) => {
        storageData.set(key, value);
        return true;
      }),
    };
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function makeController(overrides = {}) {
    const dependencies = {
      storefrontStorage,
      loadCart: vi.fn(() => []),
      saveCart: vi.fn(() => true),
      updateBadge: vi.fn(),
      renderCart: vi.fn(),
      syncAllActionAreas: vi.fn(),
      showCartSaveError: vi.fn(),
      hidePostSubmitToast: vi.fn(),
      ...overrides,
    };
    return { controller: createRecoveryBannerController(dependencies), dependencies };
  }

  it('does not expose banner, dismissal or TTL behavior', () => {
    const { controller } = makeController();
    expect(Object.keys(controller).sort()).toEqual(['initServiceOnboarding', 'markOrderAsSent']);
    expect(document.querySelector('#cart-recovery')).toBeNull();
    expect(storefrontStorage.saveJson).not.toHaveBeenCalled();
  });

  it('keeps the saved cart intact if no completed order is present', () => {
    const { controller, dependencies } = makeController();
    controller.markOrderAsSent();
    expect(dependencies.saveCart).not.toHaveBeenCalled();
    expect(dependencies.updateBadge).not.toHaveBeenCalled();
  });

  it('clears the cart and updates the badge only after explicit sent confirmation', () => {
    const { controller, dependencies } = makeController({
      loadCart: vi.fn(() => [{ id: 'p1', quantity: 1, price: 1000 }]),
    });
    controller.markOrderAsSent();

    expect(dependencies.saveCart).toHaveBeenCalledWith([]);
    expect(storageData.get('orderLastSentAt')).toEqual(expect.any(Number));
    expect(dependencies.updateBadge).toHaveBeenCalledWith([], { animate: true });
    expect(dependencies.renderCart).toHaveBeenCalledWith([]);
    expect(dependencies.syncAllActionAreas).toHaveBeenCalledWith([]);
    expect(dependencies.hidePostSubmitToast).toHaveBeenCalledTimes(1);
    expect(storageData.has('recoveryDismissed')).toBe(false);
  });

  it('does not clear the badge when persisting cart changes fails', () => {
    const { controller, dependencies } = makeController({
      loadCart: vi.fn(() => [{ id: 'p1', quantity: 1, price: 1000 }]),
      saveCart: vi.fn(() => false),
    });
    controller.markOrderAsSent();

    expect(dependencies.showCartSaveError).toHaveBeenCalledOnce();
    expect(dependencies.updateBadge).not.toHaveBeenCalled();
    expect(dependencies.renderCart).not.toHaveBeenCalled();
    expect(storageData.has('orderLastSentAt')).toBe(false);
  });

  it('still opens and closes the optional service onboarding dialog', () => {
    document.body.innerHTML = `
      <button data-service-dialog-trigger>Cómo funciona</button>
      <dialog id="service-guide-dialog" aria-hidden="true">
        <button data-service-dialog-close>Cerrar</button>
      </dialog>
    `;
    const { controller } = makeController();
    controller.initServiceOnboarding();

    document.querySelector('[data-service-dialog-trigger]').click();
    const dialog = document.getElementById('service-guide-dialog');
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-hidden')).toBe('false');

    document.querySelector('[data-service-dialog-close]').click();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
  });
});
