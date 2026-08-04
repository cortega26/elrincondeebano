# Plan 066: Build structured, validated storefront curation

> **Executor instructions**: Preserve unrelated storefront-experience subtrees and
> write both canonical storefront representations atomically. Do not use raw JSON as
> the primary operator control.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/shared/schemas/storefront.ts admin/content-manager/src/server/routes/storefront.ts admin/content-manager/src/server/repositories/storefrontRepository.ts admin/content-manager/src/web/app/routes/BundlesPage.tsx admin/product_manager/storefront_service.py admin/product_manager/ui/storefront_dialogs.py astro-poc/src/lib/catalog.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 057, 062, 065
- **Category**: bug / migration / direction
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F16
- **Direction covered**: D03 storefront curation

## Why this matters

TS permits empty/duplicate merchandising data, has no featured-items editor, exposes
bundle items as raw JSON, and can leave the final deleted bundle in Astro's dedicated
bundle file. Python provides structured ordered editors and stronger invariants. A safe
curation workspace removes hand-edited JSON while preserving storefront authority.

## Current state

- `shared/schemas/storefront.ts:3-20` permits empty bundle IDs/titles/descriptions/items
  and does not enforce unique IDs or valid product references.
- `routes/storefront.ts:47+` exposes featured-item mutation, but `App.tsx` has no
  corresponding editor route.
- `BundlesPage.tsx` edits item arrays as raw JSON and sends `[]` when deleting the last.
- `storefrontRepository.ts:91-99` writes the dedicated bundles file only when non-empty.
- `astro-poc/src/lib/catalog.ts:7,111` imports that dedicated file for storefront data.
- Python `storefront_service.py:60,230` validates non-empty/unique bundles;
  `ui/storefront_dialogs.py:433+` supports add/edit/duplicate/delete/reorder/search.

## Commands you will need

| Purpose    | Command                                                               | Expected on success |
| ---------- | --------------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- storefront bundle featured` | all pass            |
| Browser    | `npm -w admin/content-manager run test:e2e -- --grep "storefront      | bundle              | featured"` | workflows pass |
| Build      | `npm run admin:build && npm run build`                                | both exit 0         |
| Regression | `npm run validate`                                                    | exit 0              |

## Scope

**In scope**:

- storefront schemas/domain validation and reference checks
- atomic repository behavior for experience and bundle projections
- structured bundles and featured-items React workspace
- searchable product picker, duplicate, reorder, preview, and change-set integration
- Python/TS/Astro parity and E2E tests

**Out of scope**:

- Redesigning the public storefront.
- New merchandising concepts absent from existing schemas/Python.
- Direct edits to production storefront JSON during tests.

## Git workflow

- Branch: `feat/066-storefront-curation`
- Commit: `feat(admin): add validated storefront curation`.

## Steps

### Step 1: Port and strengthen storefront invariants

Require non-empty IDs/titles/descriptions/items as accepted by product rules, unique
bundle IDs and item references, valid product/category references, deterministic order,
and explicit archived/missing-product policy. Preserve unrelated experience fields.

**Verify**: Python parity fixtures and TS contract tests cover empty, duplicate, dangling,
archived, reordered, and legacy-valid records.

### Step 2: Establish one atomic authority/projection flow

Write the authoritative experience once and always regenerate/write the dedicated bundle
projection, including `[]`. Use temp files, validation, backups/recovery, and change-set
owned paths so the two files cannot diverge.

**Verify**: delete-last-bundle reads `[]` from the exact file Astro imports; injected
second-file failure restores both prior files.

### Step 3: Build structured bundle curation

Replace raw JSON with typed fields, searchable product picker, add/remove/duplicate,
drag/keyboard reorder, validation summaries, and storefront preview. Apply only through
reviewed change sets.

**Verify**: Playwright covers create/edit/duplicate/delete-last/reorder/search/cancel and
persists the same result Astro loads.

### Step 4: Add featured-items curation

Expose ordered featured staples/categories using the same picker/reference validation,
with previews and exact preservation of all other experience subtrees.

**Verify**: browser/API tests edit featured content and prove unrelated trust bar,
companion rules, and bundles remain byte-semantically unchanged.

## Test plan

- Extend storefront integration tests and add repository dual-write failure injection.
- Differential Python/TS schema fixtures plus Astro load/build verification.
- Browser keyboard tests for pickers and reordering.
- Add certification rows for bundles and featured-item workflows.

## Done criteria

- [ ] Invalid/duplicate/dangling merchandising records cannot be persisted.
- [ ] Experience and bundle projection are atomically consistent, including empty list.
- [ ] Bundles and featured content have structured accessible editors.
- [ ] Unrelated experience subtrees are preserved exactly.
- [ ] Focused, browser, admin/storefront build, and root gates pass.

## STOP conditions

- ADR 0008 authority conflicts with actual Astro consumption and cannot be reconciled.
- Existing storefront data violates new invariants without an accepted mapping.
- Two-file atomic recovery cannot be proven.
- UI work expands into public storefront redesign.

## Maintenance notes

Treat dedicated JSON as a generated projection. Future storefront fields need structured
edit, reference validation, preservation tests, and change-set ownership.
