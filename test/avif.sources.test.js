const test = require('node:test');
const assert = require('node:assert');

(async () => {
  global.console = { log() {}, warn() {}, error() {} };

  const documentMock = {
    readyState: 'loading',
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() {
      return {
        setAttribute() {},
        appendChild() {},
        remove() {},
        querySelector() { return null; },
        classList: { add() {}, remove() {}, toggle() {} },
      };
    },
    createTextNode(text) {
      return { textContent: text };
    },
    body: {
      appendChild() {},
      contains() { return false; },
      classList: { add() {}, remove() {}, contains() { return false; } },
    },
  };

  const serviceWorkerMock = {
    register: async () => ({ addEventListener() {}, installing: null, active: null }),
    addEventListener() {},
    controller: null,
  };

  const windowMock = {
    addEventListener() {},
    removeEventListener() {},
    navigator: { serviceWorker: serviceWorkerMock, onLine: true },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {},
      clear() {},
    },
    location: { hostname: 'example.com', search: '' },
    document: documentMock,
  };

  documentMock.defaultView = windowMock;

  global.window = windowMock;
  global.document = documentMock;
  global.localStorage = windowMock.localStorage;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: windowMock.navigator,
  });

  const {
    __resolveAvifSrcsetForTest,
    __buildStaticSrcsetForTest,
  } = await import('../src/js/script.mjs');

  test('resolveAvifSrcset returns normalized static path for AVIF asset', () => {
    const srcset = __resolveAvifSrcsetForTest('assets/images/sample.avif');
    assert.strictEqual(srcset, '/assets/images/sample.avif');
  });

  test('resolveAvifSrcset keeps Cloudflare resizing for non-AVIF assets', () => {
    const srcset = __resolveAvifSrcsetForTest('assets/images/sample.webp');
    assert.ok(srcset.startsWith('/cdn-cgi/image/'), 'should rewrite through Cloudflare');
    assert.ok(srcset.includes('format=avif'), 'should request AVIF format from Cloudflare');
    assert.ok(srcset.includes('200w'), 'should include width descriptor for responsive images');
  });

  test('resolveAvifSrcset supports static variant arrays', () => {
    const srcset = __resolveAvifSrcsetForTest([
      { src: 'assets/images/sample-200.avif', width: 200 },
      { src: 'assets/images/sample-400.avif', width: 400 },
    ]);
    assert.strictEqual(
      srcset,
      '/assets/images/sample-200.avif 200w, /assets/images/sample-400.avif 400w',
    );
  });

  test('resolveAvifSrcset reads AVIF source details from objects', () => {
    const srcset = __resolveAvifSrcsetForTest({ src: 'assets/images/object.avif', width: 320 });
    assert.strictEqual(srcset, '/assets/images/object.avif 320w');
  });

  test('buildStaticSrcset preserves explicit srcset strings', () => {
    const srcset = __buildStaticSrcsetForTest({ srcset: 'images/a.avif 1x, images/b.avif 2x' });
    assert.strictEqual(srcset, 'images/a.avif 1x, images/b.avif 2x');
  });
})();
