'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../scripts/run-cypress.mjs');
}

test('resolveLocalProbeTarget allows only loopback hosts', async () => {
  const { resolveLocalProbeTarget } = await loadModule();

  assert.deepEqual(resolveLocalProbeTarget('http://127.0.0.1:4173'), {
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: '4173',
    pathname: '/index.html',
  });

  assert.deepEqual(resolveLocalProbeTarget('https://localhost:4444', 'healthz'), {
    protocol: 'https:',
    hostname: 'localhost',
    port: '4444',
    pathname: '/healthz',
  });

  assert.throws(
    () => resolveLocalProbeTarget('https://example.com:4173'),
    /must point to a loopback host/
  );
  assert.throws(
    () => resolveLocalProbeTarget('ftp://127.0.0.1:4173'),
    /Unsupported Cypress baseUrl protocol/
  );
  assert.throws(
    () => resolveLocalProbeTarget('http://user:pass@127.0.0.1:4173'),
    /must not include credentials/
  );
});
