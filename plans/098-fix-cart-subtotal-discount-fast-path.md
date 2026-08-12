# 098 — Fix cart subtotal ignoring discount in the quantity fast path

- **Source**: Auditoría 9, B1 (CORRECTNESS-01)
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ccb921f` (drift check: `git rev-parse --short HEAD` must match before starting; if it differs, re-read the cited lines)

## Problem

In `astro-poc/src/scripts/storefront.js`, `renderCart` has a fast path for
updating an already-rendered cart item (the `changedItemId` branch). It writes
the subtotal at the **raw price**, while every other money figure on the same
row (the "Unitario" line, the "Total" below, the WhatsApp order and the
checkout summary) uses the discounted price:

```js
// storefront.js:942-945 (fast path)
const subtotalSpan = existingEl.querySelector('.cart-item__subtotal');
if (subtotalSpan) {
  subtotalSpan.textContent = `Subtotal: ${formatCurrency(cartItem.price * cartItem.quantity)}`;
}
```

The full render path computes the discounted value:

```js
// storefront.js:1039-1050 (full render)
const effectivePrice = Math.max(0, item.price - (item.discount || 0));
```

For any product with a discount, clicking "+"/"−" in the cart shows a subtotal
at the pre-discount unit price while "Unitario" and "Total" on the same line
use the discounted price — three numbers that disagree, and the figure the
shopper sees differs from the one sent to WhatsApp.

## Scope

**In**: `astro-poc/src/scripts/storefront.js` (the `changedItemId` fast-path
branch inside `renderCart`), its unit tests, `test/e2e-astro/cart-ux.spec.ts`.

**Out**: any other pricing logic, the full-render path, `storefront-state.js`,
`formatting.js`.

## Steps

1. In the fast-path branch (line ~943), compute and use the same
   `effectivePrice` the full render uses:
   ```js
   const effectivePrice = Math.max(0, cartItem.price - (cartItem.discount || 0));
   subtotalSpan.textContent = `Subtotal: ${formatCurrency(effectivePrice * cartItem.quantity)}`;
   ```
2. Verify the "Unitario" span in the same branch is updated on qty change
   (if it is left stale by the fast path, update it the same way the full
   render does).
3. Repo convention: money math lives in `astro-poc/src/lib/formatting.js`
   (`formatCurrency`); do not introduce a second formatting path.
4. Lint gate: `npx eslint astro-poc/src/scripts/storefront.js --config astro-poc/eslint.config.mjs` (0 errors).

## Tests

- Unit: extend `test/storefront-state.spec.js` (or the spec that covers
  `renderCart` helpers) — assert the subtotal string equals
  `formatCurrency((price - discount) * qty)` for a discounted product.
- E2E: extend `test/e2e-astro/cart-ux.spec.ts` with a discounted product
  flow: add to cart → adjust quantity → assert the `cart-item__subtotal`
  text shows the discounted total, and that it equals the "Total" minus
  undiscounted items.
- Run: `npm test` (root vitest), then
  `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts cart-ux` (green).

## Done criteria

- [ ] `grep -n "cartItem.price \* cartItem.quantity" astro-poc/src/scripts/storefront.js` returns nothing.
- [ ] New unit test fails on `ccb921f` (pre-fix) and passes after.
- [ ] `npm run lint && npm run typecheck` green; `npm test` green; cart-ux e2e green.

## Maintenance

Watch: any future "price or discount semantics" change must touch both the
fast path and the full render — keep them calling one shared helper
(`effectivePrice` extracted to a named function) so they cannot drift again.
This is the second time these two paths have disagreed.

## Rollback

`git revert <sha>` — one-line change, no data migration.
