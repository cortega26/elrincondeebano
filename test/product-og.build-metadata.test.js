'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function normalizeIdentity(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function generateStableSku(product) {
  const base = `${product.name}-${product.category}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(index);
    hash |= 0;
  }
  return `pid-${Math.abs(hash)}`;
}

function getProductSku(product) {
  return normalizeIdentity(product.sku) || normalizeIdentity(product.id) || generateStableSku(product);
}

test('built product page falls back to a compatible category JPG og:image when catalog media is WebP', (t) => {
  const repoRoot = path.resolve(__dirname, '..');
  const distRoot = path.join(repoRoot, 'astro-poc', 'dist');
  if (!fs.existsSync(distRoot)) {
    t.skip('astro-poc/dist not found; run npm run build first');
    return;
  }

  const productCatalog = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'data', 'product_data.json'), 'utf8')
  );
  const webpBackedProduct = (productCatalog.products || []).find((product) =>
    /\.webp$/i.test(String(product?.image_path || ''))
  );

  assert.ok(webpBackedProduct, 'Expected at least one product with a WebP image_path');

  const sku = getProductSku(webpBackedProduct);
  const categorySlug = String(webpBackedProduct.category || '').trim().toLowerCase();
  const pagePath = path.join(distRoot, 'p', sku, 'index.html');

  assert.ok(fs.existsSync(pagePath), `Expected built product page for ${sku}`);

  const html = fs.readFileSync(pagePath, 'utf8');
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  assert.ok(imageMatch, 'Expected og:image meta tag in built product page');
  assert.match(
    imageMatch[1],
    new RegExp(
      `https://www\\.elrincondeebano\\.com/assets/images/og/categories/${categorySlug}[^"?#]*\\.jpg(?:\\?v=[^"]+)?$`,
      'i'
    ),
    'Expected product-page og:image to fall back to the compatible category JPG asset'
  );

  assert.ok(
    html.includes('<meta property="og:image:width" content="1200">'),
    'Expected og:image:width=1200'
  );
  assert.ok(
    html.includes('<meta property="og:image:height" content="1200">'),
    'Expected og:image:height=1200'
  );
});
