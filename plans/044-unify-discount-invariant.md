# Plan 044: Enforce one discount invariant across model, forms, and bulk edits

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/models.py admin/product_manager/ui/product_form.py admin/product_manager/ui/main_window.py admin/product_manager/ui/bulk_operations_mixin.py admin/product_manager/tests`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: bug
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

The domain model accepts a discount equal to price, bulk percentage accepts
100%, while the product form and inline editor reject equality. The tool can
create a product state it cannot later edit consistently.

## Current state

- `models.py:135-142` rejects only `discount > price`.
- `bulk_operations_mixin.py:195-212` permits 0–100%.
- `product_form.py:483-489` and `main_window.py:1733-1739` reject `>= price`.

## Commands

| Purpose        | Command                                                                                                                                                                                                 | Expected |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Model/UI tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_models.py admin/product_manager/tests/test_ui_product_form.py admin/product_manager/tests/test_ui_main_window.py -q` | pass     |
| Full           | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                                       | pass     |
| Lint           | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                                                                                                                      | pass     |

## Scope

**In scope**: the four validation sites and tests.

**Out of scope**: storefront display, pricing campaigns, decimal currency, or
data migration outside this folder.

## Git workflow

- Branch: `advisor/044-discount-invariant`
- Commit: `fix(product-manager): unify discount validation`

## Steps

1. Confirm the business rule with catalog evidence if available without
   reading outside scope. Default recommendation: allow a free product
   (`discount == price`) because the domain model and percentage UI already do.
2. Centralize the invariant in `Product`; UI layers should construct a product
   or call one shared validator rather than reproduce comparisons.
3. Align Spanish messages and bulk percentage bounds.
4. Add boundary tests for 0%, 99%, 100%, negative, and greater than price.

## Test plan

Extend `tests/test_models.py` and the plan-039 UI test files. Assert the same
boundary result through direct model construction, full form validation, inline
editing, percentage bulk discount, and fixed bulk discount. Include matching
Spanish error text only where it is part of the user contract.

## Done criteria

- [ ] All four paths accept/reject identical boundaries.
- [ ] One domain validator owns the comparison.
- [ ] Tests and Ruff pass; README updated.

## STOP conditions

- The maintainer requires forbidding 100% discounts. Report that decision and
  invert the plan consistently instead of guessing.

## Maintenance notes

Future pricing features should import the domain rule, not restate it in UI.
