'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../tools/share-preview-monitor.mjs');
}

function makeHtml({
  title = 'Page',
  canonical = 'https://www.elrincondeebano.com/page/',
  description = 'Share preview description',
  ogImage = 'https://www.elrincondeebano.com/assets/images/og/home.og.jpg?v=1234567890ab',
} = {}) {
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="1200">
    <meta property="og:url" content="${canonical}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImage}">
  </head>
  <body></body>
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

test('normalizeBaseUrl enforces HTTPS and allowlisted hosts', async () => {
  const { normalizeBaseUrl } = await loadModule();
  assert.equal(normalizeBaseUrl('https://www.elrincondeebano.com/'), 'https://www.elrincondeebano.com');
  assert.throws(() => normalizeBaseUrl('http://www.elrincondeebano.com'), /must use HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://example.com'), /allowlisted host/);
});

test('runSharePreviewMonitor validates homepage, category, and product previews independently of the canary', async () => {
  const { runSharePreviewMonitor } = await loadModule();

  await withMockedFetch(async (url) => {
    const target = String(url);
    if (target.endsWith('/sitemap.xml')) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://www.elrincondeebano.com/</loc></url>
  <url><loc>https://www.elrincondeebano.com/bebidas/</loc></url>
  <url><loc>https://www.elrincondeebano.com/p/pid-123/</loc></url>
</urlset>`,
        { status: 200, headers: { 'content-type': 'application/xml' } }
      );
    }
    if (target.endsWith('/assets/images/og/home.og.jpg?v=1234567890ab')) {
      return new Response('jpg', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (target.endsWith('/assets/images/og/categories/bebidas.og_v3.jpg?v=abcdef123456')) {
      return new Response('jpg', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (target.endsWith('/assets/images/og/categories/producto.og_v3.jpg?v=0123456789ab')) {
      return new Response('jpg', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    }
    if (target.endsWith('/bebidas/')) {
      return new Response(
        makeHtml({
          title: 'El Rincón de Ébano - Bebidas',
          canonical: 'https://www.elrincondeebano.com/bebidas/',
          ogImage:
            'https://www.elrincondeebano.com/assets/images/og/categories/bebidas.og_v3.jpg?v=abcdef123456',
        }),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }
    if (target.endsWith('/p/pid-123/')) {
      return new Response(
        makeHtml({
          title: 'Producto | El Rincón de Ébano',
          canonical: 'https://www.elrincondeebano.com/p/pid-123/',
          ogImage:
            'https://www.elrincondeebano.com/assets/images/og/categories/producto.og_v3.jpg?v=0123456789ab',
        }),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }
    if (target.endsWith('/')) {
      return new Response(
        makeHtml({
          title: 'El Rincón de Ébano',
          canonical: 'https://www.elrincondeebano.com/',
          ogImage: 'https://www.elrincondeebano.com/assets/images/og/home.og.jpg?v=1234567890ab',
        }),
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }
    return new Response('not found', { status: 404 });
  }, async () => {
    const report = await runSharePreviewMonitor({ baseUrl: 'https://www.elrincondeebano.com' });
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
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://www.elrincondeebano.com/</loc></url>
  <url><loc>https://www.elrincondeebano.com/bebidas/</loc></url>
  <url><loc>https://www.elrincondeebano.com/p/pid-123/</loc></url>
</urlset>`,
        { status: 200, headers: { 'content-type': 'application/xml' } }
      );
    }
    if (target.endsWith('/')) {
      return new Response('<html><body>Just a moment... /cdn-cgi/challenge-platform/</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('not found', { status: 404 });
  }, async () => {
    await assert.rejects(
      () => runSharePreviewMonitor({ baseUrl: 'https://www.elrincondeebano.com' }),
      /challenge\/interstitial/
    );
  });
});
