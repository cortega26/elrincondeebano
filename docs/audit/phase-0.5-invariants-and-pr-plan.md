# Phase 0.5 - Invariants and PR Plan

## System invariants (must always hold)

- Build output is deterministic from repo state + explicit env vars; no absolute or user-specific paths.
- `data/product_data.json` and `data/categories.json` are the single sources of truth for catalog, nav, and page generation.
- Build output root is `build/` (or `BUILD_OUTPUT_DIR` when set); tooling must not read from repo root as a runtime proxy.
- `build/asset-manifest.json` must list every emitted asset, and every listed asset must exist in `build/`.
- `service-worker.js` static asset list must reference only files that exist in `build/`.
- HTML must reference assets with site-relative paths that work on GitHub Pages; Cloudflare-only paths are allowed only when explicitly enabled.
- Image pipeline uses `assets/images/originals` as inputs and `assets/images/variants` as outputs; rewrite/lint must align.
- Sitemap entries must be derived from enabled categories in `data/categories.json` (no hard-coded lists).
- Service worker cache prefixes must be bumped when assets or catalog data change.
- Runtime data fetch must be same-origin in production; local dev is allowed only for localhost with explicit rules.
- Offline page content and JSON-LD must be generated or updated deterministically from repo data (no manual sample data drift).

## Prioritized fix list (P0 / P1 / P2)

### P0 (blocks determinism or produces broken assets)
- Fix image pipeline path mismatch (`assets/img` vs `assets/images`) to stop silent skips and broken variants.
- Remove OneDrive-specific `PRODUCTS_JSON` path in `tools/generate-image-variants.js`; default to repo data with env override.
- Replace hard-coded sitemap categories with `data/categories.json` driven output to eliminate taxonomy drift.

### P1 (production inconsistencies or local dev breakage)
- Remove hard-coded `/cdn-cgi/image` logo URLs and align with `cfimg` behavior; keep a toggle for Cloudflare.
- Make Lighthouse audit and local static servers use `build/` explicitly to avoid ambiguous roots.
- Allow `fetchWithRetry` to use HTTP only on localhost so local dev and CI servers work without HTTPS hacks.

### P2 (drift, hygiene, or long-tail correctness)
- Generate `static/offline.html` JSON-LD from catalog data or minimize it to avoid drift.
- Add a cache freshness check (or a documented, deterministic version bump rule) using `sw-timestamp`.
- Align structured data injection to a single source of truth (build-time or runtime) to avoid split behavior.

## Minimal PR plan (3-6 PRs)

### PR 1 - Normalize image pipeline paths

Files to touch:
- `tools/generate-images.mjs`
- `tools/rewrite-images.mjs`
- `tools/lint-images.mjs`
- `.github/workflows/images.yml`
- `README.md` (pipeline notes)

Acceptance criteria:
- Image generation reads from `assets/images/originals` and outputs to `assets/images/variants`.
- Rewrite + lint scripts use the same root paths.
- CI image workflow succeeds without path warnings or missing files.

Tests to add:
- `test/image-pipeline.paths.test.js` (node:test): assert scripts reference `assets/images/originals` and `assets/images/variants`.

### PR 2 - Remove external product data path coupling

Files to touch:
- `tools/generate-image-variants.js`
- `README.md` (document `PRODUCTS_JSON` override)

Acceptance criteria:
- Default product data path resolves to repo `data/product_data.json`.
- Optional env override is supported (`PRODUCTS_JSON=/path/to/product_data.json`).
- No OS-specific absolute paths remain in the script.

Tests to add:
- `test/generate-image-variants.config.test.js` (node:test): validate default path and env override behavior.

### PR 3 - Deterministic sitemap from categories

Files to touch:
- `tools/generate-sitemap.js`
- `data/categories.json` (no schema change; source of truth)

Acceptance criteria:
- Sitemap entries are generated from enabled categories in `data/categories.json`.
- No hard-coded slug lists remain.
- `build/sitemap.xml` includes all enabled categories and only those categories.

Tests to add:
- `test/sitemap.categories.test.js` (node:test): ensure sitemap output reflects enabled categories.

### PR 4 - Cloudflare image URL consistency

Files to touch:
- `templates/partials/navbar.ejs`
- `tools/utils/product-mapper.js` (or new helper for logo URL)
- `tools/build-index.js`
- `tools/build-pages.js`
- `tools/build-components.js`

Acceptance criteria:
- Logo URLs are built with the same rule set as product images.
- When CF image rewrite is disabled, HTML uses `/assets/images/web/logo.webp`.
- When enabled (via env), HTML uses `/cdn-cgi/image/...` consistently.

Tests to add:
- `test/logo-url.rendering.test.js` (node:test): render template and assert logo URL matches CFIMG settings.

### PR 5 - Local dev + audit determinism

Files to touch:
- `src/js/script.mjs` (adjust `fetchWithRetry` allowlist for localhost HTTP)
- `tools/lighthouse-audit.mjs`
- `scripts/dev-server.mjs`

Acceptance criteria:
- `fetchWithRetry` allows HTTP on localhost only; production stays HTTPS-only.
- Lighthouse audit always serves from `build/` (or `BUILD_OUTPUT_DIR`) and does not depend on repo root.
- Local dev servers work without HTTPS while preserving prod constraints.

Tests to add:
- Extend `test/fetchWithRetry.test.js`: allow http for localhost, reject http for non-localhost.
- `test/lighthouse.server.root.test.js` (node:test): assert server root path is `build/` when default.

