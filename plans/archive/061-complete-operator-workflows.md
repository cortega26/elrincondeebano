# Plan 061: Complete the daily operator workflow parity surface

> **Executor instructions**: Implement the named Python-parity capabilities in the
> React application without redesigning unrelated storefront UI. Each workflow needs
> a typed API, accessible browser interaction, and executable parity evidence.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/web admin/content-manager/src/server admin/content-manager/src/shared admin/product_manager/ui/main_window.py admin/product_manager/ui/dialogs.py`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: 056, 057, 059, 060
- **Category**: migration / dx / direction
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: remaining F17
- **Direction covered**: D03 operator-facing catalog workspace

## Why this matters

Even after core CRUD works, operators still need Python for price-range filtering,
duplicate product, Git pull, integrity diagnostics, preferences, shortcuts/help, and
several file-oriented actions. These are daily workflow gaps, not reasons to preserve
Tkinter indefinitely. The TS app should absorb them through one coherent operator shell.

## Current state

- `ProductsPage.tsx` URL state includes query/category/archive/stock but not Python's
  minimum/maximum price filters.
- Product creation at `ProductsPage.tsx:160-168` omits discount and collected image
  path values; the form has no AVIF field.
- `App.tsx:13-58` has products/categories/media/history/bundles/import/conflicts/publish,
  but no settings, help, export, or diagnostics route.
- `admin/product_manager/ui/main_window.py:371-434` exposes duplicate, JSON/CSV,
  integrity check, preferences, commit/push, Git pull, theme, help/about and shortcuts.
- The TS Git adapter allows push but has no pull operation/workflow.

Use React Router route modules, `ContentManagerClient`, Zod response contracts, and
the existing design tokens. Avoid raw inline JSON controls when a typed control exists.

## Commands you will need

| Purpose    | Command                                                                     | Expected on success |
| ---------- | --------------------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- ProductsPage settings doctor git` | all pass            |
| Browser    | `npm -w admin/content-manager run test:e2e -- --grep "operator"`            | workflows pass      |
| Manager    | `npm run admin:typecheck && npm run admin:test && npm run admin:build`      | exit 0              |
| Regression | `npm run validate`                                                          | exit 0              |

## Scope

**In scope**:

- product create/duplicate and complete-field form wiring
- min/max price filter API, URL state, and UI
- safe Git pull/rebase status flow using temporary-repo tests
- integrity/doctor UI and downloadable diagnostics without secrets
- persisted display/accessibility preferences, shortcuts, task help/about
- navigation and E2E/parity evidence

**Out of scope**:

- Media conversion implementation (Plan 063).
- Remote API sync (Plan 064); Git pull is repository synchronization only.
- Broad visual redesign or new business capabilities absent from Python.

## Git workflow

- Branch: `feat/061-operator-parity`
- Commit by workflow, e.g. `feat(admin): add operator diagnostics and preferences`.

## Steps

### Step 1: Complete product browsing and creation

Add min/max price filters across URL, client, API, and domain query. Use one typed form
value schema so create sends discount, image fallback, AVIF, category, stock, and every
editable field. Add duplicate as create-from-copy with new stable ID, revision metadata,
and explicit name confirmation.

**Verify**: URL reload restores filters; create/duplicate round-trip every field without
sharing identity or revision metadata.

### Step 2: Add safe repository pull workflow

Expose status/preflight and `git pull --rebase` through the job runner. Refuse dirty or
conflicted states unless a documented recovery path applies. Never run arbitrary remote
or branch arguments from the browser. Refresh repositories after success.

**Verify**: temporary remote tests cover success, no-op, dirty tree, conflict, timeout,
cancel, and restart; no test reaches a real remote.

### Step 3: Productize doctor/integrity diagnostics

Surface schema, reference, asset, Git, recovery, and configuration checks with severity,
remediation, and safe downloadable evidence. Redact tokens, launch credentials, absolute
home paths, and environment values.

**Verify**: seeded broken fixtures produce each diagnostic; redaction tests prove no
credential value appears in UI, logs, or export.

### Step 4: Add preferences and task help

Implement persisted theme/font/density/accessibility preferences with schema versioning
and reset. Add keyboard shortcut reference and task-oriented help for browse, edit,
review, import, recovery, and publish. Keep destructive shortcuts confirmation-gated.

**Verify**: Playwright covers keyboard-only navigation, preference persistence/reset,
invalid stored preferences, and shortcuts without triggering unintended mutations.

## Test plan

- Use Python UI tests/behavior as parity fixtures, not runtime dependencies.
- Component/browser coverage for filter URL state, full create, duplicate, settings,
  help, doctor, and Git pull job states.
- Contract tests for all new API bodies and secret redaction.
- Add certification evidence rows for each migrated workflow.

## Done criteria

- [ ] Price filters persist in URL and affect API results.
- [ ] Create/duplicate preserve every editable field and generate correct new identity.
- [ ] Git pull is bounded, observable, cancellable, and temporary-repo tested.
- [ ] Integrity diagnostics are actionable and credential-safe.
- [ ] Preferences/help/shortcuts are accessible and persist correctly.
- [ ] No selected Python daily workflow remains without an executable TS equivalent.

## STOP conditions

- A Python menu item has side effects or semantics not recoverable from code/tests.
- Git pull policy would need arbitrary browser-controlled remotes/branches.
- Preferences require server-side storage of user secrets or machine-specific paths.
- Work expands into a general visual redesign.

## Maintenance notes

Keep the operator parity ledger in certification. New Python fallback features are not
allowed after cutover unless simultaneously specified for TS or explicitly rejected.
