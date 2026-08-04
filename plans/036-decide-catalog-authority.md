# Plan 036: Decide and prove a single catalog authority before further migration

> **Executor instructions**: This is an ADR/contract-test plan, not authorization to migrate or delete data. Update `plans/README.md` when the decision artifact and tests are complete.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- admin/product_manager/models.py admin/product_manager/data_store.py admin/web/app.py server/productStore.js astro-poc/src/lib/data-schemas.ts docs/adr docs/architecture/CONTRACTS.md`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/034-integrate-admin-web-ci.md`
- **Category**: tech-debt
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

The Tk admin, Streamlit/SQLite admin and Node sync store model identity and fields differently, while Streamlit exposes two export destinations. Extending any one path before naming the source of truth risks lost metadata and builds from the wrong file. A decision record plus round-trip contract tests is net-positive; a direct migration is not yet authorized.

## Current state

- `admin/product_manager/models.py` models current JSON/admin products with revision metadata and fallback identity.
- `admin/product_manager/data_store.py:78-110` defines a second SKU-based Product with brand/thumbnail/sort fields.
- `admin/web/app.py:253-265` exports independently to `astro-poc/public/data/` or root `data/`.
- `server/productStore.js` owns JSON revisions/change log for sync.
- `astro-poc/src/lib/data-schemas.ts` is the shipped build-time validation boundary.
- Repository principle: `data/` and assets are source-of-truth inputs (`docs/architecture/ENGINEERING_PRIORITIES.md`).

## Commands you will need

| Purpose         | Command                                        | Expected |
| --------------- | ---------------------------------------------- | -------- |
| Data validation | `npm -w astro-poc run data:validate`           | exit 0   |
| Admin tests     | `cd admin/product_manager && python -m pytest` | pass     |
| Baseline        | `npm run typecheck && npm test`                | exit 0   |

## Scope

**In scope**: create a numbered ADR under `docs/adr/`; update ADR index/contracts; create fixture-based round-trip tests in the owning Python test directories and/or Astro schema tests. Minimal import-safe adapters are allowed only for testing.

**Out of scope**: moving canonical files, deleting either UI, production data migration, schema field removal, changing product identity, deploying Streamlit.

## Git workflow

- Branch: `advisor/036-catalog-authority-adr`
- Commit: `docs(adr): define catalog data authority`

## Steps

### Step 1: Inventory fields and write-paths

Create a checked table of every product/bundle field and identity/revision field across the four models, plus every command/UI path that writes root `data/`, SQLite, `astro-poc/public/data/` or changelog files. Mark derived outputs versus authoritative inputs.

**Verify**: every exported key from the cited serializers and Zod schemas appears in the inventory; `rg` results are recorded in ADR evidence.

### Step 2: Decide authority and compatibility boundaries

Write an ADR with context, options, decision, consequences, migration prerequisites and rollback. Recommended default unless evidence disproves it: root `data/` remains repository source of truth; SQLite is an operator working store/cache until a separately approved migration proves lossless round trips; `astro-poc/public/data/` is generated output only.

**Verify**: ADR explicitly answers product identity, revision ownership, bundle ownership, write permissions and generated-file policy.

### Step 3: Add loss-detection contract tests

Using temporary directories and representative fixtures, test JSON → chosen admin model → JSON and SQLite import/export against Astro validation. Assert identity, price/discount/stock, image fields, ordering, archive state and revision policy. Tests may normalize documented derived timestamps but must not silently drop fields.

**Verify**: focused admin tests plus Astro data validation pass; deliberately removing a required field makes the contract fail.

### Step 4: Produce a follow-up migration map

List ordered future work with stop/go gates, backups and rollback. Do not implement it in this plan.

**Verify**: baseline commands pass and only docs/tests/minimal test seams changed.

## Test plan

At least one product using every optional field, one bundle, archived/out-of-stock cases and revision metadata. All filesystem work uses `tmp_path`/OS temp.

## Done criteria

- [ ] Accepted ADR names one authority and all derived stores.
- [ ] Round-trip tests detect field/identity loss.
- [ ] No production data moved or deleted.
- [ ] Follow-up migration has explicit backup/rollback gates.

## STOP conditions

- Maintainer cannot choose authority from repository evidence.
- Round trip is already lossy in ways requiring product/business decisions.
- Tests would need real canonical data mutation.

## Maintenance notes

Future schema/admin/sync changes must update the field matrix and contract tests. No new write path should bypass the chosen authority.
