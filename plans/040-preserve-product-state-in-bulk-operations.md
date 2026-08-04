# Plan 040: Preserve every product field during bulk operations

> **Executor instructions**: Follow the steps and update `plans/README.md`.
> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/ui/bulk_operations_mixin.py admin/product_manager/services.py admin/product_manager/models.py admin/product_manager/tests`
> The source was dirty when planned; compare the excerpts and STOP on mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: `plans/039-characterize-product-manager-ui.md`
- **Category**: bug
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Several bulk actions reconstruct `Product` with a partial field list. When
`ProductService.batch_update` replaces the original object, omitted fields
fall back to defaults, silently erasing AVIF paths, archive state, revision,
and field-level sync metadata.

## Current state

`models.py:36-47` defines the complete state, including
`image_avif_path`, `is_archived`, `rev`, and `field_last_modified`.
`bulk_operations_mixin.py:207-216` creates percentage-discount products without
those fields; fixed discount, stock, and price adjustment repeat the pattern.
`services.py:862-870` replaces the original object wholesale.

```python
# bulk_operations_mixin.py:207-216
new_p = Product(name=p.name, description=p.description, price=p.price,
                discount=int(p.price * (pct / 100)), stock=p.stock,
                category=p.category, image_path=p.image_path, order=p.order)
```

Use `dataclasses.replace(product, changed_field=value)` as the preservation
pattern; it is already used elsewhere in this package.

## Commands you will need

| Purpose       | Command                                                                                                      | Expected |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Focused tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_ui_bulk_operations.py -q` | pass     |
| Full tests    | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                            | pass     |
| Lint          | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                                           | exit 0   |

## Scope

**In scope**: `ui/bulk_operations_mixin.py`, its new UI test file, and narrowly
necessary `services.py` tests.

**Out of scope**: changing the product schema, persistence format, bulk UX, or
sync protocol.

## Git workflow

- Branch: `advisor/040-preserve-bulk-product-state`
- Commit: `fix(product-manager): preserve metadata in bulk updates`
- Do not push unless instructed.

## Steps

### Step 1: Add failing preservation tests

Create a product with non-default values for every field. Exercise percentage
discount, fixed discount, stock, price, and category operations. Assert only
the intended field changes and every other `to_dict()` field remains equal.

**Verify**: focused tests fail against the old constructors for the expected omitted fields.

### Step 2: Replace partial constructors

Use `dataclasses.replace` or a single explicit clone helper that starts from
`p.to_dict()`. Do not maintain another hand-copied field list. Preserve deep
metadata isolation so editing the replacement cannot mutate the original.

**Verify**: focused tests pass.

### Step 3: Protect the service boundary

Add a regression test around `batch_update` proving `rev`, archive state,
AVIF path, and field metadata survive the replacement and JSON round trip.

**Verify**: full tests and Ruff pass.

## Test plan

Cover all five bulk operation types, non-default metadata, archived products,
AVIF paths, and undo/redo payloads. Model the service fake after
`tests/test_services.py`.

## Done criteria

- [ ] No bulk operation constructs a partial `Product` by hand.
- [ ] Regression tests compare all serialized fields.
- [ ] Full tests and Ruff pass.
- [ ] Only in-scope files changed.
- [ ] README status updated.

## STOP conditions

- `Product` gains or loses fields before execution.
- Preserving state requires a schema migration.
- Existing tests reveal intended field resets not documented here.

## Maintenance notes

Future product fields must be automatically preserved by the chosen clone
pattern. Reviewers should reject new manual full-field constructors in mutation
workflows.
