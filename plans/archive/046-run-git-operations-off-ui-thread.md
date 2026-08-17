# Plan 046: Keep Git and publication I/O off Tk's main thread

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/git_sync.py admin/product_manager/ui/deploy_panel.py admin/product_manager/ui/components.py admin/product_manager/tests`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/039-characterize-product-manager-ui.md`, `plans/045-make-publication-safe-and-truthful.md`
- **Category**: perf
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Git status, commit, push, and pull currently execute from Tk callbacks. Their
timeouts range from 30 to 120 seconds, so filesystem, credential, or network
latency can freeze the entire Content Manager.

## Current state

- `deploy_panel.py:263-330` polls status synchronously on the UI thread.
- `deploy_panel.py:355-399` performs commit, push, and pull synchronously.
- `git_sync.py:73-107` allows a 30-second command timeout; push/pull use 120.
- `ui/components.py:63-125` contains an `AsyncOperation` queue/polling pattern,
  but it lacks cancellation and operation identity.

## Commands

| Purpose | Command                                                                                                                                                | Expected |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Focused | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_ui_deploy_panel.py admin/product_manager/tests/test_git_sync.py -q` | pass     |
| Full    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                      | pass     |
| Lint    | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                     | pass     |

## Scope

**In scope**: deploy panel asynchronous orchestration, a reusable task runner
under `ui/`, cancellation/cleanup, and tests.

**Out of scope**: asyncio migration, multiprocessing, Git command semantics,
or parallel publication operations.

## Git workflow

- Branch: `advisor/046-async-git-ui`
- Commit: `perf(product-manager): move git io off ui thread`

## Steps

1. Create a typed single-operation task runner: worker thread executes pure I/O;
   queue carries success/error/cancel; only `master.after` callbacks touch widgets.
2. Move status polling to the runner and coalesce ticks so a slow status request
   cannot accumulate overlapping workers.
3. Move commit, push, pull, and publication callbacks to the runner. Disable
   conflicting buttons, expose progress/cancel where safe, and re-enable in one
   completion path.
4. On window close, cancel scheduled callbacks and ignore late worker results;
   never update destroyed widgets.

**Verify after each step**: focused tests use blocking events to prove the Tk
callback returns immediately and widget mutations occur only through `after`.

## Test plan

Cover slow status, overlapping poll, success, exception, cancellation, close
during operation, and late completion. Assert one Git mutation at a time.

## Done criteria

- [ ] No Git subprocess is launched directly from a Tk callback.
- [ ] No background thread mutates Tk widgets.
- [ ] Polls cannot overlap.
- [ ] Close/cancel produces no late widget error.
- [ ] Tests and Ruff pass; README updated.

## STOP conditions

- Plan 045 changes the deploy API beyond the assumptions here.
- A task requires forcefully terminating a Git subprocess; report and design a
  cooperative boundary rather than killing threads.

## Maintenance notes

Use the task runner for future blocking manager operations. Keep business
results independent of Tk objects so they remain unit-testable.
