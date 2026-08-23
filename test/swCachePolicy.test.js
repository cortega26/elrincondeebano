const assert = require('node:assert');
const path = require('node:path');
const { isNoStoreResponse, shouldSkipCache, CACHE_CONFIG } = require('../service-worker.js');

const SERVICE_WORKER_PATH = path.join(__dirname, '..', 'service-worker.js');

const createTimestampedResponse = (body, { status = 200, type = 'static', headers = {} } = {}) =>
  new Response(body, {
    status,
    headers: {
      ...headers,
      'sw-timestamp': Date.now().toString(),
      'cache-type': type,
    },
  });

const normalizeCacheKey = (req) => {
  if (!req) return '';
  if (typeof req === 'string') return req;
  if (typeof req.url === 'string') return req.url;
  return String(req);
};

const createRuntimeCachesMock = () => {
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
  Object.defineProperty(global, 'crypto', {
    value: { randomUUID: () => 'uuid-1' },
    configurable: true,
    writable: true,
  });

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

test('shouldSkipCache skips admin panel paths', () => {
  const request = new Request('https://example.com/admin-panel/index.html');
  const url = new URL(request.url);
  assert.strictEqual(shouldSkipCache(request, url), true);
});

test('shouldSkipCache skips requests with Authorization header', () => {
  const request = new Request('https://example.com/data/product_data.json', {
    headers: { Authorization: 'Bearer token' },
  });
  const url = new URL(request.url);
  assert.strictEqual(shouldSkipCache(request, url), true);
});

test('shouldSkipCache allows public requests', () => {
  const request = new Request('https://example.com/assets/images/web/logo.webp');
  const url = new URL(request.url);
  assert.strictEqual(shouldSkipCache(request, url), false);
});

test('isNoStoreResponse detects cache-control no-store', () => {
  const response = new Response('data', {
    headers: { 'Cache-Control': 'public, no-store' },
  });
  assert.strictEqual(isNoStoreResponse(response), true);
});

test('isNoStoreResponse ignores cache-control without no-store', () => {
  const response = new Response('data', {
    headers: { 'Cache-Control': 'max-age=3600' },
  });
  assert.strictEqual(isNoStoreResponse(response), false);
});

test('product_data.json remains network-first even when cached fresh', async () => {
  const caches = createRuntimeCachesMock();
  const requestUrl = 'https://example.com/data/product_data.json';
  await (
    await caches.open(CACHE_CONFIG.prefixes.products)
  ).put(requestUrl, createTimestampedResponse('cached-products', { type: 'products' }));

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('network-products', { status: 200 });
  };

  const { events, cleanup } = loadServiceWorkerRuntime({
    fetchImpl,
    cachesImpl: caches,
  });

  try {
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
    assert.strictEqual(await response.text(), 'network-products');
    assert.strictEqual(fetchCalls, 1);
  } finally {
    cleanup();
  }
});

test('product_data.json falls back to cache when network fails and cached fresh', async () => {
  const caches = createRuntimeCachesMock();
  const requestUrl = 'https://example.com/data/product_data.json';
  await (
    await caches.open(CACHE_CONFIG.prefixes.products)
  ).put(requestUrl, createTimestampedResponse('cached-products-fallback', { type: 'products' }));

  const fetchImpl = async () => {
    throw new Error('offline');
  };

  const { events, cleanup } = loadServiceWorkerRuntime({
    fetchImpl,
    cachesImpl: caches,
  });

  try {
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
    assert.strictEqual(await response.text(), 'cached-products-fallback');
  } finally {
    cleanup();
  }
});

test('static assets: isNoStoreResponse cached entry is purged and fetched from network', async () => {
  const caches = createRuntimeCachesMock();
  const requestUrl = 'https://example.com/assets/images/products/nostore.jpg';
  const noStoreCached = new Response('cached-nostore', {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'sw-timestamp': Date.now().toString(),
      'cache-type': 'dynamic',
    },
  });
  await (await caches.open(CACHE_CONFIG.prefixes.dynamic)).put(requestUrl, noStoreCached);

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('network-after-purge', { status: 200 });
  };

  const { events, cleanup } = loadServiceWorkerRuntime({
    fetchImpl,
    cachesImpl: caches,
  });

  try {
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
    assert.strictEqual(await response.text(), 'network-after-purge');
    assert.strictEqual(fetchCalls, 1);
  } finally {
    cleanup();
  }
});
