# Plan 192: Cover the web contract thin spots (page-size, categories, client, 409 retry)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/app/routes/CategoriesPage.tsx admin/content-manager/src/web/api/client.ts admin/content-manager/test/web/productsPage.test.tsx admin/content-manager/test/integration/clientIntegration.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: tests
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The highest-churn UI ships its newest behavior untested and its wire contract
thinly pinned: the plan-169 page-size selector (50/100/All) has zero tests
while pager scope is exactly where the 088/101 `REORDER_SCOPE_AMBIGUOUS`
bugs lived; `CategoriesPage` (944 lines) is covered only for undo/redo while
reassign-on-delete and filter-gated reorder hide in a sharded E2E that never
runs by default; the 788-line `ContentManagerClient` has 4 integration tests
while 30+ methods are exercised only through fully-mocked harnesses (mock
drift passes unit tests and breaks the operator UI); and the plan-141
`withFreshRev` 409 auto-retry is proven only against mocked 409s, never a
real revision race. All additive, test-only, no production change.

## Current state

Verified by advisor read/grep:

- `ProductsPage.tsx` (832 lines, 22 churn hits; plan 169 `e8eeff62` added the
  selector). `useProductsQuery.ts:8` `PAGE_SIZE_OPTIONS = [50, 100]`.
  `test/web/productsPage.test.tsx` (303 lines, 10 tests): `pageSize` appears
  only as the `pageSize: 50` fixture (lines 19,150,152,178,180,214,249) —
  zero selector tests.
- `CategoriesPage.tsx` (944 lines, 11 churn hits).
  `test/web/categoriesUndo.test.tsx` (155 lines, undo/redo only).
  Search/status-filter/expand-all/reassign-delete appear only in
  `test/e2e/scope.spec.ts:375`, which `playwright.config.ts:25` excludes via
  `testIgnore`.
- `client.ts` (788 lines, 18 churn hits; plan 151 unified all fetches).
  `test/integration/clientIntegration.test.ts:74-105` — 4 tests
  (`deleteCategory` 204, stale-`base_revision` 409, `deleteNavGroup` 204,
  404 `ApiRequestError`); 161 `mockApi.` references in `harness.tsx`.
  `exportCsv` uses raw `fetch` (no envelope/401 reset) — plan 197 owns the
  fix; here, pin current behavior with a test.
- `ProductsPage.tsx:340` `withFreshRev` helper; retry cases in
  `productsPage.test.tsx:237,267,287` all via mocked
  `ApiRequestError('Conflict', 409)`; `clientIntegration.test.ts:83` asserts
  a stale `base_revision` surfaces 409 but never drives the retry path.

Conventions: web tests use `harness.tsx` mocked API; integration tests use
real `createApp` on temp repos (`credential.test.ts` pattern). Additive
only — do not refactor the client or pages here.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/test/web/productsPage.test.tsx` (extend) and/or
  new `test/web/productsPageSize.test.tsx` + `test/web/categoriesPage.test.tsx`.
- `admin/content-manager/test/integration/clientIntegration.test.ts`
  (extend) + new `test/integration/withFreshRev409.test.ts` (or nearest
  fitting name).

**Out of scope**: production code (assert current behavior; if a test
exposes a real bug, STOP and file it — do not fix here); E2E sharding
(plan 193); `exportCsv` fix (plan 197).

## Git workflow

- Branch: `advisor/192-web-contract-coverage`
- Commit per area (page-size → categories → client → 409); e.g.
  `test(admin): page-size selector characterization (plan 192)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

Green `npm run admin:test` unmodified (especially the 4 client-integration
and 10 productsPage tests). Otherwise STOP.

### Step 1: Page-size selector characterization

Extend `productsPage.test.tsx` (harness pattern): selector renders with the
plan-169 options; changing size refetches with the new limit; reorder stays
gated when the view is a paged subset (plan 088 honest-scope contract —
assert `canReorder`-equivalent gating, not the button pixels).

**Verify**: new cases pass; existing 10 pass.

### Step 2: CategoriesPage beyond undo

New `test/web/categoriesPage.test.tsx` (mocked): search/filter/expand
rendering. Plus one `categoryMutationApi`-level (or route-level inject)
test for reassign-on-delete (the plan 096/101-adjacent behavior currently
only covered by sharded E2E).

**Verify**: suite green.

### Step 3: Client integration beyond 4 methods

Table-driven `app.inject`-backed cases in `clientIntegration.test.ts` for:
`getProducts` pagination params, `bulkApply` envelope, `reorderProducts`,
`importPreview` error-shape propagation, and `exportCsv` current behavior
(raw fetch — pin status/headers as-is with a comment pointing at plan 197).

**Verify**: suite green.

### Step 4: Real-409 retry test

First search the integration suite for any existing live-409 `withFreshRev`
coverage. If absent: temp-repo test forcing a real 409 (two concurrent edits
through the real client, or stale `base_revision` then the client's retry
entry) asserting the retry succeeds exactly once and surfaces the fresh rev.
If present: record the location and skip with a note.

**Verify**: full `npm run admin:test` green.

## Test plan

- Steps' cases are the plan (≥3 + ≥2 + ≥5 + 1). All additive.
- Verification: full `npm run admin:test` green, new tests enumerated in
  commits.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] Page-size selector, categories filter/reassign, ≥5 new client
      integration cases, and real-409 retry (or its found location) exist
      and pass.
- [ ] Zero production files changed (`git diff --name-only` shows only
      `admin/content-manager/test/**`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A characterization test exposes a real behavioral bug (STOP, file it —
  characterization locks behavior; this plan does not fix).
- The harness cannot drive some surface without production changes
  (narrow to what is drivable; report the gap).
- A real-409 retry test already exists (skip Step 4 with the pointer).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New client methods MUST add an integration row here (leave that sentence
  as a comment atop `clientIntegration.test.ts`).
- If `exportCsv` is fixed by plan 197, its pin-test here must be updated in
  the same commit as that fix — note the coupling in both plans.
- **Deferred:** E2E promotion of these flows (plan 193 owns the gate).
