# Plan 051: Introduce a durable staged content-change model

> **Drift check**: `git diff --stat 8c903e3..HEAD -- admin/product_manager`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 041, 045, 047, 050
- **Category**: direction
- **Planned at**: commit `8c903e3`, 2026-07-15

## Why this matters

Today most edits write JSON immediately, media operations happen separately,
and Git dirty state is used as the publication queue. A staged change set would
give operators one reviewable unit containing field edits, media operations,
generated artifacts, validation, and publish status.

## Current state

- `services.py:441` and related mutations save immediately.
- `product_form.py` owns media operations independently from repository writes.
- `deploy.py:169-261` derives publication from Git state rather than an
  application-owned change set.
- `history_store.py` already stores before/after snapshots; reuse its audit
  vocabulary but do not make it the transaction engine.

## Commands

| Purpose    | Command                                                                                                                                                                              | Expected              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Unit tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests/test_change_sets.py -q`                                                                                | pass                  |
| Full tests | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q`                                                                                                    | pass                  |
| Lint/type  | `admin/product_manager/.venv/bin/ruff check admin/product_manager && admin/product_manager/.venv/bin/python -m mypy admin/product_manager --no-incremental --cache-dir=/tmp/pm-mypy` | exit 0 after plan 050 |

## Scope

**In scope**: design document inside this plan, new change-set domain modules,
service integration, pending-media records, review data, local persistence, and tests.

**Out of scope**: final visual workspace, remote collaborative editing, schema
ID migration, root build changes, and automatic merge resolution.

## Git workflow

- Branch: `advisor/051-staged-content-changes`
- Commits: domain model, persistence, service integration, publish integration.

## Steps

1. Specify states (`draft`, `validated`, `publishing`, `published`, `failed`,
   `discarded`), immutable operation types, ownership, timestamps, and recovery.
   Record invariants and transition table in module docs/tests.
2. Implement a typed change-set aggregate containing product/category/storefront
   mutations, media intents, generated artifacts, and validation results.
3. Persist drafts atomically under the manager data/config boundary. Reload
   after restart and detect drift against the catalog revision.
4. Adapt services to support preview/apply without duplicating business rules.
   Keep immediate-save compatibility behind one adapter until the UI migrates.
5. Feed an exact validated change set into plan 045's publication manifest.
   Publication success closes it; failure remains retryable.
6. Add discard/rollback semantics that never delete original media or published data.

## Test plan

Cover transition legality, serialization, restart, stale base revision, media
intent recovery, validation failure, publish retry, discard, and history output.
Use temporary repositories and no real Git remote.

## Done criteria

- [ ] One tested state machine owns draft-to-published lifecycle.
- [ ] Drafts survive restart and detect catalog drift.
- [ ] Publish consumes only validated change sets.
- [ ] Compatibility path preserves current behavior until plan 052.
- [ ] Tests, Ruff, and mypy pass; README updated.

## STOP conditions

- Change-set persistence requires a new external service.
- Atomic recovery cannot be defined for media operations.
- Stable IDs are mandatory for the first slice; report dependency on plan 053.

## Maintenance notes

Do not store secrets in change sets. Keep operation schemas versioned and add a
migration test for every future version.
