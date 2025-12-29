const test = require('node:test');
const assert = require('node:assert');
const { setupAppDom, teardownAppDom } = require('./helpers/dom-test-utils');

test('initApp resolves when essential catalog nodes are missing', async () => {
  setupAppDom('<!DOCTYPE html><html><body><main></main></body></html>', {
    url: 'https://example.com/404',
  });
  const { initApp } = await import('../src/js/script.mjs');

  assert.ok(initApp, 'initApp should be exported');
  await assert.doesNotReject(() => initApp());

  teardownAppDom();
});
