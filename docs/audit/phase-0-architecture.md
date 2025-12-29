# Phase 0 - Context Assimilation & Architecture Capture

## 1. Architecture

### 1.1 Logical architecture diagram (build time vs runtime, data flow, major subsystems)

```mermaid
flowchart LR
  subgraph Build_Time
    Data[data/product_data.json + data/categories.json]
    Templates[templates/*.ejs + templates/partials/*.ejs]
    Assets[assets/, src/js/, static/]
    BuildTools[tools/*.js + esbuild + ejs]
    Data --> BuildTools
    Templates --> BuildTools
    Assets --> BuildTools
    BuildTools --> BuildOut[build/ (dist/, pages/, data/, admin-panel/)]
  end

  subgraph Runtime
    Host[GitHub Pages + CDN/Cloudflare]
    Browser[Browser + JS bundle]
    SW[service-worker.js]
    Cache[Cache Storage]
    ProductJson[/data/product_data.json]
    AdminPanel[admin-panel/ static app]
    Host --> Browser
    Browser --> SW
    SW --> Cache
    Browser --> ProductJson
    Host --> AdminPanel
  end

  AdminTool[admin/product_manager (Tkinter)] --> Data
  OptionalAPI[server/httpServer.js + productStore.js] <--> AdminTool
  BuildOut --> Host
```

### 1.2 Major subsystems and responsibilities

- Static site generator (Node): `tools/build*.js` build HTML pages from EJS templates + JSON data, bundle JS/CSS with esbuild, copy static assets, inject resource hints, inject JSON-LD, generate sitemap, verify service worker assets.
- Data sources: `data/product_data.json` (catalog + metadata), `data/categories.json` (nav groups + category catalog).
- Runtime web app: pre-rendered HTML plus `dist/js/script.min.js` (from `src/js/main.js` + `src/js/script.mjs`) for hydration, filtering, cart, and data fetch.
- PWA layer: `service-worker.js` caches static assets, dynamic content, and product data; `app.webmanifest` and runtime `modules/pwa.js` register the manifest.
- Admin tooling:
  - Offline desktop manager (`admin/product_manager/`) edits `data/product_data.json` with optional sync engine.
  - Static admin panel (`admin-panel/`) can fetch and export catalog JSON.
- Optional sync API: `server/httpServer.js` + `server/productStore.js` provide a PATCH/changes API for syncing admin edits if enabled.

### 1.3 Critical paths (build -> test -> deploy -> runtime)

- Build path: `npm run build` -> `build/` output -> `verify-sw-assets` -> `build/` deployed to Pages (`.github/workflows/static.yml`).
- Test path (CI): `npm ci` -> `npm run build` -> `npm test` (node:test + Vitest) -> `npm run check:css-order` -> Playwright e2e -> Lighthouse audit (`.github/workflows/ci.yml`).
- Deploy path: `build/` uploaded via `actions/upload-pages-artifact@v3` -> `actions/deploy-pages@v4`.
- Runtime path: browser fetches `/index.html` or `/pages/*.html` -> inline product payload rendered -> `script.min.js` hydrates -> `fetchProducts` hits `/data/product_data.json` -> service worker caches data/assets -> offline fallbacks via SW + inline data.
- Data update path: offline admin updates `data/product_data.json` -> rebuild -> redeploy -> SW cache invalidation via version bump (`CACHE_CONFIG.prefixes.products`).
- Image pipeline path: new files in `assets/images/originals/` -> CI images workflow (`images.yml`) runs `npm run images:*` -> rewrites HTML/CSS -> commit -> rebuild/deploy.

## 2. Build Pipeline

### 2.1 Primary build (npm run build)

`package.json` scripts define the build chain:

1) `npm run preflight` (`tools/preflight.js`)
   - Inputs: `package.json` (engines), env vars (`CFIMG_ENABLE`, `CFIMG_DISABLE`).
   - Outputs: ensures `build/asset-manifest.json` exists (placeholder), logs CF image rewrite mode.

2) `node tools/build.js`
   - Inputs: `src/js/main.js`, `src/js/script.mjs` (imported), `assets/css/style.css`, `assets/css/critical.css`, fonts referenced by CSS.
   - Processing: esbuild bundles ESM JS + CSS, minifies, outputs sourcemaps, generates chunk files.
   - Outputs: `build/dist/js/script.min.js`, `build/dist/js/chunks/*`, `build/dist/css/style.min.css`, `build/dist/css/critical.min.css`, `build/asset-manifest.json` (list of output files).

