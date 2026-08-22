# 134 — Enforce the category-in-use guard on batch delete (undo of create)

- **Source**: Auditoría 10, CORR-05 · **Status**: TODO · **Priority**: P1 · **Effort**: S-M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/categoryRoutes.ts admin/content-manager/src/web/app/routes/CategoriesPage.tsx`

## Problem

The plan-127 F2.1 batch endpoint validates a delete op only by existence, while the single `DELETE /categories/:id` route blocks deletion of in-use categories. Undo of a category create uses the batch path, so it can orphan products.

`admin/content-manager/src/server/routes/categoryRoutes.ts:226-233` — batch delete validation:

```ts
} else if (op.type === 'delete') {
  const id = (op.category as { id?: string } | undefined)?.id;
  if (!id || !registry.categories?.some((c) => c.id === id)) {
    return reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Category "${id ?? ''}" not found` },
    });
  }
  parsedOps.push({ type: 'delete', category: op.category });
```

The single route (`:160-167`) blocks in-use categories with `409 CATEGORY_IN_USE` (and offers reassignment). The undo path (`CategoriesPage.tsx:73-77`) calls `batchUpdateCategories([{ type: 'delete', category: { id } }])` for `op === 'create'` — a category with assigned products gets deleted, and the products keep dangling references (`astro-poc/src/lib/catalog.ts:303` then silently drops those products from listings). Redo of delete (`:103-107`) has the same hole.

## Scope

**In**: `admin/content-manager/src/server/routes/categoryRoutes.ts` (batch-update delete validation), integration tests (`test/integration/categoryMutationApi.test.ts` or `test/contract/categoryService.test.ts`).

**Out**: The single-route semantics, the UI (409 handling in `handleMutationError` already reloads with a message).

## Steps

1. In the batch delete validation, run the same usage scan the single route uses: load the product catalog (`repos.products.loadCatalog()`), count products with `p.category === id`. If `usage.length > 0`, return `409 CATEGORY_IN_USE` with the same message shape as `:161-166` (which includes the count and the reassign hint).
2. Validate ALL ops before applying any (the endpoint already does this in two phases — the usage check goes in the validation phase, keeping all-or-nothing).
3. Decide the reassign path explicitly: the single route supports `reassign_to`; the batch delete op does not. Keep batch delete strict (no reassign in batch) — document with a comment that undo-of-create on an in-use category is intentionally rejected; the operator must unassign first (or use the single route).

## Tests

- Integration test: create a category, assign a product to it, batch-delete it → `409 CATEGORY_IN_USE`; batch-delete an unused category → 200 and the record gone. Also the mixed-ops case: an `[upsert, delete]` batch where the delete is in-use → the whole batch is rejected (all-or-nothing).
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Batch delete of an in-use category returns `409 CATEGORY_IN_USE` (asserted).
- [ ] Batch delete of an unused category still works (asserted).
- [ ] All-or-nothing holds for mixed batches (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

The single route and the batch endpoint must keep the same guard — the undo/redo UI depends on the batch endpoint being safe. If reassignment is ever added to batch ops, mirror the single route's `reassign_to` semantics and test both directions (undo of create + redo of delete).

## Rollback

`git revert <sha>`.

## STOP conditions

- If products reference categories by a field other than `category` (e.g. `category_id`), stop and report — the usage scan must match the real field.
