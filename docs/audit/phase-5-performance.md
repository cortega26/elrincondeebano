# Phase 5 - Performance, Offline & User-Perceived Reliability Audit

Role: Web Performance Engineer / Offline-First Specialist
Scope: PWA behavior, offline-first flows, and perceived reliability.

## P0 Constraints (from Phase 0/1/2/3/4)
- None. Phase 1 through Phase 4 report no unresolved P0 items in the current repo state.

## 1. Performance Critical Path Map
Cold first visit (no SW, cold cache)
- HTML from `build/index.html` or `build/pages/*.html` arrives with inline product payload (`#product-data`).
- Critical CSS is preloaded and applied (`/dist/css/critical.min.css`).
- Main CSS (`/dist/css/style.min.css`) loads after critical CSS.
- Preloads include the logo, LCP image, fonts, and modulepreload for `/dist/js/script.min.js`.
- JS startup: `dist/js/csp.js` (async) then `dist/js/script.min.js` (module) initializes UI and data refresh.
- First paint uses server-rendered HTML; first product image is eager/high priority.

Warm repeat visit (SW active)
- SW registration runs on window load; install precaches static assets and the asset manifest.
- Navigation uses network-first with cached fallback; same-origin assets are network-first.
- Inline payload still renders immediately while `fetchProducts()` refreshes data.

Online to offline transition
- Offline reload uses cached HTML or `/pages/offline.html` as fallback.
- Product data comes from cache or inline payload; offline indicator updates via runtime listeners.

## 2. Lighthouse / Web Vitals Failure Analysis
- LCP risk: the first product image or logo is a likely LCP element. Category pages inline full product lists, which can increase HTML size and delay LCP on slower networks.
- CLS risk: templates set fixed image dimensions, reducing CLS; residual shifts are likely from font swaps or dynamic UI expansion.
- INP/TBT risk: duplicate initialization paths (`csp.js` vs `main.js`) can cause extra work and redundant data fetches (Phase 1), increasing main-thread time.
- Resource hint drift: `dns-prefetch` and `preconnect` entries include third-party domains even when fonts are self-hosted, adding connection overhead with limited payoff.
- Logo preload mismatch: templates preload `/cdn-cgi/image/...` by default, which is a dead preload if Cloudflare is not active, delaying the real logo fetch.
- Warm-cache penalty: network-first strategy for HTML and static assets delays repeat visits by waiting on network even when cache is hot.

## 3. Offline UX Assessment
- First visit offline: no SW yet, so users see browser offline errors. This is expected but should be documented and tested.
- Warm offline reload: SW fallback should serve cached HTML or `/pages/offline.html` and cached product data, preserving core browsing.
- Online to offline transitions: UI shows offline state, but stale data can persist because SW freshness metadata is not enforced.
- Update cost: 5-minute update checks and version-based invalidations can trigger reloads or repeated cache clears if versions are invalid.

## 4. Bottleneck Ranking
1. Large HTML payloads on category pages from full inline product lists (cold and warm LCP, TTFB).
2. Network-first strategy for HTML and static assets (warm-cache LCP and INP).
3. Duplicate init path (csp.js vs main.js) causing extra JS work and network fetches.
4. Resource hint drift and CF logo preload mismatch (wasted connections and preloads).
5. Heavy SW install precache list (competes with user fetches on first visit).

## 5. PR-ready Performance Fix Plan
PR 1 - Reduce inline payload size on category pages
- Files: `tools/build-pages.js`, `templates/category.ejs`, `src/js/script.mjs`.
- Change: inline only above-the-fold products and metadata; defer the rest to background fetch after first render.
- Measurement: HTML transfer size and LCP in Lighthouse before/after.
- Acceptance: category HTML size reduced vs baseline and LCP improves on mobile emulation.

PR 2 - Warm-cache speedup via stale-while-revalidate
- Files: `service-worker.js`.
- Change: serve cached HTML/CSS/JS immediately when available, then revalidate in the background.
- Measurement: warm-cache LCP and navigation timing vs network-first baseline.
- Acceptance: warm LCP improves without stale content persisting beyond one refresh cycle.

PR 3 - Unify initialization path to reduce startup work
- Files: `src/js/csp.js`, `src/js/main.js`, `src/js/script.mjs`.
- Change: keep csp.js to CSP metadata only; move all data/enhancement init to main.js.
- Measurement: number of product data fetches and JS execution time on load.
- Acceptance: single product data fetch on load and reduced main-thread time.

PR 4 - Clean resource hints and logo preload path
- Files: `tools/inject-resource-hints.js`, `templates/index.ejs`, `templates/category.ejs`, `templates/partials/navbar.ejs`.
- Change: remove unused dns-prefetch/preconnect entries and gate CF logo preload behind CF enablement.
- Measurement: number of external connection attempts and LCP for logo.
- Acceptance: no preconnect/prefetch to unused domains and logo preload targets a real URL.

PR 5 - Tune SW precache scope
- Files: `service-worker.js`, `tools/verify-sw-assets.js`.
- Change: precache only critical assets; allow non-critical assets to be runtime cached.
- Measurement: SW install duration and first-load network contention.
- Acceptance: faster SW install with no regression in offline fallback.

## 6. New Performance Tests & Budgets
Performance tests
- Lighthouse cold vs warm: run `npm run lighthouse:audit` twice (cold and warm) and store reports in CI artifacts.
- Playwright offline reload: ensure cached HTML and product data render after going offline post-first visit.
- Build output guard: assert preloads for LCP image and critical CSS exist in `build/index.html`.

Budgets (measurable)
- Lighthouse budgets (mobile emulation, default throttling):
  - LCP <= 2.5s, INP <= 200ms, CLS <= 0.1, TBT <= 200ms, Performance score >= 90.
- Asset budgets (from `build/` output, enforced by CI script):
  - `dist/js/script.min.js` gzip size <= current baseline + 5%.
  - `dist/css/style.min.css` gzip size <= current baseline + 5%.
  - `build/index.html` transfer size <= current baseline + 5%.
