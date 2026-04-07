'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../tools/security-header-policy.mjs');
}

test('buildSecurityHeadersPolicy returns the versioned edge baseline', async () => {
  const { buildSecurityHeadersPolicy } = await loadModule();
  const policy = buildSecurityHeadersPolicy();

  assert.equal(policy['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(policy['x-content-type-options'], 'nosniff');
  assert.equal(policy['x-frame-options'], 'DENY');
  assert.match(
    policy['content-security-policy'],
    /script-src 'self' https:\/\/static\.cloudflareinsights\.com/
  );
  assert.match(
    policy['content-security-policy'],
    /connect-src 'self' https:\/\/cloudflareinsights\.com https:\/\/static\.cloudflareinsights\.com/
  );
  assert.match(policy['content-security-policy'], /frame-ancestors 'none'/);
});

test('inspectSecurityHeaders accepts the documented edge baseline', async () => {
  const { buildSecurityHeadersPolicy, inspectSecurityHeaders } = await loadModule();
  const headers = new Headers(buildSecurityHeadersPolicy());
  const inspection = inspectSecurityHeaders(headers);

  assert.equal(inspection.ok, true);
  assert.deepEqual(inspection.missing, []);
  assert.deepEqual(inspection.invalid, []);
});

test('inspectSecurityHeaders rejects drifted CSP and frame policy values', async () => {
  const { inspectSecurityHeaders } = await loadModule();
  const headers = new Headers({
    'content-security-policy':
      'default-src \'self\'; base-uri \'self\'; object-src \'none\'; frame-ancestors \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:; font-src \'self\' data:; connect-src \'self\'; manifest-src \'self\'; worker-src \'self\'; form-action \'self\'; upgrade-insecure-requests',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'permissions-policy': 'camera=()',
  });

  const inspection = inspectSecurityHeaders(headers);
  assert.equal(inspection.ok, false);
  assert.match(inspection.invalid.join('\n'), /content-security-policy \(frame-ancestors expected "'none'"\)/);
  assert.match(
    inspection.invalid.join('\n'),
    /content-security-policy \(script-src expected "'self' https:\/\/static\.cloudflareinsights\.com/
  );
  assert.match(inspection.invalid.join('\n'), /referrer-policy/);
  assert.match(inspection.invalid.join('\n'), /x-frame-options/);
  assert.match(inspection.invalid.join('\n'), /permissions-policy/);
});

test('inspectPublicHtmlEdgeSurface flags disallowed public HTML script markers', async () => {
  const { inspectPublicHtmlEdgeSurface } = await loadModule();
  const inspection = inspectPublicHtmlEdgeSurface(`
    <!doctype html>
    <html>
      <body>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
        <script src="/cdn-cgi/scripts/7d0fa10a/cloudflare-static/rocket-loader.min.js"></script>
        <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
      </body>
    </html>
  `);

  assert.equal(inspection.ok, false);
  assert.deepEqual(inspection.findings, [
    'jsDelivr script reference',
    'Cloudflare Rocket Loader',
    'Cloudflare challenge platform',
  ]);
});

test('inspectPublicHtmlEdgeSurface flags inline Cloudflare insights bootstrap but allows the external beacon script', async () => {
  const { inspectPublicHtmlEdgeSurface, sanitizePublicHtmlEdgeSurface } = await loadModule();

  const inlineInspection = inspectPublicHtmlEdgeSurface(`
    <!doctype html>
    <html>
      <body>
        <script>
          window.__cfBeacon = "https://static.cloudflareinsights.com/beacon.min.js";
        </script>
      </body>
    </html>
  `);
  assert.equal(inlineInspection.ok, false);
  assert.deepEqual(inlineInspection.findings, ['Cloudflare inline insights bootstrap']);

  const externalInspection = inspectPublicHtmlEdgeSurface(`
    <!doctype html>
    <html>
      <body>
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token":"example"}'
        ></script>
      </body>
    </html>
  `);
  assert.equal(externalInspection.ok, true);
  assert.deepEqual(externalInspection.findings, []);

  const sanitized = sanitizePublicHtmlEdgeSurface(`
    <!doctype html>
    <html>
      <body>
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token":"example"}'
        ></script>
        <script>
          window.__CF$cv$params = { r: 'abc123' };
          var a = document.createElement('script');
          a.src = '/cdn-cgi/challenge-platform/scripts/jsd/main.js';
          document.head.appendChild(a);
        </script>
      </body>
    </html>
  `);
  assert.equal(sanitized.changed, true);
  assert.deepEqual(sanitized.findings, ['Cloudflare inline insights bootstrap']);
  assert.match(sanitized.html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.doesNotMatch(sanitized.html, /challenge-platform/);
  assert.doesNotMatch(sanitized.html, /__CF\$cv\$params/);
});
