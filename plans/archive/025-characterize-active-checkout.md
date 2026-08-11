# Plan 025: Caracterizar checkout y personalización del storefront activo

> **Executor instructions**: Follow this plan step by step. Run every verification command and honor every STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/personalization.js test/e2e-astro/cart-ux.spec.ts test/e2e-astro/storage-contract.spec.ts`
> If these files drifted, compare the current code with the excerpts below; STOP on behavioral mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

The detailed checkout tests currently import `src/js/modules/checkout.mjs`, which is not the shipped runtime. The canonical flow in `astro-poc/src/scripts/storefront.js` records personalization, emits analytics and opens WhatsApp; its only focused guardrail counts a source string rather than executing behavior. These characterization tests must land before plans 026 and 027 change cart/checkout behavior.

## Current state

- `test/checkout.test.js:5-7` imports the legacy checkout module.
- `astro-poc/src/scripts/storefront.js:1331-1355` contains active `executeSendOrder`: `recordOrder(...)`, `trackAnalyticsEvent(...)`, `globalThis.open(...)`.
- `astro-poc/src/scripts/storefront/personalization.js:27-55` saves last/recent orders and product signals; lines 58-113 rank recommendations.
- Follow the Vitest dependency-injection style in `test/storefront.service-worker-sync.spec.js` and the browser setup in `test/e2e-astro/cart-ux.spec.ts`.

## Commands you will need

| Purpose | Command                                                                                                                    | Expected on success     |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Unit    | `npx vitest run test/storefront.personalization.spec.js`                                                                   | new tests pass          |
| Browser | `npx playwright test -c playwright.astro.config.ts test/e2e-astro/cart-ux.spec.ts test/e2e-astro/storage-contract.spec.ts` | all selected tests pass |
| Gate    | `npm run lint && npm run typecheck && npm test`                                                                            | exit 0                  |

## Scope

**In scope**: create `test/storefront.personalization.spec.js`; modify `test/e2e-astro/cart-ux.spec.ts` and `test/e2e-astro/storage-contract.spec.ts`.

**Out of scope**: changing checkout behavior; refactoring `storefront.js`; modifying legacy `src/js/**`; adding analytics providers.

## Git workflow

- Branch: `advisor/025-characterize-active-checkout`
- Commit: `test: characterize active storefront checkout`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Unit-test the active personalization module

Instantiate `createPersonalizationEngine` with in-memory injected load/save functions and deterministic visible products. Cover: one order is saved once; recent order is prepended; product counters increment; unknown products are excluded; recency and count change ranking. Use fake timers for `Date.now()`/`new Date()`.

**Verify**: `npx vitest run test/storefront.personalization.spec.js` → all new tests pass.

### Step 2: Characterize active checkout in the browser

Extend the canonical Astro E2E tests to cover: empty cart cannot submit; missing payment shows the existing error and does not open WhatsApp; one confirmed send calls `window.open` once and persists one order; repeat-order restores the stored items. Stub `window.open` before the app initializes and inspect only documented `astro-poc-*` storage keys.

**Verify**: the focused Playwright command above → all selected tests pass.

### Step 3: Run the local baseline

**Verify**: `npm run lint && npm run typecheck && npm test` → exit 0 with no new lint errors.

## Test plan

The new unit suite must contain at least five behavior assertions. The E2E suite must add at least three negative/idempotency assertions against `astro-poc/src/scripts/storefront.js`, not `src/js/**`.

## Done criteria

- [ ] Personalization logic is executed by a focused Vitest suite.
- [ ] Active checkout empty/payment/single-send behavior is covered in Playwright.
- [ ] No production source was changed.
- [ ] Baseline commands pass and only scoped files changed.

## STOP conditions

- More than a small test-only seam is required in production code.
- Browser tests can only pass by using fixed sleeps rather than state/locator waits.
- Existing behavior contradicts the checkout contract documented in `README.md`.

## Maintenance notes

Plans 026 and 027 may extend these tests. Keep legacy checkout tests until plan 024 decides their migration; do not treat them as assurance for the active runtime.
