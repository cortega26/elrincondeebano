# Plan 059: Restore catalog-wide mutation, revision, and idempotency invariants

> **Executor instructions**: Use synthetic catalogs only. Preserve stable product IDs
> and unknown fields according to Plan 065's eventual contract. Do not normalize real
> production data as part of verification.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/domain/products admin/content-manager/src/domain/categories admin/content-manager/src/server/routes/catalog.ts admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/test`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 056, 057
- **Category**: bug / migration
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F08, F09, F11, F18
- **Reconciled (Auditoría 7, 2026-08-03)**: los slices discount (074), bulk undo (077) y concurrencia de categorías (080) se ejecutan como planes separados primero; este plan conserva idempotencia/replay, reorder, metadata de revisión e identidad de categorías.

## Why this matters

Bulk actions silently target the visible page, page-local reorder creates duplicate
global order values, several edits do not advance product revisions, category values
can become dangling, and idempotent replay may return an entity never persisted. These
are catalog-integrity blockers independent of visual polish.

## Current state

- `ProductsPage.tsx:60-69` loads the server default page; `catalog.ts:23-32` defaults
  to 50 items. Bulk preview/apply at lines 203-224 uses every `data.items` ID.
- Drag/drop at `ProductsPage.tsx:329-343` sends only the visible IDs.
- `productService.ts:235-263` assigns selected IDs orders `0..N` and leaves all other
  orders untouched.
- `productService.ts:149-215` increments `rev` only for name, price, and archive;
  other accepted edits do not advance the concurrency token or complete metadata.
- `catalog.ts:400-403` checks only the first 200 products before category deletion;
  product create/edit/bulk accept arbitrary category strings.
- `catalog.ts:91-110` constructs a new create result before repository idempotency;
  `productRepository.ts:67` caches status but not the original response body.
- Python category normalization tests under
  `admin/product_manager/tests/test_product_service_category_normalization.py` and
  selected-row bulk behavior provide parity fixtures, not code to import.

## Commands you will need

| Purpose    | Command                                                                                     | Expected on success |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- productService reorder bulk category mutationApi` | all pass            |
| Typecheck  | `npm run admin:typecheck`                                                                   | exit 0              |
| Manager    | `npm run admin:test && npm run admin:build`                                                 | exit 0              |
| Regression | `npm run validate`                                                                          | exit 0              |

## Scope

**In scope**:

- product/category domain services and schemas needed for command contracts
- catalog routes, product/idempotency repositories, and typed web client
- `ProductsPage.tsx` selection, bulk preview/apply, reorder, and category controls
- focused domain, integration, and browser tests

**Out of scope**:

- Durable undo/history UI (Plan 062).
- Import semantics (Plan 060) or cross-consumer schema convergence (Plan 065).
- Production catalog cleanup or automatic category migrations.

## Git workflow

- Branch: `fix/059-catalog-mutation-invariants`
- Commit by logical slice; use `fix(admin): preserve global catalog invariants`.

## Steps

### Step 1: Make every edit one atomic revision

Compute a candidate and complete changed-field set without mutating the original.
Validate it, then increment product revision exactly once and stamp metadata for every
changed field with the same new revision/base revision. No-op edits must change nothing.

**Verify**: two-client tests for every editable field return 409 to the stale second
writer; failed/no-op edits leave product and catalog revisions unchanged.

### Step 2: Add explicit selection and preview binding

Introduce stable-ID multi-selection independent of pagination/filtering. Bulk preview
returns a token bound to selected IDs, base catalog revision, operation, and exact
before/after values; apply requires that token and rejects stale or altered requests.

**Verify**: browser/API tests prove only selected IDs change across pages and filters;
apply without a current preview or after concurrent mutation fails safely.

### Step 3: Define global reorder semantics

Choose a complete canonical order request or explicit move-before/move-after commands;
do not accept a page-local list as global order. Validate uniqueness/completeness and
rewrite all affected order values deterministically in one command.

**Verify**: 184- and 10,000-product fixtures remain a permutation of `0..N-1` after
filtered/sorted/paginated moves; duplicate/missing IDs and stale revisions are rejected.

### Step 4: Enforce category identity

Resolve legacy labels to canonical category keys at the domain boundary, reject unknown
keys, count usage across the complete catalog, and require explicit reassignment before
deletion. Port Python's characterized normalization cases.

**Verify**: categories used after item 200 cannot be deleted; unknown/ambiguous values
fail; reassignment plus deletion is atomic and preserves all products.

### Step 5: Persist complete idempotent outcomes

Check command identity before mutation and store the original status/body plus request
fingerprint. Same ID/same request returns the original response after restart; same ID/
different request returns conflict and never mutates.

**Verify**: create/edit/bulk/reorder replay tests assert byte-equivalent responses and
catalog state in-process and after repository restart.

## Test plan

- Model domain tests after `test/contract/productService.test.ts`.
- Extend `reorderBulkApi.test.ts`, `mutationApi.test.ts`, and browser workflows.
- Include empty/single/large catalogs, duplicate current orders, stale revisions,
  partial pages, filter changes, command replay, and category aliases.

## Done criteria

- [ ] Every accepted product edit advances revision once and records every field.
- [ ] Bulk operations affect explicit selected IDs only and require bound preview.
- [ ] Global orders are unique, contiguous, deterministic, and concurrency-checked.
- [ ] Unknown/dangling categories cannot be created or deleted into existence.
- [ ] Idempotent replay returns the original persisted outcome after restart.
- [ ] Focused/full manager and root validation pass.

## STOP conditions

- Existing production category values cannot be mapped unambiguously; produce a dry-run
  report and request a mapping decision.
- The UI cannot preserve selection IDs across filters without changing public identity.
- Idempotency storage migration would discard active command records.
- Fixing reorder requires silently rewriting production catalog data in a test.

## Maintenance notes

All new mutation types must use the same revision/idempotency command envelope. Reviewers
should scrutinize no-op behavior, stale previews, and catalog-wide—not page-wide—invariants.
