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

  test('fetchWithRetry URL validation', async (t) => {
    await t.test('accepts same-origin https path', async () => {
      fetchCalls = 0;
      global.fetch = mockFetch;
      await fetchWithRetry('/data', {}, 0, 0, 'cid');
      assert.strictEqual(lastUrl, 'https://example.com/data');
      assert.strictEqual(fetchCalls, 1);
    });

    await t.test('rejects external origin', async () => {
      fetchCalls = 0;
      global.fetch = () => {
        fetchCalls++;
        return Promise.resolve({ ok: true, status: 200 });
      };
      await assert.rejects(
        fetchWithRetry('https://evil.com/data', {}, 0, 0, 'cid'),
        /same-origin HTTPS/
      );
      assert.strictEqual(fetchCalls, 0);
    });

    await t.test('rejects non-HTTPS protocol', async () => {
      fetchCalls = 0;
      global.fetch = () => {
        fetchCalls++;
        return Promise.resolve({ ok: true, status: 200 });
      };
      await assert.rejects(
        fetchWithRetry('http://example.com/data', {}, 0, 0, 'cid'),
        /same-origin HTTPS/
      );
      assert.strictEqual(fetchCalls, 0);
    });

    await t.test('rejects localhost http without explicit allow', async () => {
      fetchCalls = 0;
      global.fetch = () => {
        fetchCalls++;
        return Promise.resolve({ ok: true, status: 200 });
      };
      location.origin = 'http://localhost:3000';
      location.hostname = 'localhost';
      location.search = '';
      delete global.window.__ALLOW_LOCALHOST_HTTP__;
      await assert.rejects(fetchWithRetry('/data', {}, 0, 0, 'cid'), /same-origin HTTPS/);
      assert.strictEqual(fetchCalls, 0);
    });

    await t.test('allows localhost http when explicitly enabled', async () => {
      fetchCalls = 0;
      global.fetch = mockFetch;
      location.origin = 'http://localhost:3000';
      location.hostname = 'localhost';
      location.search = '';
      global.window.__ALLOW_LOCALHOST_HTTP__ = true;
      await fetchWithRetry('/data', {}, 0, 0, 'cid');
      assert.strictEqual(lastUrl, 'http://localhost:3000/data');
      assert.strictEqual(fetchCalls, 1);
      delete global.window.__ALLOW_LOCALHOST_HTTP__;
    });
  });
})();
