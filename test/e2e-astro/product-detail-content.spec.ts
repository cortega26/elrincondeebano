import { expect, test } from '@playwright/test';
import { getProductSku } from '../../astro-poc/src/lib/product-identity.ts';
import productCatalogHelpers from '../helpers/product-catalog.js';

const { getInStockProductsWithDescription } = productCatalogHelpers;
// Plan 285: the product detail spec is driven by the live catalog, so a price
// or copy edit does not turn the e2e job red.
const [primary, secondary] = getInStockProductsWithDescription(2);
const primarySku = getProductSku(primary);
const primaryEffectivePrice = Math.max(
  Number(primary.price || 0) - Number(primary.discount || 0),
  0
);
const primaryPriceText = `$${primaryEffectivePrice.toLocaleString('es-CL')}`;
const primaryCategorySlug = String(primary.category || '')
  .trim()
  .toLowerCase();

test('product page presents readable detail and retains a working order action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/p/${primarySku}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);

  await expect(page.locator('.product-detail__eyebrow')).toHaveText(/\S/);
  await expect(page.locator('.product-detail__summary')).toContainText(primary.description);
  await expect(page.locator('.product-detail__buy-panel .precio')).toHaveText(primaryPriceText);
  await expect(page.locator('.product-detail__checkout-note')).toContainText('WhatsApp');
  await expect(page.locator('.product-detail__information-title')).toHaveText(
    'Información del producto'
  );
  await expect(page.locator('.product-detail__media img')).toBeVisible();

  await page.locator('.product-detail__add').click();
  await expect(page.locator('#cart-count')).toHaveText('1');
});

test('product detail remains accessible on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/p/${primarySku}/`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: primary.name })).toBeVisible();
  await expect(page.locator('.product-detail__media img')).toBeVisible();
  await expect(page.locator('.product-detail__links a').first()).toHaveAttribute(
    'href',
    `/${primaryCategorySlug}/`
  );
  await expect(page.locator('.product-detail__buy-panel')).toBeVisible();
});

for (const item of [primary, secondary].map((product) => ({
  sku: getProductSku(product),
  label: product.name,
}))) {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`image surfaces stay solid white for ${item.label} at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/p/${item.sku}/`, { waitUntil: 'networkidle' });

      const media = page.locator('.product-detail__media');
      await expect(media.locator('img')).toBeVisible();
      for (const selector of [
        '.product-detail__media',
        '.product-detail__media picture',
        '.product-detail__media img',
      ]) {
        const style = await page.locator(selector).evaluate((element) => {
          const computed = getComputedStyle(element);
          return {
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage,
          };
        });
        expect(style.backgroundColor, `${selector} at ${viewport.width}px`).toBe(
          'rgb(255, 255, 255)'
        );
        expect(style.backgroundImage, `${selector} at ${viewport.width}px`).toBe('none');
      }
    });
  }
}
