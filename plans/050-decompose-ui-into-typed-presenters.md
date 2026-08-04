# Plan 050: Decompose the Content Manager UI into typed feature presenters

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/ui admin/product_manager/category_gui.py admin/product_manager/services.py admin/product_manager/tests`
> Compare live files carefully; the UI had extensive uncommitted work when planned.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 039–047
- **Category**: tech-debt
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

`MainWindow` is a 2,070-line controller with four mixins and 78 structurally
affected symbols. UI modules mix widget construction, domain decisions,
filesystem work, persistence, Git, filtering, and presentation. The current
mypy run reports 64 errors, many caused by undocumented mixin host attributes.
A visual revamp on this foundation would multiply regression risk.

## Current state

```python
# ui/main_window.py:60
class MainWindow(DragDropMixin, BulkOperationsMixin,
                 ImportExportMixin, DeployPanelMixin):
```

- `bulk_operations_mixin.py:17-29` documents required host attributes only in prose.
- `import_export_mixin.py:20-30` repeats the implicit contract.
- `product_form.py` is 974 lines; `category_gui.py` is 1,195 lines.
- Services and repositories are already separable Python objects; presenters
  should depend on their protocols, not Tk widgets.

## Commands

| Purpose    | Command                                                                                                                     | Expected                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tests      | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                           | pass after each slice                                                        |
| Lint       | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                          | pass                                                                         |
| Typecheck  | `admin/product_manager/.venv/bin/python -m mypy admin/product_manager --no-incremental --cache-dir=/tmp/pm-mypy`            | zero errors in production package; test-only exceptions explicitly justified |
| Complexity | `admin/product_manager/.venv/bin/ruff check admin/product_manager/ui --select C901,PLR0912,PLR0915 --output-format=concise` | no new violations; named target handlers removed or reduced                  |

## Scope

**In scope**: `admin/product_manager/ui/`, `category_gui.py`, new presenter/view
protocol modules inside this package, and tests. Small service protocol changes
are allowed when required for clean boundaries.

**Out of scope**: changing business rules, JSON schemas, visual redesign,
replacing Tkinter, root application code, or stable-ID migration.

## Git workflow

- Branch: `advisor/050-typed-ui-presenters`
- Use several logical commits: `refactor(product-manager): extract <feature> presenter`.
- Do not push unless instructed.

## Steps

### Step 1: Define boundaries and dependency direction

Create typed protocols for view operations and presenter inputs. Target feature
areas: catalog browsing/filtering, selection/actions, product editing, bulk
operations, import/export, sync/conflicts, and publishing. Presenters return
plain dataclasses/enums; views translate them to widgets.

**Verify**: protocol/presenter unit tests pass without importing `tkinter`.

### Step 2: Extract pure catalog state first

Move filter state, quick views, selection identity, status summaries, and reorder
intent from `MainWindow` into a catalog presenter. Keep adapter methods so the
existing UI behavior remains unchanged.

**Verify**: characterization tests and full suite pass.

### Step 3: Replace mixin host contracts

Extract bulk, import/export, deploy, and conflict orchestration into composed
presenters with constructor-injected services and explicit view protocols.
Delete a mixin only after all callers use the presenter.

**Verify**: mypy attr-defined errors for each removed mixin reach zero before
moving to the next feature.

### Step 4: Separate forms from media/persistence

Make product/category/storefront dialogs thin views over typed form state and
commands. Reuse plan 041's media transaction service rather than adding widget
filesystem calls.

**Verify**: dialog behavior tests pass headlessly.

### Step 5: Reduce `MainWindow` to composition

`MainWindow` should construct layout, bind view events, and delegate commands.
Set review thresholds: no business mutation method, no direct file/network/Git
I/O, and no new handler above the existing complexity limit.

**Verify**: full tests, Ruff, targeted complexity, and mypy gates pass.

## Test plan

Every extracted presenter needs unit tests for state transitions, errors, and
commands. Retain adapter integration tests for event wiring. Convert all plan
039 xfails relevant to completed fixes.

## Done criteria

- [ ] Main window contains composition/view binding, not business workflows.
- [ ] No UI mixin relies on undocumented host attributes.
- [ ] Presenter tests run without a display.
- [ ] Production package mypy errors are zero or an explicit narrower baseline
      approved by the maintainer.
- [ ] Full tests, Ruff, and complexity gates pass; README updated.

## STOP conditions

- Any prerequisite correctness plan is unfinished.
- A slice changes user-visible behavior without a characterization test.
- More than one large feature is broken between commits.
- The work begins turning into a visual redesign; defer that to plan 052.

## Maintenance notes

Dependency direction is `Tk view -> presenter -> service/repository protocol`.
Never import Tk types into presenters or repository types into widgets.
