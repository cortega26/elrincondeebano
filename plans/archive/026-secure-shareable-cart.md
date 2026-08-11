# Plan 026: Resolve shared-cart prices from the canonical catalog

> **Executor instructions**: Execute each step and verification in order. STOP instead of improvising when a condition below occurs. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts test/storefront-state.spec.js test/e2e-astro/cart-ux.spec.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/025-characterize-active-checkout.md`
- **Category**: security
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

The URL hash is untrusted input, but the current shared-cart payload contains and restores product names, prices and discounts. Those values reach the WhatsApp order total without a catalog lookup, allowing a crafted link to present false commercial data. Shared links must carry identity and quantity only; display and pricing fields must come from the current catalog.

## Current state

- `storefront.js:190-212` base64-encodes the complete cart.
- `storefront.js:223-240` decodes, sanitizes and saves that payload directly.
- `storefront-state.ts:30-46` accepts `price`, `discount`, `name` and `image` from any object.
- `storefront.js:1285-1297` uses those stored fields in the WhatsApp message and total.
- Existing product resolution uses `getProductByIdFromSource(id)` in `storefront.js:1691`.

## Commands you will need

| Purpose | Command                                                                            | Expected |
| ------- | ---------------------------------------------------------------------------------- | -------- |
| Unit    | `npx vitest run test/storefront-state.spec.js`                                     | all pass |
| Browser | `npx playwright test -c playwright.astro.config.ts test/e2e-astro/cart-ux.spec.ts` | all pass |
| Gate    | `npm run lint && npm run typecheck && npm test && npm run build`                   | exit 0   |

## Scope

**In scope**: `astro-poc/src/scripts/storefront.js`, `astro-poc/src/scripts/storefront/storefront-state.ts`, `test/storefront-state.spec.js`, `test/e2e-astro/cart-ux.spec.ts`.

**Out of scope**: signing links, backend storage, changing product IDs/SKUs, accepting out-of-stock products, legacy `src/js/**`.

## Git workflow

- Branch: `advisor/026-secure-shareable-cart`
- Commit: `fix(security): canonicalize shared cart products`
- No push/PR unless instructed.

## Steps

### Step 1: Define a versioned minimal payload

Add exported helpers in `storefront-state.ts` for a payload shaped as `{ version: 1, items: [{ id, quantity }] }`. Encoding must omit name, price, discount, category and image. Decoding must cap quantities with `clampQty`, deduplicate IDs deterministically and reject malformed/non-array/unsupported versions.

**Verify**: focused Vitest tests prove the serialized payload contains no commercial fields.

### Step 2: Rehydrate against current catalog

Add `hydrateSharedCart(payload, resolveProductById)` or equivalent. For each ID, resolve the current product and create the cart item via `createCartItemFromProduct`; drop missing or `stock === false` products. Support old array links only by reading their `id` and `quantity`; ignore every other old field.

**Verify**: unit tests with a forged price/discount produce the resolver's canonical values; unknown/out-of-stock IDs are omitted.

### Step 3: Wire the URL flow and preserve compatibility

Change `getShareableCartUrl` and `loadCartFromUrl` to use the helpers. Remove the hash after successful persistence as today. If no valid products remain, leave storage and URL unchanged and return false.

**Verify**: Playwright loads a deliberately forged legacy link and the cart/WhatsApp preview show current catalog data only.

### Step 4: Full gate

**Verify**: `npm run lint && npm run typecheck && npm test && npm run build` → exit 0.

## Test plan

Cover new-format round trip, legacy safe hydration, forged values, duplicate IDs, quantity caps, bad base64/JSON/version, missing product and out-of-stock product. Model pure tests after `test/storefront-state.spec.js`.

## Done criteria

- [ ] New links contain only version, product ID and quantity.
- [ ] Old links cannot supply price/name/discount/image.
- [ ] WhatsApp totals use catalog values.
- [ ] Focused and full gates pass; no out-of-scope files changed.

## STOP conditions

- Current catalog products cannot be resolved synchronously when the hash is processed.
- Product identity is ambiguous for a supported existing link.
- Compatibility requires trusting a legacy commercial field.

## Maintenance notes

Any future payload version must remain data-minimal and treat the catalog as price authority. Do not add integrity-sensitive fields without a signed server-issued format.
