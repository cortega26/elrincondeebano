# Phase 2 - Build Determinism & Reproducibility Audit

Role: Build Systems Engineer / Release Integrity Specialist
Scope: build-time determinism, reproducibility across CI vs local, and elimination of hidden state, timestamps, and local-path leakage.

## P0 Constraints (from Phase 0/0.5/Phase 1)
No unresolved P0 items found. P0 fixes from Phase 0.5 (image paths, OneDrive default, sitemap categories) appear resolved in current repo state.

## 1. Determinism Matrix
| Step / Artifact | Inputs | Env Inputs | Deterministic? | Notes |
| --- | --- | --- | --- | --- |
| Preflight (`tools/preflight.js`) | `package.json`, filesystem | `CFIMG_ENABLE`, `CFIMG_DISABLE` | No | Writes `build/asset-manifest.json` with current timestamp when missing. |
| JS/CSS bundle (`tools/build.js`) | `src/js/**`, `assets/css/**` | `NODE_ENV` | No | Writes `asset-manifest.json` with `generatedAt` timestamp; sourcemaps likely include absolute paths. |
| Index render (`tools/build-index.js`) | templates + JSON data | `CFIMG_ENABLE/CFIMG_DISABLE` (via product mapper) | Yes (if env pinned) | Output deterministic given stable inputs and env. |
| Category pages (`tools/build-pages.js`) | templates + JSON data | `CFIMG_ENABLE/CFIMG_DISABLE` | Yes (if env pinned) | Same as above. |
| Partials (`tools/build-components.js`) | templates + categories | none | Yes | File order does not affect output. |
| Copy static (`tools/copy-static.js`) | `assets/`, `data/`, root files | none | Yes | Straight copy; deterministic if inputs stable. |
| Inject JSON-LD (`tools/inject-structured-data.js`) | `data/product_data.json`, pages | none | Yes (input-order dependent) | Stable as long as `product_data.json` order is stable. |
| Inject resource hints (`tools/inject-resource-hints.js`) | built HTML | none | Yes | Content stable; uses fixed logo preload path. |
| Sitemap (`tools/generate-sitemap.js`) | categories | none | No | Uses current date for `<lastmod>`. |
| SW verify (`tools/verify-sw-assets.js`) | build output + SW list | none | Yes | Deterministic verification only. |
| Image variants (`tools/generate-images.mjs`) | `assets/images/originals/**` | `SKIP_IMAGE_OPT` | Maybe | Sharp/libvips output can vary by OS/build. |
| Image variants + data update (`tools/generate-image-variants.js`) | product JSON + images | `PRODUCTS_JSON`, `FULL_REGEN`, `CLEAN_ORPHANS` | No | Version + manifest timestamp updated each run. |
| Fonts fetch (`tools/fetch-fonts.mjs`) | Google Fonts API | network | No | External network dependency; contents can change. |
| Lighthouse / snapshots | built site | `LH_SKIP_BUILD`, local Chrome | No | Timestamped filenames and environment variability. |

## 2. Non-Deterministic Sources
1) Timestamped build artifacts
- `tools/build.js` writes `asset-manifest.json` with `generatedAt: new Date().toISOString()`.
- `tools/preflight.js` seeds `asset-manifest.json` with a timestamp if missing.
- `tools/utils/manifest.js` writes `generatedAt` when appending.
- Impact: `build/asset-manifest.json` changes on every build even with identical inputs.

2) Sitemap lastmod is time-dependent
- `tools/generate-sitemap.js` sets `<lastmod>` using the current date.
- Impact: `build/sitemap.xml` changes daily regardless of inputs.

3) Sourcemaps leak absolute paths
- `tools/build.js` generates JS/CSS sourcemaps with default esbuild settings.
- Impact: sourcemaps may embed absolute filesystem paths, making builds machine-specific.

4) Image variant generator mutates data with timestamps
- `tools/generate-image-variants.js` updates `data.version` using current time and sets manifest entry `updated: Date.now()`.
- Impact: image pipeline outputs and data file differ across runs.

5) External network inputs
- `tools/fetch-fonts.mjs` downloads fonts from Google Fonts at build time.
- Impact: external changes or CDN variants alter assets.

6) Platform-sensitive image outputs
- `tools/generate-images.mjs` and `tools/generate-icons.js` use `sharp` (libvips).
- Impact: bitwise output can vary across OS/libvips versions.

7) Local path defaults in auxiliary tools
- `tools/prune-backups.js`, `scripts/image_to_webp_converter3.py`, `admin/product_manager` allow user-home paths.
- Impact: not part of build, but violates repo-wide determinism guardrails (Phase 0.5B).

