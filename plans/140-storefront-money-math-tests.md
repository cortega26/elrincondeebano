# 140 — Unit-test the storefront money math (cart + order submit)

- **Source**: Auditoría 10, TEST-01 · **Status**: TODO · **Priority**: P1 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/src/scripts/storefront/order-submit.js astro-poc/src/scripts/storefront/cart-view.js test/`

## Problem

The money-critical path of the storefront — the exact per-line prices, totals and discount math quoted to the customer over WhatsApp — has zero unit tests. `astro-poc/src/scripts/storefront/order-submit.js` (discount math at `:34` and `:70`) and `cart-view.js` (effective-price subtotal/total rendering at `:39,138,149`) are imported by no test; the tests that exercise cart/checkout target the retired root `src/js/` (`test/cart.spec.js:11` imports `../src/js/script.mjs`, `test/checkout.test.js:5` imports `src/js/modules/checkout.mjs`). Only one indirect e2e assertion covers the production path (`test/e2e-astro/cart-ux.spec.ts:385-410`, "Subtotal: $23.800"); the actual WhatsApp order text is asserted nowhere.

The modules were built for exactly this: `createOrderSubmitController` / `createCartViewController` are factories with injected dependencies (`order-submit.js:7-19`).

## Scope

**In**: New test files `test/order-submit.spec.js` and `test/cart-view.spec.js` (root vitest, pattern: `test/storefront-state.spec.js` — jsdom available at root via `jsdom` devDep), and — only if needed to make them importable in jsdom — no changes to the source modules (their factories already inject DOM deps).

**Out**: The source modules themselves (no production behavior changes), the legacy `src/js` tests (their retirement is plan 155), e2e specs.

## Steps

1. `test/order-submit.spec.js`: build `createOrderSubmitController` with stub dependencies (functions returning fixed values; `createElement` can build real DOM in jsdom). Cases for `buildWhatsAppMessageText`:
   - discount > 0 → line shows `price - discount` (e.g. `1.500 - 300` → `$1.200`);
   - discount == price → effective price `$0` (Math.max floor);
   - quantity > 1 → `qty × price = subtotal` with `es-CL` formatting;
   - delivery note included/omitted.
     Also `submitCartOrder`: no payment selected → error text set, no message built; with payment → pending order captured (`takePendingOrder`) with the built message.
2. `test/cart-view.spec.js`: render the cart view with injected `formatCurrency` and a cart containing a discounted item; assert the subtotal row and total use effective price (discount applied), and the remove-last-item path keeps the share row consistent (the plan-116 contract `cart-view.js` implements).
3. Run the new files: `npx vitest run test/order-submit.spec.js test/cart-view.spec.js` → all pass.

## Tests

Listed in Steps 1-2; model file structure on `test/storefront-state.spec.js` (imports the storefront ESM directly, jsdom env). Keep assertions on values, not on exact full strings, to avoid brittle formatting assertions — assert the line contains the expected `$` values and the product name.

## Done criteria

- [ ] `npx vitest run test/order-submit.spec.js test/cart-view.spec.js` → all pass.
- [ ] Discount/discount==price/qty/note cases covered (asserted in file).
- [ ] `npm run lint` and `npm run typecheck` green.
- [ ] No source files modified (`git status` shows only the two new test files).

## Maintenance

This is the coverage floor for plan 145 (stryker) and plan 155 (src/js retirement — the legacy checkout tests are the only other cart-math coverage and will be deleted there; this suite must exist first). Any change to discount semantics (e.g. percentage discounts) must extend these tests in the same change.

## Rollback

`git revert <sha>` (or just delete the two test files).

## STOP conditions

- If the factory signatures differ from this description (drift), stop and report — the test plan depends on the injection points.
- If `test/e2e-astro/cart-ux.spec.ts` T12 already asserts these values and the new tests contradict it, stop and report (the two suites must agree).
