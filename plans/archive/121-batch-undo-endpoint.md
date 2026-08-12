# 121 — Batch-undo endpoint (single atomic write for multi-product undo)

- **Source**: Auditoría 9, PERF-03
- **Status**: TODO · **Priority**: P3 · **Effort**: M
- **Stamped against**: `b3805e1`
- **Depends on**: plan 099 (undo stack semantics) — land 099 first so this
  plan ports the corrected success-path semantics.

## Problem

Undo of a multi-product edit issues N serial HTTP calls, each a full-catalog
atomic rewrite:

```ts
// ProductsPage.tsx:491-493
for (const action of actions) {
  await client.updateProduct(action.id, action.rev, action.patch);
}
```

Each call hits `routes/catalog.ts:290` `writeCatalog(...)`, which rewrites
and fsyncs the entire catalog under the mutation lock with a revision check.
Undoing a 50-product bulk edit = 50 sequential round trips, each
serializing + atomically rewriting the whole catalog — even though the
server-side `changeSetApplier` (`services/changeSetApplier.ts:192`) already
proves a single `writeCatalog` can apply many ops at once.

## Scope

**In**: `admin/content-manager/src/server/routes/catalog.ts` (or a new
route), the client (`src/web/api/client.ts`), `ProductsPage.tsx`
(handleUndo/handleRedo), the undo integration tests.

**Out**: the per-product PATCH semantics for non-undo paths, bulk apply.

## Steps

1. Add a batch endpoint (e.g. `POST /api/v1/products/batch-update`) that
   takes `[{ id, rev, patch }]`, validates all, applies them under ONE
   `writeCatalog` with a single revision guard (mirror the change-set
   applier's loop; preserve per-op idempotency — a no-op op must not bump
   rev, consistent with plan 102).
2. Port `handleUndo`/`handleRedo` (post-plan-099) to call the batch
   endpoint once. Keep the success-path stack semantics from 099.
3. Keep the per-product PATCH route untouched (used by inline edits).
4. Error contract: the batch endpoint must report per-op failures in the
   response body (which op failed + why) so the UI can show which products
   to retry — do NOT fail the whole batch on the first bad op if the
   remaining ops are valid (decide and document: recommend validate-all →
   apply-all, atomic; on conflict, return 409 with the failed op list).

## Tests

- Integration: batch update of 50 products = one disk write (assert via
  the repository's write counter if available, or via the mutation lock
  being acquired once — the existing mutation tests' patterns apply); a
  batch with one invalid rev → 409 + no partial application.
- Contract: idempotency (applying the same batch twice → second is no-op,
  consistent with plan 102's `changed` semantics).
- E2E/scope: the bulk-apply → undo → redo flow in scope.spec.ts still
  green (now through the batch path).
- Run: `npm run admin:test` + scope e2e green.

## Done criteria

- [ ] Undo/redo of a 50-product entry issues exactly 1 mutation request
      (count in the e2e or a test assertion on the server log).
- [ ] Batch failure leaves the catalog unchanged (no partial writes).
- [ ] 099's stack tests still green (ported semantics).
- [ ] `npm run admin:test` + `npm run lint` + `npm run typecheck` green.

## Maintenance

This is the natural companion to the change-set applier — future
multi-entity mutations should reuse this endpoint's semantics. Plan 105
(catalog snapshots) and this plan compose cleanly (batch loads one clone).

## Rollback

`git revert <sha>` — new endpoint is additive; the UI can revert to the
loop by reverting the ProductsPage change only.
