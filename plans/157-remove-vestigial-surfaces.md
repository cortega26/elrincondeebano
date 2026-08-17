# 157 — Remove vestigial surfaces (cypress, admin/panel, stale Python config, dead abstraction)

- **Source**: Auditoría 10, DEBT-07 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- cypress/ admin/panel/ mypy.ini admin/ruff.toml admin/__init__.py .venv admin/content-manager/src/shared/errors/AppError.ts`

## Problem

Several vestigial surfaces create false affordances (a new contributor reads them and assumes a live surface):

- `cypress/` — contains only an empty `screenshots/` dir; **0 tracked files** (`git ls-files cypress` empty); unreferenced in package.json, workflows, configs.
- `admin/panel/` — a static HTML/JS admin (`index.html`, `app.js`, `style.css`, tracked) referenced by nothing in the repo (only a URL string inside `test/swCachePolicy.test.js:5`); the deployed admin is `content-manager`.
- `mypy.ini:3` — `files = admin/product_manager`, a directory that no longer exists (plan 069); the root `.venv` is a **dangling symlink** to `admin/product_manager/.venv` — it breaks tools that auto-detect `.venv`.
- `admin/ruff.toml` + `admin/__init__.py` — vestigial config for the retired Python admin (the only live Python, `tools/category_og`, is invoked via `python3 -m tools.category_og` and never ruff-linted by this config).
- `admin/content-manager/src/shared/errors/AppError.ts:10-26` — `AppError` interface and `DomainError` class have zero production usages (`HttpError` and `sanitizeUserMessage` are what the app imports); `DomainError` appears only in `test/contract/shared.test.ts:5-11`.

## Scope

**In**: Delete `cypress/`, `admin/panel/`, `admin/ruff.toml`, `admin/__init__.py`, `mypy.ini`, the `.venv` symlink; remove the unused `AppError`/`DomainError` exports from `AppError.ts` (keep `HttpError` + `sanitizeUserMessage`). Update `test/contract/shared.test.ts` if it asserts the removed exports.

**Out**: `tools/category_og` Python (live — plan 156 retires it separately), `tools/requirements-semgrep.txt` + `tools/__init__.py` (live semgrep infra), `test/swCachePolicy.test.js` (keep — it only references a URL string, not the panel).

## Steps

1. `git ls-files` each target to confirm tracked/untracked state; delete tracked files with `git rm`, untracked dirs/symlink with plain removal.
2. Remove the unused exports from `AppError.ts` and delete the `DomainError`-asserting lines from `test/contract/shared.test.ts`.
3. Grep after deletion to confirm zero references remain: `grep -rn "admin/panel\|mypy\|ruff\|DomainError\|__init__.py"` across package.json, workflows, docs that must stay current (if a doc references these, fix the doc in this same commit per the repo's doc-gardening practice).

## Tests

- `npm run lint`, `npm run typecheck`, `npm test` green — proves nothing imported the removed surfaces.
- `npm run admin:test` green (AppError removal).

## Done criteria

- [ ] `git status` shows the deletion commit with no unexpected removals.
- [ ] `grep -rn "DomainError" admin/content-manager/src` → no matches.
- [ ] `ls .venv` → no such file; `mypy.ini`, `admin/ruff.toml`, `admin/__init__.py`, `cypress/`, `admin/panel/` gone.
- [ ] `npm run lint` + `npm run typecheck` + `npm test` green.

## Maintenance

The `tools/category_og` Python is still live (until plan 156); do NOT add ruff/mypy config for it here — that is plan 156's job. A reviewer should confirm no CI workflow referenced the deleted files (the workflows were grepped by the audit; re-verify in this commit).

## Rollback

`git revert <sha>`.

## STOP conditions

- If any CI workflow or script references a deleted file (the audit may have missed one), stop and report — never delete a referenced file.
