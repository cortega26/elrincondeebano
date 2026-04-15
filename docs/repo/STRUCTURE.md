# Repository Structure and Conventions

## Dual-root layout

This repo has **two `package.json` roots**. A full cold-start install requires both:

```bash
npm ci                   # root tooling, tests, guardrails
(cd astro-poc && npm ci) # Astro storefront dependencies
```

Or use the single `bootstrap` script:

```bash
npm run bootstrap
```

The canonical production build is always `npm run build` from the repo root — it runs the shared preflight pipeline and then delegates to `astro-poc/`.

## Directory reference

| Directory | Role |
|-----------|------|
| `astro-poc/` | **Active production storefront.** Astro app; `npm run build` outputs to `astro-poc/dist/`. |
| `src/js/` | Legacy root JS modules type-checked via `tsconfig.typecheck.json`. Not shipped directly. |
| `data/` | Shared build inputs: `product_data.json`, `categories.json`, `category_registry.json`. Read by preflight and the Astro build. |
| `assets/` | Source images, fonts, CSS. Processed by preflight image pipelines before the Astro build consumes them. |
| `tools/` | Build-time and CI scripts (image generation, guardrails, preflight, live-contract monitors). Not shipped to the browser. |
| `scripts/` | Operator helpers: local dev server, smoke checklist, CI utilities. |
| `test/` | Unit tests (`*.test.js` via node:test), Vitest specs (`*.spec.{js,ts}`), and Playwright E2E (`test/e2e-astro/`). |
| `static/` | Static files copied verbatim into `astro-poc/dist/` by the build. |
| `config/` | Shared config inputs consumed by tooling (e.g., `category_og_icon_map.json`). |
| `infra/` | Cloudflare Workers config (`wrangler.toml`) for edge security headers. Not part of the static build. |
| `admin/` | Python-based desktop product manager. Separate venv; CI via `admin.yml`. |
| `reports/` | Committed report artifacts (Lighthouse, canary, orphan-assets, smoke evidence). |
| `build/` | Legacy asset manifest artifact. Not used by the Astro build path. |
| `output/` | Playwright trace/report output. Not committed. |
| `coverage/` | Test coverage output. Not committed. |
| `_archive/` | Dead code preserved for reference only. Never imported or built. |
| `_products/` | Raw product data backups. Not part of any build or test. |

## Data flow

```
data/product_data.json ──┐
data/categories.json ────┤
assets/images/originals ─┤──► npm run preflight ──► astro-poc/src/ ──► npm run build ──► astro-poc/dist/
config/ ─────────────────┘                                                                      │
                                                                                                └──► GitHub Pages deploy
```

**Critical:** agents must not skip the preflight step. Changes to `data/` or `assets/` are only reflected in `astro-poc/dist/` after a full `npm run build`.

## Key agent entry points

- **Storefront source:** `astro-poc/src/`
- **Product/category data:** `data/product_data.json` + `admin/`
- **Build pipeline:** `tools/` + root `package.json` scripts
- **Tests:** `test/` + `npm test` + `npm run test:e2e`
- **Edge config (headers/CSP):** `infra/cloudflare/` — not the Astro source

## Top-level layout (legacy detail)

- `src/`: browser runtime code (ES modules).
- `assets/`: source static assets (images, fonts, CSS).
- `tools/`: build and generation pipeline scripts.
- `scripts/`: operator helpers (local servers, smoke runs, CI helpers).
- `test/` and `cypress/`: unit/integration/e2e suites.
- `docs/`: operational, architecture, and audit documentation.
- `admin/`: Python content manager tooling.
- `astro-poc/`: active Astro storefront source and generated deploy output in `astro-poc/dist/`.
- `_archive/legacy-storefront/`: retired EJS templates, builders, and tests kept only as historical reference.

## Script ownership

### Canonical build scripts (`tools/`)

- Image pipeline: `generate-images.mjs`, `rewrite-images.mjs`, `lint-images.mjs`, `generate-image-variants.js`.
- Guardrails and checks: `preflight.js`, `check-determinism-paths.mjs`, `validate-category-registry.js`, `prune-backups.js`.

### Operator scripts (`scripts/`)

- Canonical: `dev-server.mjs`, `smoke-checklist.mjs`, `check-css-order.mjs`.
- Specialized/manual: `run-cypress.mjs`, `python_quality.ps1`, `fix_python_lint.ps1`, `sarif_to_md.py`, `image_to_webp_converter3.py`.

Manual/specialized scripts are kept for targeted maintenance tasks and should not be added to CI gates without explicit RFC/ADR.

## Naming conventions

- JavaScript/TypeScript:
  - Use `kebab-case` for files (`product-data-manager.mjs`).
  - Keep ESM runtime modules in `.mjs` when possible.
  - Keep legacy CommonJS tooling in `.js` where required by current toolchain.
- Tests:
  - Unit/integration: `test/*.test.js` or `test/*.spec.js`.
  - E2E Playwright (active): `test/e2e-astro/*.spec.ts`.
  - Supplemental/manual Playwright: `test/e2e/*.spec.ts`.
  - Supplemental/manual Cypress: `cypress/e2e/*.cy.ts`.
  - Archived legacy storefront checks live under `_archive/legacy-storefront/tests/` and are outside the active assurance path.
- Documentation:
  - Prompt checkpoints: `docs/audit/prompt-<N>-<topic>-YYYYMMDD.md`.
  - ADR files: `docs/adr/NNNN-topic.md`.

## Import/path conventions

- Prefer relative imports within `src/js/` modules.
- Avoid deep cross-layer imports from runtime modules into `tools/` or `scripts/`.
- Do not import generated artifacts from `astro-poc/dist/` in source code.
- Keep category and product data contracts rooted in `data/` only.

## Repo hygiene rules

- Do not commit temporary logs in repo root.
- Keep generated outputs and caches out of git (`astro-poc/dist/`, `reports/`, `coverage/`, test artifacts).
- Before opening PRs, validate:
  - `npm run lint`
  - `npm test`
  - `npm run build`
