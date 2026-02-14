# CONTENT_MANAGER_COMPAT.md

## Phase 3 Goal
Verify that the offline Content Manager (CM) continues to work without CM migration when storefront rendering moves to Astro.

## Contract Summary (CM -> Storefront)

| Contract item | Legacy expectation | Astro implementation status | Evidence |
|---|---|---|---|
| Product source file | `data/product_data.json` | ✅ | `astro-poc/scripts/sync-data.mjs` copies to `src/data/products.json` and `public/data/product_data.json`. |
| Category source file | `data/category_registry.json` | ✅ | `astro-poc/scripts/sync-data.mjs` copies to `src/data/categories.json`. |
| Legacy category URL shape | `/pages/<slug>.html` | ✅ | `astro-poc/src/pages/pages/[slug].html.astro` + postbuild flattening in `astro-poc/scripts/postbuild-legacy-pages.mjs`. |
| Active empty category rendering | Category exists even with 0 products | ✅ | `getActiveCategories()` + route generation in `astro-poc/src/lib/catalog.ts`; `astro-poc/dist/pages/e.html` exists. |
| Key/slug identity stability | CM key + slug contract preserved | ✅ | `resolveCategoryParamToKey`, `getCategoryRouteParams`, `getLegacyCategoryPath` in `astro-poc/src/lib/catalog.ts`. |
| Image contract (`image_path`) | Required | ✅ | Used in card/detail rendering. |
| AVIF optional contract (`image_avif_path`) | Optional fallback chain | ✅ | `astro-poc/src/components/ProductCard.astro`, `astro-poc/src/components/ProductDetail.astro`. |
| Ingestion validation | Prevent malformed payload drift | ✅ | `validateProductsPayload`, `validateCategoryPayload`, `validateProductCategoryMapping` in `astro-poc/scripts/sync-data.mjs`. |

## CM Remains Unchanged

- CM default data outputs remain rooted at repo `data/` files.
- No CM schema migration or UI migration required.
- Astro adapts to CM output format.

Primary CM-side evidence:
- `admin/product_manager/content_manager.py`
- `admin/product_manager/category_repository.py`
- `tools/utils/product-contract.js`
- `tools/utils/category-registry.js`

## Runtime Validation Evidence

1. Build + sync path:
- `npm --prefix astro-poc run build` -> PASS (sync + Astro build + legacy page flatten + sitemap generation).

2. Route coverage from CM categories:
- `active_categories=18`
- `legacy_category_pages=18` in `astro-poc/dist/pages/*.html` (excluding offline placeholder route).

3. Astro E2E parity:
- `npm run test:e2e:astro` -> PASS (includes legacy `/pages/*.html` and active empty category checks).

4. Data/public contract availability:
- `astro-poc/dist/data/product_data.json` -> `True`.

## Edge Cases

| Edge case | Status | Notes |
|---|---|---|
| Missing product required fields | ✅ | Validated at sync; build fails fast on malformed payload. |
| Unknown product category key | ✅ | Explicit mapping validation in sync step. |
| Path traversal in image fields | ✅ | Explicit guard in sync validation. |
| Missing image file on disk | ⚠️ | Data contract can still pass while image asset may be missing physically; keep asset guardrail in CI. |
| Non-ASCII labels/slugs | ✅ | Current registry and routes resolve correctly with slug mapping. |

## Compatibility Verdict

## ✅ Works as-is (with built-in Astro adapter)

- CM does not need migration.
- Astro now preserves CM output contracts through adapter logic and validation.

## Remaining recommendation

- Keep running product/category contract tests and asset guardrails in CI to prevent future drift.
