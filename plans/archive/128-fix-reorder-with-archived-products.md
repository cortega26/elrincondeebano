# 128 — Fix reorder broken by archived products (regression)

- **Source**: Auditoría 10, CORR-01 · **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/api/client.ts`

## Problem

Since commit `db6f00ca` ("default list excludes archived"), the reorder feature 409s on every attempt when any product is archived. The live catalog has 184 products, 6 archived.

Server (`admin/content-manager/src/server/routes/productRoutes.ts:440-450`) requires the FULL catalog id list:

```ts
// Plan 088: reorder must cover the FULL catalog — a partial id list
// (visible page under filters/pagination) would compact the visible
// orders to 0..N and scramble the global order.
if (body.ordered_ids.length !== catalog.products.length) {
  return reply.status(409).send({
    error: {
      code: 'REORDER_SCOPE_AMBIGUOUS',
      message: `Reorder requires the full catalog (${catalog.products.length} products), got ${body.ordered_ids.length}. Clear filters and pagination first.`,
    },
  });
}
```

Client (`ProductsPage.tsx:205-210`) treats the default non-archived view as "full":

```ts
const canReorder =
  !!data &&
  !filtersActive &&
  data.total <= data.items.length &&
  sortField === 'order' &&
  sortDir === 'asc';
```

…and `handleReorder` (`ProductsPage.tsx:553-564`) sends only the visible ids:

```ts
const ids = data.items.filter((p) => p.id).map((p) => p.id!);
if (ids.length === 0) return;
try {
  await client.reorderProducts(ids);
```

`data.total`/`data.items` come from the default query `archived: 'false'` (`useProductsQuery.ts:45`), so `canReorder` is true while the payload is short → guaranteed `409 REORDER_SCOPE_AMBIGUOUS` with 178 vs 184.

## Scope

**In**: `admin/content-manager/src/web/app/routes/ProductsPage.tsx` (`handleReorder`), `admin/content-manager/src/web/app/useProductsQuery.ts` (only if a helper is needed), web tests `test/web/productsPage.test.tsx`.

**Out**: `productRoutes.ts` reorder endpoint and `productService.reorder` — the server-side full-catalog guard stays as the invariant. The archived view itself.

## Steps

1. In `handleReorder` (`ProductsPage.tsx:553-564`), before sending, fetch the archived products so the payload always covers the full catalog:
   - Query `archived: 'true'` (the ProductsPage already has an 'Archivados' view wiring for this filter; reuse the same query params), take its `items`, and append their ids **in server order** after the visible `data.items` ids.
   - Send `ordered_ids = [...visibleIds, ...archivedIds]`. If the archived query returns 0 items, behavior is unchanged from today (payload = visible = full).
   - `canReorder` stays as-is — the change is entirely in the payload construction.
2. Keep the existing ordering invariant: archived products land at the end of the new global order (index N..N+k). That is the documented, predictable consequence — note it in a code comment.

## Tests

- Extend `test/web/productsPage.test.tsx` (harness `test/web/harness.tsx` provides `getProducts` mocks): a test where the default (non-archived) query returns 4 items and the archived query returns 2 → clicking reorder sends `ordered_ids` of length 6 with the archived ids appended. Also the no-archived case (payload = visible ids only).
- Run: `npm run admin:test` green (web suite included); `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] With archived products present, reorder succeeds (payload length == full catalog).
- [ ] With no archived products, payload unchanged from current behavior.
- [ ] `npm run admin:test` green with the 2 new web tests.
- [ ] `npm run admin:typecheck` and `npm run lint` green; no files outside Scope modified.

## Maintenance

This is the second regression around the archived-view semantics (`db6f00ca` introduced it, this plan fixes it). If a future change makes reorder accept a partial payload, delete BOTH the server guard comment and the client appending logic in the same change — they encode one invariant.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `client.reorderProducts` or `useProductsQuery` signatures differ from this description, stop and report (drift).
- If the archived query endpoint returns items not ordered by `order`, stop — the append-order assumption fails.
