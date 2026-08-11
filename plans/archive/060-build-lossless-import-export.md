# Plan 060: Build lossless, preview-bound catalog import and export

> **Executor instructions**: Preserve the complete incoming catalog through preview
> and apply. Never test imports against the real catalog. Every destructive apply must
> be bound to an approved preview and base revision.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/server/routes/changes.ts admin/content-manager/src/web/app/routes/ImportPage.tsx admin/content-manager/src/web/api/client.ts admin/content-manager/src/shared admin/content-manager/test admin/product_manager/ui/import_export_mixin.py`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 056, 057, 059
- **Category**: bug / migration / direction
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F07 and the import/export portion of F17
- **Reconciled (Auditoría 7, 2026-08-03)**: el arreglo del flujo actual de import lo ejecuta el plan 073 antes que este plan; 073 es prerrequisito de la parte import.
- **Direction covered**: D03 catalog interchange

## Why this matters

The browser currently previews an import but reconstructs partial products that fail
the server's complete-product schema; new-only imports cannot be applied, and the UI
expects a response the API does not return. Python remains necessary for safe JSON and
filtered CSV interchange. This plan creates a lossless file-oriented workflow with an
auditable preview/apply contract.

## Current state

- `ImportPage.tsx:44-50` sends parsed products to preview.
- `ImportPage.tsx:77-105` builds `{id, changed fields}` fragments only from resolved
  conflicts; lines 156-160 render Apply only when conflicts exist.
- `routes/changes.ts:182-218` parses each apply item with the complete `productSchema`.
- `ImportPage.tsx:115` expects `{created, updated}` while `changes.ts:266` returns
  `{applied, skipped, errors, resulting_revision}`.
- `changes.ts:87-90` exposes raw full JSON export but no browser download or CSV.
- `admin/product_manager/ui/import_export_mixin.py:41-297` preserves an approved plan
  with additions, updates, and field choices; lines 299+ implement JSON/filtered CSV.

Follow the existing Zod shared-schema convention. Use the Python behavior as a
characterization oracle, not as a runtime dependency.

## Commands you will need

| Purpose    | Command                                                                | Expected on success |
| ---------- | ---------------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- import export`               | all pass            |
| Browser    | `npm -w admin/content-manager run test:e2e -- --grep "import           | export"`            | workflows pass |
| Manager    | `npm run admin:typecheck && npm run admin:test && npm run admin:build` | exit 0              |
| Regression | `npm run validate`                                                     | exit 0              |

## Scope

**In scope**:

- typed import/export schemas and client methods
- import preview/apply routes and `ImportPage.tsx`
- file upload/download UI for JSON and filtered CSV
- durable preview records or change-set integration needed for safe apply
- parity fixtures/tests for Python interchange semantics

**Out of scope**:

- Generic spreadsheet editing or XLSX.
- Remote sync and conflicts (Plan 064).
- Reworking the product schema policy beyond consuming Plan 065's contract.

## Git workflow

- Branch: `feat/060-lossless-catalog-interchange`
- Commit: `feat(admin): add lossless catalog interchange`.

## Steps

### Step 1: Define one typed preview/apply protocol

The preview response must include a durable preview ID, input hash, base catalog
revision, complete normalized incoming records, additions, unchanged records, field
conflicts, validation errors, and proposed result summary. Apply accepts only preview
ID plus explicit resolution choices; it must not accept reconstructed product fragments.

**Verify**: contract tests reject stale/tampered preview IDs, unresolved conflicts,
unknown fields under the chosen policy, and altered source content.

### Step 2: Make apply atomic and complete

Resolve choices against the preserved full input, revalidate the complete resulting
catalog, then write once through the normal mutation/change-set path. Support new-only,
update-only, mixed, no-op, and keep-local-only imports. Align response schema with the UI.

**Verify**: failure injection before final replace leaves catalog unchanged; each mode
returns accurate created/updated/skipped/error counts and resulting revision.

### Step 3: Build file-based operator UX

Add JSON file selection with size/type feedback, structured conflict review, explicit
approval summary, and downloadable error report. Keep paste JSON as an optional expert
path. Require confirmation displaying exact additions/updates before apply.

**Verify**: Playwright covers new-only, mixed field resolutions, malformed input,
stale preview, cancel, persisted reload result, and keyboard completion.

### Step 4: Add lossless exports

Provide full canonical JSON export and CSV export for the current filters using stable,
documented column order and UTF-8. Export must not leak credentials or manager metadata
outside the catalog contract. Characterize Python columns/filter behavior and either
match it or document intentional differences in tests.

**Verify**: round-trip JSON preserves the compatibility corpus byte-semantically;
CSV fixture rows/columns/filtering match the accepted parity golden.

## Test plan

- Extend `test/integration/importApply.test.ts` and add shared contract tests.
- Add differential fixtures produced by Python and TS for additions, updates, field
  conflicts, Unicode, archived/out-of-stock, and all optional media fields.
- Browser tests must use uploaded files and downloaded artifacts, not direct API calls.
- Test stale catalog revision and server restart between preview and apply.

## Done criteria

- [ ] Browser import submits no partial products.
- [ ] New-only and mixed imports apply atomically from a bound preview.
- [ ] Request/response types are shared and compile-time enforced.
- [ ] Full JSON round-trip is lossless for the compatibility corpus.
- [ ] Filtered CSV matches an approved Python parity fixture.
- [ ] Focused, E2E, manager, and root validation pass.

## STOP conditions

- Python and TS disagree on a field-loss policy not decided by Plan 065.
- Input contains unknown fields whose preservation behavior is ambiguous.
- Apply would require an unreviewed direct write outside the change-set/mutation path.
- Browser download tests require network or production data.

## Maintenance notes

Version the interchange schema. Future product fields must be added to round-trip and
CSV parity fixtures before certification can remain green.
