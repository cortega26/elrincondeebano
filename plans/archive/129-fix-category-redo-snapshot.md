# 129 — Fix category redo re-applying the pre-update snapshot (edit silently lost)

- **Source**: Auditoría 10, CORR-02 · **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/web/app/routes/CategoriesPage.tsx`

## Problem

Undo/redo (plan 127 F2.1) for category **update** stores only the pre-update record. Redo therefore re-upserts the OLD record: Edit category → Undo → Redo leaves the category at the pre-edit state — the edit is silently lost, and the entry moves to the undo stack as if the redo succeeded.

`CategoriesPage.tsx:190-196` — the undo entry for an update captures only `previousRecord` (the record as it was BEFORE the edit):

```ts
if (editing) {
  const previousRecord = categoryRecordById(editing.id);
  await client.updateCategory(editing.id, form, data?.rev ?? 0);
  if (previousRecord) {
    undoStack.current.push(buildCategoryUndoEntry('update', editing.id, previousRecord));
```

`CategoriesPage.tsx:108-113` — redo for `op === 'update'` (the `else if (entry.previous)` branch) upserts `previous` again:

```ts
} else if (entry.previous) {
  await client.batchUpdateCategories(
    [{ type: 'upsert', category: entry.previous }],
    baseRev
  );
```

Undo (`:78-83`) correctly upserts `previous`; redo must upsert the post-update state — which is never stored.

## Scope

**In**: `admin/content-manager/src/web/app/routes/CategoriesPage.tsx` — the undo-entry builder (`buildCategoryUndoEntry` and the `CategoryUndoEntry` type) and `handleRedoCategory` (`:94-122`). Web tests `test/web/categoriesUndo.test.tsx`.

**Out**: The batch endpoint contract, the server, other op types' semantics (create/delete are correct).

## Steps

1. Extend the undo-entry type (and `buildCategoryUndoEntry`) so an update entry carries both `previous` (pre-edit record) and `next` (the saved record). At save time (`handleSave`, `CategoriesPage.tsx:187-214`), the post-state is exactly what was submitted — capture it from the form/created record, not from a reload.
2. In `handleRedoCategory`, for `op === 'update'` upsert `entry.next` instead of `entry.previous`. Undo is untouched.
3. Guard: if `entry.next` is missing (entries persisted before this fix, `cm-category-undo-stack` in localStorage), fall back to `entry.previous` — no data loss, same behavior as today.

## Tests

- Extend `test/web/categoriesUndo.test.tsx` (the existing plan-127 harness tests are the pattern): update → undo → redo asserts the category is back at the POST-edit state; the legacy-entry fallback case (entry without `next`).
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Redo of an update restores the post-edit record (asserted in test).
- [ ] Redo of create/delete unchanged.
- [ ] `npm run admin:test` green with the new tests; `npm run admin:typecheck` green.

## Maintenance

This is the same snapshot-semantics class as plan 099 (products): undo/redo entries must carry enough state to invert AND re-apply. When adding a new op type to category undo/redo, decide both directions' snapshots together.

## Rollback

`git revert <sha>`.

## STOP conditions

- If the stored undo stack format is validated anywhere else (migration code, other readers of `cm-category-undo-stack`), stop and report before changing the shape.
