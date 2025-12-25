const test = require('node:test');
const assert = require('node:assert');

(async () => {
  const originalWindow = global.window;
  const originalDocument = global.document;

  const setWindow = ({ origin, hostname, search = '' } = {}) => {
    const location = { origin, hostname, search };
    global.window = {
      location,
      __DATA_BASE_URL__: undefined,
      __ALLOW_CROSS_ORIGIN_DATA__: undefined,
      __DATA_ORIGIN_ALLOWLIST__: undefined,
      __ALLOW_LOCALHOST_HTTP__: undefined,
    };
    global.document = {
      querySelector: () => null,
    };
    return location;
  };

  const { resolveProductDataUrl, validateProductDataUrl } = await import(
    '../src/js/utils/data-endpoint.mjs'
  );

  test('resolveProductDataUrl builds same-origin URLs', () => {
    setWindow({ origin: 'https://example.com', hostname: 'example.com' });
    const url = resolveProductDataUrl({ version: 'v1' });
    assert.strictEqual(url, 'https://example.com/data/product_data.json?v=v1');
  });

  test('resolveProductDataUrl honors base URL override', () => {
    setWindow({ origin: 'https://example.com', hostname: 'example.com' });
    global.window.__DATA_BASE_URL__ = '/custom';
    const url = resolveProductDataUrl();
    assert.strictEqual(url, 'https://example.com/custom/data/product_data.json');
  });

  test('validateProductDataUrl blocks cross-origin by default', () => {
    setWindow({ origin: 'https://example.com', hostname: 'example.com' });
    assert.throws(
      () => validateProductDataUrl('https://evil.com/data/product_data.json'),
      /same-origin HTTPS/
    );
  });

  test('validateProductDataUrl allows cross-origin with allowlist', () => {
    setWindow({ origin: 'https://example.com', hostname: 'example.com' });
    global.window.__ALLOW_CROSS_ORIGIN_DATA__ = true;
    global.window.__DATA_ORIGIN_ALLOWLIST__ = 'evil.com';
    const url = validateProductDataUrl('https://evil.com/data/product_data.json');
    assert.strictEqual(url, 'https://evil.com/data/product_data.json');
  });

  test('validateProductDataUrl allows localhost http only when explicitly enabled', () => {
    setWindow({ origin: 'http://localhost:3000', hostname: 'localhost' });
    assert.throws(
      () => validateProductDataUrl('http://localhost:3000/data/product_data.json'),
      /same-origin HTTPS/
    );
    global.window.__ALLOW_LOCALHOST_HTTP__ = true;
    const url = validateProductDataUrl('http://localhost:3000/data/product_data.json');
    assert.strictEqual(url, 'http://localhost:3000/data/product_data.json');
  });

  global.window = originalWindow;
  global.document = originalDocument;
})();
