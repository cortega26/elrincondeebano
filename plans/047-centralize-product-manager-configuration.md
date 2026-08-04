# Plan 047: Give Content Manager configuration one typed owner

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/content_manager.py admin/product_manager/ui/main_window.py admin/product_manager/ui/dialogs.py admin/product_manager/ui/theme.py admin/product_manager/ui/components.py admin/product_manager/tests`
> The listed files were dirty when planned; compare excerpts before editing.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: tech-debt
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Application configuration, UI preferences, and theme preferences currently
have separate loaders and writers. CLI-provided UI settings are only partially
applied, and concurrent non-atomic read/merge/write cycles can lose keys.

## Current state

- `content_manager.py:464-472` creates `UIConfig`, but `MainWindow.__init__`
  does not accept it and reloads `~/.product_manager/config.json` at line 81.
- `main_window.py:246-313`, `dialogs.py:69-100`, and `theme.py:264-294` each
  implement their own JSON persistence.
- Product/category repositories already demonstrate temp-file, fsync, and
  `os.replace` atomic writes; follow that convention.

## Commands

| Purpose | Command                                                                                                                                                    | Expected |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Focused | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_configuration.py admin/product_manager/tests/test_ui_main_window.py -q` | pass     |
| Full    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                          | pass     |
| Lint    | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                         | pass     |

## Scope

**In scope**: a typed settings model/store under `admin/product_manager/`, the
four current callers, and tests.

**Out of scope**: product/category data configuration format, secrets storage,
OS keychain integration, or preferences outside this application.

## Git workflow

- Branch: `advisor/047-centralize-manager-config`
- Commit: `refactor(product-manager): centralize configuration`

## Steps

1. Define typed application/UI/theme settings with defaults, validation, and
   forward-compatible unknown-key preservation.
2. Implement one settings repository with atomic write, lock, corrupted-file
   fallback, and dependency-injected path for tests.
3. Pass the normalized `UIConfig`/settings object into `MainWindow`; remove its
   independent startup load. Ensure CLI config overrides defaults and user
   preferences according to one documented precedence order.
4. Route preferences and theme changes through the same repository and one
   update API. Debounce window geometry writes without racing theme changes.
5. Remove duplicate JSON persistence code and test migration from the existing
   user file shape.

**Verify after each step**: focused tests pass; final full suite and Ruff pass.

## Test plan

Cover missing file, malformed JSON, unknown keys, CLI overrides, preference
updates preserving theme, theme update preserving geometry, concurrent updates,
write failure, and legacy file migration.

## Done criteria

- [ ] One module owns settings load/validate/update/save.
- [ ] `MainWindow`, preferences, and theme contain no direct config-file I/O.
- [ ] CLI UI settings are applied consistently.
- [ ] Writes are atomic and preserve unrelated keys.
- [ ] Tests and Ruff pass; README updated.

## STOP conditions

- Configuration contains a real bearer token that would be migrated or logged;
  report the credential type without copying its value.
- Precedence cannot be inferred; present options instead of guessing.

## Maintenance notes

New preferences must extend the typed model and repository update API, never
open the JSON file directly.
