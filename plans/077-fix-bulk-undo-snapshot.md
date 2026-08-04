# Plan 077: Fix bulk-operation undo — always snapshot old values before applying

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The bulk-operations "Deshacer" (undo) restores wrong values whenever the
operator applies a bulk operation without first running the preview — which
is a supported flow ("Aplicar" works standalone). The undo entry's
`perProductOldValues` is only populated when a preview was shown; otherwise
the fallback computes `inverseValue = 0` and re-applies the operation with 0:
for `set_discount_fixed`/`set_discount_percent` every discount is zeroed;
for `set_price_delta_percent` it's a silent no-op that still reports
"Operación deshecha ✓"; for `set_category` the number `0` becomes the
category `"0"`. The catalog is written straight to the canonical file.

After this plan: old values are always snapshotted before any bulk apply, so
undo restores the exact previous state regardless of whether a preview ran.

## Current state

Verified code (read directly):

- `admin/content-manager/src/web/app/routes/ProductsPage.tsx:283-318` —
  `handleUndo` fallback:
  ```tsx
  } else {
    let inverseValue: number | boolean | string;
    if (entry.action === "set_stock") {
      inverseValue = entry.value === true ? false : true;
    } else {
      inverseValue = 0;                       // :305-310 — the bug
    }
    await client.bulkApply(entry.action, inverseValue, entry.product_ids);
  }
  ```
- `ProductsPage.tsx:235-250` — `perProductOldValues` is built only
  `if (bulkPreview)` (from `bulkPreview` + `data.items`).
- The apply path: `client.bulkApply(bulkAction, val, ids)` (`:246`) then
  `await load()` — after which `data.items` carries fresh revs.
- `undoStack.current.push(entry)` happens before the apply (`:243`).
- The bulk preview response (`bulkPreview`) contains per-product
  `{ product_id, field, old_value }` — from the server's `bulkPreview`
  (see `productService.bulkPreview`).

Repo conventions: React 19 + TS; client calls via `src/web/api/client.ts`
(`client.bulkApply`, `client.updateProduct`, `client.fetchProducts`).
No existing unit tests for ProductsPage (UI-level behavior is covered by
Playwright E2E at best — check `admin/content-manager` playwright specs for
a bulk flow before writing UI tests; prefer extracting the undo logic into a
testable module if needed).

## Commands you will need

| Purpose   | Command                   | Expected on success |
| --------- | ------------------------- | ------------------- |
| Typecheck | `npm run admin:typecheck` | exit 0              |
| Tests     | `npm run admin:test`      | exit 0              |
| Web build | `npm run admin:build:web` | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/routes/ProductsPage.tsx`
- `admin/content-manager/src/web/api/client.ts` — only if a
  fetch-products-by-ids helper is needed for the snapshot
- A new unit test file for the extracted undo logic (preferred over UI tests)

**Out of scope**:

- Server-side bulk semantics (correct as-is; only the client snapshot is wrong).
- Reorder undo (reorder has no undo at all — out of scope, note it).
- The Python fallback's bulk operations.

## Git workflow

- Branch: `advisor/077-fix-bulk-undo-snapshot`.
- Single commit: `fix(admin): snapshot old values for bulk undo regardless of preview` + `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Snapshot before every bulk apply

In `handleApplyBulk` (the function containing `:235-250`), replace the
`if (bulkPreview)` conditional with an unconditional snapshot: before calling
`client.bulkApply`, fetch the current values of the affected products for the
operation's target field(s) and build `entry.perProductOldValues` from that.

The products are already in `data.items` (the current page list) — build the
snapshot from `data.items` directly (no extra fetch needed when the field is
present on the list payload; verify the list payload includes `discount`,
`price`, `stock`, `category` — the products page table shows them, so it
does). Use the preview's `old_value` when a preview exists (more accurate),
else fall back to the value in `data.items`. Remove the `inverseValue = 0`
fallback entirely — every non-`set_stock` action must use
`perProductOldValues`.

If `set_stock` is the only action left on the fallback path, keep its
inverse logic or fold it into the snapshot (prefer snapshot: `old_value` for
stock is the boolean from `data.items`).

**Verify**: `npm run admin:typecheck` exit 0; `npm run admin:build:web` exit 0.

### Step 2: Fix undo's stale-rev hazard

`handleUndo` currently does `data.items.find(...)` per product then
`client.updateProduct(id, product.rev, ...)` — after the FIRST update the
revs in `data.items` are stale and later updates in the loop can 409.
Fix by fetching fresh products per undo item before updating, or batch the
undo as a bulk apply when the action matches (for `set_discount_fixed`/%
undo use bulkApply with the original value — simpler and atomic). Choose the
simplest correct path; document it in a code comment.

**Verify**: `npm run admin:typecheck` exit 0.

### Step 3: Extract and test the undo logic

Extract the "build undo entry" and "apply undo" logic into pure functions in
a new module `src/web/app/routes/undo.ts` (or `src/web/lib/undo.ts` — match
the existing layout; `src/web/api/` holds the client) so it can be unit
tested without React:

```ts
export function buildUndoEntry(products, operation, preview): UndoEntry;
export function computeUndoActions(entry, currentProducts): Array<{ id; rev; patch }>;
```

Wire ProductsPage to these. Add `test/contract/undo.test.ts` (new) covering:

- undo entry built without preview has old values from current products
- discount undo restores the original discount (not 0)
- price-delta undo restores the original price
- category undo restores the original category (not "0")
- stock undo inverts the stored value

**Verify**: `npm run admin:test` exit 0 with the new tests; `npm run admin:build:web` exit 0.

## Test plan

- `test/contract/undo.test.ts` — the five cases above (pure-function tests;
  no DOM needed).
- Existing suite: `npm run admin:test` exit 0.
- Optional manual E2E (if Playwright specs cover the products page): run
  `npx playwright test -c playwright.config.ts` (may be slow — skip if the
  suite is > 5 min, note it).

## Done criteria

- [ ] No `inverseValue = 0` fallback remains in ProductsPage.tsx
- [ ] Undo entry always snapshots old values (unit tests prove the five cases)
- [ ] Undo no longer uses stale revs (no 409 in the multi-product loop path
      — test or code structure proves it)
- [ ] `npm run admin:typecheck`, `npm run admin:test`, `npm run admin:build:web` exit 0
- [ ] `plans/README.md` status row 077 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The products list payload does not include the fields needed for the
  snapshot (`discount`/`price`/`stock`/`category` are missing from
  `data.items` — check `client.fetchProducts` and the list response shape
  first; if missing, the snapshot needs the server to include them, which
  extends the scope — report before doing that).
- There is an existing Playwright E2E that asserts the CURRENT (buggy) undo
  behavior — update it in this plan, don't leave it red.

## Maintenance notes

- The reorder path has no undo — a known gap; the planned conflict-center /
  change-set work (plan 062) is the right home for it, not this plan.
- If the server ever returns per-product `old_value` in the bulk APPLY
  response, the snapshot could use that instead of a client-side fetch —
  worth doing when the API changes.
