'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../tools/live-contract-monitor.mjs');
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

test('normalizeBaseUrl rejects non-allowlisted hosts', async () => {
  const { normalizeBaseUrl } = await loadModule();
  assert.equal(
    normalizeBaseUrl('https://www.elrincondeebano.com/'),
    'https://www.elrincondeebano.com'
  );
  assert.throws(() => normalizeBaseUrl('https://example.com'), /allowlisted host/);
});

test('resolveProbeUrl blocks absolute and traversal probe targets', async () => {
  const { resolveProbeUrl } = await loadModule();
  assert.equal(
    resolveProbeUrl('https://www.elrincondeebano.com', '/pages/bebidas.html').toString(),
    'https://www.elrincondeebano.com/pages/bebidas.html'
  );
  assert.throws(
    () => resolveProbeUrl('https://www.elrincondeebano.com', 'https://example.com/evil'),
    /Absolute URLs are not allowed/
  );
  assert.throws(
    () => resolveProbeUrl('https://www.elrincondeebano.com', '/../secrets'),
    /Path traversal is not allowed/
  );
});

test('runMonitor records security header failures without failing when strict mode is disabled', async () => {
  const { runMonitor } = await loadModule();

  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/data/product_data.json')) {
        return new Response(JSON.stringify({ products: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    async () => {
      const captured = [];
      const originalLog = console.log;
      console.log = (value) => captured.push(value);
      try {
        await assert.doesNotReject(() =>
          runMonitor({
            baseUrl: 'https://www.elrincondeebano.com',
            timeoutMs: 5000,
            sampleSize: 5,
            reportPath: '',
            requireSecurityHeaders: false,
          })
        );
      } finally {
        console.log = originalLog;
      }

      const report = JSON.parse(captured[0]);
      assert.equal(report.success, true);
      assert.equal(report.availabilityOk, true);
      assert.equal(report.securityHeadersOk, false);
      assert.equal(report.securityHeaderFailures.length, 2);
      assert.deepEqual(
        report.securityHeaderFailures.map((item) => item.url),
        [
          'https://www.elrincondeebano.com/',
          'https://www.elrincondeebano.com/pages/bebidas.html',
        ]
      );
    }
  );
});

test('runMonitor fails in strict mode when security headers are missing', async () => {
  const { runMonitor } = await loadModule();

  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target.endsWith('/data/product_data.json')) {
        return new Response(JSON.stringify({ products: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    async () => {
      const originalLog = console.log;
      console.log = () => {};
      try {
        await assert.rejects(
          () =>
            runMonitor({
              baseUrl: 'https://www.elrincondeebano.com',
              timeoutMs: 5000,
              sampleSize: 5,
              reportPath: '',
              requireSecurityHeaders: true,
            }),
          /security header contract failure/
        );
      } finally {
        console.log = originalLog;
      }
    }
  );
});

test('runMonitor fails when public HTML contains disallowed injected scripts', async () => {
  const { runMonitor } = await loadModule();
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
      if (target.endsWith('/data/product_data.json')) {
        return new Response(JSON.stringify({ products: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (target.endsWith('/pages/bebidas.html')) {
        return new Response(
          '<!doctype html><script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js"></script>',
          {
            status: 200,
            headers: compliantHeaders,
          }
        );
      }

      return new Response('<!doctype html><html><body>ok</body></html>', {
        status: 200,
        headers: compliantHeaders,
      });
    },
    async () => {
      const originalLog = console.log;
      console.log = () => {};
      try {
        await assert.rejects(
          () =>
            runMonitor({
              baseUrl: 'https://www.elrincondeebano.com',
              timeoutMs: 5000,
              sampleSize: 5,
              reportPath: '',
              requireSecurityHeaders: false,
            }),
          /disallowed HTML surface failure/
        );
      } finally {
        console.log = originalLog;
      }
    }
  );
});

test('checkUrl sends browser-like probe headers to reduce Cloudflare false positives', async () => {
  const { checkUrl } = await loadModule();
  let capturedHeaders;

  await withMockedFetch(
    async (_url, init = {}) => {
      capturedHeaders = new Headers(init.headers || {});
      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    async () => {
      const result = await checkUrl('https://www.elrincondeebano.com', '/', 5000);
      assert.equal(result.status, 200);
    }
  );

  assert.equal(capturedHeaders.get('cache-control'), 'no-cache');
  assert.equal(capturedHeaders.get('pragma'), 'no-cache');
  assert.equal(capturedHeaders.get('sec-fetch-dest'), 'document');
  assert.equal(capturedHeaders.get('sec-fetch-mode'), 'navigate');
  assert.equal(capturedHeaders.get('sec-fetch-site'), 'none');
  assert.equal(capturedHeaders.get('sec-fetch-user'), '?1');
  assert.equal(capturedHeaders.get('upgrade-insecure-requests'), '1');
  assert.match(capturedHeaders.get('accept') || '', /application\/json/);
  assert.match(capturedHeaders.get('user-agent') || '', /Mozilla\/5\.0/);
});

test('checkUrl retries Cloudflare-like 403 responses before failing', async () => {
  const { checkUrl } = await loadModule();
  let attempt = 0;

  await withMockedFetch(
    async () => {
      attempt += 1;

      if (attempt === 1) {
        return new Response('<html><title>Just a moment...</title></html>', {
          status: 403,
          headers: {
            server: 'cloudflare',
            'cf-ray': 'retry-me',
            'content-type': 'text/html; charset=utf-8',
          },
        });
      }

      return new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
    async () => {
      const result = await checkUrl('https://www.elrincondeebano.com', '/', 5000, {
        maxAttempts: 3,
        retryDelayMs: 0,
      });

      assert.equal(result.status, 200);
      assert.equal(result.ok, true);
      assert.equal(result.attemptCount, 2);
      assert.equal(result.retried, true);
      assert.equal(result.retryHistory.length, 2);
      assert.equal(result.retryHistory[0].status, 403);
      assert.match(result.retryHistory[0].retryReason, /Cloudflare-managed challenge/);
    }
  );
});
