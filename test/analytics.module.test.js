const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(relPath) {
  const filePath = path.join(__dirname, relPath);
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, 'exports.$2 = $1function $2');
  code = code.replace(/export\s+\{([^}]+)\};?/g, (_, names) => {
    return names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => `exports.${name} = ${name};`)
      .join('\n');
  });
  const exports = {};
  const wrapper = new Function('exports', code + '\nreturn exports;');
  return wrapper(exports);
}

test('initializeAnalytics bootstraps dataLayer and gtag script once', () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', { url: 'https://elrincondeebano.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  dom.window.__CSP_NONCE__ = 'nonce-test';

  const analytics = loadModule('../src/js/modules/analytics.js');

  assert.strictEqual(
    dom.window.document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js?id="]').length,
    0
  );

  analytics.initializeAnalytics();

  const scripts = dom.window.document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js?id="]');
  assert.strictEqual(scripts.length, 1);
  assert.strictEqual(scripts[0].getAttribute('nonce'), 'nonce-test');
  assert.strictEqual(typeof dom.window.gtag, 'function');

  const calls = dom.window.dataLayer;
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0][0], 'js');
  assert.ok(calls[0][1] instanceof dom.window.Date);
  assert.strictEqual(calls[1][0], 'config');
  assert.strictEqual(calls[1][1], 'G-H0YG3RTJVM');

  scripts[0].dispatchEvent(new dom.window.Event('load'));
  assert.strictEqual(dom.window.dataLayer.length, 2, 'load event should not duplicate config');

  analytics.initializeAnalytics();
  assert.strictEqual(dom.window.dataLayer.length, 2, 'initializer should be idempotent');
  assert.strictEqual(
    dom.window.document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js?id="]').length,
    1
  );

  delete global.window;
  delete global.document;
});
