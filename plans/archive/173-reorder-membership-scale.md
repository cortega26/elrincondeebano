# Plan 173: Reject non-member reorder lists and uncap the reorder path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/domain/products/productService.ts admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/components/useProductsQuery.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The reorder endpoint checks list _length_ and _duplicates_ but never _set
membership_: submitting `[C,B,X]` against catalog `[A,B,C]` passes both
checks, `reorder()` silently skips unknown `X` and leaves `A` at its old
`order`, producing duplicate `order` values with a 200 response — scrambled
storefront sort with no error. Separately, the client hard-caps the data the
reorder path can ever see (archived fetch `limit: 200`, "Todos" page size
`min(total, 500)`), so beyond 200 archived or 500 total products reorder is
permanently dead. Both are small, safe fixes on the plan-128 contract.

## Current state

Relevant files:

- `admin/content-manager/src/server/routes/productRoutes.ts` — reorder route
  (lines 440–493).
- `admin/content-manager/src/domain/products/productService.ts` — `reorder()`
  (lines ~343–377).
- `admin/content-manager/src/web/app/routes/ProductsPage.tsx` —
  `reorderWithFullCatalog` (lines 37–44), `canReorder` (lines 220–225),
  "Todos" size (lines 668–680).
- `admin/content-manager/src/web/app/components/useProductsQuery.ts` —
  page-size clamp `Math.min(500, ...)` (limit computation).

Excerpts (verified by advisor read):

```ts
// productRoutes.ts:458-474 — length + duplicates, NO membership check
if (body.ordered_ids!.length !== catalog.products.length) {
  return { ok: false, statusCode: 409, code: 'REORDER_SCOPE_AMBIGUOUS', ... };
}
const uniqueIds = new Set(body.ordered_ids);
if (uniqueIds.size !== body.ordered_ids!.length) { ... duplicates ... }
const result = productService.reorder(catalog, body.ordered_ids!);
```

```ts
// productService.ts reorder — unknown ids skipped, missing keep old order
for (let i = 0; i < catalog.products.length; i++) {
  const product = catalog.products[i];
  if (!product.id || !idSet.has(product.id)) continue;  // missing ids keep stale `order`
  const newOrder = orderedIds.indexOf(product.id);
  ...
}
```

```ts
// ProductsPage.tsx:37-44 — archived fetch truncates at 200, no pagination
const archivedResult = await client.getProducts({ archived: true, page: 1, limit: 200 });
```

Conventions: reorder errors use `REORDER_SCOPE_AMBIGUOUS` (409) for scope
problems (plan 088/128) and `BAD_REQUEST` (400) for malformed lists; the
client builds the full id list (`visibleIds + archivedIds`). Keep both.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/productRoutes.ts` (reorder route)
- `admin/content-manager/src/web/app/routes/ProductsPage.tsx`
  (`reorderWithFullCatalog` + "Todos" cap for the reorder path)
- `admin/content-manager/src/web/app/components/useProductsQuery.ts`
  (only if the 500 clamp must be bypassed for reorder)
- `admin/content-manager/test/integration/reorderMembership.test.ts` (create)

**Out of scope**:

- `productService.reorder()` internals (leave the skip logic; the route now
  guarantees set equality before calling it).
- Changing `REORDER_SCOPE_AMBIGUOUS` semantics for genuinely partial lists
  (still 409).
- A new full-id-list endpoint (only if pagination proves insufficient — see
  STOP conditions).

## Git workflow

- Branch: `advisor/173-reorder-membership-scale`
- Commit per step; e.g. `fix(admin): reject non-member reorder lists; paginate archived fetch (plan 173)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE. Install + typecheck + admin tests unmodified.

**Verify**: green; otherwise STOP.

### Step 1: Reject unknown/missing ids server-side

In the reorder route, after the duplicates check, compare sets:

```ts
const catalogIds = new Set(catalog.products.map((p) => p.id));
if (uniqueIds.size !== catalogIds.size || ![...uniqueIds].every((id) => catalogIds.has(id))) {
  return {
    ok: false,
    statusCode: 400,
    code: 'BAD_REQUEST',
    message: 'ordered_ids must contain exactly the catalog id set (unknown or missing ids)',
  };
}
```

Products with falsy `id` cannot be represented in the protocol — if any
exist, return 400 with a message saying the catalog contains id-less
products (fail closed, do not silently skip).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Paginate the archived fetch; lift the cap for the reorder path

- `reorderWithFullCatalog`: loop `getProducts({ archived: true, page, limit: 200 })`
  until a page returns fewer than the limit (or `items.length >= total`);
  concatenate ids. Keep the 200 page size (server max), just paginate.
- "Todos" 500 cap: the reorder path must see the full filtered view. Minimal
  approach — in `handleReorder`, if `data.total > data.items.length`, fetch
  remaining pages (same filters, `useProductsQuery` params) before calling
  `reorderWithFullCatalog`; do NOT raise the global 500 UI clamp (rendering
  500+ rows is a separate perf concern owned by no current plan).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 3: Add membership + scale tests

Create `admin/content-manager/test/integration/reorderMembership.test.ts`:

1. `[C,B,X]` vs `[A,B,C]` → 400 (unknown id), catalog order untouched.
2. `[C,B]` vs `[A,B,C]` → 409 (existing length guard, unchanged).
3. Exact permutation → 200 with correct 0..N orders.
4. Archived pagination: seed 250 archived products, drive the client helper
   logic (or replicate the loop against `app.inject`) and assert all 250
   ids are collected (unit-test the pagination loop with a mocked
   `getProducts` following the existing `productsPage.test.tsx` harness
   pattern if driving the real UI is heavy).

**Verify**: `npm run admin:test` → all pass including the new file.

## Test plan

- New integration file, 4 cases above.
- Existing reorder tests (plan 128/141 coverage) must pass unchanged.
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with new reorder-membership tests passing.
- [ ] `grep -n "catalogIds" admin/content-manager/src/server/routes/productRoutes.ts` matches (membership check present).
- [ ] `grep -n "limit: 200" admin/content-manager/src/web/app/routes/ProductsPage.tsx` is inside a pagination loop (no single-shot archived fetch).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The reorder route or `reorderWithFullCatalog` does not match excerpts.
- The server has a max `limit` below 200 that breaks the pagination loop.
- A full-id-list endpoint turns out to be necessary (report; do not build
  a new API route in this plan).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- If id-less products can ever exist, the 400 message must tell the operator
  how to repair (backfill stable ids) — link the backfill script if it still
  exists.
- Reviewer: confirm the "Todos" fetch-all stays on the reorder click path
  only, not on page render.
- **Deferred:** server-side full-id-list endpoint (only if pagination proves
  fragile) — unblocks nothing today.
