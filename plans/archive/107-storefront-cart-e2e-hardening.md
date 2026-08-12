# 107 — Storefront cart e2e hardening: offcanvas dismiss + discounted subtotal

- **Source**: Auditoría 9, T2 (TEST-02) + B1 regression coverage
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

Two recent storefront regressions shipped with **no regression test**:

1. **Offcanvas dismiss** (`91bea36`): the fix for "cart offcanvas stays
   visible after dismiss" touched only `storefront.js` (3 deleted lines, no
   test). `test/e2e-astro/cart-ux.spec.ts` asserts only the open state
   (cart-ux.spec.ts:31-49); a grep across `test/e2e-astro/*.ts` finds zero
   after-dismiss assertions. Re-introducing the inline
   `visibility`/`transform` hacks — or any new dismiss-path break — passes
   CI silently.
2. **Subtotal discount** (plan 098 fixes the code): the fast-path price
   bug has no e2e assertion locking the discounted value.

## Scope

**In**: `test/e2e-astro/cart-ux.spec.ts` (extend), possibly a shared helper
in that file.

**Out**: storefront source code (plan 098 owns the fix; this plan only adds
tests — run after 098 or in the same commit).

## Steps

1. Offcanvas dismiss flows — add one test (or extend the existing cart test)
   covering all three close paths, asserting `#cartOffcanvas` becomes hidden
   and the mobile shortcut state flips back (`mobileCartShortcut` visible):
   - close via the X (`btn-close` with `data-bs-dismiss="offcanvas"`);
   - close via `#continue-shopping` (the path that regressed);
   - close via Escape (if supported — check `storefront.js` for an Escape
     handler; if the app does not support it, assert only the two real
     paths and note Escape as a UX gap, do NOT add a test for behavior the
     app doesn't have).
2. Discounted subtotal — extend the cart test with a discounted product:
   adjust quantity in the cart, assert the `.cart-item__subtotal` text uses
   the discounted unit price (this test fails on `ccb921f`, passes after
   plan 098).
3. Follow the existing helpers in `test/e2e-astro/` (`openCartFromHome`,
   `waitForReady`, fixtures — the storefront e2e uses the live catalog, pick
   a product that has a discount in `data/product_data.json`; if none does,
   plan 098's unit test covers the math and this e2e asserts the subtotal
   equals `formatCurrency(unitPrice * qty)` for the product used).

## Tests

- The e2e additions ARE the deliverable:
  `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts cart-ux` green.
- Full storefront suite stays green (44 tests).
- `npm run test:e2e` green at the root (it builds first).

## Done criteria

- [ ] Dismiss test fails on `ccb921f` (pre-fix bundle) and passes after.
- [ ] Subtotal test fails on `ccb921f` and passes after plan 098.
- [ ] Full storefront e2e suite green.

## Maintenance

The offcanvas open/close contract now has a test — any future styling or
Bootstrap-interaction change (the exact class of the Feb-2026 hack) is
covered. Keep the three close paths in one test so a future refactor that
removes one of them forces a conscious decision.

## Rollback

N/A (tests only).
