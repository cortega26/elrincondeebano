# Plan 043: Preserve sync conflicts until explicit resolution

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/sync.py admin/product_manager/services.py admin/product_manager/ui/main_window.py admin/product_manager/tests`
> This plan reflects dirty source; compare excerpts before editing.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: bug
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Viewing the conflict dialog currently consumes and clears every conflict. A
user can lose the only record of divergent server/local fields without choosing
a winner or retrying anything.

## Current state

`sync.py:412-423` distinguishes `get_conflicts()` from destructive
`clear_conflicts()`. `services.py:267-271` exposes the destructive call as
`consume_conflicts()`. `main_window.py:875-898` invokes it simply to display a
warning and joins lines without newline separators.

## Commands

| Purpose    | Command                                                                                                                                                          | Expected |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Sync tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_sync_engine_headers.py admin/product_manager/tests/test_ui_main_window.py -q` | pass     |
| Full tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                | pass     |
| Lint       | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                               | pass     |

## Scope

**In scope**: sync conflict read/acknowledge APIs, the current read-only dialog,
queue persistence, and tests.

**Out of scope**: field-level merge UI, API protocol changes, or automatic
conflict resolution; those belong to plan 054.

## Git workflow

- Branch: `advisor/043-preserve-sync-conflicts`
- Commit: `fix(product-manager): retain conflicts until acknowledged`

## Steps

1. Add a regression test proving opening the dialog twice returns the same
   conflicts and queue persistence retains them.
2. Make the display path use non-destructive `get_conflicts()`.
3. Add an explicit acknowledgement API keyed by conflict/change-set identity;
   do not expose a global clear operation to ordinary viewing code.
4. Improve the current warning formatting and add an explicit acknowledgement
   confirmation if the temporary dialog offers dismissal.

**Verify**: focused tests after each API/UI step; full suite and Ruff at end.

## Test plan

Cover repeated view, application restart/load, acknowledgement of one among
multiple conflicts, unknown ID, and cancelled acknowledgement.

## Done criteria

- [ ] Viewing is non-destructive.
- [ ] Conflicts persist until an explicit keyed acknowledgement.
- [ ] The service no longer calls global clear for display.
- [ ] Tests and Ruff pass; README updated.

## STOP conditions

- Queue format lacks a stable conflict key; add a backward-compatible key but
  STOP if a destructive migration would be required.
- Remote API changes are required.

## Maintenance notes

Plan 054 will build resolution actions on this durable conflict lifecycle.
