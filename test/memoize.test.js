const test = require('node:test');
const assert = require('node:assert');

(async () => {
  global.console = { log() {}, warn() {}, error() {} };

  const windowListeners = new Map();
  const documentMock = {
    readyState: 'loading',
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() {
      return {
        setAttribute() {},
        appendChild() {},
        remove() {},
        querySelector() { return null; },
        classList: { add() {}, remove() {}, toggle() {} }
      };
    },
    createTextNode(text) {
      return { textContent: text };
    },
    body: {
      appendChild() {},
      contains() { return false; }
    }
  };

  const windowMock = {
    addEventListener(event, handler) {
      windowListeners.set(event, handler);
    },
    removeEventListener() {},
    location: { reload() {} },
    document: documentMock
  };

  const serviceWorkerMock = {
    register: async () => ({ addEventListener() {}, installing: null, active: null }),
    addEventListener() {},
    controller: null
  };

  global.window = windowMock;
  global.document = documentMock;
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: serviceWorkerMock, onLine: true },
    configurable: true
  });
  windowMock.navigator = global.navigator;

  const { __memoizeForTest } = await import('../src/js/script.mjs');

  test('memoize caches results for identical inputs', () => {
    let calls = 0;
    const fn = (...args) => {
      calls += 1;
      return args.reduce((acc, value) => acc + Number(value || 0), 0);
    };
    const memoized = __memoizeForTest(fn, 5);
    const products = [{ id: 1 }, { id: 2 }];

    const first = memoized(products, 'chocolate', 'price-asc', true);
    const second = memoized(products, 'chocolate', 'price-asc', true);

    assert.strictEqual(first, second, 'cached result should be reused');
    assert.strictEqual(calls, 1, 'underlying function should only run once');
  });

  test('memoize differentiates object identities', () => {
    let calls = 0;
    const fn = () => {
      calls += 1;
      return calls;
    };
    const memoized = __memoizeForTest(fn, 5);

    memoized([{ id: 1 }], 'vino');
    memoized([{ id: 1 }], 'vino');

    assert.strictEqual(calls, 2, 'different array instances should not share cache entries');
  });

  test('memoize evicts least recently used entries', () => {
    let calls = 0;
    const fn = (value) => {
      calls += 1;
      return value;
    };
    const memoized = __memoizeForTest(fn, 1);

    memoized('a');
    memoized('b');
    memoized('a');

    assert.strictEqual(calls, 3, 'cache should evict oldest entry when size exceeded');
  });
})();
