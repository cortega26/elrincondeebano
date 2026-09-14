# Plan 172: Validate bulk-action inputs and re-check mutated products

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/domain/products/productService.ts`
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

Bulk preview/apply blind-casts `body.action`/`body.value` (`as` casts, no
allowlist, no `default` in the service switch) and `bulkApply` persists
without re-validating. A typo'd action returns a misleading `ok:true` with
zero changes; a non-numeric value (`Number('') === 0` from a cleared UI field,
or `NaN`) is written into `data/product_data.json`, where
`JSON.stringify(NaN)` becomes `null` and the next `loadCatalog` hard-throws —
taking the whole admin offline until manual JSON repair. This is a
data-corruption path behind an operator UI affordance.

## Current state

Relevant files:

- `admin/content-manager/src/server/routes/productRoutes.ts` — bulk
  preview (lines 495–541) and bulk apply (lines 543–598) routes.
- `admin/content-manager/src/domain/products/productService.ts` —
  `bulkPreview` (lines ~378–470), `bulkApply` (lines 472–558).
- `admin/content-manager/src/shared/schemas/product.ts` — `productSchema`
  (strict types; `loadCatalog` throws on violation, lines 91–97 of the repo).
- `admin/content-manager/src/web/app/routes/ProductsPage.tsx` — lines
  435–467 build the bulk value from the input field.

Excerpts (verified by advisor read):

```ts
// productRoutes.ts (both routes) — blind casts, no allowlist
const result = productService.bulkPreview(catalog, {
  action: body.action as 'set_discount_percent',
  value: body.value as number,
  product_ids: resolved.ids,
});
```

```ts
// productService.ts:500-529 — bulkApply switch: no `default`, blind casts
switch (operation.action) {
  case 'set_discount_percent':
    product.discount = Math.min(
      product.price,
      Math.round(product.price * ((operation.value as number) / 100))
    );
    break;
  // ... set_discount_fixed / set_stock / set_price_delta_percent /
  // set_category (does (operation.value as string).trim() — throws on
  // non-string → uncaught → 500, neither bulk route has try/catch)
}
```

```ts
// productService.ts bulkPreview switch — same shape, also no `default`:
// unknown action falls through, returns { ok: true, changes: [] }
```

Conventions: routes return typed error envelopes
`{ error: { code, message } }` with 400 for bad input (see the
`Missing command_id or action` guards); service returns
`{ ok: false, error }` and the route maps to 400. Match both.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/productRoutes.ts` (bulk routes only)
- `admin/content-manager/src/domain/products/productService.ts` (`bulkPreview`
  - `bulkApply` only)
- `admin/content-manager/test/integration/bulkValidation.test.ts` (create)

**Out of scope**:

- `ProductsPage.tsx` input handling (plan 177 owns the empty-field UX; the
  server must reject regardless).
- Single-edit validation (already validates; do not touch).
- Changing the set of supported bulk actions (no new actions).

## Git workflow

- Branch: `advisor/172-bulk-action-validation`
- Commit per step; e.g. `fix(admin): validate bulk action/value + re-check mutated products (plan 172)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE. Run Install + Typecheck + admin tests unmodified.

**Verify**: all green; otherwise STOP.

### Step 1: Allowlist action + type-check value at the route

In BOTH bulk routes, after the `command_id/action` presence check, add:

- `action` must be one of `set_discount_percent | set_discount_fixed |
set_stock | set_price_delta_percent | set_category` → else 400
  `{ code: 'BAD_REQUEST', message: 'Unknown bulk action "<x>"' }`.
- Value type per action: number (finite, not NaN) for the three numeric
  actions; boolean for `set_stock`; non-empty string for `set_category` →
  else 400. Reject `NaN`/`Infinity` explicitly (`Number.isFinite`).
- Reject empty-string numeric input at the route too (defense in depth for
  the cleared-field `Number('') === 0` case), with a message naming the
  field.

Keep the existing `BulkOperation` type; narrow `body.action`/`body.value`
through a small local validator function shared by both routes (same file).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Fail unknown actions and re-validate mutated products in the service

- Add a `default:` branch to BOTH switches in `bulkPreview` and `bulkApply`
  returning `{ ok: false, error: 'Unknown bulk action' }` (never silently
  `ok:true` with zero changes).
- In `bulkApply`, after mutating each product, run
  `productSchema.safeParse(product)`; on failure `continue` (skip) WITHOUT
  counting it as changed, and include the skip in the response so the UI can
  report it (extend the return with a `skipped` count — additive field only,
  existing `changed`/`changes` fields unchanged).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 3: Add integration tests

Create `admin/content-manager/test/integration/bulkValidation.test.ts`
(temp-repo + `app.inject` pattern) covering: unknown action → 400 on both
routes; `NaN`/string value for numeric action → 400; non-string
`set_category` → 400 (not 500); empty-string numeric → 400; valid apply still
200 with identical `changed` counts as before (plan 102 invariant); mutated
product failing schema is skipped, not persisted (assert catalog unchanged
for that product via `GET`).

**Verify**: `npm run admin:test` → all pass including the new file.

## Test plan

- New `test/integration/bulkValidation.test.ts`, ≥6 cases above.
- Existing bulk tests must pass unchanged (plan 088/102 count semantics).
- Verification: `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with new bulk-validation tests passing.
- [ ] `grep -n "as 'set_discount_percent'" admin/content-manager/src/server/routes/productRoutes.ts` returns no matches.
- [ ] Both service switches contain a `default:` branch.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Excerpts do not match (drift — e.g. plan 170's landing already changed these lines).
- The `BulkOperation` type or supported action set differs from Current state.
- Fixing requires touching `ProductsPage.tsx` or the response envelope shape
  beyond the additive `skipped` field.

## Maintenance notes

- If a new bulk action is ever added, it must be added to the route
  allowlist table, both switches, AND these tests in the same commit.
- Reviewer: check the `skipped` reporting surfaces in the UI follow-up
  (plan 177) — this plan only guarantees the server reports it.
- **Deferred:** empty-field UX guard in `ProductsPage.tsx` → plan 177.
