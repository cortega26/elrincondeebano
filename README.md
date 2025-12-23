# El Rincón de Ébano – Offline-first catalog with disciplined automation

Providing a bilingual-friendly grocery catalog that ships as a static site, pre-caches critical assets, and keeps operations reproducible through scripted builds.

![Node 22.x](https://img.shields.io/badge/node-22.x-339933?logo=node.js) ![CI GitHub Actions](https://img.shields.io/badge/ci-GitHub%20Actions-2088FF?logo=githubactions) ![Tests](https://img.shields.io/badge/tests-node%3Atest%20%2B%20Playwright%20%2B%20Cypress-6A5ACD?logo=github) ![License ISC](https://img.shields.io/badge/license-ISC-blue)

## Features

- Generate static category, product, and offline pages from EJS templates plus structured JSON data (`tools/build*.js`).
- Ship an offline-first service worker with cache expiry controls and message channels for deterministic hydration fallbacks.
- Orchestrate responsive AVIF/WebP asset pipelines with Sharp and automated GitHub Actions image rewrites.
- Inject schema.org structured data, preload hints, and robots metadata as part of the deterministic build chain.
- Exercise multiple layers of verification: node:test suites, Playwright anti-flicker checks, Cypress menu regression, and stylesheet order linting.
- Maintain reproducible operations with Volta-pinned runtime, npm lockfile, and backup pruning scripts for catalog data.
- Ship an optional desktop “Content Manager” (`admin/product_manager/`) that edits `data/product_data.json` locally; remote API sync is disabled by default so changes are committed through Git.

> ```js
> // service-worker.js
> const CACHE_CONFIG = {
>   prefixes: {
>     static: 'ebano-static-v6',
>     dynamic: 'ebano-dynamic-v4',
>     products: 'ebano-products-v5',
>   },
> };
> // Versioned prefixes make cache busting explicit, avoiding stale assets after data refreshes.
> ```

## Tech Stack

- **Runtime:** Node.js 22.x (Volta + `.nvmrc` guardrails). Admin Tools run on Python 3.12.
- **Build tooling:** Custom Node scripts with esbuild, Sharp, undici, and Lighthouse.
- **Frontend:** Static HTML/CSS/Bootstrap 5, vanilla JS modules, service worker orchestration.
- **Testing:** node:test, Playwright, Cypress, CSS order lint, Lighthouse audits in CI.
- **Automation:** GitHub Actions for CI, Pages deploy, image optimization, and Codacy SARIF upload.

## Architecture at a Glance

```mermaid
flowchart TD
  Data[data/product_data.json] --> BuildScripts[Node build scripts]
  Templates[EJS templates] --> BuildScripts
  Assets[assets/, src/] --> BuildScripts
  BuildScripts --> Staging[build/ staged site snapshot]
  Staging --> ServiceWorker
  ServiceWorker --> Browser[Browser cache & offline UX]
  BuildScripts --> CI[GitHub Actions CI]
  CI --> Staging
```

## Quick Start

1. `nvm use 22` – align with the Volta/CI runtime (`>=22 <25`).
2. `npm ci` – install dependencies deterministically.
3. `npm run build` – generate a full static snapshot under `build/` (contains `dist/`, `pages/`, sitemap, etc.).
4. `npx serve build -l 4173` – preview the staged site locally (swap with your preferred static server).

_No environment variables are required for the default build. Optional flags such as `FULL_REGEN` or `LH_SKIP_BUILD` fine-tune heavy scripts and are documented inline in `tools/`._

## Pricing & Discounts

- **Currency:** prices are stored and rendered in Chilean pesos (CLP).
- **Discount semantics:** `discount` is an absolute CLP amount (not a percentage), subtracted from `price`.
- **Display rules:** when discounted, the UI shows the discounted price as primary and the original price struck through; otherwise it shows the base price only.

Example (CLP amounts, absolute discount):

```json
{
  "price": 5000,
  "discount": 1000
}
```

This yields a displayed final price of `CLP 4.000`, with the original `CLP 5.000` struck through and a derived `20%` badge.

## Availability

- **Stock flag:** set `stock: false` in `data/product_data.json` to mark a product as unavailable.
- **Visual treatment:** the card receives the `agotado` class, which applies a dark overlay
  badge labeled **"AGOTADO"** and grayscales the product image (`assets/css/style.css`,
  `assets/css/style-enhanced.css`).
- **Catalog filtering:** client-side filtering/search excludes out-of-stock items, so
  filtered views hide products with `stock: false` even though the base catalog can still
  render them.

### Product image workflow (WebP + AVIF)

- Every catalog entry still needs a traditional fallback image (`image_path`) in `assets/images/` using one of the existing extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`).
- AVIF assets are now optional but supported through a new `image_avif_path` field stored alongside products in `data/product_data.json`.
- The Node build emits `<picture>` tags and serves AVIF when browsers advertise support, while preserving the WebP/JPEG fallback for Safari/legacy clients.
- Offline Product Manager and the admin panel expose new fields so you can paste the AVIF relative path (e.g. `assets/images/bebidas/Coca.webp` + `assets/images/bebidas/Coca.avif`). The dialog also offers a helper button to copy AVIF files into the canonical assets directory.
- Keep both files committed and run `npm run build` after changes; the guard workflow simply rebuilds from source and fails if the staged output diverges.

## Quality & Tests

| Check                 | Command                    | Notes                                                         |
| --------------------- | -------------------------- | ------------------------------------------------------------- |
| Unit tests            | `npm test`                 | node:test suite passes (`# pass 7`, `# fail 0`).              |
| Admin Tool tests      | `pytest`                   | 100% coverage for Admin logic (18 tests).                     |
| CSS entrypoint order  | `npm run check:css-order`  | Guards against regressions in `<link>` ordering.              |
| Playwright regression | `npm run test:e2e`         | Validates navbar/cart flicker budgets (CI installs Chromium). |
| Cypress smoke         | `npm run test:cypress`     | Ensures navigation menu parity with production templates.     |
| Lint                  | `npx eslint .`             | Enforces repo-wide JS/TS standards.                           |
| Lighthouse audit      | `npm run lighthouse:audit` | Reuses last build via `LH_SKIP_BUILD=1` in CI.                |

_Coverage reporting is not yet instrumented — integrate `c8` and surface reports before claiming metrics._

## Performance & Accessibility

- Lighthouse script runs against both desktop and mobile profiles; results land in `reports/lighthouse/` for traceability.
- Service worker caches HTML, assets, and product data with expiry metadata to keep INP budgets in check while avoiding stale catalog listings.
- Image workflows generate AVIF/WebP plus fallbacks, reducing payloads before pages reach GitHub Pages.

## Roadmap

- Publish `LICENSE` file matching the ISC declaration for distribution clarity.
- Add `c8` coverage instrumentation and surface results in CI badges.
- Automate visual diffing from the existing Playwright suite to guard marketing-critical pages.
- Document the Python → Node data sync between `admin/` scripts and `data/product_data.json` for future contributors.
- Introduce scheduled build snapshots that archive `pages/` outputs for release notes.

## Why It Matters

- Demonstrates ownership of an offline-first UX with cache versioning and graceful degradation, reflecting production-readiness for PWA work.
- Shows ability to codify operational tasks (fonts, icons, sitemap, backups) as idempotent scripts rather than wiki steps.
- Validates quality gates across layers (unit, e2e, accessibility) similar to what I enforce in regulated delivery pipelines.
- Highlights CI discipline with pinned Node versions, npm caching, and reproducible builds for deterministic deploys.
- Emphasizes maintainability through documented scripts, Volta pinning, and automation-first image management.

## Contributing & License

Contributions via pull request are welcome — please run the CI suite (`npm run build`, `npm test`, `npm run check:css-order`, `npm run test:e2e`) before submitting. The project is licensed under ISC as declared in `package.json`; add a root `LICENSE` file before publishing externally.

## Operational Runbooks

- [Service worker + data recovery runbook](docs/operations/RUNBOOK.md) — canonical operational procedures for cache busting, incident response, and data refreshes.
- [Backup management checklist](docs/operations/BACKUP.md) — retention policies and restoration steps for catalog data snapshots.

## Contact & Portfolio

- GitHub: [Repository owner](../../..)
- Issues: [Open a new discussion](../../issues/new/choose)
- Portfolio / LinkedIn: _Add personal links here before sharing with employers._

---

_Footnote:_ capture a Lighthouse report (`npm run lighthouse:audit`) and store it under `docs/` when preparing for review sessions.
