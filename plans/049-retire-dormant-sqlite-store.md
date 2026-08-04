# Plan 049: Retire the unused competing SQLite content store

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/data_store.py admin/product_manager/__init__.py admin/product_manager/tests`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/036-decide-catalog-authority.md`
- **Category**: tech-debt
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

`data_store.py` claims to replace JSON persistence but is unused and defines a
second incompatible `Product` model. Keeping it implies an architectural
decision that production wiring never made and invites future code to choose
the wrong authority.

## Current state

- `data_store.py:1-8` claims SQLite replaces direct JSON manipulation.
- `data_store.py:78-110` defines a SKU-based product schema unrelated to
  `models.Product`.
- `content_manager.py:416-429` wires `JsonProductRepository` and
  `ProductService`; no package caller imports `DataStore`.
- `repositories.py:138-159` already provides locked, fsynced, atomic JSON writes.

## Commands

| Purpose    | Command                                                                           | Expected          |
| ---------- | --------------------------------------------------------------------------------- | ----------------- |
| References | `rg -n "DataStore                                                                 | from .*data_store | import ._data_store" admin/product_manager --glob '!data_store.py' --glob '!\**/.venv_/**'` | no runtime matches before/after |
| Tests      | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q` | pass              |
| Lint       | `admin/product_manager/.venv/bin/ruff check admin/product_manager`                | pass              |

## Scope

**In scope**: delete `admin/product_manager/data_store.py`; remove only direct
package exports/tests that exclusively support it if discovered.

**Out of scope**: adopting SQLite, migrating data, introducing SKU, or changing
the active JSON repositories. Stable identity is plan 053.

## Git workflow

- Branch: `advisor/049-retire-unused-data-store`
- Commit: `refactor(product-manager): remove unused sqlite store`

## Steps

1. Read the accepted ADR produced by plan 036. Continue only if it explicitly
   confirms that this SQLite module is neither authoritative nor a retained
   compatibility surface.
2. Run CodeGraph callers and the literal reference command. If any active caller
   exists, STOP; this plan's no-caller premise is false.
3. Delete `data_store.py` and exclusive dead tests/exports only.
4. Run import compilation, tests, and Ruff.

## Test plan

No new behavior test is expected for dead-code deletion. Run the full existing
suite, compile/import the active package, and use the reference search to prove
there is no remaining import. If an exclusive `data_store` test exists, remove
it only with the module and do not repurpose it for the active repository.

## Done criteria

- [ ] Dormant module removed with no active caller broken.
- [ ] Active JSON persistence unchanged.
- [ ] Tests and Ruff pass; README updated.

## STOP conditions

- Any active import, external entry point, or test contract depends on the module.
- Plan 036 retains SQLite as an operator cache or migration compatibility layer.
- Removal requires editing outside `admin/product_manager/`.

## Maintenance notes

Do not reintroduce a second persistence model without an approved migration
design and explicit authority decision.
