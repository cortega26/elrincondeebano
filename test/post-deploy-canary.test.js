'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../tools/post-deploy-canary.mjs');
}

function makeHtml({
  title = 'Page',
  ogImage = 'https://example.com/og.jpg',
  withWhatsapp = false,
} = {}) {
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
  assert.equal(
    normalizeBaseUrl('https://www.elrincondeebano.com/'),
    'https://www.elrincondeebano.com'
  );
  assert.throws(() => normalizeBaseUrl('http://elrincondeebano.com'), /must use HTTPS/);
  assert.throws(
    () => normalizeBaseUrl('https://example.com'),
    /must target an allowlisted host/
  );
});

test('extractMetaContent and assertOgContract validate required OG tags', async () => {
  const { extractMetaContent, assertOgContract, assertSupportedOgImageUrl } = await loadModule();
  const html = makeHtml({ ogImage: 'https://cdn.example.com/cat.jpg' });
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
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://www.elrincondeebano.com/vinos/</loc></url>
  <url><loc>https://www.elrincondeebano.com/aguas/</loc></url>
</urlset>`;
  assert.equal(extractCategoryPathFromSitemap(xml), '/aguas/');
});

test('runCanary validates homepage/category/og/data/service-worker paths', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/bebidas/')) {
        return new Response(
          makeHtml({
            title: 'Bebidas',
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/bebidas.jpg',
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      if (target.endsWith('/')) {
        return new Response(
          makeHtml({
            title: 'Home',
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/home.jpg',
            withWhatsapp: true,
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      if (target.endsWith('/sitemap.xml')) {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://www.elrincondeebano.com/bebidas/</loc></url></urlset>',
          { status: 200, headers: { 'content-type': 'application/xml' } }
        );
      }
      if (target.endsWith('/pages/bebidas.html')) {
        return new Response(makeHtml({ title: 'Compat bebidas' }), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (
        target.endsWith('/assets/images/og/home.jpg') ||
        target.endsWith('/assets/images/og/bebidas.jpg')
      ) {
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
    },
    async () => {
      const report = await runCanary({ baseUrl: 'https://www.elrincondeebano.com' });
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
    }
  );
});

test('runCanary fails when homepage does not expose WhatsApp flow', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/')) {
        return new Response(
          makeHtml({
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/home.jpg',
            withWhatsapp: false,
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      if (target.endsWith('/assets/images/og/home.jpg')) {
        return new Response('img', { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      return new Response('not found', { status: 404 });
    },
    async () => {
      await assert.rejects(
        () => runCanary({ baseUrl: 'https://www.elrincondeebano.com' }),
        /WhatsApp flow references/
      );
    }
  );
});

test('runCanary fails when og:image uses an unsupported WebP asset', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/')) {
        return new Response(
          makeHtml({
            title: 'Home',
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/home.webp',
            withWhatsapp: true,
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      return new Response('not found', { status: 404 });
    },
    async () => {
      await assert.rejects(
        () => runCanary({ baseUrl: 'https://www.elrincondeebano.com' }),
        /must use JPG or PNG/
      );
    }
  );
});

test('runCanary fails when og:image points to a foreign origin', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/')) {
        return new Response(
          makeHtml({
            title: 'Home',
            ogImage: 'https://elrincondeebano.com/assets/images/og/home.jpg',
            withWhatsapp: true,
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      return new Response('not found', { status: 404 });
    },
    async () => {
      await assert.rejects(
        () => runCanary({ baseUrl: 'https://www.elrincondeebano.com' }),
        /must stay on the canary origin/
      );
    }
  );
});

test('runCanary fails in strict mode when security headers are missing', async () => {
  const { runCanary } = await loadModule();
  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/')) {
        return new Response(
          makeHtml({
            title: 'Home',
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/home.jpg',
            withWhatsapp: true,
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      if (target.endsWith('/pages/bebidas.html')) {
        return new Response(makeHtml({ title: 'Compat bebidas' }), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (target.endsWith('/sitemap.xml')) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>https://www.elrincondeebano.com/bebidas/</loc></url></urlset>`,
          { status: 200, headers: { 'content-type': 'application/xml' } }
        );
      }
      if (target.endsWith('/bebidas/')) {
        return new Response(
          makeHtml({
            title: 'Bebidas',
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/bebidas.jpg',
          }),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }
        );
      }
      if (
        target.endsWith('/assets/images/og/home.jpg') ||
        target.endsWith('/assets/images/og/bebidas.jpg')
      ) {
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
    },
    async () => {
      await assert.rejects(
        () =>
          runCanary({
            baseUrl: 'https://www.elrincondeebano.com',
            requireSecurityHeaders: true,
          }),
        /missing required security headers/
      );
    }
  );
});

test('runCanary fails when Cloudflare injects disallowed scripts into baseline HTML routes', async () => {
  const { runCanary } = await loadModule();
  const compliantHeaders = {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy':
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; form-action 'self'; upgrade-insecure-requests",
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy':
      'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
  };

  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/')) {
        return new Response(
          makeHtml({
            title: 'Home',
            ogImage: 'https://www.elrincondeebano.com/assets/images/og/home.jpg',
            withWhatsapp: true,
          }),
          {
            status: 200,
            headers: compliantHeaders,
          }
        );
      }
      if (target.endsWith('/pages/bebidas.html')) {
        return new Response(
          '<!doctype html><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
          {
            status: 200,
            headers: compliantHeaders,
          }
        );
      }
      if (target.endsWith('/assets/images/og/home.jpg')) {
        return new Response('img', { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      return new Response('not found', { status: 404 });
    },
    async () => {
      await assert.rejects(
        () => runCanary({ baseUrl: 'https://www.elrincondeebano.com' }),
        /disallowed HTML script surface/
      );
    }
  );
});
