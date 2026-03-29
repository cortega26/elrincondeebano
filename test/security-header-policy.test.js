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
    /content-security-policy \(script-src expected "'self' https:\/\/static\.cloudflareinsights\.com"\)/
  );
  assert.match(inspection.invalid.join('\n'), /referrer-policy/);
  assert.match(inspection.invalid.join('\n'), /x-frame-options/);
  assert.match(inspection.invalid.join('\n'), /permissions-policy/);
});
