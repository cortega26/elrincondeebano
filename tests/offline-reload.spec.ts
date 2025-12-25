import { test, expect, type Page } from '@playwright/test';

async function ensureServiceWorkerControl(page: Page) {
  const attempts = 3;
  for (let i = 0; i < attempts; i += 1) {
    await page.waitForLoadState('domcontentloaded');
    try {
      await page.waitForFunction(() => 'serviceWorker' in navigator);
      await page.evaluate(() => navigator.serviceWorker.ready);
      const hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
      if (hasController) {
        return;
      }
      await page.reload({ waitUntil: 'domcontentloaded' });
    } catch (error) {
      const message = String(error);
      if (i === attempts - 1 || !message.includes('Execution context was destroyed')) {
        throw error;
      }
    }
  }
}

test.describe('offline reload', () => {
  test('serves cached content and shows offline indicator', async ({ page, context }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ebano-sw-enable-local', 'true');
      localStorage.removeItem('ebano-sw-disabled');
    });

    await page.goto('/?sw=on', { waitUntil: 'domcontentloaded' });
    await ensureServiceWorkerControl(page);
    await page.waitForFunction(
      () => document.querySelectorAll('#product-container .producto').length > 0
    );

    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelectorAll('#product-container .producto').length > 0
    );

    const offlineIndicator = page.locator('#offline-indicator');
    await expect(offlineIndicator).toBeVisible();
  });
});
