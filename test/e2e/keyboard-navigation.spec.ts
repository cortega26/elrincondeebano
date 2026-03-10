import { test, expect } from '@playwright/test';

test.describe('keyboard navigation smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ebano-service-guide-seen', 'true');
    });
  });

  test('dropdown and cart are operable with keyboard only', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'chromium-mobile') {
      testInfo.skip('Desktop viewport keeps dropdown toggles directly visible.');
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.enhancementsInit === '1');

    const skipLink = page.locator('.skip-link');
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();

    const firstToggle = page.locator('.nav-item.dropdown .dropdown-toggle').first();
    const firstMenu = page.locator('.nav-item.dropdown .dropdown-menu').first();
    await firstToggle.focus();
    await page.keyboard.press('Enter');
    await expect(firstMenu).toBeVisible();
    await expect(firstToggle).toHaveAttribute('aria-expanded', /true/i);

    await page.keyboard.press('Escape');
    await expect(firstMenu).not.toBeVisible();
    await expect(firstToggle).toHaveAttribute('aria-expanded', /false/i);
    await expect(firstToggle).toBeFocused();

    const cartIcon = page.locator('#cart-icon');
    await cartIcon.focus();
    await page.keyboard.press('Enter');
    const cartOffcanvas = page.locator('#cartOffcanvas');
    await expect(cartOffcanvas).toBeVisible();

    const closeButton = page.locator('#cartOffcanvas .btn-close');
    await closeButton.focus();
    await page.keyboard.press('Enter');
    await expect(cartOffcanvas).toBeHidden();
    await expect(cartIcon).toBeFocused();
  });

  test('checkout can be completed with keyboard only after adding a product', async ({ page }) => {
    await page.addInitScript(() => {
      window.__lastOpenedUrl = null;
      window.open = (url, target, features) => {
        window.__lastOpenedUrl = { url, target, features };
        return null;
      };
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.enhancementsInit === '1');

    const firstAddButton = page.locator('.add-to-cart-btn').first();
    await firstAddButton.focus();
    await page.waitForFunction(() => window.__APP_READY__ === true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#cart-count')).toHaveText('1');

    const cartIcon = page.locator('#cart-icon');
    await cartIcon.focus();
    await page.keyboard.press('Enter');

    const cartOffcanvas = page.locator('#cartOffcanvas');
    await expect(cartOffcanvas).toBeVisible();

    const firstPayment = page.locator('input[name="paymentMethod"]').first();
    await firstPayment.focus();
    await page.keyboard.press('Space');
    await expect(firstPayment).toBeChecked();

    const submitButton = page.locator('#submit-cart');
    await expect(submitButton).toBeEnabled();
    await submitButton.focus();
    await page.keyboard.press('Enter');

    await page.waitForFunction(() => Boolean(window.__lastOpenedUrl?.url));

    const checkoutRequest = await page.evaluate(() => window.__lastOpenedUrl);
    expect(checkoutRequest?.target).toBe('_blank');
    expect(checkoutRequest?.url).toContain('https://wa.me/');
    expect(decodeURIComponent(checkoutRequest?.url || '')).toContain('Método de pago: Efectivo');
  });
});
