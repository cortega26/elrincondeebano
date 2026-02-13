const test = require('node:test');
const assert = require('node:assert');

let fetchWithRetry, lastUrl, fetchCalls;

(async () => {
  global.console = { log() {}, warn() {}, error() {} };
  const location = {
    origin: 'https://example.com',
    hostname: 'example.com',
    search: '',
    reload() {},
  };
  global.window = {
    location,
    addEventListener() {},
  };
  global.document = {
    addEventListener() {},
    createElement: () => ({
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
      querySelector() {
        return { addEventListener() {} };
      },
      remove() {},
    }),
    createTextNode: (text) => ({ textContent: text }),
    getElementById: () => null,
    body: {
      appendChild() {},
      contains() {
        return false;
      },
    },
  };

  ({ fetchWithRetry } = await import('../src/js/script.mjs'));

  function mockFetch(url) {
    lastUrl = url;
    fetchCalls++;
    return Promise.resolve({ ok: true, status: 200 });
  }

  function resetFetch(impl) {
    fetchCalls = 0;
    global.fetch = impl;
  }

  const noopFetch = () => {
    fetchCalls++;
    return Promise.resolve({ ok: true, status: 200 });
  };

  function setLocation({ origin, hostname, search = '' }) {
    location.origin = origin;
    location.hostname = hostname;
    location.search = search;
  }

  async function expectReject(url) {
    resetFetch(noopFetch);
    await assert.rejects(fetchWithRetry(url, {}, 0, 0, 'cid'), /same-origin HTTPS/);
    assert.strictEqual(fetchCalls, 0);
  }

  test('fetchWithRetry URL validation', async (t) => {
    await t.test('accepts same-origin https path', async () => {
      resetFetch(mockFetch);
      await fetchWithRetry('/data', {}, 0, 0, 'cid');
      assert.strictEqual(lastUrl, 'https://example.com/data');
      assert.strictEqual(fetchCalls, 1);
    });

    await t.test('rejects external origin', async () => {
      await expectReject('https://evil.com/data');
    });

    await t.test('rejects non-HTTPS protocol', async () => {
      await expectReject('http://example.com/data');
    });

    await t.test('rejects localhost http without explicit allow', async () => {
      setLocation({ origin: 'http://localhost:3000', hostname: 'localhost' });
      delete global.window.__ALLOW_LOCALHOST_HTTP__;
      await expectReject('/data');
    });

    await t.test('allows localhost http when explicitly enabled', async () => {
      resetFetch(mockFetch);
      setLocation({ origin: 'http://localhost:3000', hostname: 'localhost' });
      global.window.__ALLOW_LOCALHOST_HTTP__ = true;
      await fetchWithRetry('/data', {}, 0, 0, 'cid');
      assert.strictEqual(lastUrl, 'http://localhost:3000/data');
      assert.strictEqual(fetchCalls, 1);
      delete global.window.__ALLOW_LOCALHOST_HTTP__;
    });

    await t.test('returns structured ProductDataError details on HTTP failure', async () => {
      setLocation({ origin: 'https://example.com', hostname: 'example.com' });
      resetFetch(() => Promise.resolve({ ok: false, status: 503 }));
      await assert.rejects(
        fetchWithRetry('/data', {}, 0, 0, 'cid'),
        (error) => {
          assert.strictEqual(error.name, 'ProductDataError');
          assert.strictEqual(error.code, 'PRODUCT_DATA_HTTP_ERROR');
          assert.strictEqual(error.correlationId, 'cid');
          assert.strictEqual(error.context.status, 503);
          return true;
        }
      );
    });
  });
})();