3) `node tools/build-index.js`
   - Inputs: `templates/index.ejs`, `data/product_data.json`, `data/categories.json`, `build/asset-manifest.json`.
   - Processing: reads product data, sorts/enriches, filters `stock === true`, selects first 12 for initial render, builds inline JSON payload, renders template, preloads fonts from manifest.
   - Outputs: `build/index.html`, updates `build/asset-manifest.json` with `/index.html`.

4) `node tools/build-pages.js`
   - Inputs: `templates/category.ejs`, `data/product_data.json`, `data/categories.json`, `build/asset-manifest.json`.
   - Processing: builds category pages for enabled categories, filters products by `category` vs `product_key`, renders full category product lists, builds inline payloads.
   - Outputs: `build/pages/<slug>.html`, updates `build/asset-manifest.json` with page paths.

5) `node tools/build-components.js`
   - Inputs: `templates/partials/*.ejs`, `data/categories.json`.
   - Processing: renders partials with `navGroups` into standalone pages.
   - Outputs: `build/pages/navbar.html`, `build/pages/footer.html` (used for component regression checks).

6) `node tools/copy-static.js`
   - Inputs: `assets/`, `data/`, `admin-panel/`, `404.html`, `app.webmanifest`, `robots.txt`, `service-worker.js`, `static/offline.html`.
   - Outputs: copies to `build/`:
     - `build/assets/**`, `build/data/**`, `build/admin-panel/**`.
     - `build/404.html`, `build/app.webmanifest`, `build/robots.txt`, `build/service-worker.js`.
     - `build/pages/offline.html` (offline fallback page).

7) `node tools/inject-structured-data.js`
   - Inputs: `data/product_data.json`, `build/pages/*.html`.
   - Processing: injects JSON-LD with full product list into each category page (skips index).
   - Outputs: modified `build/pages/*.html` (adds `<script type="application/ld+json">`).

8) `node tools/inject-resource-hints.js`
   - Inputs: `build/index.html`, `build/pages/*.html`.
   - Processing: inserts DNS prefetch + preload hints if missing, removes GTM prefetch.
   - Outputs: modified HTML files with resource hints.

9) `node tools/generate-sitemap.js`
   - Inputs: hard-coded category list in `tools/generate-sitemap.js`.
   - Outputs: `build/sitemap.xml` (static category URLs).

10) `node tools/verify-sw-assets.js`
    - Inputs: `service-worker.js` (staticAssets list), `build/asset-manifest.json`, `build/**`.
    - Processing: validates that all SW static assets and manifest files exist in `build/`.
    - Outputs: build failure on missing assets.

### 2.2 Supporting build scripts (on-demand)

- `npm run fonts` -> `tools/fetch-fonts.mjs` downloads Google Fonts into `assets/fonts/`.
- `npm run icons` -> `tools/generate-icons.js` generates PWA icons from `assets/images/web/logo.webp`.
- `npm run images:generate` -> `tools/generate-images.mjs` generates `assets/img/variants/*` from `assets/img/originals/*` (note: path mismatch vs `assets/images/`).
- `npm run images:rewrite` -> `tools/rewrite-images.mjs` rewrites HTML/CSS to `assets/images/variants` and adds `<picture>`/preload tags.
- `npm run lint:images` -> `tools/lint-images.mjs` validates that rewritten HTML/CSS does not reference originals and includes width/height.
- `npm run prune:backups` -> `tools/prune-backups.js` (data backup maintenance).
- `npm run lighthouse:audit` -> `tools/lighthouse-audit.mjs` runs Lighthouse against a local static server and stores reports under `reports/lighthouse/`.
- `npm run snapshot` -> `tools/snapshot-site.mjs` captures Playwright screenshots into `reports/snapshots/`.

### 2.3 Build inputs and outputs summary

| Step | Inputs | Outputs |
| --- | --- | --- |
| Preflight | `package.json`, env vars | `build/asset-manifest.json` placeholder (if missing) |
| JS/CSS build | `src/js/**`, `assets/css/**` | `build/dist/js/**`, `build/dist/css/**`, `build/asset-manifest.json` |
| Index render | `templates/index.ejs`, `data/product_data.json`, `data/categories.json`, manifest | `build/index.html`, manifest update |
| Category render | `templates/category.ejs`, `data/product_data.json`, `data/categories.json` | `build/pages/*.html`, manifest update |
| Partials render | `templates/partials/*.ejs`, `data/categories.json` | `build/pages/navbar.html`, `build/pages/footer.html` |
| Static copy | `assets/`, `data/`, `admin-panel/`, root files | `build/assets/**`, `build/data/**`, `build/admin-panel/**`, `build/404.html`, `build/app.webmanifest`, `build/robots.txt`, `build/service-worker.js`, `build/pages/offline.html` |
| Structured data inject | `data/product_data.json`, `build/pages/*.html` | Modified pages with JSON-LD |
| Resource hints inject | `build/index.html`, `build/pages/*.html` | Modified HTML with preloads/prefetch |
| Sitemap | Hard-coded list | `build/sitemap.xml` |
| SW verify | `service-worker.js`, manifest, `build/**` | Build failure if assets missing |

