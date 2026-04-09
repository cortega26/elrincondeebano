# SMOKE_RESULTS.md

## Phase 2 Scope
Behavior verification for current Astro storefront output (`astro-poc/dist`) against legacy behavioral baseline.

Date: 2026-02-14
Branch under verification: `chore/astro-closeout-phase-b-20260214`
Verification SHA: `2168728cf2fca8eca0446bf4716e51abc946ef5a`

## Automated checks run

| Command | Result | Evidence |
|---|---|---|
| `npm test` | ✅ PASS | Vitest + node:test pass after boundary fix (`vitest.config.mts`). |
| `npm run test:e2e:astro` | ✅ PASS | `4 passed` (`test/e2e-astro/parity-smoke.spec.ts`). |
| `npm --prefix astro-poc run build` | ✅ PASS | Build reports 141 pages + legacy flatten + sitemap generation. |
| `node --test test/post-deploy-canary.test.js` | ✅ PASS | `5/5` canary contract tests passed. |

## Direct parity probes (generated output)

Command evidence:
- `Test-Path` probe over generated artifacts/routes
- HTML metadata presence checks on generated pages

### Artifact and route availability

| Path | Status |
|---|---|
| `astro-poc/dist/404.html` | ✅ |
| `astro-poc/dist/robots.txt` | ✅ |
| `astro-poc/dist/sitemap.xml` | ✅ |
| `astro-poc/dist/service-worker.js` | ✅ |
| `astro-poc/dist/app.webmanifest` | ✅ |
| `astro-poc/dist/data/product_data.json` | ✅ |
| `astro-poc/dist/pages/bebidas.html` | ✅ |
| `astro-poc/dist/pages/vinos.html` | ✅ |
| `astro-poc/dist/pages/e.html` | ✅ |
| `astro-poc/dist/pages/offline.html` | ❌ |

### Metadata parity checks

| Page | canonical | `og:title` | `twitter:card` | Status |
|---|---|---|---|---|
| `astro-poc/dist/index.html` | ✅ | ✅ | ✅ | ✅ |
| `astro-poc/dist/pages/bebidas.html` | ✅ | ✅ | ✅ | ✅ |
| `astro-poc/dist/p/pid-1027260660/index.html` | ✅ | ✅ | ✅ | ✅ |

## Behavior checklist outcome

| Check | Result | Evidence |
|---|---|---|
| Home renders with navbar/catalog and SEO tags | ✅ | `test/e2e-astro/parity-smoke.spec.ts` |
| Legacy category URL contract `/pages/*.html` | ✅ | Playwright parity test + artifact probes |
| Active empty category page generation (`E`) | ✅ | Playwright parity test + `astro-poc/dist/pages/e.html` |
| Service worker + compatibility artifacts served | ✅ | Playwright parity test |
| Dedicated legacy offline page route | ❌ | `astro-poc/dist/pages/offline.html` missing |

## Regression outcome

### Closed mismatches
1. ✅ Legacy category URL contract.
2. ✅ Canonical + OG + Twitter metadata.
3. ✅ `robots.txt`, `sitemap.xml`, `404.html`, `service-worker.js`, `app.webmanifest`, and product data output.
4. ✅ In-place `astro-poc` reproducible build path.
5. ✅ Astro-specific browser smoke suite exists and passes.

### Remaining blocker
1. ❌ `/pages/offline.html` route not emitted in Astro output.

## Phase 2 verdict

**Near-parity achieved with one open regression (`/pages/offline.html`).**
