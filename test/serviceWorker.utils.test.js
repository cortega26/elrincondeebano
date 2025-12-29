const assert = require('assert');
const { addTimestamp, isCacheFresh, CACHE_CONFIG } = require('../service-worker.js');

(async () => {
  const resp = new Response('data');
  const stamped = await addTimestamp(resp.clone(), 'static');
  assert.ok(stamped.headers.get('sw-timestamp'), 'timestamp should be added');
  assert.strictEqual(stamped.headers.get('cache-type'), 'static');
  assert.strictEqual(isCacheFresh(stamped, 'static'), true, 'fresh response should be fresh');

  const headers = new Headers(stamped.headers);
  const past = Date.now() - 2 * 24 * 60 * 60 * 1000; // older than cache duration
  headers.set('sw-timestamp', past.toString());
  const oldResp = new Response('old', { headers });
  assert.strictEqual(isCacheFresh(oldResp, 'static'), false, 'stale response should be stale');

  const originalNow = Date.now;
  const baseNow = 1.7e12;
  Date.now = () => baseNow;
  const productFresh = new Response('ok', {
    headers: {
      'sw-timestamp': String(baseNow - CACHE_CONFIG.duration.products + 1000),
    },
  });
  assert.strictEqual(isCacheFresh(productFresh, 'products'), true, 'product cache should be fresh');
  const productStale = new Response('ok', {
    headers: {
      'sw-timestamp': String(baseNow - CACHE_CONFIG.duration.products - 1000),
    },
  });
  assert.strictEqual(isCacheFresh(productStale, 'products'), false, 'product cache should be stale');
  Date.now = originalNow;

  console.log('All tests passed');
})();
