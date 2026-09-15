# Plan 198: Split the remaining god modules (first slice) + remove dead surfaces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/scripts/storefront.js admin/content-manager/src/web/app/routes/CategoriesPage.tsx admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/routes/PublicationPage.tsx admin/content-manager/src/server/routes/media.ts admin/content-manager/src/server/routes/categoryRoutes.ts astro-poc/src/lib/catalog.ts admin/content-manager/src/server/routes/changes.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/192-web-contract-coverage.md, plans/194-write-path-unification.md
- **Category**: tech-debt
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Post-split remainder is still god-sized: `storefront.js` 1686 lines (repo
median ~70) owning cart/favorites/profile/companion/checkout;
`CategoriesPage` 944 (14 `useState`, 2 embedded forms), `ProductsPage` 832,
`PublicationPage` 718; `media.ts` 640 (9 intent routes + magic bytes +
staging + jobs + two-file apply); `categoryRoutes` 623; `catalog.ts` 606
(image + search + nav + SKU caches in one module). Every category/media/
storefront PR re-learns the whole file. This plan takes the FIRST slice
(category routes + media routes + dead surfaces) behind existing coverage —
not the whole L — and leaves the storefront/pages slices to a follow-up
with evidence. Dead prototype/shim surfaces go in the same plan (same
"remove confusion" theme, trivial risk).

## Current state

Sizes verified by advisor (`wc -l`): storefront.js 1686, CategoriesPage 944,
ProductsPage 832, PublicationPage 718, media.ts 640, categoryRoutes 623,
productRoutes 598, catalog.ts 606, client.ts 788, productService 559.

```ts
// changes.ts — deprecated re-export shim (plan 158), zero logic
export { changeSetRoutes } from './changeSetRoutes.ts';
export { importRoutes } from './importRoutes.ts';
export { historyRoutes } from './historyRoutes.ts';
/** @deprecated */ export async function changesRoutes(...) { ...delegates... }
```

Prototype dirs (zero non-prototype importers — verified by grep):
`server/prototype/previewRoute.ts`, `web/api/__prototype__/
{typedClient.prototype.ts, openapi.d.ts}`. (Plan 214 may retire them via the
typed-client decision — coordinate: whoever lands first wins, the other
drops that slice. `previewRoute.ts` is ALSO plan 211's build-preview home —
if 211 adopts it by moving to `routes/`, this plan must not delete it.)

Conventions: prior splits (plans 114 catalog.ts, 158 changes.ts) kept
facade-compatible seams and moved embedded logic to co-located modules;
follow the same pattern (no barrel files — import from the new modules
directly). Contract tests pin route behavior — keep them green per slice.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope (first slice only)**:

- `categoryRoutes.ts` → CRUD vs nav-groups vs subcategories modules
  (after plan 194's helper migration — this plan only splits files).
- `media.ts` → upload vs intents vs apply submodules.
- Delete `changes.ts` shim (after updating any importers — grep first; app.ts
  already imports the three modules directly per the grep, verify).
- Prototype dirs: delete ONLY what plans 211/214 have not adopted (check
  their index status first).

**Out of scope (follow-up plan's call)**: storefront.js,
Categories/Products/Publication pages, `catalog.ts`, `productRoutes.ts`,
`productService.ts` splits. Do NOT touch them here.

## Git workflow

- Branch: `advisor/198-god-module-slice-1`
- One commit per split + one for removals.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + coordination check

Requires plans 170, 192, 194 DONE. Suite green. Check plans/README status
of 211 and 214: if either adopted `previewRoute.ts` / prototype files,
exclude them from this plan's deletions.

**Verify**: green; coordination recorded; otherwise STOP.

### Step 1: Split categoryRoutes (CRUD / nav-groups / subcategories)

Extract into co-located modules under `server/routes/` (e.g.
`categories/crud.ts`, `categories/navGroups.ts`, `categories/subcategories.ts`
— or flat files if the repo prefers flat; check how plan 158 laid out its
three modules and match). Re-export/rewire in place so `app.ts` registration
is unchanged. No behavior change — move code only.

**Verify**: typecheck + contract tests green; file sizes recorded
before/after in commit.

### Step 2: Split media.ts (upload / intents / apply)

Same pattern: extract intent lifecycle vs upload vs apply/rollback pairing
(keep the try/catch rollback pairing in ONE module — do not split the
promote/rollback transaction across files). Tests green per move.

**Verify**: typecheck + media tests green.

### Step 3: Remove dead surfaces

- `changes.ts`: grep importers; update any stragglers to the three modules;
  delete the shim.
- Prototype files not adopted by 211/214: delete (or archive per spike
  disposition — check the spike docs' disposition notes first).
- `backfill-product-ids.ts` main-guard belongs to plan 196 — do not touch it
  here even though it looks related.

**Verify**: grep for deleted paths → zero source references; suite green.

## Test plan

- No new behavior → no new tests required; existing contract/integration
  suites are the pins (must stay green per slice).
- Verification: full `npm run admin:test` green + before/after line counts.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] `wc -l` on split files shows no file over ~450 lines without a
      documented reason in the commit.
- [ ] Deleted paths have zero references (`grep -rn "changesRoutes\|prototype/previewRoute\|__prototype__" admin/content-manager/src` clean, modulo plan-211/214 adoptions).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated (name the follow-up slices).

## STOP conditions

Stop and report back (do not improvise) if:

- A split requires behavior changes to untangle (report the coupling; split
  differently or narrow).
- Plan 194 is not DONE (splits on top of unmigrated routes conflict —
  wait, do not rebase around it).
- Prototype files were adopted by 211/214 (drop that deletion slice).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Follow-up slices (storefront.js, pages, catalog.ts, productRoutes) earn
  their own plan only with the same coverage-backed method — file with the
  before/after counts from this plan as evidence.
- Reviewer: each split commit must be move-only (review with `--find-renames`
  / diff readability in mind).
- **Deferred:** slices 2+ (storefront, pages, catalog, product routes) —
  file after this lands, not before.
