# ADR 0008: Catalog data authority and write-path matrix

- Date: 2026-07-15
- Status: Accepted

## Context

Four models across the repository model product identity, fields, and write
permissions differently:

| Component                                        | Language   | Identity                                           | Extra fields                                                      | Revision                                                                    |
| ------------------------------------------------ | ---------- | -------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `models.py` (Tk admin)                           | Python     | `normalize(name)::normalize(description)`          | —                                                                 | `rev` + `field_last_modified`                                               |
| `data_store.py` (Streamlit)                      | Python     | `sku` (SQL UNIQUE, name-based)                     | `brand`, `thumbnail_path`                                         | DB-level `updated_at` only                                                  |
| `productStore.js` (Node sync)                    | JavaScript | `id` > `slug` > `normalize(name)::normalize(desc)` | `brand`, `thumbnail_path`                                         | `rev` + `field_last_modified`                                               |
| `data-schemas.ts` (Astro)                        | TypeScript | `sku` > `id` > `stableHash(name-category)`         | `brand`, `thumbnail_path`, `image_variants`, `thumbnail_variants` | catalog-level `rev` only                                                    |
| `shared/schemas/product.ts` (TS Content Manager) | TypeScript | forward-compatible `id`/`sku`/`slug`               | `brand`, `thumbnail_path`, `image_variants`, `thumbnail_variants` | per-product `rev` + `field_last_modified` (with `base_rev`, `changeset_id`) |

Additionally, the Streamlit web UI exports to two destinations (`astro-poc/public/data/`
and root `data/`), and `astro-poc/src/data/products.json` / `categories.json` are
**build-synced copies**: `astro-poc/scripts/sync-data.mjs` copies the root
authoritative files into them on every build (byte-identical today), so they
are not independently written artifacts.

## Field inventory

### Product fields across all models

| Field                  | models.py |  data_store.py  | productStore.js | data-schemas.ts  |             cm product.ts              |
| ---------------------- | :-------: | :-------------: | :-------------: | :--------------: | :------------------------------------: |
| `name`                 | required  |    required     |    required     | required (min 1) |       required (min 1, max 200)        |
| `description`          | optional  |    optional     |    optional     |     optional     |                optional                |
| `price`                | required  |    optional     |    required     |     optional     |        required (positive int)         |
| `discount`             | optional  |    optional     |    optional     |     optional     |                optional                |
| `stock`                | optional  |    optional     |    optional     |     optional     |                optional                |
| `category`             | optional  |    required     |    optional     | required (min 1) |                optional                |
| `image_path`           | optional  |    optional     |    optional     |     optional     |                optional                |
| `image_avif_path`      | optional  |    optional     |    optional     |     optional     |                optional                |
| `order` / `sort_order` | optional  |    optional     |    optional     |     optional     |                optional                |
| `is_archived`          | optional  |    optional     |    optional     |     optional     |                optional                |
| `brand`                |     —     |    optional     |    optional     |     optional     |                optional                |
| `thumbnail_path`       |     —     |    optional     |    optional     |     optional     |                optional                |
| `image_variants`       |     —     |        —        |        —        |     optional     |                optional                |
| `thumbnail_variants`   |     —     |        —        |        —        |     optional     |                optional                |
| `sku`                  |     —     | required UNIQUE |    optional     |     optional     |                optional                |
| `id`                   |     —     |        —        |    optional     |     optional     |                optional                |
| `slug`                 |     —     |        —        |    optional     |        —         |                optional                |
| `rev`                  |    int    |        —        |       int       |   optional int   |              optional int              |
| `field_last_modified`  |   dict    |        —        |      dict       |        —         | dict (with `base_rev`, `changeset_id`) |

### Write-path matrix

| Write target                                             | Writer                                                              | Authority?                      |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| `data/product_data.json`                                 | `JsonProductRepository.save_products()` (Tk)                        | **authoritative**               |
| `data/product_data.json`                                 | `DataStore.export_to_json()` (Streamlit)                            | export only                     |
| `data/storefront.db`                                     | `DataStore` (Streamlit)                                             | **non-authoritative prototype** |
| `data/categories.json`                                   | `JsonCategoryRepository.save_catalog()` (Tk)                        | **authoritative (co-written)**  |
| `data/category_registry.json`                            | `JsonCategoryRepository.save_catalog()` (Tk)                        | **authoritative (co-written)**  |
| `astro-poc/src/data/storefront-bundles.json`             | `StorefrontBundleService.save_bundles()` (Tk)                       | **authoritative**               |
| `astro-poc/src/data/storefront-experience.json`          | `FeaturedStaplesService.save_staples()` (Tk)                        | **authoritative**               |
| `astro-poc/src/data/products.json`                       | `sync-data.mjs` (build copy of `data/product_data.json`)            | **build-synced copy**           |
| `astro-poc/src/data/categories.json`                     | `sync-data.mjs` (build copy of `data/category_registry.json`)       | **build-synced copy**           |
| `data/product_data.json` / `data/category_registry.json` | TS Content Manager (`admin/content-manager/` repositories + routes) | **authoritative (canonical)**   |
| `astro-poc/public/data/product_data.json`                | `DataStore.export_to_json()`                                        | **generated output**            |
| `astro-poc/public/data/storefront-bundles.json`          | `DataStore.export_to_json()`                                        | **generated output**            |
| `data/sync_queue.json`                                   | `SyncEngine._save_queue()`                                          | **runtime state**               |
| `data/product_data.backup_*`                             | `JsonProductRepository._create_backup()`                            | **auto-backup**                 |

