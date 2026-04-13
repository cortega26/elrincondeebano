'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../infra/cloudflare/edge-security-headers/worker.mjs');
}

test('shouldApplySecurityHeaders targets only canonical-host HTML documents', async () => {
  const { shouldApplySecurityHeaders } = await loadModule();

  const htmlRequest = new Request('https://www.elrincondeebano.com/pages/bebidas.html');
  const htmlResponse = new Response('<!doctype html><h1>ok</h1>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  assert.equal(shouldApplySecurityHeaders({ request: htmlRequest, response: htmlResponse }), true);

  const assetResponse = new Response('img', {
    status: 200,
    headers: { 'content-type': 'image/webp' },
  });
  assert.equal(
    shouldApplySecurityHeaders({ request: htmlRequest, response: assetResponse }),
    false
  );

  const foreignRequest = new Request('https://example.com/');
  assert.equal(
    shouldApplySecurityHeaders({ request: foreignRequest, response: htmlResponse }),
    false
  );
});

test('applySecurityHeaders injects the documented edge baseline without dropping existing headers', async () => {
  const { applySecurityHeaders } = await loadModule();

  const original = new Response('<!doctype html><h1>ok</h1>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      etag: '"abc123"',
    },
  });

  const hardened = applySecurityHeaders(original);
  assert.equal(hardened.headers.get('etag'), '"abc123"');
  assert.equal(hardened.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(hardened.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(hardened.headers.get('x-frame-options'), 'DENY');
  assert.match(
    hardened.headers.get('content-security-policy') || '',
    /default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'/
  );
});

test('sanitizeHtmlResponse removes disallowed Cloudflare-injected HTML while preserving allowed beacon scripts', async () => {
  const { sanitizeHtmlResponse } = await loadModule();

  const original = new Response(
    `<!doctype html>
      <html>
        <head>
          <script src="https://static.cloudflareinsights.com/beacon.min.js" defer></script>
        </head>
        <body>
          <h1>ok</h1>
          <script>
            window.__CF$cv$params = { r: 'abc123' };
            var a = document.createElement('script');
            a.src = '/cdn-cgi/challenge-platform/scripts/jsd/main.js';
            document.head.appendChild(a);
          </script>
        </body>
      </html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        etag: '"abc123"',
      },
    }
  );

  const sanitized = await sanitizeHtmlResponse(original);
  const html = await sanitized.text();

  assert.equal(sanitized.headers.get('etag'), '"abc123"');
  assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(html, /<h1>ok<\/h1>/);
  assert.doesNotMatch(html, /challenge-platform/);
  assert.doesNotMatch(html, /__CF\$cv\$params/);
});

test('worker fetch handler hardens canonical-host HTML and leaves assets unchanged', async () => {
  const workerModule = await loadModule();

  const originalFetch = global.fetch;
  global.fetch = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('.webp')) {
      return new Response('img', {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      });
    }

    return new Response(
      '<!doctype html><h1>ok</h1><script>window.__CF$cv$params={r:"abc"};var a=document.createElement("script");a.src="/cdn-cgi/challenge-platform/scripts/jsd/main.js";document.head.appendChild(a);</script>',
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }
    );
  };

  try {
    const htmlResponse = await workerModule.default.fetch(
      new Request('https://www.elrincondeebano.com/'),
      {},
      {}
    );
    const html = await htmlResponse.text();
    assert.equal(htmlResponse.headers.get('x-frame-options'), 'DENY');
    assert.doesNotMatch(html, /challenge-platform/);
    assert.doesNotMatch(html, /__CF\$cv\$params/);

    const assetResponse = await workerModule.default.fetch(
      new Request('https://www.elrincondeebano.com/assets/images/web/logo.webp'),
      {},
      {}
    );
    assert.equal(assetResponse.headers.get('x-frame-options'), null);
  } finally {
    global.fetch = originalFetch;
  }
});
