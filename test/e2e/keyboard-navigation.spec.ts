import { test, expect } from '@playwright/test';

test.describe('keyboard navigation smoke', () => {
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
});
