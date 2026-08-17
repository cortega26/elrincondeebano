# Plan 041: Make product-form media changes transactional

> **Executor instructions**: Execute in order and update the index.
> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/ui/product_form.py admin/product_manager/tests`
> Compare live code because this path was dirty when planned.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: bug
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Changing category in the editor immediately moves referenced images. Cancel,
validation failure, or service failure can therefore leave the persisted
catalog pointing to files that no longer exist. Imported images can likewise
be orphaned before the product save commits.

## Current state

- `product_form.py:162-163` binds category selection/focus loss to `_on_category_change`.
- `product_form.py:711-780` calls `shutil.move` and rewrites entry values immediately.
- `product_form.py:246-261` destroys the dialog on Cancel without rollback.
- `product_form.py:432-445` persists only later in `save_product`.
- Repository writes use temp-file + fsync + `os.replace`; match that commit/rollback discipline.

## Commands you will need

| Purpose | Command                                                                                                   | Expected |
| ------- | --------------------------------------------------------------------------------------------------------- | -------- |
| Focused | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_ui_product_form.py -q` | pass     |
| Full    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                         | pass     |
| Lint    | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                        | exit 0   |

## Scope

**In scope**: `ui/product_form.py`, a new small media-operation value object or
helper under `ui/`, and focused tests.

**Out of scope**: changing asset directory conventions, image codecs, category
schema, product JSON, or adding a general transaction framework.

## Git workflow

- Branch: `advisor/041-transactional-product-media`
- Commit: `fix(product-manager): stage media changes until save`

## Steps

### Step 1: Model pending media operations

Represent copy/move operations as immutable pending records containing source,
destination, prior relative path, and target field. Category changes should
calculate and preview destinations but perform no filesystem mutation.

**Verify**: a unit test changes category and asserts `shutil.move` was not called.

### Step 2: Commit media only after validation

In `save_product`, validate all product data first, then perform pending media
operations, then call the product service. If the service save fails, roll back
completed moves/copies in reverse order and retain the dialog for correction.
Use collision-safe destinations and never overwrite an existing asset.

**Verify**: tests cover successful save and service failure rollback.

### Step 3: Make cancellation side-effect free

Route window close, Cancel, and Escape through one cancellation method that
discards pending operations and deletes only temporary files created by this
dialog. Never delete an original catalog asset.

**Verify**: cancellation tests assert original paths and files remain unchanged.

### Step 4: Surface commit failures clearly

Report the failed operation and rollback result without closing the editor.
Log technical paths at debug level; keep the user message concise.

**Verify**: focused and full tests pass; Ruff passes.

## Test plan

Use `tmp_path` for files. Cover category change + Cancel, validation failure,
copy success, move success, destination collision, repository failure after a
move, partial rollback failure, and source already inside the correct category.

## Done criteria

- [ ] Category selection performs no immediate move.
- [ ] Cancel and validation failure leave disk unchanged.
- [ ] Save commits product and media as one compensating transaction.
- [ ] No existing asset is overwritten or deleted on rollback.
- [ ] Tests and Ruff pass; README updated.

## STOP conditions

- Atomicity requires changing files outside `admin/product_manager/`.
- A reliable rollback cannot be defined for an operation.
- Existing dirty work contains a competing media transaction implementation.

## Maintenance notes

Keep filesystem intent separate from widgets. A future staged-change-set plan
should consume these pending operation records directly.