## 3. Runtime Pipeline

### 3.1 Page load lifecycle

1) Browser requests static HTML (`/index.html` or `/pages/<slug>.html`).
   - HTML is pre-rendered with a subset (index) or full category list (category pages).
   - Inline product payload is injected as JSON (`<script id="product-data" type="application/json">`).
   - CSS includes critical CSS (`/dist/css/critical.min.css`), Bootstrap via CDN, and main CSS.

2) `dist/js/csp.js` (async) injects Content Security Policy metadata, sets `window.__CSP_NONCE__`, and runs a minimal enhancements initializer on DOMContentLoaded.

3) `dist/js/script.min.js` (ES module bundle):
   - Entry `src/js/main.js` initializes enhancements (a11y/perf/SEO/PWA) and imports `src/js/script.mjs` (core app).
   - Optional analytics is dynamically imported if `window.__ANALYTICS_ENABLE__ === true`.

4) `script.mjs` (core app) on DOMContentLoaded:
   - Registers service worker (with guards for localhost and kill-switch flags).
   - Hydrates pre-rendered products and wires UI interactions (filters, sort, discount toggle, cart, lazy loading).
   - Starts `fetchProducts()` to refresh catalog data from `/data/product_data.json`.
   - Updates offline indicator and listens for online/offline events.

### 3.2 Data fetch behavior

- Inline bootstrap:
  - The build embeds initial products + metadata into `#product-data`.
  - `fetchProducts()` reads this payload first, stores it in a global shared cache, and sets `localStorage.productDataVersion` when available.

- Network fetch:
  - URL: `/data/product_data.json` (appends `?v=<version>` when a version is stored).
  - `fetchWithRetry()` retries up to 2 times with backoff and logs attempts with a correlation ID.
  - Hard constraint: same-origin HTTPS only (`fetchWithRetry` rejects non-HTTPS or cross-origin URLs).

- Fallback behavior (in order):
  1) Use cached product data from the service worker (if available) via the normal fetch call.
  2) If fetch fails, but inline data exists -> show the inline subset and mark it as partial.
  3) If no data -> show error UI with a "Intentar nuevamente" button that calls `initApp()`.

- Metadata/version handling:
  - `localStorage.productDataVersion` is used for cache-busting and SW invalidation checks.
  - When a version mismatch is detected, `INVALIDATE_PRODUCT_CACHE` is sent to the SW.

### 3.3 Service worker registration, cache strategies, offline fallbacks

- Registration logic (`src/js/script.mjs`):
  - Guarded by `localStorage.ebano-sw-disabled=true` (kill-switch).
  - Disabled on localhost unless `localStorage.ebano-sw-enable-local=true` or `?sw=on`.
  - Registers `/service-worker.js` on window load, sets update checks every 5 minutes.

- Cache configuration (`service-worker.js`):
  - Static cache: `ebano-static-v6` (CSS/JS/HTML/icons/offline page).
  - Dynamic cache: `ebano-dynamic-v4` (runtime requests not in static list).
  - Products cache: `ebano-products-v5` (`/data/product_data.json`).
  - Duration metadata is stored in `sw-timestamp` headers but freshness is not actively enforced in fetch logic.

- Install:
  - Precache `CACHE_CONFIG.staticAssets`.
  - Fetch and cache all entries from `/asset-manifest.json`.

- Fetch:
  - Navigation requests: network-first; fallback to cached request, then `/index.html`, then `/pages/offline.html`.
  - Same-origin asset requests: network-first with cache update, fallback to cache; if image -> placeholder (`/assets/images/web/placeholder.svg`) if cache/network fails.
  - Bypass: `/service-worker.js` and `/cdn-cgi/image/`.

- Messages:
  - `SKIP_WAITING` -> activate new SW immediately.
  - `INVALIDATE_PRODUCT_CACHE` -> clears product cache.
  - `INVALIDATE_ALL_CACHES` -> clears all known caches.

## 4. Tooling Inventory

### 4.1 Build tools

- Node.js 22.x (Volta, `.nvmrc`, `.tool-versions`), esbuild, ejs, sharp, undici.
- Custom build scripts in `tools/` (build, sitemap, resource hints, structured data, preflight, verify SW assets).

### 4.2 Image pipeline

