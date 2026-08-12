# 101 — Fix reorder gating under discount filters (guaranteed 409)

- **Source**: Auditoría 9, B4 (CORRECTNESS-04)
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/web/app/routes/ProductsPage.tsx` computes
`filtersActive` without the three discount filter params:

```ts
// ProductsPage.tsx:153
const filtersActive = Boolean(q || category || outOfStock || minPrice || maxPrice || archived);
const canReorder =
  !!data &&
  !filtersActive &&
  data.total <= data.items.length &&
  sortField === 'order' &&
  sortDir === 'asc';
```

The discount filters (`discountedOnly`, `minDiscount`, `maxDiscount`, read at
ProductsPage.tsx:45-47) are missing. With "solo ofertas" or a min/max discount
filter, `canReorder` is true whenever the filtered set fits one page — drag
handles and the reorder button are enabled — but the server rejects every
reorder because it requires the full catalog:

```ts
// routes/catalog.ts:376
// returns 409 REORDER_SCOPE_AMBIGUOUS when ordered_ids.length !== catalog.products.length
```

The UI sends only the filtered page's ids, so every attempt fails with a
guaranteed 409. The reorder tooltip (`BulkOpsBar.tsx:130-133`) even claims
reorder is available.

## Scope

**In**: `admin/content-manager/src/web/app/routes/ProductsPage.tsx`
(`filtersActive`), `BulkOpsBar.tsx` if it duplicates the gating logic,
`test/e2e/scope.spec.ts` (reorder tests).

**Out**: server reorder logic, drag-and-drop implementation.

## Steps

1. Include the discount params in `filtersActive`:
   ```ts
   const filtersActive = Boolean(
     q ||
     category ||
     outOfStock ||
     minPrice ||
     maxPrice ||
     archived ||
     discountedOnly ||
     minDiscount !== '' ||
     maxDiscount !== ''
   );
   ```
   (Check the actual param types at ProductsPage.tsx:45-47 — `minDiscount`/
   `maxDiscount` are strings from the URL; use the same truthiness the
   server query uses.)
2. Prefer deriving `filtersActive` from the URL search params
   (`activeFilterCount`) if that is cleaner and matches FilterBar's param
   names — the important contract is: any active filter disables reorder.
3. Add an e2e assertion: with a discount filter active, the reorder button is
   disabled and drag handles are not rendered.

## Tests

- Extend the reorder section of `test/e2e/scope.spec.ts`: enable a discount
  filter, assert `canReorder` is false (button disabled / handles absent),
  then clear filters and assert reorder works.
- Unit: if `filtersActive` is extracted to a helper, cover it in the admin
  vitest suite.
- Run: `npm run admin:test` + scope e2e config green.

## Done criteria

- [ ] With any discount filter active, no reorder affordance is rendered.
- [ ] Test fails on `ccb921f`, passes after.
- [ ] `npm run lint && npm run typecheck` green.

## Maintenance

Every new FilterBar param must be added here or the "UI promises, server
refuses" class of bug returns. Consider a comment linking `filtersActive` to
the server's `REORDER_SCOPE_AMBIGUOUS` contract.

## Rollback

`git revert <sha>`.
