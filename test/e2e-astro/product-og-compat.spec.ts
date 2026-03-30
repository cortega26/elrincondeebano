import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type ProductRecord = {
  sku?: string;
  id?: string;
  name: string;
  category: string;
  image_path?: string;
};

function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function generateStableSku(product: ProductRecord): string {
  const base = `${product.name}-${product.category}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(index);
    hash |= 0;
  }

  return `pid-${Math.abs(hash)}`;
}

function getProductSku(product: ProductRecord): string {
  return normalizeIdentity(product.sku) || normalizeIdentity(product.id) || generateStableSku(product);
}

const productCatalogPath = path.resolve(__dirname, '..', '..', 'data', 'product_data.json');
const productCatalog = JSON.parse(fs.readFileSync(productCatalogPath, 'utf8')) as {
  products?: ProductRecord[];
};
const webpBackedProduct = productCatalog.products?.find((product) =>
  /\.webp$/i.test(String(product.image_path || ''))
);

if (!webpBackedProduct) {
  throw new Error('Expected at least one product with a WebP image_path for OG compatibility coverage.');
}

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
