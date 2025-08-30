import test from 'node:test';
import assert from 'node:assert';
import { invalidateCache, invalidateAllCaches, CACHE_CONFIG } from '../service-worker.js';

function createCachesMock() {
  const stores = new Map();
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name);
      return {
        put: async (req, res) => { cache.set(req, res); },
        delete: async (req) => cache.delete(req),
        keys: async () => Array.from(cache.keys())
      };
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name)
  };
}

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

  assert.deepStrictEqual((await caches.keys()).sort(), [staticPrefix, dynamicPrefix, unrelated].sort());

  await invalidateAllCaches();

  assert.deepStrictEqual(await caches.keys(), [unrelated]);
});
