# Plan 174: Build undo entries from server snapshots and tolerate purged products

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/routes/undo.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Non-`all` undo entries snapshot old values from the _current page_
(`data.items`) while the server already returns the honest fresh snapshot in
`bulkApply`'s `result.changes` — so cross-page selections and edits that
landed between load and apply are silently excluded or stale, and undo
restores wrong values. Worse, `Promise.all(entry.perProductOldValues.map(
getProduct…))` rejects the _entire_ undo when a single product 404s
(purged), and an emptied action list then hits the `batch-update` non-empty
guard as a confusing 400. Client-only fix; the server contract is already
correct.

## Current state

Relevant files:

- `admin/content-manager/src/web/app/routes/ProductsPage.tsx` — undo entry
  construction (lines ~505–535), `handleUndo` with `Promise.all` fetch
  (lines ~581–600).
- `admin/content-manager/src/web/app/routes/undo.ts` — `buildUndoEntry`
  (`continue` on missing, lines 77–80), `computeUndoActions` skips missing
  rows (lines 97–104).
- `admin/content-manager/src/server/routes/productRoutes.ts` — batch-update
  non-empty guard (lines 358–366).

Excerpts (verified by advisor read):

```tsx
// ProductsPage.tsx ~518-532 — non-'all' scopes snapshot from current page
: buildUndoEntry({
    action: bulkAction, value: val, productIds: ids,
    products: data.items.filter(...).map((p) => ({ id, price, discount, stock, category })),
    preview: bulkPreview,
  });
```

```tsx
// ProductsPage.tsx ~590-595 — one 404 rejects the whole undo
const currentProducts = await Promise.all(
  entry.perProductOldValues.map(async (item) => {
    const product = await client.getProduct(item.product_id);
    return { id: item.product_id, rev: product.rev ?? 0 };
  })
);
```

Conventions: plan-099 semantics (entries move stacks only on success via
`moveEntryOnSuccess`) must be preserved; `computeUndoActions` already skips
missing rows — the client just never lets it get there. Tests:
`admin/content-manager/test/web/productsPage.test.tsx` (mocked harness
`harness.tsx`) and `categoriesUndo.test.tsx` for stack semantics.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/routes/ProductsPage.tsx` (undo paths)
- `admin/content-manager/src/web/app/routes/undo.ts` (only if a helper
  change is needed; prefer ProductsPage-only)
- `admin/content-manager/test/web/productsUndo.test.tsx` (create; or extend
  `productsPage.test.tsx` if the harness fits better)

**Out of scope**:

- Server routes, `batch-update` guard semantics, `computeUndoActions`
  (already correct).
- `CategoriesPage` undo (same pattern may apply — report as follow-up, do
  not expand scope).

## Git workflow

- Branch: `advisor/174-undo-server-snapshots`
- Commit per step; e.g. `fix(admin): undo from server changes; tolerate purged products (plan 174)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE. Install + typecheck + admin web tests unmodified.

**Verify**: green; otherwise STOP.

### Step 1: Build every undo entry from server `changes`

Replace the `data.items`-derived `products` argument with values derived
from `result.changes` (the post-apply server snapshot, which carries
per-product old/new values for exactly the mutated set) for ALL scopes,
not just `scope === 'all'`. If `result.changes` lacks a field the entry
needs, fetch that single product fresh (not from the page cache).

Keep the entry shape (`UndoEntry`) byte-compatible — only the _source_ of
values changes.

**Verify**: `npm run admin:typecheck` → exit 0; existing undo tests pass.

### Step 2: Tolerate purged products with allSettled + empty guard

- Replace `Promise.all(...)` with `Promise.allSettled(...)`; drop rejected
  (404/network) items and continue with the fulfilled ones.
- After `computeUndoActions`, if the action list is empty, show operator
  feedback (`Nothing left to undo — products were removed`) and return
  WITHOUT calling `batch-update` (avoid the confusing 400).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 3: Add web tests

New `test/web/productsUndo.test.tsx` (harness pattern from
`productsPage.test.tsx`):

1. Cross-page apply → undo entry contains server values, not page values.
2. One product 404s on rev-fetch → undo still applies to the rest.
3. All products purged → clean feedback, `batchUpdateProducts` never called
   (assert via mock).

**Verify**: `npm run admin:test` → all pass including the 3 new tests.

## Test plan

- New web test file, 3 cases above; stack-move-on-success semantics
  asserted (entry stays on undo stack after failed undo).
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with the 3 new undo tests passing.
- [ ] `grep -n "Promise.all($" admin/content-manager/src/web/app/routes/ProductsPage.tsx` returns no matches in `handleUndo` (allSettled used).
- [ ] `grep -n "data.items" admin/content-manager/src/web/app/routes/ProductsPage.tsx` shows no use in undo-entry construction.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `result.changes` does not carry the old values needed for undo entries
  (then the server contract differs from Current state — report, do not
  invent a new endpoint).
- The `UndoEntry` shape cannot accommodate server-sourced values without a
  migration of `sessionStorage` persisted stacks (report versioning approach
  instead of breaking stored stacks silently).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Stored undo stacks in `sessionStorage` keep the old shape — this plan must
  read both (or version-guard); note what you chose in the commit message.
- Check whether `CategoriesPage` needs the same treatment and file it as a
  follow-up; do not fix it here.
- **Deferred:** CategoriesPage undo parity (needs verification it shares the
  bug).
