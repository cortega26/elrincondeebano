'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { distRoot, resolveDistPath } = require('./helpers/repo-files.js');
const { getWebpBackedProduct } = require('./helpers/product-catalog.js');

test('built product page falls back to a compatible category JPG og:image when catalog media is WebP', async (t) => {
  if (!fs.existsSync(distRoot)) {
    t.skip('astro-poc/dist not found; run npm run build first');
    return;
  }

  const { getProductSku } = await import('../astro-poc/src/lib/product-identity.ts');
  const product = getWebpBackedProduct();
  const sku = getProductSku(product);
  const categorySlug = String(product.category || '')
    .trim()
    .toLowerCase();
  const pagePath = resolveDistPath('p', sku, 'index.html');

  assert.ok(fs.existsSync(pagePath), `Expected built product page for ${sku}`);

  const html = fs.readFileSync(pagePath, 'utf8');
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  assert.ok(imageMatch, 'Expected og:image meta tag in built product page');
  assert.match(
    imageMatch[1],
    new RegExp(
      `https://www\\.elrincondeebano\\.com/assets/images/og/categories/${categorySlug}[^"?#]*\\.jpg\\?v=[a-f0-9]{12}$`,
      'i'
    ),
    'Expected product-page og:image to fall back to the compatible category JPG asset'
  );

  assert.equal(product.category.trim().toLowerCase(), categorySlug);
  assert.ok(
    html.includes('<meta property="og:image:width" content="1200">'),
    'Expected og:image:width=1200'
  );
  assert.ok(
    html.includes('<meta property="og:image:height" content="1200">'),
    'Expected og:image:height=1200'
  );
});
