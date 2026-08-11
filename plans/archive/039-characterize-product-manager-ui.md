# Plan 039: Establish a characterization safety net for the Content Manager UI

> **Executor instructions**: Follow every step and verification gate. Update the
> plan row in `plans/README.md` when finished. Do not refactor production UI code
> while building this baseline.
>
> **Drift check (run first)**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/ui admin/product_manager/tests`
> This plan was authored against commit `8c903e3` plus an already-dirty working
> tree. Also run `git status --short -- admin/product_manager`; if the excerpts
> below no longer match, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `8c903e3`, 2026-07-15
- **Completed at**: 2026-07-15

## Why this matters

The Python package has 101 passing tests but only 21% statement coverage. The
main window, product form, category UI, bulk/import mixins, deploy panel,
gallery, themes, toasts, and storefront dialogs currently measure 0% coverage.
Every subsequent safety fix and the planned UI redesign depend on preserving
today's observable behavior first.

## Current state

- `admin/product_manager/ui/main_window.py:60` defines a 2,000-line controller
  with four mixins and most application interactions.
- `admin/product_manager/ui/product_form.py:45` owns validation and media side effects.
- `admin/product_manager/ui/bulk_operations_mixin.py:17` and
  `ui/import_export_mixin.py:20` rely on implicit host attributes.
- Existing tests such as `tests/test_services.py` use pytest fixtures and small
  fakes; follow this pattern instead of booting a real display.

Current startup shape:

```python
# ui/main_window.py:60-74
class MainWindow(DragDropMixin, BulkOperationsMixin, ImportExportMixin, DeployPanelMixin):
    def __init__(self, master, product_service, category_service=None,
                 project_root=None, deploy_pipeline=None, git_sync=None):
```

## Commands you will need

| Purpose  | Command                                                                                                                                                                | Expected on success                |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Tests    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                      | all tests pass                     |
| Coverage | `COVERAGE_FILE=/tmp/pm.coverage admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q --cov=admin.product_manager --cov-report=term-missing` | exit 0; target functions exercised |
| Lint     | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                                     | exit 0                             |

## Scope

**In scope**:

- `admin/product_manager/tests/conftest.py`
- New `admin/product_manager/tests/test_ui_*.py` files
- At most minimal dependency-injection seams in `admin/product_manager/ui/`
  when a behavior cannot be tested otherwise

**Out of scope**:

- Visual redesign, widget restyling, or behavior changes
- Root storefront, data files, assets, CI, and documentation outside `plans/`
- Snapshot tests of pixel appearance

## Git workflow

- Branch: `advisor/039-characterize-product-manager-ui`
- Commit style: `test(product-manager): characterize ui workflows`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add reusable headless UI fakes

Extend `tests/conftest.py` with focused fakes for Tk variables, tree selection,
messagebox calls, and `after` scheduling. Prefer constructing mixin hosts and
`MainWindow.__new__(MainWindow)` over creating `tk.Tk()`; tests must run without
`DISPLAY`.

**Verify**: `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q` -> existing tests remain green.

### Step 2: Characterize destructive and stateful workflows

Add tests that freeze current inputs/outputs for:

- product filtering and selection lookup;
- drag/drop reorder dispatch;
- bulk update payload construction and undo/redo stacks;
- product-form save/cancel and category/media callbacks;
- conflict display behavior without accepting current destructive clearing as desired;
- deploy result rendering and button-state transitions;
- config load/save merge behavior.

Mark tests exposing known bugs with `pytest.mark.xfail(strict=True, reason=...)`
only when the corresponding correction plan is named in the reason. Do not
make incorrect behavior pass as a permanent assertion.

**Verify**: `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q` -> pass with only explicitly documented strict xfails.

### Step 3: Add smoke construction tests for dialogs

For each dialog module, test constructor orchestration through patched widget
factories or extracted pure builders. Assert commands are wired to the correct
service methods and cancellation performs no persistence call.

**Verify**: coverage report shows non-zero coverage for
`bulk_operations_mixin.py`, `deploy_panel.py`, `import_export_mixin.py`,
`main_window.py`, and `product_form.py`.

## Test plan

Create at least 20 focused tests across `test_ui_main_window.py`,
`test_ui_product_form.py`, `test_ui_bulk_operations.py`, and
`test_ui_deploy_panel.py`. Use `tests/test_services.py` as the fake/fixture
style exemplar. No real Git, network, filesystem outside `tmp_path`, or display.

## Done criteria

- [x] Full package tests pass.
- [x] Ruff passes.
- [x] Five named high-risk UI modules have non-zero coverage.
- [x] Known failures are strict xfails tied to plans 040–046, not skipped tests.
- [x] Tests run successfully with `DISPLAY` unset.
- [x] No production behavior was intentionally changed.
- [x] README status updated.

## STOP conditions

- A test requires installing a desktop/display server.
- Characterization requires changing a public data format.
- More than minimal dependency seams are needed in production code.
- Existing uncommitted UI work would be overwritten.

## Maintenance notes

Prefer behavior assertions over widget-tree snapshots. Each later UI plan must
convert its relevant strict xfail into a passing regression test.
