const test = require('node:test');
const assert = require('node:assert');
const { isNoStoreResponse, shouldSkipCache } = require('../service-worker.js');

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
