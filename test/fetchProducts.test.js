const test = require('node:test');
const assert = require('node:assert');
const { MockAgent, setGlobalDispatcher, fetch: undiciFetch } = require('undici');

let fetchProducts, logs;

(async () => {
  logs = [];
  global.console = {
    log: msg => logs.push(msg),
    warn: msg => logs.push(msg),
    error: msg => logs.push(msg)
  };
  // Minimal DOM stubs for error handling paths
  global.window = { location: { origin: 'https://localhost', reload() {} }, addEventListener() {} };
  global.document = {
    addEventListener() {},
    createElement: () => ({
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
      querySelector() { return { addEventListener() {} }; },
      remove() {}
    }),
    createTextNode: text => ({ textContent: text }),
    getElementById: () => null,
    body: { appendChild() {}, contains() { return false; } }
  };

  ({ fetchProducts } = await import('../src/js/script.mjs'));

  // Mock fetch using undici's MockAgent
  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  const mockPool = mockAgent.get('https://localhost');

  global.fetch = (url, opts) => undiciFetch(new URL(url, 'https://localhost').toString(), opts);

  function setupLocalStorage(initial = {}) {
    const store = { ...initial };
    global.localStorage = {
      getItem: key => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = String(value); },
      removeItem: key => { delete store[key]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; }
    };
  }

  test('fetchProducts', async (t) => {
  await t.test('successful fetch without productDataVersion', async () => {
    setupLocalStorage();
    let path;
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply((opts) => {
        path = opts.path;
        return {
          statusCode: 200,
          data: JSON.stringify({ products: [] }),
          headers: { 'content-type': 'application/json' }
        };
      });
    const products = await fetchProducts();
    assert.deepStrictEqual(products, []);
    assert.strictEqual(path, '/data/product_data.json');
    mockAgent.assertNoPendingInterceptors();
  });

  await t.test('successful fetch with productDataVersion', async () => {
    const version = '123';
    setupLocalStorage({ productDataVersion: version });
    let path;
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply((opts) => {
        path = opts.path;
        return {
          statusCode: 200,
          data: JSON.stringify({ products: [] }),
          headers: { 'content-type': 'application/json' }
        };
      });
    const products = await fetchProducts();
    assert.deepStrictEqual(products, []);
    assert.ok(path.includes(`v=${encodeURIComponent(version)}`));
    mockAgent.assertNoPendingInterceptors();
  });

  await t.test('non-OK response throws', async () => {
    setupLocalStorage();
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(500, {});
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(500, {});
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(500, {});
    await assert.rejects(fetchProducts(), err => {
      assert.strictEqual(err.name, 'ProductDataError');
      assert.ok(/HTTP error/.test(err.message));
      return true;
    });
    mockAgent.assertNoPendingInterceptors();
  });

  await t.test('invalid JSON throws', async () => {
    setupLocalStorage();
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(200, 'not json', { headers: { 'content-type': 'application/json' } });
    await assert.rejects(fetchProducts(), err => {
      assert.strictEqual(err.name, 'ProductDataError');
      assert.ok(err.cause instanceof SyntaxError);
      return true;
    });
    mockAgent.assertNoPendingInterceptors();
  });

  await t.test('network failure throws', async () => {
    setupLocalStorage();
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .replyWithError(new Error('network failure'));
    await assert.rejects(fetchProducts(), err => {
      assert.strictEqual(err.name, 'ProductDataError');
      assert.ok(err.correlationId);
      return true;
    });
    mockAgent.assertNoPendingInterceptors();
  });

  await t.test('retries then succeeds', async () => {
    setupLocalStorage();
    logs.length = 0;
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(500, {});
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(200, JSON.stringify({ products: [] }), { headers: { 'content-type': 'application/json' } });
    const products = await fetchProducts();
    assert.deepStrictEqual(products, []);
    const warnLogs = logs.map(l => JSON.parse(l)).filter(l => l.level === 'warn');
    assert.ok(warnLogs.length >= 1);
    mockAgent.assertNoPendingInterceptors();
  });

  await t.test('logs structured error', async () => {
    setupLocalStorage();
    logs.length = 0;
    mockPool.intercept({ path: /^\/data\/product_data\.json/, method: 'GET' })
      .reply(500, {});
    await assert.rejects(fetchProducts());
    const parsed = logs.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    assert.ok(parsed.some(p => p.level === 'error' && p.correlationId));
    mockAgent.assertNoPendingInterceptors();
  });

    t.after(() => mockAgent.close());
  });
})().catch(err => {
  console.error(err);
  process.exit(1);
});
