const assert = require('node:assert');
const path = require('node:path');
const { invalidateCache, invalidateAllCaches, CACHE_CONFIG } = require('../service-worker.js');

function createCachesMock() {
  const stores = new Map();
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name);
      return {
        put: async (req, res) => {
          cache.set(req, res);
        },
        delete: async (req) => cache.delete(req),
        keys: async () => Array.from(cache.keys()),
      };
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name),
  };
}

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

test('invalidateCache deletes all entries for a specific cache', async () => {
  global.caches = createCachesMock();
  const cacheName = 'test-cache';
  const cache = await caches.open(cacheName);
  await cache.put('a', new Response('1'));
  await cache.put('b', new Response('2'));

  assert.strictEqual((await cache.keys()).length, 2);

  await invalidateCache(cacheName);

  assert.strictEqual((await cache.keys()).length, 0);
});

test('invalidateAllCaches removes only caches matching configured prefixes', async () => {
  global.caches = createCachesMock();
  const { static: staticPrefix, dynamic: dynamicPrefix } = CACHE_CONFIG.prefixes;
  const unrelated = 'unrelated-cache';

  await (await caches.open(staticPrefix)).put('a', new Response('1'));
  await (await caches.open(dynamicPrefix)).put('b', new Response('2'));
  await (await caches.open(unrelated)).put('c', new Response('3'));

  assert.deepStrictEqual(
    (await caches.keys()).sort(),
    [staticPrefix, dynamicPrefix, unrelated].sort()
  );

  await invalidateAllCaches();

  assert.deepStrictEqual(await caches.keys(), [unrelated]);
});

test('static assets served from cache on warm visits with background revalidation', async () => {
  const caches = createRuntimeCachesMock();
  const requestUrl = 'https://example.com/assets/images/products/warm.jpg';
  const cachedBody = 'cached-warm';
  await (
    await caches.open(CACHE_CONFIG.prefixes.dynamic)
  ).put(requestUrl, createTimestampedResponse(cachedBody, { type: 'dynamic' }));

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('network-warm', { status: 200 });
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
    assert.strictEqual(await response.text(), cachedBody);
    // background revalidation should have been triggered without blocking response
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.strictEqual(fetchCalls, 1);
    // cache should have been updated with network response (timestamped)
    const updated = await (await caches.open(CACHE_CONFIG.prefixes.dynamic)).match(requestUrl);
    assert.ok(updated);
    assert.strictEqual(updated.headers.get('cache-type'), 'dynamic');
  } finally {
    cleanup();
  }
});

test('cached stale static asset triggers network fetch and cache refresh', async () => {
  const caches = createRuntimeCachesMock();
  const requestUrl = 'https://example.com/assets/images/products/stale.jpg';
  const staleTimestamp = Date.now() - CACHE_CONFIG.duration.dynamic - 1000;
  const staleResponse = new Response('cached-stale', {
    status: 200,
    headers: {
      'sw-timestamp': staleTimestamp.toString(),
      'cache-type': 'dynamic',
    },
  });
  await (await caches.open(CACHE_CONFIG.prefixes.dynamic)).put(requestUrl, staleResponse);

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('network-fresh', { status: 200 });
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
    assert.strictEqual(await response.text(), 'network-fresh');
    assert.strictEqual(fetchCalls, 1);
    const updated = await (await caches.open(CACHE_CONFIG.prefixes.dynamic)).match(requestUrl);
    assert.ok(updated);
    assert.strictEqual(updated.headers.get('cache-type'), 'dynamic');
    assert.ok(updated.headers.get('sw-timestamp'));
  } finally {
    cleanup();
  }
});

test('uncached static asset does fetch and caches response', async () => {
  const caches = createRuntimeCachesMock();
  const requestUrl = 'https://example.com/assets/images/products/uncached.jpg';
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('network-uncached', { status: 200 });
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
    assert.strictEqual(await response.text(), 'network-uncached');
    assert.strictEqual(fetchCalls, 1);
    const cached = await (await caches.open(CACHE_CONFIG.prefixes.dynamic)).match(requestUrl);
    assert.ok(cached);
    assert.strictEqual(cached.headers.get('cache-type'), 'dynamic');
    assert.ok(cached.headers.get('sw-timestamp'));
  } finally {
    cleanup();
  }
});

test('navigation remains network-first even when cached fresh', async () => {
  const caches = createRuntimeCachesMock();
  const htmlCache = await caches.open(CACHE_CONFIG.prefixes.html);
  const requestUrl = 'https://example.com/page';
  await htmlCache.put(
    { url: requestUrl },
    createTimestampedResponse('cached-nav', { type: 'html' })
  );

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response('network-nav', { status: 200 });
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
        mode: 'navigate',
        headers: new Headers(),
      },
      respondWith: (promise) => {
        responsePromise = promise;
      },
    });

    const response = await responsePromise;
    assert.strictEqual(await response.text(), 'network-nav');
    assert.strictEqual(fetchCalls, 1);
  } finally {
    cleanup();
  }
});
