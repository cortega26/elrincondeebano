# Plan 045: Make Content Manager publication scoped, preflighted, and truthful

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/deploy.py admin/product_manager/git_sync.py admin/product_manager/ui/deploy_panel.py admin/product_manager/tests`
> All three production files were untracked when planned. If their live shape
> differs from the excerpts, STOP and report instead of merging designs.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: bug
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Publication is a release boundary. The current implementation can include
unrelated files already staged, omit generated content outside two hard-coded
paths, push before validation, and mark the result successful even when
`push()` returns false.

## Current state

```python
# git_sync.py:195-208
for pattern in ["data/", "assets/images/"]:
    self._run_git(["add", "--", pattern])

# deploy.py:233-249
result.pushed = self.git.push()
...
result.success = True
```

`git_sync.py:210-223` runs plain `git commit`, which includes the entire index.
`deploy.py:240-246` performs optional build verification after push, and the
default constructor disables it. Follow the structured `DeployResult` and
explicit `DeployStep` conventions already present.

## Commands

| Purpose | Command                                                                                                                                                                                           | Expected |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Focused | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_git_sync.py admin/product_manager/tests/test_deploy.py admin/product_manager/tests/test_ui_deploy_panel.py -q` | pass     |
| Full    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                                 | pass     |
| Lint    | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                                                                | pass     |

## Scope

**In scope**: `deploy.py`, `git_sync.py`, `ui/deploy_panel.py`, focused tests.

**Out of scope**: changing root npm scripts, CI, remote repository policy,
Git credentials, storefront code, or automatically pushing from tests.

## Git workflow

- Branch: `advisor/045-safe-content-publication`
- Commit: `fix(product-manager): preflight and scope publication`

## Steps

### Step 1: Define the publication manifest

Create one explicit set of content-owned paths derived from actual manager
outputs. Status, diff preview, staging, commit, and result reporting must use
the same manifest. Detect pre-staged paths outside the manifest and block with
a clear message; never commit them silently.

**Verify**: temporary-repository tests cover clean index, unrelated staged file,
untracked content file, rename, and deletion.

### Step 2: Move validation before Git mutation

Run category sync, OG generation, integrity/build preflight, then stage and
commit. A failed generator or preflight must prevent commit and push. Record
warnings separately only for explicitly non-blocking checks.

**Verify**: tests assert no stage/commit/push calls after each failure mode.

### Step 3: Make outcomes truthful

Set `success=True` only when every required step succeeds and, when push is
requested, `pushed is True`. Distinguish `commit_succeeded_push_failed` so the
operator can retry safely. The UI must never toast “Publicación exitosa” for a
failed push.

**Verify**: result/UI matrix tests pass for commit-only, full success, push false,
push exception, build failure, and cancellation.

### Step 4: Add an exact review prompt

Before publication, show branch, remote, exact staged paths, generated changes,
validation results, and whether push will occur. Require a final confirmation.

**Verify**: UI tests assert prompt content and cancellation performs no Git mutation.

## Test plan

Prefer real temporary Git repositories for staging/index behavior and mocks for
network push. Tests must never touch the developer repository or remote.

## Done criteria

- [ ] Unrelated staged files block publication.
- [ ] All generated content-owned files are included through one manifest.
- [ ] Required verification occurs before commit/push.
- [ ] Push false/exception cannot produce success.
- [ ] Focused/full tests and Ruff pass; README updated.

## STOP conditions

- The complete content-owned path manifest cannot be determined within
  `admin/product_manager/`; report missing paths rather than scanning or editing
  out-of-scope code.
- Root validation scripts must change.
- Tests would operate on the real working repository.

## Maintenance notes

Every new manager-owned artifact must be added once to the publication manifest
and automatically appear in status, review, staging, and tests.
