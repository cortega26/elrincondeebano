# 099 — Fix undo/redo stack corruption on failure

- **Source**: Auditoría 9, B2 (CORRECTNESS-02)
- **Status**: TODO · **Priority**: P1 · **Effort**: M
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/web/app/routes/ProductsPage.tsx` moves undo entries
between the stacks **before** the network operations succeed:

```js
// ProductsPage.tsx:474-499 (handleUndo)
async function handleUndo(): Promise<void> {
  const entry = undoStack.current.pop();
  if (!entry || entry.perProductOldValues.length === 0) return;
  redoStack.current.push(entry);
  saveStack('cm-undo-stack', undoStack.current);
  saveStack('cm-redo-stack', redoStack.current);

  try {
    const currentProducts = await Promise.all(
      entry.perProductOldValues.map(async (item) => {
        const product = await client.getProduct(item.product_id);
        return { id: item.product_id, rev: product.rev ?? 0 };
      })
    );
    const actions = computeUndoActions(entry, currentProducts);
    for (const action of actions) {
      await client.updateProduct(action.id, action.rev, action.patch);
    }
    setFeedback('Operación deshecha ✓');
    await reload();
  } catch (err) {
    setOpError((err as Error).message);
  }
}
```

Any failure (404 purged product, 409 stale rev, network error) leaves the
entry stranded in `redoStack`: the undo entry is gone from `undoStack`, and
clicking "Rehacer" re-applies the **original bulk action** — the opposite of
what the operator asked for. A mid-loop failure leaves some products undone
and the rest untouched, with no way to retry the undo.

The bulk apply path (`ProductsPage.tsx:429-432`) records the entry only after
success — the undo path must behave the same.

## Scope

**In**: `admin/content-manager/src/web/app/routes/ProductsPage.tsx`
(`handleUndo`/`handleRedo`), `routes/undo.ts` if it needs helpers, and the
undo tests (`admin/content-manager/test/contract/undo.test.ts` covers the pure
functions only — the stack mutation lives in the page).

**Out**: the server, `computeUndoActions`/`buildUndoEntry` semantics, bulk
apply.

## Steps

1. In `handleUndo`: pop the entry, then run the fetch+apply inside try/catch.
   Only after every `updateProduct` succeeds: push to `redoStack`,
   `saveStack` both, set feedback, reload. On failure: push the entry **back**
   onto `undoStack`, save both stacks, surface the error.
2. Same reorder in `handleRedo` (pop → apply → on success push to
   `undoStack`; on failure restore to `redoStack`).
3. Partial-failure policy: on error after some products succeeded, keep the
   entry on the original stack (restore it) and tell the operator which
   products failed (reuse `setOpError` with the entry's product count). Do
   NOT attempt to roll back already-applied per-product patches (the server
   has no bulk-rollback); the restored entry can be retried idempotently
   because `computeUndoActions` re-derives patches from fresh revisions.
4. Keep the `saveStack` calls (localStorage persistence) exactly in sync with
   the in-memory stacks — never persist a state that differs from what the
   buttons would do next.

## Tests

- Contract/integration: add a page-level test (or a harness test using the
  undo helpers with a failing `client.updateProduct`) that proves: (a) a
  409/404 on undo does NOT lose the entry from `undoStack` and does NOT push
  it to `redoStack`; (b) redo has the same property; (c) after a successful
  undo the entry IS in `redoStack`.
- E2E: in `test/e2e/scope.spec.ts` add a flow: bulk-apply an action, undo it,
  verify the redo button re-applies — and a failure-injection variant if the
  suite already has one (see `failureInjection` patterns in
  `test/integration/failureInjection.test.ts`).
- Run: `npm run admin:test` (vitest) and the scope e2e config green.

## Done criteria

- [ ] `handleUndo`/`handleRedo` mutate the stacks only inside the success path.
- [ ] New tests fail on `ccb921f` and pass after.
- [ ] `npm run admin:test`, `npm run lint`, `npm run typecheck` green; scope e2e green.

## Maintenance

Plan 121 (batch-undo endpoint) will replace the per-product loop with one
call — keep the stack semantics in the success path when porting. Any future
failure-injection test for undo should live next to this fix.

## Rollback

`git revert <sha>`.
