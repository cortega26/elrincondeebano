const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const SERVICE_WORKER_PATH = path.join(__dirname, '..', 'service-worker.js');

const normalizeCacheKey = (req) => {
  if (!req) return '';
  if (typeof req === 'string') return req;
  if (typeof req.url === 'string') return req.url;
  return String(req);
};

const createCachesMock = () => {
  const stores = new Map();

  const open = async (name) => {
    if (!stores.has(name)) {
      stores.set(name, new Map());
    }
    const cacheStore = stores.get(name);
    return {
      put: async (req, res) => {
        cacheStore.set(normalizeCacheKey(req), res);
      },
      match: async (req) => cacheStore.get(normalizeCacheKey(req)) || null,
      delete: async (req) => cacheStore.delete(normalizeCacheKey(req)),
      keys: async () => Array.from(cacheStore.keys()),
    };
  };

  const match = async (req) => {
    const key = normalizeCacheKey(req);
    for (const cacheStore of stores.values()) {
      if (cacheStore.has(key)) {
        return cacheStore.get(key);
      }
    }
    return null;
  };

  const keys = async () => Array.from(stores.keys());
  const deleteCache = async (name) => stores.delete(name);

  return {
    stores,
    open,
    match,
    keys,
    delete: deleteCache,
  };
};

const loadServiceWorkerRuntime = ({ fetchImpl, cachesImpl, origin = 'https://example.com' }) => {
  const events = new Map();
  const self = {
    location: { origin },
    addEventListener: (type, handler) => {
      events.set(type, handler);
    },
    skipWaiting: () => {
      self.__skipWaitingCalled = true;
    },
    clients: {
      claim: () => {
        self.__claimed = true;
      },
    },
  };

  global.__SW_RUNTIME_TEST__ = true;
  global.self = self;
  global.caches = cachesImpl;
  global.fetch = fetchImpl;
  global.crypto = { randomUUID: () => 'uuid-1' };

  delete require.cache[SERVICE_WORKER_PATH];
  require(SERVICE_WORKER_PATH);

  const cleanup = () => {
    delete global.__SW_RUNTIME_TEST__;
    delete global.self;
    delete global.caches;
    delete global.fetch;
    delete global.crypto;
    delete require.cache[SERVICE_WORKER_PATH];
  };

  return { events, self, cleanup };
};

test('service worker install caches static assets and manifest files', async () => {
  const fetchCalls = [];
  const caches = createCachesMock();
  const fetchImpl = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    fetchCalls.push(url);
    if (url === '/asset-manifest.json') {
      return new Response(JSON.stringify({ files: ['/dist/js/script.min.js'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('ok', { status: 200 });
  };

  const { events, cleanup } = loadServiceWorkerRuntime({ fetchImpl, cachesImpl: caches });
  const installHandler = events.get('install');
  let installPromise;
  installHandler({
    waitUntil: (promise) => {
      installPromise = promise;
    },
  });

  await installPromise;
  cleanup();

  assert.ok(caches.stores.has('ebano-static-v6'));
  const staticCache = caches.stores.get('ebano-static-v6');
  assert.ok(staticCache.size > 0);
  assert.ok(fetchCalls.includes('/asset-manifest.json'));
});

test('service worker activation removes stale caches', async () => {
  const caches = createCachesMock();
  await caches.open('ebano-static-v6');
  await caches.open('legacy-cache');

  const { events, self, cleanup } = loadServiceWorkerRuntime({
    fetchImpl: async () => new Response('ok', { status: 200 }),
    cachesImpl: caches,
  });

  const activateHandler = events.get('activate');
  let activatePromise;
  activateHandler({
    waitUntil: (promise) => {
      activatePromise = promise;
    },
  });

  await activatePromise;
  assert.ok(caches.stores.has('ebano-static-v6'));
  assert.ok(!caches.stores.has('legacy-cache'));
  assert.strictEqual(self.__claimed, true);
  cleanup();
});

test('service worker fetch handles navigation fallback from cache', async () => {
  const caches = createCachesMock();
  const staticCache = await caches.open('ebano-static-v6');
  await staticCache.put('/index.html', new Response('cached-home', { status: 200 }));

  const { events, cleanup } = loadServiceWorkerRuntime({
    fetchImpl: async () => {
      throw new Error('offline');
    },
    cachesImpl: caches,
  });

  const fetchHandler = events.get('fetch');
  let responsePromise;
  fetchHandler({
    request: {
      url: 'https://example.com/page',
      method: 'GET',
      mode: 'navigate',
      headers: new Headers(),
    },
    respondWith: (promise) => {
      responsePromise = promise;
    },
  });

  const response = await responsePromise;
  assert.strictEqual(await response.text(), 'cached-home');
  cleanup();
});

test('service worker fetch bypasses cache and serves image fallback', async () => {
  const caches = createCachesMock();
  const staticCache = await caches.open('ebano-static-v6');
  await staticCache.put(
    '/assets/images/web/placeholder.svg',
    new Response('placeholder', { status: 200 })
  );

  const { events, cleanup } = loadServiceWorkerRuntime({
    fetchImpl: async () => {
      throw new Error('network down');
    },
    cachesImpl: caches,
  });

  const fetchHandler = events.get('fetch');
  let responsePromise;
  fetchHandler({
    request: {
      url: 'https://example.com/secure.png',
      method: 'GET',
      mode: 'cors',
      destination: 'image',
      headers: new Headers({ accept: 'image/png', authorization: 'Bearer token' }),
    },
    respondWith: (promise) => {
      responsePromise = promise;
    },
  });

  const response = await responsePromise;
  assert.strictEqual(await response.text(), 'placeholder');
  cleanup();
});

test('service worker returns cached response when network fails', async () => {
  const caches = createCachesMock();
  const staticCache = await caches.open('ebano-static-v6');
  const requestUrl = 'https://example.com/dist/css/style.min.css';
  await staticCache.put(requestUrl, new Response('cached-css', { status: 200 }));

  const { events, cleanup } = loadServiceWorkerRuntime({
    fetchImpl: async () => {
      throw new Error('offline');
    },
    cachesImpl: caches,
  });

  const fetchHandler = events.get('fetch');
  let responsePromise;
  fetchHandler({
    request: {
      url: requestUrl,
      method: 'GET',
      mode: 'cors',
      headers: new Headers(),
    },
    respondWith: (promise) => {
      responsePromise = promise;
    },
  });

  const response = await responsePromise;
  assert.strictEqual(await response.text(), 'cached-css');
  cleanup();
});

test('service worker message handler supports skip waiting and cache invalidation', async () => {
  const caches = createCachesMock();
  const productsCache = await caches.open('ebano-products-v5');
  await productsCache.put('/data/product_data.json', new Response('data', { status: 200 }));

  const { events, self, cleanup } = loadServiceWorkerRuntime({
    fetchImpl: async () => new Response('ok', { status: 200 }),
    cachesImpl: caches,
  });

  const messageHandler = events.get('message');
  messageHandler({ data: { type: 'SKIP_WAITING' } });
  assert.strictEqual(self.__skipWaitingCalled, true);

  const port = { messages: [], postMessage: (msg) => port.messages.push(msg) };
  messageHandler({ data: { type: 'INVALIDATE_PRODUCT_CACHE' }, ports: [port] });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(port.messages[0].success, true);
  assert.strictEqual((await productsCache.keys()).length, 0);
  cleanup();
});