- `tools/generate-images.mjs`: generates AVIF/WebP/PNG/JPG variants (expects `assets/img/originals` -> `assets/img/variants`).
- `tools/rewrite-images.mjs`: rewrites HTML/CSS to reference `/assets/images/variants` and injects `<picture>`.
- `tools/lint-images.mjs`: verifies HTML/CSS references and width/height attributes.
- `tools/generate-image-variants.js`: generates responsive variants in `assets/images/variants/` and updates `product_data.json` (expects OneDrive path in `PRODUCTS_JSON`).
- `tools/generate-icons.js`: generates PWA icons from `assets/images/web/logo.webp`.
- `scripts/image_to_webp_converter3.py`: legacy helper for image conversion.

### 4.3 Tests & quality gates

- Unit tests (node:test): `test/run-all.js` runs `test/*.test.js` and a few `.test.mjs` with `--experimental-strip-types`.
- Vitest: `test/*.spec.js` (jsdom environment), configured in `vitest.config.mts`.
- Playwright: `test/e2e/*.spec.ts` with local static server (`scripts/dev-server.mjs build`).
- Cypress: `cypress/e2e/*.cy.ts` (smoke/regression).
- CSS order guard: `npm run check:css-order` checks `<link>` ordering in built HTML.
- Mutation testing: `npx stryker run` (configured via `stryker.conf.mjs`).
- Lint + format: `npx eslint .` and `npm run format` (Prettier).
- Lighthouse audits: `npm run lighthouse:audit` -> `reports/lighthouse/`.

### 4.4 CI/CD workflows

- `ci.yml` (Continuous Integration): `npm ci` -> build -> tests -> CSS order -> Playwright -> Lighthouse.
- `static.yml` (GitHub Pages): `npm ci` -> build -> upload `build/` -> deploy pages.
- `images.yml` (Optimize images): `npm ci` -> images generate/rewrite/lint -> auto-commit.
- `codacy.yml` (Security scan): Codacy CLI -> split/sanitize SARIF -> upload to Code Scanning.
- `admin.yml` (Admin Tools CI): Python 3.12 + pytest for `admin/product_manager`.

## 5. Couplings, Surprises & Hidden Assumptions

- `tools/generate-images.mjs` expects `assets/img/originals`, but repository assets live under `assets/images/originals` (path mismatch).
- `tools/generate-image-variants.js` reads `product_data.json` from a OneDrive path (`~/OneDrive/Tienda Ebano/data/product_data.json`), not the repo copy.
- `tools/generate-sitemap.js` hard-codes category slugs; it does not read `data/categories.json`, so taxonomy drift is likely.
- `templates/partials/navbar.ejs` references `/cdn-cgi/image/.../logo.webp` directly, assuming Cloudflare image resizing is available.
- `src/js/utils/cfimg.mjs` defaults to disabling Cloudflare image rewriting unless explicitly enabled; combined with the navbar hard-coded `/cdn-cgi/` URL, this creates inconsistent image behavior between product images and the logo.
- `src/js/script.mjs` enforces HTTPS-only, same-origin fetches in `fetchWithRetry`; local HTTP dev servers will fail unless served over HTTPS.
- `tools/lighthouse-audit.mjs` serves files from repo root, not `build/`; it assumes a build output exists at the root or `BUILD_OUTPUT_DIR` is set to `.`.
- `tools/inject-structured-data.js` injects JSON-LD into `build/pages/*.html` only; index structured data relies on runtime JS (`modules/seo.js`) and is limited to 20 products.
- Service worker uses cache duration metadata (`sw-timestamp`) but does not enforce freshness in fetch handlers; stale entries can persist until cache version bump.
- `CACHE_CONFIG.staticAssets` + `asset-manifest.json` must stay aligned; `verify-sw-assets` will fail builds if either list references missing files.
- Build outputs are hard-coded to `build/` unless `BUILD_OUTPUT_DIR` is set; `prepareOutputRoot()` deletes that directory recursively.
- Category pages rely on `data/categories.json` and `product_data.json` category values matching `product_key` (case-insensitive). Mismatches yield empty category pages.
- `data/product_data.json` is copied into `build/data/` and deployed, making the full catalog public by design.
- Admin panel (`admin-panel/`) is deployed publicly and has no auth; it can fetch live catalog data from production.
- Service worker registration is disabled on localhost by default; local testing requires explicit opt-in flags.
- `assets/images/variants/` and the rewrite pipeline expect HTML/CSS to reference `/assets/images/originals/` first; if templates bypass originals (e.g., hard-coded `/cdn-cgi/image`), the rewrite/lint steps may miss them.
- `app.webmanifest` and icon paths assume `assets/images/web/icon-*.png` exist (generated by `tools/generate-icons.js`).
- The offline page (`static/offline.html`) embeds hard-coded product JSON-LD and sample product data, which will drift unless manually updated.

