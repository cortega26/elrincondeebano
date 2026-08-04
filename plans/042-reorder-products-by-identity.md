# Plan 042: Reorder the intended product under filters and sorting

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/ui/main_window.py admin/product_manager/ui/components.py admin/product_manager/services.py admin/product_manager/tests`
> Update `plans/README.md` when done and STOP if excerpts drift.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: bug
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Tree rows can be filtered and independently sorted, but drag/drop reordering
uses a visible numeric index against the complete catalog. The wrong product
can move even though the UI reports success.

## Current state

`main_window.py:1213-1220` populates a filtered list. `components.py:148-164`
sorts Treeview rows without changing the service list. `main_window.py:1513-1523`
then pops `get_all_products()[start_index]` and inserts it at the visible index.
Rows contain only display values, not a stable item identity.

## Commands

| Purpose | Command                                                                                                  | Expected |
| ------- | -------------------------------------------------------------------------------------------------------- | -------- |
| Focused | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_ui_main_window.py -q` | pass     |
| Full    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                        | pass     |
| Lint    | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                       | pass     |

## Scope

**In scope**: `ui/components.py`, `ui/main_window.py`, `services.py` only if a
new identity-based reorder API is required, and focused tests.

**Out of scope**: product ID migration, visual drag indicators, gallery reorder,
or changing the persisted `order` format.

## Git workflow

- Branch: `advisor/042-identity-reorder`
- Commit: `fix(product-manager): reorder products by identity`

## Steps

1. Add tests for unfiltered order, search-filtered order, category-filtered
   order, sorted columns, and archived view. Verify they expose the old bug.
2. Associate each tree item with the product identity key or an explicit map;
   never recover identity from row index.
3. Change drag release to pass the moved identity and its neighboring visible
   identities. Define deterministic insertion semantics that preserve hidden
   products' relative order.
4. Persist the full catalog exactly once and refresh the active view.

**Verify after each step**: focused tests pass for implemented cases; final full
suite and Ruff exit 0.

## Test plan

Assert the moved identity, full catalog membership, hidden-product relative
order, and contiguous persisted `order` values. Include a no-op drop and a row
that disappears between drag start and release.

## Done criteria

- [ ] No reorder path indexes the full catalog with a visible row index.
- [ ] Filtered and sorted regression tests pass.
- [ ] No product is added, removed, or duplicated.
- [ ] Full tests and Ruff pass; README updated.

## STOP conditions

- The desired semantics for moving among hidden rows cannot be expressed
  deterministically; report the alternatives.
- Implementation requires the stable-ID migration from plan 053.

## Maintenance notes

The identity map remains name+description based until plan 053. Revisit only
that mapping—not reorder semantics—during the ID migration.
