'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { expectAsyncReject, withMockedFetch } = require('./helpers/network-harness.js');
const {
  SITE_ORIGIN,
  makeHtmlResponse,
  makeImageResponse,
  makeSharePreviewHtml,
  makeSitemapXml,
  makeXmlResponse,
} = require('./helpers/share-preview-fixtures.js');

async function loadModule() {
  return import('../tools/share-preview-monitor.mjs');
}

const HOMEPAGE_OG_IMAGE = `${SITE_ORIGIN}/assets/images/og/home.og.jpg?v=1234567890ab`;
const CATEGORY_OG_IMAGE = `${SITE_ORIGIN}/assets/images/og/categories/bebidas.og_v3.jpg?v=abcdef123456`;
const PRODUCT_OG_IMAGE = `${SITE_ORIGIN}/assets/images/og/categories/producto.og_v3.jpg?v=0123456789ab`;

test('normalizeBaseUrl enforces HTTPS and allowlisted hosts', async () => {
  const { normalizeBaseUrl } = await loadModule();
  assert.equal(normalizeBaseUrl(`${SITE_ORIGIN}/`), SITE_ORIGIN);
  assert.throws(() => normalizeBaseUrl('http://www.elrincondeebano.com'), /must use HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://example.com'), /allowlisted host/);
});

test('runSharePreviewMonitor validates homepage, category, and product previews independently of the canary', async () => {
  const { runSharePreviewMonitor } = await loadModule();

  await withMockedFetch(async (url) => {
    const target = String(url);
    if (target.endsWith('/sitemap.xml')) {
      return makeXmlResponse(makeSitemapXml());
    }
    if (target.endsWith('/bebidas/')) {
      return makeHtmlResponse(
        makeSharePreviewHtml({
          title: 'El Rincón de Ébano - Bebidas',
          canonical: `${SITE_ORIGIN}/bebidas/`,
          ogImage: CATEGORY_OG_IMAGE,
        })
      );
    }
    if (target.endsWith('/p/pid-123/')) {
      return makeHtmlResponse(
        makeSharePreviewHtml({
          title: 'Producto | El Rincón de Ébano',
          canonical: `${SITE_ORIGIN}/p/pid-123/`,
          ogImage: PRODUCT_OG_IMAGE,
        })
      );
    }
    if (target.endsWith('/')) {
      return makeHtmlResponse(
        makeSharePreviewHtml({
          title: 'El Rincón de Ébano',
          canonical: `${SITE_ORIGIN}/`,
          ogImage: HOMEPAGE_OG_IMAGE,
        })
      );
    }
    if (target.endsWith(HOMEPAGE_OG_IMAGE.replace(SITE_ORIGIN, ''))) {
      return makeImageResponse();
    }
    if (target.endsWith(CATEGORY_OG_IMAGE.replace(SITE_ORIGIN, ''))) {
      return makeImageResponse();
    }
    if (target.endsWith(PRODUCT_OG_IMAGE.replace(SITE_ORIGIN, ''))) {
      return makeImageResponse();
    }
    return new Response('not found', { status: 404 });
  }, async () => {
    const report = await runSharePreviewMonitor({ baseUrl: SITE_ORIGIN });
    assert.equal(report.checks.length, 3);
    assert.deepEqual(
      report.checks.map((check) => check.name),
      ['homepage', 'category', 'product']
    );
  });
});

test('runSharePreviewMonitor fails clearly on challenge pages', async () => {
  const { runSharePreviewMonitor } = await loadModule();

  await withMockedFetch(async (url) => {
    const target = String(url);
    if (target.endsWith('/sitemap.xml')) {
      return makeXmlResponse(makeSitemapXml());
    }
    if (target.endsWith('/')) {
      return makeHtmlResponse('<html><body>Just a moment... /cdn-cgi/challenge-platform/</body></html>');
    }
    return new Response('not found', { status: 404 });
  }, async () => {
    await expectAsyncReject(
      assert,
      () => runSharePreviewMonitor({ baseUrl: SITE_ORIGIN }),
      /challenge\/interstitial/
    );
  });
});
