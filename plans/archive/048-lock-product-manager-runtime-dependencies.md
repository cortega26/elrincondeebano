# Plan 048: Make Content Manager dependency installation reproducible

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/requirements.txt admin/product_manager/requirements.lock.txt`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `8c903e3`, 2026-07-15
- **Completed at**: 2026-07-15

## Why this matters

The manifest says the constraints file provides reproducible installation, but
three direct runtime dependencies—`pillow-heif`, `pillow-avif-plugin`, and
`ttkbootstrap`—are absent from the lock. The checked local environment also
drifted from locked versions, making audits and bug reports ambiguous.

## Current state

`requirements.txt:1-19` mixes runtime and test/tooling dependencies and names
the three packages. `requirements.lock.txt:1-57` is a Python 3.12 freeze but
does not constrain them. Installation convention is:

```text
pip install -r admin/product_manager/requirements.txt \
  -c admin/product_manager/requirements.lock.txt
```

## Commands

| Purpose       | Command                                                                                                                                                                                                                              | Expected                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Validate pins | `rg -qi '^pillow[-_]heif==' admin/product_manager/requirements.lock.txt && rg -qi '^pillow[-_]avif[-_]plugin==' admin/product_manager/requirements.lock.txt && rg -qi '^ttkbootstrap==' admin/product_manager/requirements.lock.txt` | exit 0                                           |
| Audit         | `admin/product_manager/.venv/bin/python -m pip_audit --path admin/product_manager/.venv/lib/python3.14/site-packages --progress-spinner off`                                                                                         | no known vulnerabilities after clean env install |
| Tests         | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                                                                    | pass                                             |
| Lint          | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                                                                                                   | pass                                             |

## Scope

**In scope**: the two requirements files and, if created inside this folder,
a small lock-generation/check script or documentation file.

**Out of scope**: committing virtual environments, root Node dependencies, CI
workflow edits, or arbitrary dependency upgrades unrelated to reproducibility.

## Git workflow

- Branch: `advisor/048-lock-manager-dependencies`
- Commit: `chore(py-deps): lock product manager runtime dependencies`

## Steps

1. Decide and document whether the lock is a full freeze or constraints file;
   do not claim both.
2. Separate runtime from development requirements if this can be done entirely
   inside the folder without breaking the documented install command.
3. Regenerate pins with the supported Python baseline and include every direct
   runtime dependency plus resolved Pillow.
4. Validate installation in a disposable environment, run tests, and audit that
   environment. Do not use or commit `.venv` contents.

## Test plan

This is an installation contract plan. Verification is a clean install, imports
of PIL/AVIF plugins/ttkbootstrap, the existing test suite, and dependency audit.

## Done criteria

- [x] Every direct dependency is constrained.
- [x] Lock semantics and generation command are truthful.
- [x] Clean supported-Python install succeeds.
- [x] Tests, imports, Ruff, and audit pass.
- [x] No `.venv` file is committed; README updated.

## STOP conditions

- Resolution differs across supported Python versions and one lock cannot
  represent it; report a lock strategy proposal.
- A vulnerability lacks a compatible fixed version.

## Maintenance notes

Regenerate from a clean environment. Never infer repository vulnerability
status from a stale developer virtualenv.
