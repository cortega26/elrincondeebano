const test = require('node:test');
const assert = require('node:assert');

(async () => {
  const store = new Map();
  global.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };

  const {
    __normalizeProductVersionForTest: normalizeProductVersion,
    __getStoredProductVersionForTest: getStoredProductVersion,
    __setStoredProductVersionForTest: setStoredProductVersion,
  } = await import('../src/js/script.mjs');

  test('normalizeProductVersion rejects invalid values', async (t) => {
    await t.test('rejects non-strings and empty strings', () => {
      assert.strictEqual(normalizeProductVersion(), null);
      assert.strictEqual(normalizeProductVersion(null), null);
      assert.strictEqual(normalizeProductVersion(''), null);
      assert.strictEqual(normalizeProductVersion('   '), null);
    });

    await t.test('rejects undefined/null string tokens', () => {
      assert.strictEqual(normalizeProductVersion('undefined'), null);
      assert.strictEqual(normalizeProductVersion('null'), null);
      assert.strictEqual(normalizeProductVersion(' Undefined '), null);
      assert.strictEqual(normalizeProductVersion(' NULL '), null);
    });

    await t.test('trims and preserves valid strings', () => {
      assert.strictEqual(normalizeProductVersion('v1'), 'v1');
      assert.strictEqual(normalizeProductVersion('  v2  '), 'v2');
    });
  });

  test('setStoredProductVersion ignores invalid values', () => {
    setStoredProductVersion('undefined');
    assert.strictEqual(getStoredProductVersion(), null);
    assert.strictEqual(store.has('productDataVersion'), false);

    setStoredProductVersion('  ');
    assert.strictEqual(getStoredProductVersion(), null);
    assert.strictEqual(store.has('productDataVersion'), false);
  });

  test('getStoredProductVersion clears invalid stored values', () => {
    store.set('productDataVersion', 'null');
    assert.strictEqual(getStoredProductVersion(), null);
    assert.strictEqual(store.has('productDataVersion'), false);
  });

  test('setStoredProductVersion stores normalized values', () => {
    setStoredProductVersion('  v3  ');
    assert.strictEqual(getStoredProductVersion(), 'v3');
    assert.strictEqual(store.get('productDataVersion'), 'v3');
  });
})();
