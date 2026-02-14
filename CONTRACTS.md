# CONTRACTS

Last updated: 2026-02-14

This file is the contract inventory for Astro production stability.

## URL Contracts

| Contract | Expected | Verification script/test | CI/Workflow |
| --- | --- | --- | --- |
| `/` | 200 + storefront HTML | `test/e2e-astro/parity-smoke.spec.ts` | `.github/workflows/ci.yml` |
| `/pages/*.html` | 200 legacy-compatible category routes | `test/e2e-astro/parity-smoke.spec.ts` + `astro-poc/scripts/postbuild-legacy-pages.mjs` | `.github/workflows/ci.yml` |
| `/p/:sku/` | 200 product detail route | `test/e2e-astro/parity-smoke.spec.ts` | `.github/workflows/ci.yml` |
| `/pages/offline.html` | 200 offline fallback page | `test/e2e-astro/parity-smoke.spec.ts` | `.github/workflows/ci.yml` |

## Artifact Contracts

| Artifact | Expected in build output | Verification script/test | CI/Workflow |
| --- | --- | --- | --- |
| `astro-poc/dist/robots.txt` | exists | `astro-poc/scripts/validate-artifact-contract.mjs` | `.github/workflows/product-data-guard.yml`, `.github/workflows/ci.yml` |
| `astro-poc/dist/sitemap.xml` | exists + valid route coverage | `astro-poc/scripts/postbuild-sitemap.mjs`, `test/sitemap.categories.test.js` | `.github/workflows/ci.yml`, `.github/workflows/product-data-guard.yml` |
| `astro-poc/dist/404.html` | exists | `astro-poc/scripts/validate-artifact-contract.mjs` | `.github/workflows/product-data-guard.yml`, `.github/workflows/ci.yml` |
| `astro-poc/dist/service-worker.js` | exists | `astro-poc/scripts/validate-artifact-contract.mjs` + `test/service-worker.runtime.test.js` | `.github/workflows/product-data-guard.yml`, `.github/workflows/ci.yml` |
| `astro-poc/dist/data/product_data.json` | exists + valid payload | `astro-poc/scripts/validate-artifact-contract.mjs`, `test/product-data.contract.test.js` | `.github/workflows/product-data-guard.yml`, `.github/workflows/ci.yml` |
| `astro-poc/dist/pages/offline.html` | exists | `astro-poc/scripts/validate-artifact-contract.mjs` | `.github/workflows/product-data-guard.yml`, `.github/workflows/ci.yml` |

## Asset Contract

Definition:

- Every asset referenced by:
  - `astro-poc/dist/data/product_data.json`
  - rendered Astro HTML (`src`, `href`, `poster`, `meta content` where applicable)
- must exist in:
  - `astro-poc/dist/assets/**`

Verification:

- Script: `astro-poc/scripts/validate-asset-contract.mjs`
- Commands:
  - `npm --prefix astro-poc run assets:validate`
  - `npm run certify:migration`
- CI/Workflows:
  - `.github/workflows/product-data-guard.yml`
  - `.github/workflows/ci.yml`

## Data Schema Contracts

| Data file | Required contract | Verification script/test | CI/Workflow |
| --- | --- | --- | --- |
| `data/product_data.json` | product schema + valid category mapping | `test/product-data.contract.test.js`, `test/category-registry.contract.test.js`, `tools/utils/product-contract.js` | `.github/workflows/ci.yml` |
| `data/category_registry.json` | unique keys/slugs + nav integrity | `test/category-registry.contract.test.js`, `tools/validate-category-registry.js` | `.github/workflows/ci.yml` |
| Astro synced copies | deterministic sync from source files | `astro-poc/scripts/sync-data.mjs` | `.github/workflows/product-data-guard.yml`, `.github/workflows/ci.yml` |

## Certification Entry Point

Single migration safety gate command:

```powershell
npm run certify:migration
```

This command must pass before considering a migration/cutover change safe.
