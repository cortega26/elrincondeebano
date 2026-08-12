# 102 — Fix bulkApply counting no-op products as changed (rev inflation)

- **Source**: Auditoría 9, B5 (CORRECTNESS-05)
- **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/domain/products/productService.ts` `bulkApply`
applies the operation to every id-matching product and unconditionally bumps
`rev`/`changed`:

```ts
// productService.ts:480-532 (bulkApply loop)
// product.rev += 1 and changed += 1 for every product in scope,
// even when the operation is a no-op (e.g. set_discount_percent 10% on a
// product already at 10%, set_stock with the same value, delta 0%)
```

The preview (`bulkPreview`, productService.ts:376-453) **excludes** those
no-op products, so the response's `changed` count and the applied `changes`
array disagree: the operator sees "Aplicado: 24 productos modificados" when
only 20 changed, and every no-op product's `rev`/`field_last_modified`
advance — inflating history rows and burning the per-product revision budget
(which also guards revert targets).

## Scope

**In**: `admin/content-manager/src/domain/products/productService.ts`
(`bulkApply`), its contract tests (`test/contract/` — find the bulk tests,
e.g. `bulkMutation` suites).

**Out**: `bulkPreview` semantics, the UI, the undo snapshot builder
(`buildUndoEntry` in `routes/undo.ts` — keep its output consistent with the
new `changed` count).

## Steps

1. In `bulkApply`, apply the operation only to products that the action
   would actually change — mirror the skip conditions the preview uses
   (the preview already has this logic; extract it to a shared
   `shouldApplyAction(product, action): boolean` used by both paths).
2. Count `changed` from the products actually mutated; only bump `rev` for
   those.
3. Verify `buildUndoEntry` (ProductsPage/undo.ts:404-428) still lines up with
   the new semantics — its scope is derived from the preview, so it should
   remain correct; adjust if the count change ripples.

## Tests

- Extend the bulk contract tests: for each action type, a case where the
  action is a no-op on the fixture product (same discount %, same stock,
  delta 0) → assert `changed === 0` and `rev` unchanged.
- Assert the "apply twice" scenario: applying the same bulk action twice
  yields `changed: 0` on the second call.
- Run: `npm run admin:test` green.

## Done criteria

- [ ] `bulkApply` on all-no-op inputs returns `changed: 0` and mutates no revs.
- [ ] Preview count == applied count in every fixture test.
- [ ] `npm run admin:test` green; `npm run lint` green.

## Maintenance

The preview/apply duality is the invariant to protect: any new bulk action
must be added to the shared `shouldApplyAction` so preview and apply cannot
drift again. This is the same drift class as B1 (two paths disagreeing).

## Rollback

`git revert <sha>`.
