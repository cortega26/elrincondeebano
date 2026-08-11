# Plan 027: Preserve repeat-order discounts and rollback failed cart writes

> **Executor instructions**: Follow all steps and STOP conditions. Update `plans/README.md` after completion.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts test/storefront-state.spec.js test/e2e-astro/storage-contract.spec.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/025-characterize-active-checkout.md`
- **Category**: bug
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

`hydrateCartFromOrder` drops the saved discount, so repeating a discounted order increases its total. Separately, repeat, empty-cart and mark-sent flows update the UI or sent markers even when `saveCart` fails, leaving memory, UI and durable state inconsistent. All destructive/replacement cart actions need the rollback discipline already used by `setQty`.

## Current state

- `storefront-state.ts:92-107` maps order items without `discount`.
- `storefront.js:1410-1421` marks sent and clears UI without checking `saveCart([])`.
- `storefront.js:1710-1719` replaces the in-memory cart and renders without checking `saveCart(cart)`.
- `storefront.js:1870-1878` empties and renders without checking persistence.
- `storefront.js:1635-1651` is the exemplar: check `saveCart`, restore previous state, show `showCartSaveError`, return.

## Commands you will need

| Purpose | Command                                                                                     | Expected |
| ------- | ------------------------------------------------------------------------------------------- | -------- |
| Unit    | `npx vitest run test/storefront-state.spec.js`                                              | all pass |
| E2E     | `npx playwright test -c playwright.astro.config.ts test/e2e-astro/storage-contract.spec.ts` | all pass |
| Gate    | `npm run lint && npm run typecheck && npm test && npm run build`                            | exit 0   |

## Scope

**In scope**: the four files in the drift check.

**Out of scope**: changing discount policy, refreshing prices from network, shared-link format (plan 026), legacy cart modules.

## Git workflow

- Branch: `advisor/027-harden-cart-repeat`
- Commit: `fix: keep repeated orders and cart storage consistent`

## Steps

### Step 1: Preserve discounts during hydration

Map `discount: item.discount` in `hydrateCartFromOrder` so normal sanitization validates/defaults it. Extend the existing test with a discounted order and assert the hydrated item and `getCartState` total.

**Verify**: focused Vitest command → pass.

### Step 2: Make cart replacement conditional on storage success

For repeat order, compute `nextCart` without overwriting `cart`; call `saveCart(nextCart)` first, then publish/render it only on success. On failure, retain the previous cart, show the existing save error and do not update profile/payment/substitution from the old order.

For empty-cart and mark-sent, only update memory/UI/sent markers after `saveCart([])` succeeds. Failure must preserve current UI and must not write `STORAGE_SENT_KEY`.

**Verify**: add browser cases that replace `localStorage.setItem` with a throwing implementation for canonical cart writes; assert UI, badge and sent state remain unchanged and the warning appears.

### Step 3: Full gate

**Verify**: full gate command → exit 0.

## Test plan

Cover discount preservation, repeat write failure, empty write failure and mark-sent write failure. Reuse selectors/storage helpers from `test/e2e-astro/storage-contract.spec.ts`; do not use arbitrary sleeps.

## Done criteria

- [ ] Repeated discounted order retains its effective total.
- [ ] Failed replacement/clear writes leave memory, UI and durable state unchanged.
- [ ] Sent marker is written only after successful cart clearing.
- [ ] All gates pass and scope is clean.

## STOP conditions

- Browser storage methods cannot be fault-injected before runtime initialization.
- The desired product policy is to reprice repeat orders from the live catalog; report this product decision instead of preserving snapshots.
- Fix requires changing storage key contracts.

## Maintenance notes

Review future cart mutations for “persist first, publish second.” If repricing repeated orders becomes desired, specify it as a separate product contract with customer-visible messaging.
