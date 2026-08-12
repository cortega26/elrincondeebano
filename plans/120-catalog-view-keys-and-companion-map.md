# 120 — Precompute catalog-view sort/search keys and hoist companion map

- **Source**: Auditoría 9, PERF-05 + PERF-06
- **Status**: TODO · **Priority**: P3 · **Effort**: S
- **Stamped against**: `b3805e1`

## Problem

Two small algorithmic inefficiencies in the storefront runtime (negligible
at the current 184 products, but textbook traps if the catalog grows):

1. **Sort keys computed inside the comparator**
   (`astro-poc/src/scripts/storefront/catalog-view.js:44-64`): the sort
   comparator calls `normalizeSearchText` (NFD regex + lowercase) twice per
   comparison → O(n log n) string-heavy work per keystroke (120 ms debounce,
   storefront.js:1981-1987). Also `:71-86` recomputes each product's search
   text on every `updateView`, and `:66-68` re-appends all nodes. Each
   `updateView` invalidates `productCardCache` (`storefront.js:1163-1165`),
   forcing re-scans by personalization/companion code.
2. **Companion map rebuilt per rule, per cart interaction**
   (`storefront.js:735-754`): inside `companionRules.forEach`, the whole
   `productByKey` map is rebuilt by scanning every product card
   (`getProductCardMap().forEach` + `getProductFromCard` +
   `normalizeSearchText` per product) — identical, rule-invariant work on
   every `setQty` (each +/- click), called from `renderCompanionSuggestions`
   (1673, 1740, 2016).

## Scope

**In**: `astro-poc/src/scripts/storefront/catalog-view.js`,
`astro-poc/src/scripts/storefront.js` (companion-suggestion block).

**Out**: DOM output, sort/filter semantics, any e2e assertions on order.

## Steps

1. In `catalog-view.js`: precompute each product's sort key and search text
   once per `updateView` into a Map (keyed by product id), and have the
   comparator read from it — never compute inside the comparator. Keep the
   exact same comparison semantics (verify: same sort order for the current
   data with a before/after test).
2. Hoist the `productByKey` map build out of the `companionRules.forEach`
   loop in `storefront.js` (build once per call, reusing the existing
   `productCardCache` where possible — check what `getProductCardMap` reads
   from so the cache invalidation contract stays intact).
3. Pure refactor: no DOM/text changes. Verify with the existing e2e sort/
   companion tests (catalog sort options are exercised in the storefront
   e2e suite; companion suggestions in cart tests).

## Tests

- Unit (if a vitest spec covers catalog-view helpers — check
  `test/storefront*`; otherwise rely on e2e): sort order identical for the
  fixture catalog, search matches identical.
- E2E: storefront suite green (44 tests), especially sort/filter and cart
  companion specs.
- `npm run lint` (astro-poc) green.

## Done criteria

- [ ] Comparator contains no `normalizeSearchText` call (grep).
- [ ] Companion map built once per call, outside the rules loop.
- [ ] Storefront e2e suite green.

## Maintenance

If the catalog ever grows past ~500 products, these two sites are the first
hot spots; the precomputed-keys pattern here becomes the template for the
rest of the view layer.

## Rollback

`git revert <sha>` (pure refactor — revert restores prior behavior exactly).
