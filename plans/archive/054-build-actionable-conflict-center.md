# Plan 054: Build an actionable sync conflict center

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/sync.py admin/product_manager/services.py admin/product_manager/ui admin/product_manager/tests`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 043, 050, 052; plan 053 recommended before final persistence contract
- **Category**: direction
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

The sync engine already captures field-level server/client values, reasons,
change-set IDs, and timestamps, but the UI only shows a destructive warning.
Operators need to understand, resolve, retry, and audit conflicts without
losing either version.

## Current state

- `sync.py:551-560` records `product_id`, field conflicts, change-set ID, and timestamp.
- `sync.py:412-423` currently offers only list or clear.
- `main_window.py:875-898` formats conflicts as warning text without actions.
- Plan 043 first makes viewing durable; plan 050 provides presenter boundaries.

## Commands

| Purpose   | Command                                                                                                                                                                              | Expected |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Focused   | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_conflict_center.py -q`                                                                            | pass     |
| Full      | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                    | pass     |
| Lint/type | `admin/product_manager/.venv/bin/ruff check admin/product_manager && admin/product_manager/.venv/bin/python -m mypy admin/product_manager --no-incremental --cache-dir=/tmp/pm-mypy` | exit 0   |

## Scope

**In scope**: conflict domain state, durable local resolution records, service
commands, presenter, workspace page/dialog, retry integration, and tests.

**Out of scope**: changing remote API semantics without explicit evidence,
automatic semantic merges, multi-user locking, or resolving Git conflicts.

## Git workflow

- Branch: `advisor/054-conflict-center`
- Commit by slice: domain state, service commands, presenter, UI.

## Steps

1. Define conflict lifecycle: `unresolved`, `resolution_selected`, `retrying`,
   `resolved`, `failed`, `acknowledged`. Assign stable conflict/field IDs.
2. Preserve immutable server/local/base snapshots and resolution audit entries.
   Never overwrite evidence when a retry fails.
3. Implement service commands for choose-local, choose-server, and manual value
   per field, plus apply-all only when every field has a choice.
4. Integrate retry/idempotency with change-set IDs. If remote protocol cannot
   accept a resolution, persist a pending action and surface the limitation.
5. Build a presenter and workspace view showing product, timestamps, field diff,
   reason, choice, retry state, and error. Require confirmation before apply.
6. Add filtering by unresolved/failed/resolved and an auditable read-only history.

## Test plan

Cover each resolution type, mixed field choices, invalid manual value, retry
success/failure, restart, duplicate retry, stale remote revision, acknowledgement,
and preservation of snapshots/history.

## Done criteria

- [ ] Viewing never mutates conflict state.
- [ ] Every resolution is explicit, validated, retryable, and audited.
- [ ] Failed retries preserve evidence and selected choices.
- [ ] UI exposes unresolved and failed work clearly.
- [ ] Tests, Ruff, and mypy pass; README updated.

## STOP conditions

- Remote API lacks a safe idempotent resolution operation; stop after local
  design/presenter and document the required API contract.
- Conflict identity depends on mutable name/description after plan 053 is selected.
- Any resolution would discard an unrepresented field value.

## Maintenance notes

Conflict records may contain business data; do not log full snapshots at info
level or include credentials. Retention policy should be explicit.
