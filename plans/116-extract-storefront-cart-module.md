# 116 — Extract the cart module from the storefront.js monolith

- **Source**: Auditoría 9, TDA-01
- **Status**: TODO · **Priority**: P3 · **Effort**: L
- **Stamped against**: `b3805e1`
- **Note**: largest plan in the batch; run last, chunked, each chunk behind the storefront E2E suite (44 tests).

## Problem

`astro-poc/src/scripts/storefront.js` is 2089 lines mixing cart persistence,
DOM rendering, WhatsApp order submission, onboarding, recovery banner and
telemetry. The extraction that started (plan 031-era) is half-finished:

- `initStorefront()` spans 1567–2062 (~495 lines),
- `renderCart()` 923–1140,
- `submitCartOrder()` 1439–1500,
- the extracted modules are small (`catalog-view.js` 182, `observability.js`
  267, `personalization.js` 121) and only own sort/filter/pagination;
  product-card parsing (`getProductFromCard` 462–486) and all rendering stay
  in the monolith.

Impact: every cart/UI change touches one 2K-line file; the module boundary
is unpredictable; `initStorefront` is untestable in isolation.

## Scope

**In**: `astro-poc/src/scripts/storefront.js` + new
`astro-poc/src/scripts/storefront/` modules.

**Out**: behavior, the e2e suite, other runtime files.

## Steps

1. Follow the existing DI pattern from `createCatalogViewController`
   (`catalog-view.js`): exported factory functions taking injected DOM
   handles, registered from `storefront.js`.
2. Chunk 1 — cart rendering: extract `renderCart` (+ its helpers:
   `formatCurrency` usage, subtotal/effective-price logic from plan 098,
   companion-suggestion rendering) into `storefront/cart-view.js`; keep the
   `changedItemId` fast path in the same module so plan 098's fix can't
   regress. Verify: `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c
playwright.astro.config.ts cart-ux storage-contract` green.
3. Chunk 2 — order submission: extract `submitCartOrder`, the WhatsApp
   message builder and `buildOrderConfirmSummary` into
   `storefront/order-submit.js`. Verify: the same suite + `cart-ux`
   (T10/T11 tests cover submit flows).
4. Chunk 3 — onboarding/recovery banner + remaining state glue; verify the
   full 44-test suite green.
5. Keep `storefront.js` as the composition root: imports + registration
   only (~300 lines target; do not force further extraction beyond this
   plan's chunks).
6. No behavior changes per chunk — each chunk is a pure move with import
   adjustments (verify with `git diff --stat` that only storefront.js and
   the new files changed).

## Tests

- The storefront E2E suite (44 tests) after each chunk.
- `npm run build` + artifact contract green (build determinism).
- `npm run lint` (astro-poc config) green.

## Done criteria

- [ ] Cart render, order submission and onboarding live in
      `storefront/*.js` modules; `storefront.js` ≤ ~400 lines.
- [ ] All 44 storefront e2e tests green after each chunk.
- [ ] No test file changes required (behavior identical).

## Maintenance

Future cart/order changes go to the new modules; the monolith keeps only
composition. Do not extract further without a new plan — the boundary chosen
here becomes the stable one.

## Rollback

Per-chunk `git revert` (pure moves — reverts restore the monolith).
