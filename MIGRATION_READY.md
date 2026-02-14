# MIGRATION_READY.md

Date: 2026-02-14
PR Evidence: https://github.com/cortega26/elrincondeebano/pull/216
Verification SHA: `2168728cf2fca8eca0446bf4716e51abc946ef5a`

## 5.1 GO / NO-GO

**Decision: NO-GO (near-ready)**

**Risk Rating: High**

### Top 5 reasons (with evidence)
1. ✅ Legacy route + SEO + artifact parity is now implemented.
- Evidence:
  - `npm --prefix astro-poc run build` passes and emits:
    - legacy routes (`/pages/*.html`)
    - `/404.html`, `/robots.txt`, `/sitemap.xml`, `/service-worker.js`, `/data/product_data.json`
  - `test:e2e:astro` passes: 4/4 (`npm run test:e2e:astro`)
  - SEO tags present in generated HTML (`rel="canonical"`, `og:title`, `twitter:card`) for:
    - `astro-poc/dist/index.html`
    - `astro-poc/dist/pages/bebidas.html`
    - `astro-poc/dist/p/pid-1027260660/index.html`

2. ✅ Hosted CI continuity is proven on PR for the required workflows.
- Evidence:
  - `Continuous Integration`: https://github.com/cortega26/elrincondeebano/actions/runs/22019902823
  - `Verify catalog build artifacts`: https://github.com/cortega26/elrincondeebano/actions/runs/22019902849
  - `Post-Deploy Canary` (PR contract path): https://github.com/cortega26/elrincondeebano/actions/runs/22019902830
  - `Deploy static content to Pages` (workflow_dispatch verification path): https://github.com/cortega26/elrincondeebano/actions/runs/22019931534

3. ✅ Content Manager compatibility is preserved without CM migration.
- Evidence:
  - Astro adapter + validation in `astro-poc/scripts/sync-data.mjs`
  - slug/key route adapter in `astro-poc/src/lib/catalog.ts`
  - active empty category route (`E`) generated and available (`astro-poc/dist/pages/e.html`)
  - AVIF fallback support in:
    - `astro-poc/src/components/ProductCard.astro`
    - `astro-poc/src/components/ProductDetail.astro`

4. ❌ One user-facing regression remains: offline route contract.
- Evidence:
  - `astro-poc/dist/pages/offline.html` is missing (`Test-Path ... = False`)
  - service worker still references `/pages/offline.html`:
    - `astro-poc/public/service-worker.js:32`
    - `astro-poc/public/service-worker.js:299`

5. ⚠️ Live post-deploy synthetic probe against production origin is environment-sensitive.
- Evidence:
  - prior canary run against `https://elrincondeebano.com` failed with `403` from GitHub runner network path.
  - PR path now validates canary contract tests successfully, but true live probe is still executed only on deploy path (`workflow_run`/manual dispatch).

## 5.2 Blockers (NO-GO)

| Blocker | What fails | Where | Exact fix | How to verify fix |
|---|---|---|---|---|
| B1 | Offline route contract regression | `astro-poc/dist/pages/offline.html` missing; SW expects `/pages/offline.html` | Add offline page to Astro public output (e.g., copy `static/offline.html` to `astro-poc/public/pages/offline.html` during sync/build). | 1) `Test-Path astro-poc/dist/pages/offline.html` = `True`; 2) offline smoke confirms fallback path resolves; 3) `npm run test:e2e:astro` remains green. |

## 5.3 Migration steps (when GO is achieved)

1. Fix B1 (`/pages/offline.html`) and re-run:
- `npm test`
- `npm run test:e2e:astro`
- `npm --prefix astro-poc run build`

2. Open/refresh PR and confirm hosted green:
- `ci.yml`
- `product-data-guard.yml`
- `post-deploy-canary.yml`
- `static.yml` verification path on non-main

3. Merge and execute staged cutover:
- let `static.yml` deploy on `main` via `workflow_run` of CI
- run live post-deploy canary (`workflow_run` / manual dispatch) against production URL

4. Rollback plan:
- use `post-deploy-canary.yml` rollback inputs (`rollback_on_failure=true`, `rollback_ref`, `confirm_rollback=ROLLBACK`)
- verify homepage/category/canary immediately after rollback

5. Post-cutover monitoring checklist:
- 404 rates (especially `/pages/*.html`)
- canary status + OG/data/SW checks
- broken images/assets
- LCP/CLS/INP and runtime JS errors