## 3. Reproducibility Tests
1) Deterministic build comparison (local or CI)
- Set fixed env: `SOURCE_DATE_EPOCH`, `TZ=UTC`, `LC_ALL=C`, `CFIMG_DISABLE=1` (or `CFIMG_ENABLE=1`).
- Build twice to separate outputs:
  - `BUILD_OUTPUT_DIR=build-a npm run build`
  - `BUILD_OUTPUT_DIR=build-b npm run build`
- Compare file hashes (PowerShell example):
  - `Get-ChildItem build-a -Recurse -File | Get-FileHash | Sort-Object Path > build-a.sha`
  - `Get-ChildItem build-b -Recurse -File | Get-FileHash | Sort-Object Path > build-b.sha`
  - `Compare-Object (Get-Content build-a.sha) (Get-Content build-b.sha)` should be empty.

2) Sourcemap path scan
- Ensure `.map` files do not contain absolute paths:
  - `rg -n "C:\\|/Users/|/home/" build-a/dist/**/*.map` should return nothing.

3) Determinism guard scan (paths and env leakage)
- `rg -n "OneDrive|C:/Users|USERPROFILE|HOME|~" tools scripts admin` should be empty except allowlisted files.

4) Image pipeline determinism (if running images workflow)
- Run `npm run images:generate` twice with fixed env and compare `assets/images/variants` hashes.

## 4. CI Hardening Plan
- Pin OS images: replace `ubuntu-latest` with a fixed version (e.g., `ubuntu-22.04`) in `ci.yml` and `images.yml`.
- Standardize build time: export `SOURCE_DATE_EPOCH` from the commit timestamp (`git log -1 --format=%ct`) and set `TZ=UTC` + `LC_ALL=C.UTF-8` before `npm run build`.
- Make env inputs explicit: set `CFIMG_DISABLE=1` (or `CFIMG_ENABLE=1`) in CI to avoid silent fallbacks.
- Add a determinism scan step before build (Phase 0.5B guardrail).
- For images workflow, keep `sharp`/libvips stable by pinning OS and using the lockfile; avoid `ubuntu-latest` drift.

## 5. PR-ready Fix Plan
PR 1 - Deterministic timestamps for manifest and sitemap
- Files: `tools/build.js`, `tools/preflight.js`, `tools/utils/manifest.js`, `tools/generate-sitemap.js`.
- Changes: introduce `SOURCE_DATE_EPOCH` (or `BUILD_TIMESTAMP`) as the single time source; if missing, log a warning and use a fixed fallback (e.g., `1970-01-01T00:00:00Z`) to avoid silent nondeterminism.
- Acceptance criteria:
  - `asset-manifest.json` and `sitemap.xml` are identical across repeated builds with the same `SOURCE_DATE_EPOCH`.
  - No current-time calls remain in these files.
- Tests:
  - Node test for time helper.
  - Rebuild-to-two-dirs hash comparison in CI.

PR 2 - Normalize sourcemap paths
- Files: `tools/build.js`.
- Changes: set `absWorkingDir: rootDir` and `sourceRoot: ''` (or equivalent) so `sources` are repo-relative.
- Acceptance criteria:
  - `.map` files contain no machine-specific absolute paths.
- Tests:
  - CI grep on `build/dist/**/*.map` for OS path prefixes.

PR 3 - Determinism guardrails for local paths
- Files: new `tools/check-determinism-paths.mjs`, `package.json`, `.github/workflows/ci.yml`.
- Changes: fail CI if banned patterns (`OneDrive`, `C:/Users`, `USERPROFILE`, `HOME`, `~`) appear outside allowlist.
- Acceptance criteria:
  - CI blocks new local-path leakage.
- Tests:
  - Unit test with mocked file list (or run guard in CI).

PR 4 - Deterministic image variant metadata
- Files: `tools/generate-image-variants.js`, `README.md`.
- Changes: support `NO_VERSION_BUMP=1` and/or `VERSION_OVERRIDE`; use `SOURCE_DATE_EPOCH` for manifest `updated` when set.
- Acceptance criteria:
  - Running the script twice with fixed env produces identical `product_data.json` and `assets/images/variants/manifest.json`.
- Tests:
  - Node test for version/manifest behavior.

PR 5 - CI environment pinning
- Files: `.github/workflows/ci.yml`, `.github/workflows/images.yml`.
- Changes: pin OS, set `TZ=UTC`, `LC_ALL=C.UTF-8`, and export `SOURCE_DATE_EPOCH` before builds.
- Acceptance criteria:
  - CI builds are repeatable across runs with the same commit.
- Tests:
  - Add a CI job that compares two build outputs via hash list.
