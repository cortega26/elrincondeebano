# 146 — Service worker: stale-while-revalidate for static assets

- **Source**: Auditoría 10, PERF-03 · **Status**: TODO · **Priority**: P2 · **Effort**: S-M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- service-worker.js astro-poc/scripts/sync-data.mjs test/swCache.test.js test/swCachePolicy.test.js`

## Problem

The service worker is network-first for every non-navigation GET: the cache is consulted only after a network error, so on warm online visits it is never used — repeat visits re-download every product image (the site's largest payload) from the network/edge.

`service-worker.js:354-390`:

```js
let freshResponse;
let networkError = false;
try {
  freshResponse = await fetch(req);
  if (freshResponse && freshResponse.ok) {
    if (!isNoStoreResponse(freshResponse)) {
      const responseToCache = await addTimestamp(freshResponse.clone(), type);
      await cache.put(req, responseToCache);
    }
  }
} catch (error) {
  networkError = true;
  ...
}

if (freshResponse) {
  return freshResponse;
}

if (cached) { ... isCacheFresh(cached, type) ... }
```

The cache-version invalidation machinery (`INVALIDATE_ALL_CACHES`, cache-version bump in `service-worker-sync.ts`) plus the TTL stamps already bound staleness — that is exactly the mechanism that makes cache-first safe for versioned assets. The TTL constants (`service-worker.js:13-18`: 30-day static / 24-hour dynamic) currently only matter on the failure path.

## Scope

**In**: `service-worker.js` (fetch handler), its tests (`test/swCache.test.js`, `test/swCachePolicy.test.js` — note `astro-poc/scripts/sync-data.mjs` copies the root file into `astro-poc/public/` at build; edit the root file only).

**Out**: Navigation requests (HTML) and `product_data.json` — keep network-first for those (freshness is correctness there; the TTL logic already covers their fallback). The cache-version bump flow (plan 137).

## Steps

1. In the fetch handler, split the strategy by request type:
   - `static`/versioned assets (`getCacheKeyForRequest` already classifies types — reuse it): serve `cached` immediately when present and fresh (`isCacheFresh`), then revalidate in the background (`fetch` + `cache.put` when ok), never blocking the response on the network. When uncached or stale, fetch and cache as today.
   - Navigations + `product_data.json` (`products` type): keep the current network-first path untouched.
2. Keep the network-error fallback chain (cache → `getFallbackResponse`) intact for both branches.
3. Verify the version-bump invalidation still forces freshness: after `INVALIDATE_ALL_CACHES` (which deletes the caches), the first load re-fetches — no change needed, just confirm with the existing tests.

## Tests

- Extend `test/swCache.test.js` / `test/swCachePolicy.test.js` (their mocking pattern — the SW tests use a fake cache/fetch harness; follow it): (a) a cached fresh static asset returns from cache WITHOUT a network call (assert fetch not called); (b) a cached stale asset triggers a fetch and the response is refreshed into the cache; (c) an uncached static asset behaves as today (fetch + cache); (d) navigation + product_data.json remain network-first (fetch called).
- Run: `npx vitest run test/swCache.test.js test/swCachePolicy.test.js` → all pass; root vitest green; `npm run lint` green.

## Done criteria

- [ ] Static assets served from cache on warm visits (asserted: fetch not called).
- [ ] Navigations and product_data.json still network-first (asserted).
- [ ] All SW tests green.

## Maintenance

The cache-version bump is now the ONLY deploy-freshness lever for static assets — keep it in lockstep with deploys (it already is; plan 137 hardens its failure path). The TTL constants (30d/24h) become the staleness bound; if they change, the freshness semantics in step 1 change with them.

## Rollback

`git revert <sha>`.

## STOP conditions

- If the SW tests' harness cannot simulate a cache hit without network (no injectable fetch), stop and report — do not weaken the assertions.
- If the deployed SW and the root file are NOT byte-identical after the edit (`cmp service-worker.js astro-poc/public/service-worker.js` after a build), stop and report (sync-data.mjs copy issue).
