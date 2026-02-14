'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../tools/post-deploy-canary.mjs');
}

function makeHtml({ title = 'Page', ogImage = 'https://example.com/og.jpg', withWhatsapp = false } = {}) {
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="1200">
    <meta property="og:url" content="https://example.com/page">
  </head>
  <body>
    ${withWhatsapp ? '<a href="https://wa.me/123456789">WhatsApp</a>' : ''}
  </body>
</html>`;
}

function withMockedFetch(mockImpl, fn) {
  const original = global.fetch;
  global.fetch = mockImpl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = original;
    });
}

test('normalizeBaseUrl requires https and strips trailing slash', async () => {
  const { normalizeBaseUrl } = await loadModule();
  assert.equal(normalizeBaseUrl('https://elrincondeebano.com/'), 'https://elrincondeebano.com');
  assert.throws(() => normalizeBaseUrl('http://elrincondeebano.com'), /must use HTTPS/);
});

test('extractMetaContent and assertOgContract validate required OG tags', async () => {
  const { extractMetaContent, assertOgContract } = await loadModule();
  const html = makeHtml({ ogImage: 'https://cdn.example.com/cat.jpg' });
  assert.equal(extractMetaContent(html, 'property', 'og:image'), 'https://cdn.example.com/cat.jpg');
  assert.doesNotThrow(() => assertOgContract(html, 'sample page'));
  assert.throws(() => assertOgContract('<html></html>', 'broken page'), /missing meta tag/);
});

test('extractCategoryPathFromSitemap returns first category path', async () => {
  const { extractCategoryPathFromSitemap } = await loadModule();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://elrincondeebano.com/pages/vinos.html</loc></url>
  <url><loc>https://elrincondeebano.com/pages/aguas.html</loc></url>
</urlset>`;
  assert.equal(extractCategoryPathFromSitemap(xml), '/pages/aguas.html');
});

test('runCanary validates homepage/category/og/data/service-worker paths', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(async (url) => {
    const target = String(url);
    if (target.endsWith('/')) {
      return new Response(makeHtml({ title: 'Home', ogImage: 'https://elrincondeebano.com/assets/images/og/home.jpg', withWhatsapp: true }), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (target.endsWith('/sitemap.xml')) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://elrincondeebano.com/pages/bebidas.html</loc></url></urlset>`,
        { status: 200, headers: { 'content-type': 'application/xml' } }
      );
    }
    if (target.endsWith('/pages/bebidas.html')) {
      return new Response(makeHtml({ title: 'Bebidas', ogImage: 'https://elrincondeebano.com/assets/images/og/bebidas.jpg' }), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    if (target.endsWith('/assets/images/og/home.jpg') || target.endsWith('/assets/images/og/bebidas.jpg')) {
      return new Response('img', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (target.endsWith('/data/product_data.json')) {
      return new Response(JSON.stringify({ products: [{ id: 1 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (target.endsWith('/service-worker.js')) {
      return new Response('sw', {
        status: 200,
        headers: { 'content-type': 'application/javascript' },
      });
    }
    return new Response('not found', { status: 404 });
  }, async () => {
    const report = await runCanary({ baseUrl: 'https://elrincondeebano.com' });
    assert.equal(report.checks.length, 4);
    assert.deepEqual(
      report.checks.map((item) => item.name),
      ['homepage', 'product-data-endpoint', 'service-worker', 'category-page']
    );
  });
});

test('runCanary fails when homepage does not expose WhatsApp flow', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(async (url) => {
    const target = String(url);
    if (target.endsWith('/')) {
      return new Response(makeHtml({ withWhatsapp: false }), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('not found', { status: 404 });
  }, async () => {
    await assert.rejects(
      () => runCanary({ baseUrl: 'https://elrincondeebano.com' }),
      /WhatsApp flow references/
    );
  });
});
