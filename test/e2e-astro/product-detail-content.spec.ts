import { expect, test } from '@playwright/test';

test('product page presents readable detail and retains a working order action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/p/p-00770236729335/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);

  await expect(page.locator('.product-detail__eyebrow')).toHaveText('Despensa');
  await expect(page.locator('.product-detail__summary')).toContainText('ensaladas');
  await expect(page.locator('.product-detail__buy-panel .precio')).toHaveText('$2.500');
  await expect(page.locator('.product-detail__checkout-note')).toContainText('WhatsApp');
  await expect(page.locator('.product-detail__information-title')).toHaveText('Información del producto');
  await expect(page.locator('.product-detail__media img')).toBeVisible();

  await page.locator('.product-detail__add').click();
  await expect(page.locator('#cart-count')).toHaveText('1');
});

test('product detail remains accessible on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/p/p-00770236729335/', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: "Van Camp's • Atún Lomitos en Agua" })).toBeVisible();
  await expect(page.locator('.product-detail__media img')).toBeVisible();
  await expect(page.locator('.product-detail__links a').first()).toHaveAttribute('href', '/despensa/');
  await expect(page.locator('.product-detail__buy-panel')).toBeVisible();
});

for (const item of [
  { sku: 'p-00770236729335', label: 'atún Van Camp\'s' },
  { sku: '01a131ed-153a-721e-94fc-2eb8f6b9a44c', label: 'papel Confort' },
]) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`image surfaces stay solid white for ${item.label} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/p/${item.sku}/`, { waitUntil: 'networkidle' });

      const media = page.locator('.product-detail__media');
      await expect(media.locator('img')).toBeVisible();
      for (const selector of ['.product-detail__media', '.product-detail__media picture', '.product-detail__media img']) {
        const style = await page.locator(selector).evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage,
          };
        });
        expect(style.backgroundColor, `${selector} at ${viewport.width}px`).toBe('rgb(255, 255, 255)');
        expect(style.backgroundImage, `${selector} at ${viewport.width}px`).toBe('none');
      }
    });
  }
}
