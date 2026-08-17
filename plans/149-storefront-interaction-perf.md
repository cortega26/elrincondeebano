# 149 — Storefront interaction perf: companion cache + catalog-view reorder gating

- **Source**: Auditoría 10, PERF-01 + PERF-02 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/catalog-view.js test/storefront.catalog-view.spec.js test/`

## Problem

Two per-interaction costs on the storefront's main interaction paths:

**1. Companion suggestions re-extract product data from the DOM on every cart interaction.** `storefront.js:1235` runs `renderCompanionSuggestions(cart, companionRules)` inside `setQty` — every quantity +/−, add-to-cart, remove, empty-cart. It calls `getCompanionProducts` (`:671`) → `getProductCardMap().forEach(card => getProductFromCard(card))` (`:683-692`); `getProductFromCard` (`:411-432`) does a per-card `querySelector` plus two `normalizeSearchText` NFD-regex normalizations per card (`:687`). With 184 cards that's ~200 querySelector + ~400 regex normalizations PER CLICK. The card data lives in immutable `data-*` attributes — only ever read client-side.

**2. catalog-view.js moves every product node in the DOM on every filter keystroke.** `catalog-view.js:61-80` `updateView()` always sorts and re-appends ALL `.producto` nodes (detach+re-insert = full layout invalidation) even when the sort is `original` (server DOM order) and nothing reordered — every search keystroke (debounced 120ms, `storefront.js:1541-1547`), sort/discount change (`:1515-1519`), clear (`:1554-1571`) and `loadMore` (`catalog-view.js:143-151`). Additionally `normalizeSearchText` runs twice per product per call (`:49` and again in the searchText concat at `:51-58`).

## Scope

**In**: `astro-poc/src/scripts/storefront.js` (companion data cache), `astro-poc/src/scripts/storefront/catalog-view.js` (reorder gating + normalization hoist), `test/storefront.catalog-view.spec.js` (existing root vitest suite — extend).

**Out**: Rendering output (the DOM must be identical), the cart/order modules (plan 140's scope), e2e specs.

## Steps

1. **Companion cache** (`storefront.js`): build the id→product-data map once at init (iterate `getProductCardMap` once), store it in a module-level Map next to `productCardCache` (`:397-409`), and reset it from the existing `onViewUpdated` hook (`:898-900`) when the catalog view changes (reorder/loadMore). `getCompanionProducts` then does map lookups + rule matching — zero DOM queries. Keep `getProductFromCard` for any other caller (don't delete).
2. **catalog-view.js**: gate the fragment re-append on an actual order change: when `sortValue === 'original'` (or the computed order equals the current DOM order — compare ids in order), skip the sort/re-append pass entirely; the matching/hiding pass (`:82-103`) still runs (it is independent of DOM order). Hoist the per-product `name` normalization so it's computed once and reused in the searchText concat.
3. Verify the default sort path (`original`) produces byte-identical DOM as before.

## Tests

- `test/storefront.catalog-view.spec.js` (existing suite): (a) with `sortValue === 'original'`, calling `updateView` does not detach/re-append nodes (spy on `container.appendChild` or `replaceChildren`); (b) a sort change still reorders; (c) search still filters correctly after the hoist.
- Companion: add a test asserting `getCompanionProducts` returns the same products before/after a cart mutation without re-scanning the DOM (spy on the card-map iteration or assert via a cache-hit counter if exposed; otherwise assert result equality + a spy on `querySelector`).
- Run: `npx vitest run test/storefront.catalog-view.spec.js` and the root suite; `npm run typecheck:astro` and `npm run lint` green.

## Done criteria

- [ ] Companion suggestions render correctly from the cache (asserted).
- [ ] `updateView` with `original` sort does no DOM re-append (asserted).
- [ ] Root vitest suite green.

## Maintenance

The DOM data-attributes are the cache's source of truth; any script that mutates them (none today — verified) must also reset the cache. `onViewUpdated` is the reset hook for catalog changes. A reviewer should confirm e2e cart tests (`test/e2e-astro/cart-ux.spec.ts`) still pass — they exercise the real interaction path.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `getProductFromCard` reads fields that change over the page lifetime (not just data-attributes), stop and report — the immutability assumption is false.
