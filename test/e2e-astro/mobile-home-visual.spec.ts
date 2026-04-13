import { expect, test } from '@playwright/test';

async function waitForReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

test('mobile home top section stays compact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // Seed a last order so the repeat-order strip is visible (it hides itself via
  // CSS when the button is disabled, i.e. when no last order exists in storage).
  await page.goto('/', { waitUntil: 'commit' });
  await page.evaluate(() => {
    localStorage.setItem(
      'astro-poc-last-order',
      JSON.stringify({ items: [{ id: 'test-product', quantity: 1, price: 100 }] })
    );
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const trustCards = page.locator('.trust-strip__card');
  await expect(trustCards).toHaveCount(4);

  const entry = page.locator('.home-entry');
  await expect(entry).toBeVisible();
  await expect(page.locator('.home-entry__cta')).toBeVisible();
  await expect(page.locator('[data-repeat-last-order]')).toBeVisible();

  const entryBox = await entry.boundingBox();
  expect(entryBox?.height).toBeLessThan(460);

  await expect(page.locator('h2', { hasText: 'Categorías clave' })).toHaveCount(0);

  await page.locator('.home-entry__help').click();
  await expect(page.locator('#service-guide-dialog')).toBeVisible();
  await page.locator('[data-service-dialog-close]').first().click();
  await expect(page.locator('#service-guide-dialog')).not.toBeVisible();

  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});
