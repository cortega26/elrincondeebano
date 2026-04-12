'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { expectAsyncReject, withMockedFetch } = require('./helpers/network-harness.js');
const {
  SITE_ORIGIN,
  buildCompliantHtmlHeaders,
  makeHtmlResponse,
  makeImageResponse,
  makeJsonResponse,
  makeSharePreviewHtml,
  makeSitemapXml,
  makeXmlResponse,
} = require('./helpers/share-preview-fixtures.js');

const HOMEPAGE_OG_IMAGE = `${SITE_ORIGIN}/assets/images/og/home.jpg`;
const CATEGORY_OG_IMAGE = `${SITE_ORIGIN}/assets/images/og/bebidas.jpg`;

async function loadModule() {
  return import('../tools/post-deploy-canary.mjs');
}

function createCanaryFetch(handlers = []) {
  const defaultHandlers = [
    ['/sitemap.xml', () => makeXmlResponse(makeSitemapXml([`${SITE_ORIGIN}/bebidas/`]))],
    ['/pages/bebidas.html', () => makeHtmlResponse('<!doctype html><html><body>Compat bebidas</body></html>')],
    ['/assets/images/og/home.jpg', () => makeImageResponse()],
    ['/assets/images/og/bebidas.jpg', () => makeImageResponse()],
    ['/data/product_data.json', () => makeJsonResponse({ products: [{ id: 1 }] })],
    [
      '/service-worker.js',
      () =>
        new Response('sw', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        }),
    ],
    [
      '/bebidas/',
      () =>
        makeHtmlResponse(
          makeSharePreviewHtml({
            title: 'Bebidas',
            ogImage: CATEGORY_OG_IMAGE,
          })
        ),
    ],
    [
      '/',
      () =>
        makeHtmlResponse(
          makeSharePreviewHtml({
            title: 'Home',
            ogImage: HOMEPAGE_OG_IMAGE,
            withWhatsapp: true,
          })
        ),
    ],
  ];

  return async (url) => {
    const target = String(url);
    for (const [suffix, responder] of [...handlers, ...defaultHandlers]) {
      if (target.endsWith(suffix)) {
        return typeof responder === 'function' ? responder(target) : responder;
      }
    }
    return new Response('not found', { status: 404 });
  };
}

test('normalizeBaseUrl requires https and strips trailing slash', async () => {
  const { normalizeBaseUrl } = await loadModule();
  assert.equal(normalizeBaseUrl(`${SITE_ORIGIN}/`), SITE_ORIGIN);
  assert.throws(() => normalizeBaseUrl('http://elrincondeebano.com'), /must use HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://example.com'), /must target an allowlisted host/);
});

test('extractMetaContent and assertOgContract validate required OG tags', async () => {
  const { extractMetaContent, assertOgContract, assertSupportedOgImageUrl } = await loadModule();
  const html = makeSharePreviewHtml({
    canonical: 'https://example.com/page',
    ogImage: 'https://cdn.example.com/cat.jpg',
  });
  assert.equal(extractMetaContent(html, 'property', 'og:image'), 'https://cdn.example.com/cat.jpg');
  assert.doesNotThrow(() => assertOgContract(html, 'sample page'));
  assert.doesNotThrow(() =>
    assertSupportedOgImageUrl('https://cdn.example.com/cat.jpg?v=123', 'sample page og:image')
  );
  assert.throws(
    () => assertSupportedOgImageUrl('https://cdn.example.com/cat.webp', 'sample page og:image'),
    /must use JPG or PNG/
  );
  assert.throws(() => assertOgContract('<html></html>', 'broken page'), /missing meta tag/);
});

test('extractCategoryPathFromSitemap returns first category path', async () => {
  const { extractCategoryPathFromSitemap } = await loadModule();
  const xml = makeSitemapXml([`${SITE_ORIGIN}/vinos/`, `${SITE_ORIGIN}/aguas/`]);
  assert.equal(extractCategoryPathFromSitemap(xml), '/aguas/');
});

test('runCanary validates homepage/category/og/data/service-worker paths', async () => {
  const { runCanary } = await loadModule();

  await withMockedFetch(createCanaryFetch(), async () => {
    const report = await runCanary({ baseUrl: SITE_ORIGIN });
    assert.equal(report.checks.length, 5);
    assert.deepEqual(
      report.checks.map((item) => item.name),
      [
        'homepage',
        'security-headers-baseline',
        'product-data-endpoint',
        'service-worker',
        'category-page',
      ]
    );
    const securityCheck = report.checks.find((item) => item.name === 'security-headers-baseline');
    assert.equal(securityCheck.status, 'warn');
  });
});

test('runCanary fails when homepage does not expose WhatsApp flow', async () => {
  const { runCanary } = await loadModule();

  await withMockedFetch(
    createCanaryFetch([
      [
        '/',
        () =>
          makeHtmlResponse(
            makeSharePreviewHtml({
              ogImage: HOMEPAGE_OG_IMAGE,
              withWhatsapp: false,
            })
          ),
      ],
    ]),
    async () => {
      await expectAsyncReject(assert, () => runCanary({ baseUrl: SITE_ORIGIN }), /WhatsApp flow references/);
    }
  );
});

test('runCanary fails when og:image uses an unsupported WebP asset', async () => {
  const { runCanary } = await loadModule();

  await withMockedFetch(
    createCanaryFetch([
      [
        '/',
        () =>
          makeHtmlResponse(
            makeSharePreviewHtml({
              title: 'Home',
              ogImage: `${SITE_ORIGIN}/assets/images/og/home.webp`,
              withWhatsapp: true,
            })
          ),
      ],
    ]),
    async () => {
      await expectAsyncReject(assert, () => runCanary({ baseUrl: SITE_ORIGIN }), /must use JPG or PNG/);
    }
  );
});

test('runCanary fails when og:image points to a foreign origin', async () => {
  const { runCanary } = await loadModule();

  await withMockedFetch(
    createCanaryFetch([
      [
        '/',
        () =>
          makeHtmlResponse(
            makeSharePreviewHtml({
              title: 'Home',
              ogImage: 'https://elrincondeebano.com/assets/images/og/home.jpg',
              withWhatsapp: true,
            })
          ),
      ],
    ]),
    async () => {
      await expectAsyncReject(
        assert,
        () => runCanary({ baseUrl: SITE_ORIGIN }),
        /must stay on the canary origin/
      );
    }
  );
});

test('runCanary fails in strict mode when security headers are missing', async () => {
  const { runCanary } = await loadModule();

  await withMockedFetch(createCanaryFetch(), async () => {
    await expectAsyncReject(
      assert,
      () =>
        runCanary({
          baseUrl: SITE_ORIGIN,
          requireSecurityHeaders: true,
        }),
      /missing required security headers/
    );
  });
});

test('runCanary fails when Cloudflare injects disallowed scripts into baseline HTML routes', async () => {
  const { runCanary } = await loadModule();
  const compliantHeaders = await buildCompliantHtmlHeaders();

  await withMockedFetch(
    createCanaryFetch([
      [
        '/',
        () =>
          makeHtmlResponse(
            makeSharePreviewHtml({
              title: 'Home',
              ogImage: HOMEPAGE_OG_IMAGE,
              withWhatsapp: true,
            }),
            compliantHeaders
          ),
      ],
      [
        '/pages/bebidas.html',
        () =>
          makeHtmlResponse(
            '<!doctype html><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
            compliantHeaders
          ),
      ],
    ]),
    async () => {
      await expectAsyncReject(assert, () => runCanary({ baseUrl: SITE_ORIGIN }), /disallowed HTML script surface/);
    }
  );
});
