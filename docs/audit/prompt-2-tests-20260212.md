# Prompt 2 - Test Audit and Coverage Plan (2026-02-12)

## Test stack discovered

1. Node unit/integration (`node:test`) via `test/run-all.js`.
2. Vitest (`test/**/*.spec.{js,mjs,ts}`) via `vitest.config.mts`.
3. Playwright e2e smoke/regression (`test/e2e/*.spec.ts`).
4. Cypress e2e focused nav checks (`cypress/e2e/*.cy.ts`).
5. Python admin tests (`admin/product_manager/tests/*.py`, pytest in `admin.yml`).

## Coverage (real behavior, not %)

1. Routing/navigation:
   - Navbar dropdown and mobile toggler e2e.
   - Category contract validation and sitemap category coverage.
2. Cart/checkout:
   - Cart render + interaction covered by Node/Vitest.
   - Checkout submission and payment gating covered in new `test/checkout.test.js`.
3. Product data and contracts:
   - Product endpoint resolver, fetch retry policy, version normalization.
   - Category registry contracts and product/category integrity.
4. Offline/service worker:
   - SW runtime install/activate/fetch/message behavior.
   - Offline reload e2e and service worker registration policy.
5. Build/SEO/static integrity:
   - Robots, resource hints, image pipeline paths/config, structured data injection.

## Classification

### Maintain

Keep as-is (high signal, stable in current CI/local flow):

- `test/service-worker.runtime.test.js`
- `test/registerServiceWorker.test.js`
- `test/product-filter.test.js`
- `test/product-sync.server.test.js`
- `test/category-registry.contract.test.js`
- `test/resourceHints.integrity.test.js`
- `test/sitemap.categories.test.js`
- `test/robots.test.js`
- `test/deferredCss.swap.test.js`
- `test/tools.staticServer.security.test.js`
- `test/cart.unit.test.mjs`
- `test/e2e/*.spec.ts` (Playwright)
- `test/*.spec.js` (Vitest suite)

### Update

Needs refactor or integration changes before promotion:

1. `cypress/e2e/*.cy.ts`
   - Valuable but currently not part of default CI gates, so regression coverage is split.

### Eliminate

- None in this pass.
- Decision: avoid deletion until replacement coverage is merged and stable.

## Changes applied in Prompt 2

1. Added missing checkout coverage:
   - `test/checkout.test.js`
   - Covers submit enable/disable logic, empty cart fallback, payment validation, and WhatsApp payload generation.
2. Improved `node:test` execution coverage:
   - `test/run-all.js`
   - Removed duplicate `registerServiceWorker.test.js`.
   - Added existing stable tests previously outside `npm test`:
     - `cfimg.config.test.js`
     - `copyStatic.adminPanel.test.js`
     - `intersectionObserver.fallback.test.js`
     - `swCachePolicy.test.js`
     - `deferredCss.swap.test.js`
     - `tools.staticServer.security.test.js`
     - `cart.unit.test.mjs`
3. Removed import side effects from `tools/lighthouse-audit.mjs`:
   - Audit now runs only on direct execution (`npm run lighthouse:audit`).
   - The exported static server can be imported safely from tests.
4. Extracted deferred CSS swap logic to a testable module:
   - `src/js/modules/deferred-css.mjs`
   - `src/js/main.js` now delegates to `applyDeferredStyles`.
5. Stabilized legacy cart unit tests:
   - Replaced shallow object mocks with jsdom-backed DOM fixtures in `test/cart.unit.test.mjs`.

## Flakiness and determinism notes

1. Current suite is deterministic in CI/local for the promoted tests.
2. Some tests still log expected warnings/errors by design (offline/network simulation).
3. Remaining gap is Cypress integration into default CI gates.
