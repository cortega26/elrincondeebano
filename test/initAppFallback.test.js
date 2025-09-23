const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

function setupMinimalDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><main></main></body></html>', {
    url: 'https://example.com/404'
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.CustomEvent = dom.window.CustomEvent;
  global.IntersectionObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  return dom;
}

test('initApp resolves when essential catalog nodes are missing', async () => {
  setupMinimalDom();
  const { initApp } = await import('../src/js/script.mjs');

  assert.ok(initApp, 'initApp should be exported');
  await assert.doesNotReject(() => initApp());
});
