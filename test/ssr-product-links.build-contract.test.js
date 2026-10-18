'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const { distRoot, readDistFile } = require('./helpers/repo-files.js');
const { loadProductCatalog } = require('./helpers/product-catalog.js');

// Stable fixture category, same one the sibling build-contract suites use
// (category-og.build-metadata.test.js, share-preview.build-contract.test.js).
const CATEGORY_SLUG = 'bebidas';
const MIN_PRODUCT_ANCHORS = 3;

const REGRESSION_NOTE =
  'product cards lost their SSR anchors — the orphan-page SEO fix is regressing';

test('built category page server-renders /p/<sku>/ anchors for crawlers that do not run JS', async (t) => {
  if (!fs.existsSync(distRoot)) {
    // Explicit CI opt-in: the unit-tests job has no build artifacts.
    if (process.env.CI_SKIP_BUILD_CONTRACT === '1') {
      t.skip('skipped: CI_SKIP_BUILD_CONTRACT=1 (no build artifacts in this job)');
      return;
    }
    assert.fail('astro-poc/dist not found; run npm run build first');
    return;
  }

  const html = readDistFile(CATEGORY_SLUG, 'index.html');
  assert.ok(
    html,
    `Expected built category page astro-poc/dist/${CATEGORY_SLUG}/index.html — ${REGRESSION_NOTE}`
  );

  // No JS execution anywhere below: this is the raw server-rendered HTML a
  // crawler without a JS engine downloads.
  const anchorCount = (html.match(/href="\/p\//g) ?? []).length;
  assert.ok(
    anchorCount >= MIN_PRODUCT_ANCHORS,
    `Expected at least ${MIN_PRODUCT_ANCHORS} href="/p/ anchors in astro-poc/dist/${CATEGORY_SLUG}/index.html, found ${anchorCount} — ${REGRESSION_NOTE}`
  );

  const { getProductSku } = await import('../astro-poc/src/lib/product-identity.ts');
  const products = loadProductCatalog().products || [];
  const sample = products.find(
    (product) =>
      String(product?.category || '')
        .trim()
        .toLowerCase() === CATEGORY_SLUG &&
      product?.stock !== false &&
      product?.is_archived !== true
  );
  assert.ok(
    sample,
    `Expected data/product_data.json to contain an active product in category "${CATEGORY_SLUG}" to sample`
  );

  const sku = getProductSku(sample);
  const expectedHref = `href="/p/${sku}/"`;
  assert.ok(
    html.includes(expectedHref),
    `Expected astro-poc/dist/${CATEGORY_SLUG}/index.html to contain ${expectedHref} for the sampled product "${sample.name}" — ${REGRESSION_NOTE}`
  );
});
