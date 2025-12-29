# Phase 3 - Test Architecture & Coverage Against Failure Modes

Role: SDET / Test Automation Architect
Scope: Unit (node:test, Vitest), E2E (Playwright/Cypress), performance (Lighthouse), mutation (Stryker), and admin tooling (pytest).

## P0 Constraints (from Phase 0/0.5/Phase 1/Phase 2)
- No unresolved P0 items reported in Phase 0.5, Phase 1, or Phase 2 for current repo state.

## 1. Test Inventory
| Layer | Location | Runner | Command | Primary coverage | Notes |
| --- | --- | --- | --- | --- | --- |
| Node unit tests | `test/*.test.js`, `test/*.test.mjs` via `test/run-all.js` | node:test | `npm test` (first stage) | SW utils, SW registration guards, cache invalidation, CSP policy, resource hints, sitemap categories, robots, product sync server, UI controllers | Several tests read from `build/` when present (resource hints, buildIndex LCP). |
| Vitest unit tests | `test/*.spec.js` | Vitest (jsdom) | `npm test` (second stage) | cart logic, fetchProducts retry/inline fallback | Focused on client data flow and cart logic. |
| Playwright E2E | `test/e2e/*.spec.ts` | Playwright | `npm run test:e2e` | navbar dropdown behavior, mobile toggle, first-paint flicker checks | Uses real browser; skips mobile-only tests per project. |
| Cypress E2E (smoke) | `cypress/e2e/*.cy.ts` | Cypress | `npm run test:cypress` | nav menu and submenu regressions | Not wired into CI. |
| Performance audits | `tools/lighthouse-audit.mjs` | Lighthouse | `npm run lighthouse:audit` | performance/CLS/LCP reports | Runs in CI; output stored under `reports/lighthouse/`. |
| Mutation testing | `stryker.conf.mjs` | Stryker + Vitest | `npx stryker run` | mutation testing for `src/js/script.mjs`, `src/js/modules/**/*.mjs` | Configured, not run in CI. |
| Admin tooling tests | `admin/product_manager/tests/*.py` | pytest | `admin.yml` workflow | model/repo/service logic, data integrity, repair workflows | Run only in admin workflow. |

## 2. Failure Mode Coverage Map (from Phase 1)
| Failure mode (Phase 1) | Current coverage | Evidence |
| --- | --- | --- |
| Non-deterministic enhancement/data path (csp.js vs main.js timing) | Gap | No test asserts single initialization path or single data fetch. |
| `productDataVersion` stored as "undefined" | Gap | `fetchProducts.spec.js` covers versioned fetch but not invalid/missing version normalization. |
| Retry flow re-runs `initApp` and duplicates listeners | Gap | `initAppFallback.test.js` only checks missing DOM; no retry/idempotence checks. |
| SW cache freshness metadata unused | Gap | `swCache.test.js` covers invalidation, not freshness or stale behavior. |
| HTTPS-only fetch blocks localhost HTTP | Partial | `fetchWithRetry.test.js` asserts HTTPS-only, but no localhost allowlist test. |
| Cloudflare logo URLs hard-coded | Partial | `resourceHints.integrity.test.js` enforces CDN logo path, but no test for non-CF fallback. |

## 3. Critical Gaps (Ranked)
1) Service worker lifecycle + cache update behavior lacks end-to-end tests (install, update, invalidation on version change, offline recovery).
2) Data versioning safety (no test preventing `productDataVersion` corruption or repeated invalidation loops).
3) Initialization idempotence (no test to prevent duplicate listeners after retry).
4) Data endpoint policy split (no single resolver test to ensure same-origin constraints across modules).
5) Localhost HTTP policy not tested (guards for dev/CI usage remain unverified).
6) Cloudflare logo toggling not validated for non-CF deployments.

## 4. Flakiness & Reliability Assessment
- Playwright flicker tests sample UI state over time; they can be sensitive to CPU timing and font loading (potential false positives under load).
- Lighthouse audits are environment-dependent and can vary between runs; no thresholds or artifact retention for triage.
- Node tests that read from `build/` can pass without a fresh build (they fall back to repo paths), which weakens assurance for build output.
- `test/run-all.js` runs `registerServiceWorker.test.js` twice (redundant runtime, no extra coverage).
- Cypress is not in CI, so regressions covered there can still ship.

## 5. PR-ready Test Plan (5-15 tests)
1) Unit - productDataVersion normalization
   - Scope: `src/js/script.mjs`
   - Acceptance: `productDataVersion` is never written as "undefined"/"null"; update check skips invalid version.
   - Test: add unit test that feeds missing/invalid `data.version` and asserts no invalidation or version write.

2) Unit - data endpoint resolver
   - Scope: new `src/js/utils/data-endpoint.mjs` (per Phase 1 plan)
   - Acceptance: all product-data URLs resolve to same-origin HTTPS; localhost HTTP allowed only under explicit flag.
   - Test: unit test for default, versioned, and localhost override cases.

3) Unit - initApp retry idempotence
   - Scope: `src/js/script.mjs`
   - Acceptance: retry does not double-bind listeners or double-fetch.
   - Test: simulate retry twice and assert single handler registration and one network call.

4) Unit - SW cache freshness logic
   - Scope: `service-worker.js`
   - Acceptance: stale cached entries refresh when online; offline still serves cached entries.
   - Test: export helper or mock cache to validate `isCacheFresh` usage in fetch handler.

5) Playwright - offline-first reload
   - Scope: `test/e2e/offline-reload.spec.ts`
   - Acceptance: after online load and SW ready, offline reload shows products and offline indicator.
   - Test: toggle offline, reload, assert content renders from cache/inline data.

6) Playwright - update version invalidates cache
   - Scope: `test/e2e/product-version-update.spec.ts`
   - Acceptance: version bump triggers a single update notification and refreshes data.
   - Test: intercept `/data/product_data.json` with v1 then v2 and assert cache invalidation message.

7) Build-output guard - logo path toggling
   - Scope: `test/logo-url.rendering.test.js`
   - Acceptance: with CF disabled, logo uses `/assets/images/web/logo.webp`; with CF enabled, uses `/cdn-cgi/image/...`.
   - Test: build or render templates with env toggle and assert logo/preload URLs.

8) CI smoke - Cypress or Playwright consolidation
   - Scope: CI pipeline
   - Acceptance: at least one nav regression suite runs in CI (Playwright or Cypress).
   - Test: add or migrate Cypress coverage to Playwright, remove unused runner to reduce duplication.

## 6. CI Recommendations
- Add failure artifacts for Playwright (`test-results/`, traces) and Lighthouse (`reports/lighthouse/`) to speed triage.
- Add a lightweight CI job for critical unit tests (e.g., `fetchProducts`, `fetchWithRetry`, SW registration) to fail fast before E2E.
- Decide on a single E2E runner for nav regressions (Playwright or Cypress) to avoid split coverage and untested paths.
- Schedule Stryker for periodic runs (nightly/weekly) targeting `src/js/script.mjs` and modules.
