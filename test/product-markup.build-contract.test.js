'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const { distRoot, readDistFile } = require('./helpers/repo-files.js');
const { loadProductCatalog } = require('./helpers/product-catalog.js');

const REGRESSION_NOTE =
  'build markup regressed: the LCP priority or the Product JSON-LD no longer matches the visible page';

function countHighPriority(html) {
  // Count matches, never lines: the built HTML is a single line (plan 119's
  // grep -c criterion was always 1 because of that).
  return (html.match(/fetchpriority="high"/g) ?? []).length;
}

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, `Expected a JSON-LD script — ${REGRESSION_NOTE}`);
  return JSON.parse(match[1]);
}

function productNode(data) {
  return (data['@graph'] || []).find((node) => node['@type'] === 'Product');
}

function breadcrumbNode(data) {
  return (data['@graph'] || []).find((node) => node['@type'] === 'BreadcrumbList');
}

function skipWithoutBuild(t) {
  if (fs.existsSync(distRoot)) {
    return false;
  }
  if (process.env.CI_SKIP_BUILD_CONTRACT === '1') {
    t.skip('skipped: CI_SKIP_BUILD_CONTRACT=1 (no build artifacts in this job)');
    return true;
  }
  assert.fail('astro-poc/dist not found; run npm run build first');
  return true;
}

test('home and product pages emit exactly one high-priority image', async (t) => {
  if (skipWithoutBuild(t)) return;

  const home = readDistFile('index.html');
  assert.ok(home, `Expected astro-poc/dist/index.html — ${REGRESSION_NOTE}`);
  assert.equal(
    countHighPriority(home),
    1,
    `Expected exactly one fetchpriority="high" in astro-poc/dist/index.html — ${REGRESSION_NOTE}`
  );

  const { getProductSku } = await import('../astro-poc/src/lib/product-identity.ts');
  const products = loadProductCatalog().products || [];
  const sample = products.find(
    (product) => product?.stock !== false && product?.is_archived !== true
  );
  assert.ok(sample, 'Expected an in-stock product to sample a product page');

  const sku = getProductSku(sample);
  const productPage = readDistFile('p', sku, 'index.html');
  assert.ok(
    productPage,
    `Expected astro-poc/dist/p/${sku}/index.html — ${REGRESSION_NOTE}`
  );
  assert.equal(
    countHighPriority(productPage),
    1,
    `Expected exactly one fetchpriority="high" in astro-poc/dist/p/${sku}/index.html — ${REGRESSION_NOTE}`
  );
  assert.match(
    productPage,
    /<img[^>]*product-detail-image[^>]*fetchpriority="high"/,
    `Expected the single high-priority image to be the product detail image — ${REGRESSION_NOTE}`
  );

  const categoryPage = readDistFile('despensa', 'index.html');
  if (categoryPage) {
    assert.ok(
      countHighPriority(categoryPage) <= 1,
      `Expected at most one fetchpriority="high" in astro-poc/dist/despensa/index.html — ${REGRESSION_NOTE}`
    );
  }
});

test('product JSON-LD offer matches the visible effective price', async (t) => {
  if (skipWithoutBuild(t)) return;

  const { getProductSku } = await import('../astro-poc/src/lib/product-identity.ts');
  const products = loadProductCatalog().products || [];
  const discounted = products.find(
    (product) =>
      product?.stock !== false &&
      product?.is_archived !== true &&
      Number(product?.discount) > 0
  );
  assert.ok(
    discounted,
    'Expected at least one in-stock product with discount > 0 to verify the JSON-LD offer'
  );

  const sku = getProductSku(discounted);
  const html = readDistFile('p', sku, 'index.html');
  assert.ok(html, `Expected astro-poc/dist/p/${sku}/index.html — ${REGRESSION_NOTE}`);

  const product = productNode(extractJsonLd(html));
  assert.ok(product, `Expected a Product JSON-LD node — ${REGRESSION_NOTE}`);
  const expectedPrice = Math.max(
    Number(discounted.price) - Number(discounted.discount || 0),
    0
  );
  assert.equal(
    product.offers.price,
    expectedPrice,
    `JSON-LD offer must equal the visible effective price (${expectedPrice}) — ${REGRESSION_NOTE}`
  );
  assert.match(
    product.image,
    /^https:\/\/www\.elrincondeebano\.com\//,
    `JSON-LD product image must be absolute — ${REGRESSION_NOTE}`
  );
  assert.doesNotMatch(
    product.image,
    /\s/,
    `JSON-LD product image must be URL-encoded (no spaces) — ${REGRESSION_NOTE}`
  );
});

test('product breadcrumb uses the category label', async (t) => {
  if (skipWithoutBuild(t)) return;

  const [{ getProductSku }, { getCategoryLabel }] = await Promise.all([
    import('../astro-poc/src/lib/product-identity.ts'),
    import('../astro-poc/src/lib/catalog.ts'),
  ]);
  const products = loadProductCatalog().products || [];
  const sample = products.find(
    (product) =>
      product?.stock !== false &&
      product?.is_archived !== true &&
      getCategoryLabel(product.category) !== product.category
  );
  assert.ok(
    sample,
    'Expected a product whose category label differs from the raw key to verify the breadcrumb'
  );

  const sku = getProductSku(sample);
  const html = readDistFile('p', sku, 'index.html');
  assert.ok(html, `Expected astro-poc/dist/p/${sku}/index.html — ${REGRESSION_NOTE}`);

  const breadcrumb = breadcrumbNode(extractJsonLd(html));
  assert.ok(breadcrumb, `Expected a BreadcrumbList JSON-LD node — ${REGRESSION_NOTE}`);
  const categoryCrumb = breadcrumb.itemListElement?.[1];
  assert.ok(categoryCrumb, `Expected the category breadcrumb entry — ${REGRESSION_NOTE}`);
  assert.equal(
    categoryCrumb.name,
    getCategoryLabel(sample.category),
    `Breadcrumb must use the visible category label — ${REGRESSION_NOTE}`
  );
  assert.notEqual(
    categoryCrumb.name,
    sample.category,
    `Breadcrumb must not expose the raw category key — ${REGRESSION_NOTE}`
  );
});
