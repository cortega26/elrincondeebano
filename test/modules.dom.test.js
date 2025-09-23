const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(relPath) {
  const filePath = path.join(__dirname, relPath);
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, 'exports.$2 = $1function $2');
  const exports = {};
  const wrapper = new Function('exports', code + '\nreturn exports;');
  return wrapper(exports);
}

test('setupNavigationAccessibility toggles class and inserts style', () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;

  const { setupNavigationAccessibility } = loadModule('../src/js/modules/a11y.js');

  setupNavigationAccessibility();

  const styleEl = document.querySelector('style');
  assert.ok(styleEl, 'style element should be inserted');

  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab' }));
  assert.ok(document.body.classList.contains('keyboard-navigation'), 'class should be added on Tab');

  document.dispatchEvent(new dom.window.MouseEvent('mousedown'));
  assert.ok(!document.body.classList.contains('keyboard-navigation'), 'class should be removed on mouse click');
});

test('injectPwaManifest adds link only once', () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;

  const { injectPwaManifest } = loadModule('../src/js/modules/pwa.js');

  injectPwaManifest();
  assert.strictEqual(document.querySelectorAll('link[rel="manifest"]').length, 1, 'manifest link inserted');
  injectPwaManifest();
  assert.strictEqual(document.querySelectorAll('link[rel="manifest"]').length, 1, 'manifest link should not duplicate');
});

test('injectStructuredData and injectSeoMetadata insert expected elements', async () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', { url: 'https://example.com/path' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ products: [] }) };
  };

  window.__PRODUCT_DATA__ = {
    products: [
      {
        id: 'p-1',
        name: 'Producto 1',
        description: 'Descripción breve',
        price: 1200,
        stock: true,
        category: 'General',
        image_path: '/assets/producto-1.webp',
        brand: 'Marca Uno'
      }
    ]
  };

  const { injectStructuredData, injectSeoMetadata } = loadModule('../src/js/modules/seo.js');

  await injectStructuredData();
  injectSeoMetadata();

  assert.strictEqual(fetchCalled, false, 'should use shared product data without fetching');
  assert.ok(document.querySelector('script[type="application/ld+json"]'), 'structured data script inserted');
  assert.ok(window.__PRODUCT_DATA__.structuredDataInjected, 'shared data should record structured data injection');
  await injectStructuredData();
  assert.strictEqual(document.querySelectorAll('script[type="application/ld+json"]').length, 1, 'structured data script should not duplicate');
  assert.ok(document.querySelector('link[rel="canonical"]'), 'canonical link inserted');
  assert.ok(document.querySelector('meta[name="description"]'), 'description meta inserted');
});

