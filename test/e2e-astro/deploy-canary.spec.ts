import { expect, test } from '@playwright/test';

test('deploy canary boots the shipped storefront bundle without browser errors', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready;
    }
  });

  await expect(page.locator('#product-container .producto').first()).toBeVisible();

  const firstAddToCartButton = page.locator('.add-to-cart-btn').first();
  await expect(firstAddToCartButton).toBeVisible();
  await firstAddToCartButton.click();

  await page.waitForFunction(() => {
    const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
    return Array.isArray(cart) && cart.some((item) => Number(item.quantity) >= 1);
  });

  expect(pageErrors, `page errors: ${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
});
