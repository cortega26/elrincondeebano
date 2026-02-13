# Repository Structure and Conventions

## Top-level layout

- `src/`: browser runtime code (ES modules).
- `templates/`: EJS templates for landing, category pages, and partials.
- `assets/`: source static assets (images, fonts, CSS).
- `tools/`: build and generation pipeline scripts.
- `scripts/`: operator helpers (local servers, smoke runs, CI helpers).
- `test/` and `cypress/`: unit/integration/e2e suites.
- `docs/`: operational, architecture, and audit documentation.
- `admin/`: Python content manager tooling.
- `build/`: generated output (never hand-edited).

## Script ownership

### Canonical build scripts (`tools/`)

- Build pipeline: `build.js`, `build-index.js`, `build-pages.js`, `build-components.js`.
- Static and metadata: `copy-static.js`, `inject-structured-data.js`, `inject-resource-hints.js`, `generate-sitemap.js`, `verify-sw-assets.js`.
- Image pipeline: `generate-images.mjs`, `rewrite-images.mjs`, `lint-images.mjs`, `generate-image-variants.js`.
- Guardrails and checks: `preflight.js`, `check-determinism-paths.mjs`, `validate-category-registry.js`, `prune-backups.js`.

### Operator scripts (`scripts/`)

- Canonical: `dev-server.mjs`, `smoke-checklist.mjs`, `run-cypress.mjs`, `check-css-order.mjs`.
- Specialized/manual: `python_quality.ps1`, `fix_python_lint.ps1`, `sarif_to_md.py`, `image_to_webp_converter3.py`.

Manual/specialized scripts are kept for targeted maintenance tasks and should not be added to CI gates without explicit RFC/ADR.

## Naming conventions

- JavaScript/TypeScript:
  - Use `kebab-case` for files (`product-data-manager.mjs`).
  - Keep ESM runtime modules in `.mjs` when possible.
  - Keep legacy CommonJS tooling in `.js` where required by current toolchain.
- Tests:
  - Unit/integration: `test/*.test.js` or `test/*.spec.js`.
  - E2E Playwright: `test/e2e/*.spec.ts`.
  - Cypress: `cypress/e2e/*.cy.ts`.
- Documentation:
  - Prompt checkpoints: `docs/audit/prompt-<N>-<topic>-YYYYMMDD.md`.
  - ADR files: `docs/adr/NNNN-topic.md`.

## Import/path conventions

- Prefer relative imports within `src/js/` modules.
- Avoid deep cross-layer imports from runtime modules into `tools/` or `scripts/`.
- Do not import generated artifacts from `build/` in source code.
- Keep category and product data contracts rooted in `data/` only.

## Repo hygiene rules

- Do not commit temporary logs in repo root.
- Keep generated outputs and caches out of git (`build/`, `reports/`, `coverage/`, test artifacts).
- Before opening PRs, validate:
  - `npm run lint`
  - `npm test`
  - `npm run build`
