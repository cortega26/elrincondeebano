'use strict';

const assert = require('node:assert/strict');
const { SECRET_PATTERNS, scanContent } = require('../tools/guardrails/secret-scan.mjs');

// Samples are assembled at runtime by concatenation so this file never holds
// a complete credential literal (the scan itself runs over tracked files).
const SAMPLES = {
  'private-key': ['-----BEGIN ', 'RSA PRIVATE KEY', '-----'].join(''),
  'github-token': ['gh', 'p_', 'A'.repeat(36)].join(''),
  'npm-token': ['np', 'm_', 'A'.repeat(36)].join(''),
  'aws-access-key': ['AK', 'IA', 'A'.repeat(16)].join(''),
  'google-api-key': ['AI', 'za', 'A'.repeat(35)].join(''),
  'stripe-secret': ['sk', '_', 'live_', 'A'.repeat(16)].join(''),
  'slack-token': ['xo', 'x', 'b-', 'A'.repeat(10)].join(''),
  'cloudflare-api-token': ['cf', '_', 'token', ' = "', 'A'.repeat(40), '"'].join(''),
  'generic-secret-assignment': ['api', '_', 'key', ' = "', 'A'.repeat(20), '"'].join(''),
  'jwt-token': ['ey', 'J', 'A'.repeat(10), '.', 'B'.repeat(10), '.', 'C'.repeat(10)].join(''),
  'bearer-token-literal': ['Bearer', ' ', 'A'.repeat(24)].join(''),
};

test('the secret scan has a positive control for every pattern', () => {
  const ids = SECRET_PATTERNS.map((pattern) => pattern.id);
  assert.deepEqual(
    Object.keys(SAMPLES).sort(),
    [...ids].sort(),
    'every SECRET_PATTERNS id must have a runtime-built sample'
  );

  for (const id of ids) {
    const findings = scanContent(SAMPLES[id], 'sample.txt');
    assert.ok(
      findings.some((finding) => finding.pattern === id),
      `pattern "${id}" did not detect its positive control: ${JSON.stringify(findings)}`
    );
  }
});

test('clean text produces no findings', () => {
  const findings = scanContent('const answer = 42;\n// nothing secret here\n', 'clean.txt');
  assert.deepEqual(findings, []);
});
