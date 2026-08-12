# 117 — Complete the storefront storage abstraction (favorites + shared-cart feedback)

- **Source**: Auditoría 9, TDA-07 + CORRECTNESS-08
- **Status**: TODO · **Priority**: P3 · **Effort**: S
- **Stamped against**: `b3805e1`

## Problem

The storage abstraction exists but is bypassed in two places:

1. **Favorites bypass** (`astro-poc/src/scripts/storefront.js:259-265`):
   ```js
   function getFavorites() {
     return JSON.parse(globalThis.localStorage.getItem('astro-poc-favorites') || '[]');
   }
   ```
   Direct `localStorage.getItem` + unguarded `JSON.parse` — no safe-parse,
   no slot key constant, no migration — while `createStorefrontStorage`/
   `readStorefrontSlot`/`writeStorefrontSlot`
   (`storefront/storage-contract.ts:80-135`) already provide all of it, and
   `migrateLegacyStorefrontState` (storage-contract.ts:138+) handles the
   legacy keys.
2. **Silent shared-cart refusal** (`storefront.js:244-245`):
   ```js
   var currentCart = loadCart();
   if (currentCart.length > 0) return false;
   ```
   A valid shared-cart link is ignored whenever any cart exists — silently:
   no message, the link appears broken. `saveCart` (172-181) also writes the
   raw (unsanitized) `cart` to the legacy key while writing the sanitized
   cart to the canonical key.

## Scope

**In**: `astro-poc/src/scripts/storefront.js` (getFavorites, loadCartFromUrl,
saveCart legacy write-through), `storefront/storage-contract.ts` (add a
favorites slot), the storage tests.

**Out**: cart state semantics, other consumers of the legacy key.

## Steps

1. Add a `favorites` slot to `STOREFRONT_STORAGE_KEYS` in
   `storage-contract.ts` and route `getFavorites` through
   `storefrontStorage.loadJson` (same pattern as the cart slot). Verify the
   migration path: existing users' `astro-poc-favorites` values must survive
   (add it to `migrateLegacyStorefrontState` if that helper owns legacy-key
   migration — mirror the cart's legacy handling).
2. `loadCartFromUrl`: when the current cart is non-empty, do not silently
   return false — surface a user-visible message (check the existing
   feedback/status elements; e.g. reuse the submit-feedback or a toast
   pattern) explaining the link was not applied because the cart has items,
   or merge per the product decision in the plan review (recommend: notify,
   do not auto-merge — destructive auto-merge is worse than silence).
3. `saveCart` legacy write-through: serialize `sanitizeCart(cart)` for the
   legacy key so the two keys can never diverge in validity.
4. No storage-key renames beyond favorites (cart keys stay stable — the
   migration window is documented in the code).

## Tests

- Unit: `test/storefront-state.spec.js` / storage-contract tests — favorites
  round-trip incl. corrupt JSON (safe-parse), legacy favorites migration,
  sanitized legacy write-through.
- E2E: `test/e2e-astro/storage-contract.spec.ts` — the forged shared-cart
  link test (T11) is the pattern; add: non-empty cart + shared link →
  message shown, cart unchanged.
- Run: `npm test` + the storage-contract e2e green.

## Done criteria

- [ ] `grep -n "astro-poc-favorites" astro-poc/src/` → only the key constant
      (storage-contract.ts).
- [ ] No direct `localStorage.getItem/setItem` remains outside
      `storage-contract.ts` (grep).
- [ ] Non-empty-cart + shared link shows feedback (e2e test).
- [ ] `npm run validate` green.

## Maintenance

`storage-contract.ts` is the single localStorage seam — the pattern for all
future slots. The shared-cart notify decision (not auto-merge) is a product
call: record it in the test so it can be reversed consciously.

## Rollback

`git revert <sha>`.
