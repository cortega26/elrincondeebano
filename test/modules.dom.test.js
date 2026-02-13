const test = require('node:test');
const assert = require('node:assert');
const { createModuleLoader } = require('./helpers/module-loader');
const {
  ensureFileGlobal,
  setupDom,
  teardownDom,
} = require('./helpers/dom-test-utils');

ensureFileGlobal();

const loadModule = createModuleLoader(__dirname, {
  importMap: {
    '../utils/data-endpoint.mjs': {
      resolveProductDataUrl: () => '/data/product_data.json',
    },
  },
  transform: (code) =>
    code.replace(
      /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"];?/g,
      (_match, imports, specifier) =>
        `const { ${imports.trim()} } = (__imports[${JSON.stringify(specifier)}] || {});`
    ),
});

test('setupNavigationAccessibility toggles class and inserts style', () => {
  setupDom('<!DOCTYPE html><head></head><body></body>');

  const { setupNavigationAccessibility } = loadModule('../src/js/modules/a11y.js');

  setupNavigationAccessibility();

  const styleEl = document.querySelector('style');
  assert.ok(styleEl, 'style element should be inserted');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab' }));
  assert.ok(
    document.body.classList.contains('keyboard-navigation'),
    'class should be added on Tab'
  );

  document.dispatchEvent(new window.MouseEvent('mousedown'));
  assert.ok(
    !document.body.classList.contains('keyboard-navigation'),
    'class should be removed on mouse click'
  );

  teardownDom();
});

test('injectPwaManifest adds link only once', () => {
  setupDom('<!DOCTYPE html><head></head><body></body>');

  const { injectPwaManifest } = loadModule('../src/js/modules/pwa.js');

  injectPwaManifest();
  assert.strictEqual(
    document.querySelectorAll('link[rel="manifest"]').length,
    1,
    'manifest link inserted'
  );
  injectPwaManifest();
  assert.strictEqual(
    document.querySelectorAll('link[rel="manifest"]').length,
    1,
    'manifest link should not duplicate'
  );

  teardownDom();
});

test('injectStructuredData and injectSeoMetadata insert expected elements', async () => {
  setupDom('<!DOCTYPE html><head></head><body></body>', {
    url: 'https://example.com/path',
  });
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
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
        brand: 'Marca Uno',
      },
    ],
  };

  const { injectStructuredData, injectSeoMetadata } = loadModule('../src/js/modules/seo.js');

  await injectStructuredData();
  injectSeoMetadata();

  assert.strictEqual(fetchCalled, false, 'should use shared product data without fetching');
  assert.ok(
    document.querySelector('script[type="application/ld+json"]'),
    'structured data script inserted'
  );
  const structuredDataText = document.querySelector('script[type="application/ld+json"]')?.textContent;
  assert.ok(
    structuredDataText && structuredDataText.includes('"url":"https://www.elrincondeebano.com/"'),
    'structured data Store URL should use HTTPS'
  );
  assert.ok(
    window.__PRODUCT_DATA__.structuredDataInjected,
    'shared data should record structured data injection'
  );
  await injectStructuredData();
  assert.strictEqual(
    document.querySelectorAll('script[type="application/ld+json"]').length,
    1,
    'structured data script should not duplicate'
  );
  assert.ok(document.querySelector('link[rel="canonical"]'), 'canonical link inserted');
  assert.ok(document.querySelector('meta[name="description"]'), 'description meta inserted');

  delete global.fetch;
  delete global.localStorage;
  teardownDom();
});
