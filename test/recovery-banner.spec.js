/** @vitest-environment jsdom */
/* eslint-disable max-lines-per-function -- suite-level describe block (plan 143) */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createRecoveryBannerController } from '../astro-poc/src/scripts/storefront/recovery-banner.js';

describe('recovery-banner cart-recovery TTL (plan 143)', () => {
  let storageData;
  let storefrontStorage;
  let bannerEl;

  beforeEach(() => {
    storageData = new Map();
    storefrontStorage = {
      loadJson: (key, def) => (storageData.has(key) ? storageData.get(key) : def),
      saveJson: (key, val) => storageData.set(key, val),
    };
    document.body.innerHTML = '<div id="cart-recovery" class="is-hidden" aria-hidden="true"></div>';
    bannerEl = document.getElementById('cart-recovery');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    storageData.clear();
  });

  function makeController(overrides = {}) {
    return createRecoveryBannerController({
      storefrontStorage,
      loadCart: () => [],
      saveCart: () => true,
      updateBadge: () => {},
      renderCart: () => {},
      syncAllActionAreas: () => {},
      showCartSaveError: () => {},
      hidePostSubmitToast: () => {},
      isOrderJustSent: () => false,
      ...overrides,
    });
  }

  it('shows banner when not dismissed', () => {
    const controller = makeController();
    const cart = [{ id: 'p1', price: 1000, quantity: 1 }];
    expect(controller.shouldShowRecoveryBanner(cart)).toBe(true);
    controller.showRecoveryBanner();
    expect(bannerEl.classList.contains('is-hidden')).toBe(false);
    expect(bannerEl.getAttribute('aria-hidden')).toBe('false');
  });

  it('hides banner when dismissed under 1h ago', () => {
    // dismissed 30 min ago
    const dismissedAt = Date.now() - 30 * 60 * 1000;
    storageData.set('recoveryDismissed', dismissedAt);
    const controller = makeController();
    const cart = [{ id: 'p1', price: 1000, quantity: 1 }];
    expect(controller.shouldShowRecoveryBanner(cart)).toBe(false);
    // show then hide via logic
    controller.showRecoveryBanner();
    expect(bannerEl.classList.contains('is-hidden')).toBe(false);
    controller.hideRecoveryBanner();
    expect(bannerEl.classList.contains('is-hidden')).toBe(true);
    expect(bannerEl.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows banner again when dismissed over 1h ago (TTL expiry)', () => {
    const dismissedAt = Date.now() - 70 * 60 * 1000; // 70 min ago
    storageData.set('recoveryDismissed', dismissedAt);
    const controller = makeController();
    const cart = [{ id: 'p1', price: 1000, quantity: 1 }];
    expect(controller.shouldShowRecoveryBanner(cart)).toBe(true);
  });

  it('dismiss action persists timestamp and hides banner', () => {
    const controller = makeController();
    const cart = [{ id: 'p1', price: 1000, quantity: 1 }];
    expect(controller.shouldShowRecoveryBanner(cart)).toBe(true);
    const before = Date.now();
    controller.dismissRecoveryBanner();
    const saved = storageData.get('recoveryDismissed');
    expect(saved).toBeGreaterThanOrEqual(before);
    expect(saved).toBeLessThanOrEqual(Date.now());
    expect(bannerEl.classList.contains('is-hidden')).toBe(true);
    expect(controller.shouldShowRecoveryBanner(cart)).toBe(false);
    // after TTL, should show again
    vi.setSystemTime(new Date(Date.now() + 3600000 + 1000));
    expect(controller.shouldShowRecoveryBanner(cart)).toBe(true);
  });
});
