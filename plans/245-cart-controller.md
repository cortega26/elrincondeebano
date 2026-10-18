# Plan 245: Extract the cart controller from `initStorefront()`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/cart-controller.js`
> Plan 219 edits `storefront.js` (loadCart/setQty area) — if it has landed,
> re-read those functions before starting; unexplained divergence is a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED (money path)
- **Depends on**: 219, 231 (cart behavior frozen and tested first)
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`storefront.js:1123-1707` — `initStorefront()` is 585 lines / ~380
statements: bootstrap, DOM wiring, **cart business rules** (`getQty`/`setQty`
at `:1253-1336`: stock guards, persist-first writes, stale rebase,
telemetry), checkout sync, dialogs, toasts, SW registration. It is the
highest-churn file in the repo (41 commits since 2026-04) and the last god
function: `cart-view.js`/`catalog-view.js`/`order-submit.js` were already
extracted into injectable factories, but the mutation rules they depend on
have no home. Every cart fix edits this one function and the risky behavior
(persist-then-render, cross-tab adoption) is only protected end-to-end.

## Current state

- `storefront.js:1253-1259` — `getQty` loads the cart (localStorage read +
  parse + sanitize) per lookup.
- `:1263-1336` — `setQty`: rebase from persisted cart, stock guards,
  `saveCart` failure path (`cart_save_failed` + quota toast), render/badge/
  companion/action-area sync, `trackProductSignal`.
- `:1338-1367` — `addBundleItems` loops `setQty`.
- Extracted-factory pattern to imitate: `cart-view.js` /
  `order-submit.js` headers ("Factory with injected dependencies;
  storefront.js remains the composition root").
- Tests: `test/storefront-state.spec.js` (pure), `test/storefront-totals.spec.js`,
  e2e `test/e2e-astro/cart-ux.spec.ts` + `storage-contract.spec.ts`
  (includes the Oct-18 dedup/resurrection fixes). Mutation testing pins
  `storefront-state.ts` (90.91%) — do not touch that module's logic.

## Commands you will need

| Purpose        | Command                                                                                | Provenance | Expected on success |
| -------------- | -------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install        | `npm ci`                                                                               | declared   | exit 0              |
| Focused unit   | `npx vitest run test/storefront.cart-controller.spec.js test/storefront-state.spec.js` | declared   | all pass            |
| Root tests     | `npm test`                                                                             | declared   | all pass            |
| E2E (cart)     | `npm run test:e2e -- cart-ux.spec.ts storage-contract.spec.ts`                         | declared   | pass                |
| Lint/typecheck | `npm run lint && npm run typecheck`                                                    | declared   | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js`
- `astro-poc/src/scripts/storefront/cart-controller.js` (create)
- `test/storefront.cart-controller.spec.js` (create)

**Out of scope**:

- `cart-view.js` (rendering), `order-submit.js`, `storefront-state.ts`
  internals, the Oct-18 identity/dedup rules — behavior must be identical.
- DOM/bootstrap wiring stays in `storefront.js`.

## Git workflow

- Branch: `advisor/245-cart-controller`
- Commits: characterize → extract → rewire, each with the e2e gate.

## Steps

### Step 0: Baseline

`npm ci`; `npm test`; the two cart e2e specs (rebuild or
`PLAYWRIGHT_SKIP_BUILD=1` on warm dist). All green → proceed; any red →
STOP (fixing pre-existing red is not this plan's job).

### Step 1: Characterization first (the actual plan)

Before moving anything, write `test/storefront.cart-controller.spec.js`
against the **existing** behavior by calling the factory you will create —
no. You cannot test what does not exist; instead:

1. Read `setQty`/`addBundleItems`/`getQty` + the toast/quota paths and list
   the rules as test names: "rebase from persisted storage", "stock guard
   blocks increase of out-of-stock product", "quota failure surfaces error
   and does not corrupt state", "render exactly what was persisted",
   "bundle add applies N mutations with one render per item (current
   behavior — pin it, do not improve it)".
2. Extract the functions into `cart-controller.js` as a factory:

   ```js
   export function createCartController({
     loadCart, saveCart, sanitizeCart, getCartState, clampQty,
     getProductByIdFromSource, getProductFromCard, getProductCardById,
     createCartItemFromProduct, sameCartProduct,
     renderCart, updateBadge, renderCompanionSuggestions, syncAllActionAreas,
     log, trackProductSignal, showCartSaveError, isOrderJustSent, clearLastOrderSentAt,
     createDocumentElement?, ...
   }) { return { getQty, setQty, addBundleItems, ... }; }
   ```

   Pass everything the moved code touches as injected deps (the
   `order-submit.js` style). Keep function bodies byte-identical at first.

3. Instantiate it from `storefront.js` with the same closures it uses
   today; delete the inline functions.

**Verify**: new unit spec passes against the extracted factory; cart e2e
passes; diff review shows moved-code bodies unchanged.

### Step 2: Unit tests for the guarded rules

With the factory testable, write the rule tests directly against it
(jsdom stubs like `test/storefront.catalog-view.spec.js`): stale rebase,
stock guard, quota failure path, persist-before-render ordering (assert
`saveCart` called before `renderCart` via spies), telemetry callback
firing on increase only.

**Verify**: `npx vitest run test/storefront.cart-controller.spec.js` → all
pass.

### Step 3: Trim `initStorefront` to wiring

With rules extracted, `initStorefront` should mainly construct controllers
and wire DOM events. Do not move DOM handlers that the rules depend on
unless the characterization tests cover them. Target: `initStorefront`
≤ ~300 lines.

**Verify**: `npm test` → all pass; cart e2e passes; `npm run typecheck` →
exit 0; manual smoke on `npm run dev`: add/increase/decrease/remove/bundle
add/checkout — report the checklist you ran (e2e covers most).

### Step 4: Full gates

**Verify**: `npm run lint && npm run typecheck && npm test`;
`npm run test:e2e` (root, full) → green.

## Test plan

- New `test/storefront.cart-controller.spec.js` (rules above).
- Existing cart e2e as the behavior net; run at every step.
- Mutation testing: not required, but if `npm run test:mutation` is cheap
  on `storefront-state.ts`, confirm the 90.91% pin is untouched.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `wc -l astro-poc/src/scripts/storefront.js` ≤ 1450 (record HEAD number; down ~250+)
- [ ] `ls astro-poc/src/scripts/storefront/cart-controller.js` exists; `grep -c "export function createCartController" …` = 1
- [ ] `npx vitest run test/storefront.cart-controller.spec.js` exits 0 with ≥6 rule tests
- [ ] `npm test` exits 0; `npm run test:e2e` green
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A cart e2e test fails at any step and the failure is not explainable by a
  test-local assumption (report; revert the step).
- The extraction requires changing `storefront-state.ts` semantics.
- You cannot preserve "exactly what was persisted is rendered" (report the
  ordering you found instead of restructuring).

## Maintenance notes

- New cart mutations go into the controller with a rule test; the
  composition root wires only.
- Reviewer: compare moved bodies against HEAD with `git diff -M` to confirm
  no accidental edits.
- **Deferred:** per-click perf batching (registered in the deferrals
  register, plan 250 — do not optimize here).