## Decision

1. **Root `data/product_data.json` is the single authoritative product catalog.**
   All product CRUD from the Content Manager (Python Tk today, TypeScript tomorrow)
   writes here. The Streamlit prototype and its SQLite store must never write this file
   as an independent authority; their export path is retained only until retirement.

2. **Root `data/categories.json` and `data/category_registry.json` are co-written
   authoritative taxonomy sources.** The Astro build reads `data/category_registry.json`
   as primary; `data/categories.json` is a compatibility form. The Python
   `JsonCategoryRepository` writes both atomically.

3. **`astro-poc/src/data/storefront-bundles.json` and `astro-poc/src/data/storefront-experience.json`
   are authoritative storefront configuration** edited by the Content Manager and
   read by the Astro build.

4. **`astro-poc/src/data/products.json` and `astro-poc/src/data/categories.json` are
   build-synced copies**, not stale artifacts: `astro-poc/scripts/sync-data.mjs`
   regenerates them from the root authoritative files on every build
   (byte-identical today). The Astro build reads from
   `astro-poc/src/data/products.json` at `catalog.ts:109`; keeping this path is
   intentional — it is a synced read copy, and the sync step is the single
   writer.

5. **`data/storefront.db` (SQLite) is a non-authoritative prototype artifact.**
   It is owned exclusively by the Streamlit prototype and must not be read or written
   by the new TypeScript Content Manager. Its retirement is planned (Plan 049).

6. **`astro-poc/public/data/` is a generated output directory.** No component of the
   new TypeScript Content Manager may write here as an independent export destination.
   The Astro build (`astro-poc/public/data/product_data.json`) may be generated from
   the authoritative `data/` sources for backward compatibility, but this is a build
   output, not an authority.

7. **Generated files (AVIF, OG images, category artifacts, image variants) are
   produced by canonical tools invoked from the Content Manager.** The manager never
   hand-edits generated outputs.

## Consequences

### Positive

- One unambiguous authority for every catalog artifact eliminates the risk of
  competing write paths producing different results.
- The TypeScript Content Manager can target a clean, well-defined set of canonical
  files from day one.
- Stale artifacts (`src/data/products.json`, `src/data/categories.json`) are
  explicitly identified and can be removed after the Astro read-path is redirected.

### Costs

- The Streamlit prototype cannot write back to `data/product_data.json` as an
  authority; it must be retired (Plan 049) or its export path documented as
  non-authoritative.
- The Astro build currently reads from `astro-poc/src/data/products.json`, which is
  stale. A follow-up PR must redirect this import to `data/product_data.json` and
  add a Zod validation gate to prevent silent data loss.
- `astro-poc/src/data/products.json` diverged from `data/product_data.json`. The
  merge must be a deliberate data operation, not automated.

## Migration prerequisites

Before any write-capable TypeScript phase merges:

1. Astro's `catalog.ts` must import product data from `data/product_data.json`
   (or a generated copy with Zod validation), not from the stale
   `astro-poc/src/data/products.json`.
2. The stale `src/data/products.json` and `src/data/categories.json` files must be
   removed or gated as non-authoritative.
3. A contract test must prove that `data/product_data.json` round-trips through
   Python → TypeScript → Astro validation without field loss.
4. The Streamlit write paths to `data/product_data.json` must be disabled or
   explicitly marked as export-only.

## Rollback

Revert this ADR to `Proposed` and redirect the Astro import back to
`astro-poc/src/data/products.json`. No data migration is required because this
ADR names existing files as authority — it does not move them.

## Related documents

- Plan 036: Decide and prove a single catalog authority
- Plan 049: Retire dormant SQLite store
- Plan 055: Build parallel TypeScript Content Manager
- `docs/architecture/ENGINEERING_PRIORITIES.md`
- `docs/adr/0005-shared-data-assets-contract.md`
