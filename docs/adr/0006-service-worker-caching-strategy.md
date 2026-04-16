# ADR-0006: Service Worker Caching Strategy

**Date:** 2026-04-16
**Status:** Accepted
**Authors:** Security / Supply Chain · CI Guardian

---

## Context

The storefront is a fully static site deployed to GitHub Pages. Offline-first
behaviour and fast repeat loads require a service worker with explicit cache
management. The caching strategy must balance asset freshness, data freshness,
and resilience to partial network failures without requiring a server-side
cache-invalidation mechanism.

Three distinct content categories exist in the site with different freshness
requirements:

- **Static assets** (CSS/JS bundles, icons, offline page) — change only on
  deploys; can be cached aggressively.
- **Dynamic content** (navigated HTML pages) — changes on every deploy; should
  be served fresh but fall back to cache when offline.
- **Product data** (`product_data.json`) — managed via the admin tool;
  schema changes are infrequent but full-catalog invalidation is sometimes
  needed independently of an asset deploy.

## Decision

Three independent cache namespaces are maintained, each with its own version
prefix incremented independently in `CACHE_CONFIG.prefixes` inside
`astro-poc/public/service-worker.js`.

| Prefix key | Bump when                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `static`   | Precached asset list or content changes (CSS/JS rebundle, new icons, offline page update)                  |
| `dynamic`  | Runtime cache strategy or set of cached endpoints changes                                                  |
| `products` | `product_data.json` schema changes, invalidation logic changes, or a forced full-catalog refresh is needed |

**Rationale for split namespaces:** asset changes (e.g. new icons, CSS
rebundle) must not force a product-cache bust, and vice versa. Independent
prefixes allow targeted invalidations without stale-cache
cross-contamination or unnecessary re-downloads for users.

## Active versions

> **Keep this table current. Update it every time a prefix is bumped.**

| Cache    | Active version      |
| -------- | ------------------- |
| static   | `ebano-static-v7`   |
| dynamic  | `ebano-dynamic-v5`  |
| products | `ebano-products-v6` |

## Operational affordances

**Kill-switch (incident triage / local debugging):**

```js
localStorage.setItem('ebano-sw-disabled', 'true');
```

Disables the SW for the current origin without a redeploy. Remove the key
to re-enable.

**Local HTTP override (localhost development):**

```js
localStorage.setItem('ebano-sw-enable-local', 'true');
// or use the ?sw=on URL parameter
```

Enables the SW on `http://` localhost (blocked by default for security).

**DevTools hard-clear (last resort):**

```js
navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
// Then hard-refresh (Ctrl+Shift+R)
```

**Verification after a prefix bump:**

1. Edit `CACHE_CONFIG.prefixes` in `astro-poc/public/service-worker.js`.
2. Update the active-versions table in this ADR.
3. Run `npm run build`.
4. Deploy and open DevTools → Application → Service Workers — confirm the
   new prefix appears and the old caches are deleted on activate.

## Consequences

- Every release that changes SW behaviour or the precached asset list **must**
  increment the corresponding prefix. Skipping a bump causes stale assets to
  be served to users whose SW has already activated.
- Agents must **not** change cache prefix logic without updating the
  active-versions table above in the same commit.
- Do **not** merge SW prefix bumps with unrelated changes (wider rollback
  surface than necessary).
- The `html` cache key (navigated pages) shares the `dynamic` namespace for
  strategy purposes; a routing change that affects which pages exist requires
  a `dynamic` bump.

## References

- `astro-poc/public/service-worker.js` — implementation (`CACHE_CONFIG`)
- `src/js/modules/pwa.js` · `src/js/modules/service-worker-manager.mjs` — registration
- `docs/operations/RUNBOOK.md` — operational procedures, DevTools clear-cache steps, cache bump rules
- ADR-0003 — Astro migration (static deployment context)
- ADR-0004 — GitHub Pages / Cloudflare deployment (no server-side cache control)
