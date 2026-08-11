# Plan 053: Design and migrate to stable content identities

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager/models.py admin/product_manager/services.py admin/product_manager/sync.py admin/product_manager/storefront_service.py admin/product_manager/tests`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 039, 043, 050 and the authority decision in plan 036
- **Category**: migration
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Product identity is derived from mutable name and description. Renames affect
indexes, history keys, imports, bundle references, and sync lookup. A stable ID
is the long-term foundation for safe drafts, conflict resolution, and content
relationships, but it must be introduced compatibly.

## Current state

```python
# models.py:96-104
return f"{cls.normalized_name(name)}::{cls.normalized_description(description)}"
```

`services.py` accepts original name/description for updates. `sync.py` stores a
`product_id` derived by current helper logic. Storefront bundle references use
category/name pairs. The retired `data_store.py` SKU idea is not an approved
schema and must not be revived implicitly.

## Commands

| Purpose         | Command                                                                                                                                                                              | Expected              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Migration tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_product_identity_migration.py -q`                                                                 | pass                  |
| Full tests      | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                    | pass                  |
| Lint/type       | `admin/product_manager/.venv/bin/ruff check admin/product_manager && admin/product_manager/.venv/bin/python -m mypy admin/product_manager --no-incremental --cache-dir=/tmp/pm-mypy` | exit 0 after plan 050 |

## Scope

**In scope**: a design/migration record in this plan, product model/service/sync
identity code, backward-compatible repository loading, manager-owned references,
and tests.

**Out of scope**: editing actual catalogs outside this folder, storefront schema
implementation, database adoption, or generating IDs without a migration review.

## Git workflow

- Branch: `advisor/053-stable-content-identities`
- First commit must be design/tests only; implementation follows approval.

## Steps

1. Inventory every identity consumer inside the folder and classify persisted
   vs runtime references. Define ID format, immutability, collision behavior,
   provenance, and compatibility alias.
2. Write a migration specification: deterministic backfill where possible,
   explicit collision report, old key aliasing, rollback, and dry-run output.
3. Add optional stable ID to the model and repository loader while retaining
   legacy identity lookup. New products receive IDs; old products remain readable.
4. Migrate indexes, history, sync queue/conflicts, imports, bundles/favorites,
   and UI selection maps one consumer at a time.
5. Add a read-only dry-run migration command/service returning counts and
   collisions. Do not rewrite real data automatically.
6. Only after all compatibility tests pass, make stable ID the primary key and
   retain legacy lookup for a documented deprecation window.

## Test plan

Cover deterministic backfill, duplicate names/descriptions, rename continuity,
history continuity, queued sync entries, bundle/favorite references, mixed old/new
catalogs, repeated migration, and rollback serialization.

## Done criteria

- [ ] Approved identity and migration specification exists.
- [ ] Mixed legacy/new catalogs load without data loss.
- [ ] Rename does not change stable identity.
- [ ] Dry run reports collisions without writing.
- [ ] All manager references and tests use stable identity or explicit legacy adapter.
- [ ] Tests, Ruff, and mypy pass; README updated.

## STOP conditions

- External storefront/API contracts are required to complete migration; stop at
  a design handoff and list exact required changes.
- Deterministic backfill has collisions that need owner decisions.
- Any step would rewrite real catalogs without a reviewed dry run and backup.

## Maintenance notes

Stable IDs are opaque identifiers, not slugs or display labels. Never recycle
an archived/deleted ID.
