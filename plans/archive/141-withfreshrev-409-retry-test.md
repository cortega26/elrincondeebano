# 141 — Component-test the withFreshRev 409 retry

- **Source**: Auditoría 10, TEST-02 · **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/test/web/productsPage.test.tsx`

## Problem

The plan-127 fix for stale-revision 409s (`withFreshRev`) shipped with only a manual verification note — no test. It is subtle stateful logic that has already regressed twice (`db6f00ca`, `723d9f4b`): a stale list closure made purge/archive/restore fail with a 409 the operator could miss; the fix refetches the product and retries once with the fresh revision.

`admin/content-manager/src/web/app/routes/ProductsPage.tsx:321-353`:

```ts
// Fix (verificación 2026-08-13): a stale revision (another edit/sync
// bumped the product) made purge/archive/restore fail with a 409 that the
// operator could miss — the product simply stayed. Reload and retry once
// with the fresh revision (the operator's intent is explicit).
async function withFreshRev(id: string, op: (freshRev: number) => Promise<unknown>): Promise<void> {
  try {
    await op(data?.items.find((p) => p.id === id)?.rev ?? 0);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 409) {
      let fresh: ProductResponse | null = null;
      try {
        fresh = await client.getProduct(id);
      } catch {
        // The product is gone (e.g. purged elsewhere) — the view is fresh.
      }
      if (!fresh) {
        setOpError('El producto cambió; la lista se recargó.');
        await reload();
        return;
      }
      await op(fresh.rev);
      await reload();
      return;
    }
    throw err;
  }
}
```

`test/web/productsPage.test.tsx` (92 lines, 4 tests) covers filter rendering, reorder-disabled-under-filter, and the bulk-confirm dialog — no 409 mock exists anywhere in the web suite. The harness (`test/web/harness.tsx:13-43`) already provides `getProduct`/`updateProduct` mocks. The undo-stack retry (`ProductsPage.tsx:569-574`) relies on the same mechanism.

## Scope

**In**: `admin/content-manager/test/web/productsPage.test.tsx` only.

**Out**: Source files, other suites.

## Steps

1. Add tests exercising `withFreshRev` through a public entry point (archive/purge/restore handlers call it):
   - **409 → refetch OK → retry**: `getProduct` resolves once with a product whose `rev` is newer than the stale list → assert `updateProduct` was called twice total (first with the stale rev, retry with the fresh rev) and the success feedback appears.
   - **409 → refetch fails**: `getProduct` rejects → assert the error message "El producto cambió; la lista se recargó." and `reload` was triggered.
   - **non-409 error**: the op rejects with e.g. a 500 → assert no retry and the error surfaces.
2. Assert the op is retried with `fresh.rev`, not the stale closure rev.

## Tests

Three cases as above in `test/web/productsPage.test.tsx`, using `mockApi` from the harness. Verify the harness exposes enough to assert `reload` (or assert via a subsequent render/query call).

## Done criteria

- [ ] All three cases pass (`npx vitest run test/web/productsPage.test.tsx` or `npm run admin:test`).
- [ ] A 409 no longer possible to regress silently (the retry branch is covered).
- [ ] `npm run admin:typecheck` and `npm run lint` green.

## Maintenance

The same stale-rev mechanism is used by undo (`:569-574`); when that path changes, extend these tests. A reviewer should confirm the mock `updateProduct` assertions count exactly two calls in the retry case — that count is the regression guard.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `ApiRequestError` is not exported where the test can import it (or the client throws a different error type for 409s), stop and report — the test must construct the real error class.
