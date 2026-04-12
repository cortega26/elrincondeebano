import { expect, test } from '@playwright/test';

import { getProductSku } from '../../astro-poc/src/lib/product-identity.ts';
import productCatalogHelpers from '../helpers/product-catalog.js';

const { getWebpBackedProduct } = productCatalogHelpers;
const webpBackedProduct = getWebpBackedProduct();
const webpBackedSku = getProductSku(webpBackedProduct);
const expectedCategorySlug = String(webpBackedProduct.category || '').trim().toLowerCase();

test('product detail page serves a compatible social-preview asset', async ({ page, request }) => {
  await page.goto(`/p/${webpBackedSku}/`, { waitUntil: 'networkidle' });

  await expect(page.locator('h1')).toHaveText(webpBackedProduct.name);
  const ogImage = page.locator('meta[property="og:image"]');
  await expect(ogImage).toHaveAttribute(
    'content',
    new RegExp(
      `https://www\\.elrincondeebano\\.com/assets/images/og/categories/${expectedCategorySlug}[^"?#]*\\.jpg(?:\\?v=[^"]+)?$`,
      'i'
    )
  );

  const ogImageUrl = await ogImage.getAttribute('content');
  expect(ogImageUrl, 'product page should expose an og:image').toBeTruthy();

  const imageResponse = await request.get(ogImageUrl!);
  expect(imageResponse.ok(), 'og:image should resolve successfully').toBeTruthy();
  expect(imageResponse.headers()['content-type']).toMatch(/^image\/jpeg\b/i);
});
