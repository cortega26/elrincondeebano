'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  expectAsyncReject,
  withMockedConsoleLog,
  withMockedFetch,
} = require('./helpers/network-harness.js');
const {
  SITE_ORIGIN,
  buildCompliantHtmlHeaders,
  makeHtmlResponse,
  makeJsonResponse,
} = require('./helpers/share-preview-fixtures.js');

async function loadModule() {
  return import('../tools/live-contract-monitor.mjs');
}

function createMonitorFetch(handlers = []) {
  const defaultHandlers = [
    ['/data/product_data.json', () => makeJsonResponse({ products: [] })],
    ['/', () => makeHtmlResponse('<!doctype html><html><body>ok</body></html>')],
  ];

  return async (url) => {
    const target = String(url);
    for (const [suffix, responder] of [...handlers, ...defaultHandlers]) {
      if (target.endsWith(suffix)) {
        return typeof responder === 'function' ? responder(target) : responder;
      }
    }
    return makeHtmlResponse('<!doctype html><html><body>ok</body></html>');
  };
}

test('normalizeBaseUrl rejects non-allowlisted hosts', async () => {
  const { normalizeBaseUrl } = await loadModule();
  assert.equal(normalizeBaseUrl(`${SITE_ORIGIN}/`), SITE_ORIGIN);
  assert.throws(() => normalizeBaseUrl('https://example.com'), /allowlisted host/);
});

test('resolveProbeUrl blocks absolute and traversal probe targets', async () => {
  const { resolveProbeUrl } = await loadModule();
  assert.equal(resolveProbeUrl(SITE_ORIGIN, '/pages/bebidas.html').toString(), `${SITE_ORIGIN}/pages/bebidas.html`);
  assert.throws(() => resolveProbeUrl(SITE_ORIGIN, 'https://example.com/evil'), /Absolute URLs are not allowed/);
  assert.throws(() => resolveProbeUrl(SITE_ORIGIN, '/../secrets'), /Path traversal is not allowed/);
});

test('runMonitor records security header failures without failing when strict mode is disabled', async () => {
  const { runMonitor } = await loadModule();

  await withMockedFetch(createMonitorFetch(), async () => {
    const captured = [];
    await withMockedConsoleLog((value) => captured.push(value), async () => {
      await assert.doesNotReject(() =>
        runMonitor({
          baseUrl: SITE_ORIGIN,
          timeoutMs: 5000,
          sampleSize: 5,
          reportPath: '',
          requireSecurityHeaders: false,
        })
      );
    });

    const report = JSON.parse(captured[0]);
    assert.equal(report.success, true);
    assert.equal(report.availabilityOk, true);
    assert.equal(report.securityHeadersOk, false);
    assert.equal(report.securityHeaderFailures.length, 2);
    assert.deepEqual(
      report.securityHeaderFailures.map((item) => item.url),
      [`${SITE_ORIGIN}/`, `${SITE_ORIGIN}/pages/bebidas.html`]
    );
  });
});

test('runMonitor fails in strict mode when security headers are missing', async () => {
  const { runMonitor } = await loadModule();

  await withMockedFetch(createMonitorFetch(), async () => {
    await withMockedConsoleLog(() => {}, async () => {
      await expectAsyncReject(
        assert,
        () =>
          runMonitor({
            baseUrl: SITE_ORIGIN,
            timeoutMs: 5000,
            sampleSize: 5,
            reportPath: '',
            requireSecurityHeaders: true,
          }),
        /security header contract failure/
      );
    });
  });
});

test('runMonitor fails when public HTML contains disallowed injected scripts', async () => {
  const { runMonitor } = await loadModule();
  const compliantHeaders = await buildCompliantHtmlHeaders();

  await withMockedFetch(
    createMonitorFetch([
      [
        '/pages/bebidas.html',
        () =>
          makeHtmlResponse(
            '<!doctype html><script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js"></script>',
            compliantHeaders
          ),
      ],
      ['/', () => makeHtmlResponse('<!doctype html><html><body>ok</body></html>', compliantHeaders)],
    ]),
    async () => {
      await withMockedConsoleLog(() => {}, async () => {
        await expectAsyncReject(
          assert,
          () =>
            runMonitor({
              baseUrl: SITE_ORIGIN,
              timeoutMs: 5000,
              sampleSize: 5,
              reportPath: '',
              requireSecurityHeaders: false,
            }),
          /disallowed HTML surface failure/
        );
      });
    }
  );
});

test('checkUrl sends browser-like probe headers to reduce Cloudflare false positives', async () => {
  const { checkUrl } = await loadModule();
  let capturedHeaders;

  await withMockedFetch(
    async (_url, init = {}) => {
      capturedHeaders = new Headers(init.headers || {});
      return makeHtmlResponse('<!doctype html><html><body>ok</body></html>');
    },
    async () => {
      const result = await checkUrl(SITE_ORIGIN, '/', 5000);
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

      return makeHtmlResponse('<!doctype html><html><body>ok</body></html>');
    },
    async () => {
      const result = await checkUrl(SITE_ORIGIN, '/', 5000, {
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
