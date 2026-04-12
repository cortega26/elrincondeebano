'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { distRoot, readDistFile, resolveDistPath } = require('./helpers/repo-files.js');
const { getSharePreviewSampleProduct } = require('./helpers/product-catalog.js');

const siteOrigin = 'https://www.elrincondeebano.com';

function extractMeta(html, attributeName, attributeValue) {
  const escapedValue = attributeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]+${attributeName}=["']${escapedValue}["'][^>]+content=["']([^"]+)["']`,
    'i'
  );
  return html.match(pattern)?.[1] || null;
}

function extractCanonical(html) {
  return html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"]+)["']/i)?.[1] || null;
}

function assertSupportedSharePreview(html, expectedCanonical, label) {
  const canonical = extractCanonical(html);
  const ogUrl = extractMeta(html, 'property', 'og:url');
  const description = extractMeta(html, 'name', 'description');
  const ogDescription = extractMeta(html, 'property', 'og:description');
  const twitterDescription = extractMeta(html, 'name', 'twitter:description');
  const ogTitle = extractMeta(html, 'property', 'og:title');
  const twitterTitle = extractMeta(html, 'name', 'twitter:title');
  const ogImage = extractMeta(html, 'property', 'og:image');
  const ogImageType = extractMeta(html, 'property', 'og:image:type');
  const ogImageWidth = extractMeta(html, 'property', 'og:image:width');
  const ogImageHeight = extractMeta(html, 'property', 'og:image:height');
  const twitterCard = extractMeta(html, 'name', 'twitter:card');

  assert.equal(canonical, expectedCanonical, `${label} canonical should match the supported public URL`);
  assert.equal(ogUrl, expectedCanonical, `${label} og:url should match canonical`);
  assert.ok(description, `${label} should emit meta description`);
  assert.equal(ogDescription, description, `${label} og:description should match meta description`);
  assert.equal(
    twitterDescription,
    description,
    `${label} twitter:description should match meta description`
  );
  assert.ok(ogTitle, `${label} should emit og:title`);
  assert.equal(twitterTitle, ogTitle, `${label} twitter:title should match og:title`);
  assert.equal(twitterCard, 'summary_large_image', `${label} should emit summary_large_image`);
  assert.match(
    ogImage || '',
    /^https:\/\/www\.elrincondeebano\.com\/.+\.(?:jpe?g|png)\?v=[a-f0-9]{12}$/i,
    `${label} should emit a versioned absolute JPG/PNG og:image`
  );
  assert.match(ogImageType || '', /^image\/(?:jpeg|png)$/i, `${label} should emit og:image:type`);
  assert.equal(ogImageWidth, '1200', `${label} should emit og:image:width=1200`);
  assert.equal(ogImageHeight, '1200', `${label} should emit og:image:height=1200`);

  const imageUrl = new URL(ogImage);
  assert.equal(imageUrl.origin, siteOrigin, `${label} og:image should stay on the canonical origin`);
  const distImagePath = resolveDistPath(decodeURIComponent(imageUrl.pathname).replace(/^\/+/, ''));
  assert.ok(fs.existsSync(distImagePath), `${label} og:image asset should exist in dist`);
}

test('built supported routes keep the share-preview contract aligned for WhatsApp unfurls', async (t) => {
  if (!fs.existsSync(distRoot)) {
    t.skip('astro-poc/dist not found; run npm run build first');
    return;
  }

  const homepageHtml = readDistFile('index.html');
  assert.ok(homepageHtml, 'Expected built homepage');
  assertSupportedSharePreview(homepageHtml, `${siteOrigin}/`, 'homepage');

  const categoryHtml = readDistFile('bebidas', 'index.html');
  assert.ok(categoryHtml, 'Expected built modern category page');
  assertSupportedSharePreview(categoryHtml, `${siteOrigin}/bebidas/`, 'modern category page');

  const { getProductSku } = await import('../astro-poc/src/lib/product-identity.ts');
  const sku = getProductSku(getSharePreviewSampleProduct());
  const productHtml = readDistFile('p', sku, 'index.html');
  assert.ok(productHtml, `Expected built product page for ${sku}`);
  assertSupportedSharePreview(productHtml, `${siteOrigin}/p/${sku}/`, 'product page');
});

test('legacy compatibility routes stay out of the supported share-preview contract', (t) => {
  if (!fs.existsSync(distRoot)) {
    t.skip('astro-poc/dist not found; run npm run build first');
    return;
  }

  const legacyCases = [
    {
      label: 'legacy pages route',
      html: readDistFile('pages', 'bebidas.html'),
      canonical: `${siteOrigin}/bebidas/`,
    },
    {
      label: 'legacy /c route',
      html: readDistFile('c', 'bebidas', 'index.html'),
      canonical: `${siteOrigin}/bebidas/`,
    },
  ];

  for (const legacyCase of legacyCases) {
    assert.ok(legacyCase.html, `Expected ${legacyCase.label}`);
    assert.equal(extractMeta(legacyCase.html, 'name', 'robots'), 'noindex, follow');
    assert.equal(extractCanonical(legacyCase.html), legacyCase.canonical);
    assert.equal(extractMeta(legacyCase.html, 'property', 'og:url'), legacyCase.canonical);
  }
});
