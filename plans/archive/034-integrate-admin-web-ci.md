# Plan 034: Lock and validate the Streamlit admin surface in CI

> **Executor instructions**: Keep Python dependency ownership explicit, avoid importing Streamlit with uncontrolled UI side effects, and update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- admin/web admin/product_manager/requirements.txt admin/product_manager/requirements.lock.txt .github/workflows/admin.yml .github/workflows/security-audit.yml`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

`admin/web` is an executable Streamlit UI over shared catalog storage, but its two lower-bounded dependencies are outside the canonical lock, admin CI and pip audit. Fresh installs can resolve untested versions and security scanning omits the web surface. A locked profile and smoke test make this real surface reproducible.

## Current state

- `admin/web/requirements.txt` contains `streamlit>=1.40.0` and `watchfiles>=0.24.0` only.
- `.github/workflows/admin.yml` caches/installs only product-manager requirements and runs ruff/bandit/pytest there.
- `.github/workflows/security-audit.yml` audits only `admin/product_manager/requirements.lock.txt`.
- `admin/web/app.py` executes Streamlit UI at import; a smoke strategy must avoid starting a server.

## Commands you will need

| Purpose       | Command                                                                  | Expected                                           |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| Install check | `python -m pip check`                                                    | no conflicts                                       |
| Python gate   | `cd admin/product_manager && python -m ruff check . && python -m pytest` | pass                                               |
| Web smoke     | documented command created by this plan                                  | imports/constructs app dependencies without server |
| Audit         | `python -m pip_audit -r <web lock or combined lock>`                     | no known high/critical issues                      |

## Scope

**In scope**: drift-check paths; create a small `admin/web/tests/test_app_smoke.py` or refactor an import-safe `admin/web/config.py` if necessary.

**Out of scope**: changing the catalog model/source of truth (plan 036), UI redesign, deploying Streamlit, broad dependency upgrades.

## Git workflow

- Branch: `advisor/034-admin-web-ci`
- Commit: `chore(admin): validate Streamlit surface in CI`

## Steps

### Step 1: Choose and document dependency ownership

Prefer one canonical top-level Python input plus lock if Streamlit and Tkinter share an environment; otherwise create explicit `admin/web/requirements.lock.txt` generated under Python 3.12. Do not leave duplicate unconstrained names across profiles without explaining their relationship.

**Verify**: a clean Python 3.12 environment installs the selected profile(s) with constraints and `pip check` passes.

### Step 2: Add an import-safe smoke

Move path/constants/store construction behind functions if required so a test can validate module imports, database initialization against `tmp_path`, and one read without starting Streamlit or touching repo data.

**Verify**: focused pytest passes and `git status` shows no generated DB/data.

### Step 3: Extend CI and audit

Update admin CI cache/install paths, ruff/bandit scopes and tests to cover `admin/web`. Update security audit to scan the effective web dependency graph.

**Verify**: workflow syntax tests/linters pass; local Python gate and audit pass.

## Test plan

Smoke dependency import, temporary SQLite initialization and read-only product listing. No browser UI test is required in this plan.

## Done criteria

- [ ] Streamlit/watchfiles versions are reproducibly locked.
- [ ] CI installs and tests `admin/web`.
- [ ] Security audit includes its effective graph.
- [ ] Tests do not touch canonical repo data.

## STOP conditions

- Combining locks creates incompatible dependency constraints.
- Import safety requires a broad rewrite of `app.py`; create a follow-up design plan instead.
- pip audit finds a high issue with no compatible fix.

## Maintenance notes

Regenerate locks on the documented Python version and keep admin profiles explicit. Deployment remains out of scope until ownership is decided.
