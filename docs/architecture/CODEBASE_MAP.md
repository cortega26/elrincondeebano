# Codebase Map

Reference document for automated agents, CI tools, and new contributors. Maps every top-level directory to its responsibility, documents the build data-flow, and summarises the test layer stack.

---

## Directory responsibilities

| Directory | Role | Written by | Read by |
|-----------|------|-----------|---------|
| `data/` | Source of truth for product catalog (`product_data.json`) and category tree (`categories.json`, `category_registry.json`). **Read-only input to build** (ADR-0005). | Admin tools / `npm run categories:sync` | Preflight pipeline, tests |
| `assets/images/` | Source images: `originals/` (uploaded once), `web/` (generated variants), `og/` (Open Graph images). **Read-only input to Astro build**. | Image pipeline (`npm run images:*`) | Preflight, Astro build |
| `assets/css/` | Legacy stylesheet used by dev-server preview. | Manual edits | dev-server.mjs |
| `assets/fonts/` | Web fonts fetched by `npm run fonts`. | `tools/fetch-fonts.mjs` | Astro build |
| `astro-poc/` | **Production Astro storefront** — the canonical runtime (ADR-0003). Contains `src/`, `public/`, `scripts/`, and its own `package.json`. | Storefront dev | CI/CD (static.yml) |
| `astro-poc/dist/` | Compiled static site. Git-ignored. Deployed to GitHub Pages. | `npm run build` | GitHub Pages (static.yml) |
| `src/js/` | Shared typed JS modules (cart, logger, analytics, fetch). Covered by `tsconfig.typecheck.json`. | Core dev | Astro storefront, tests |
| `test/` | All unit (Vitest), legacy integration (node:test), contract, guardrail, E2E (Playwright + Cypress) tests. | Test Sentinel | `npm test`, `npm run test:e2e` |
| `tools/` | Preflight pipeline scripts (`preflight.js`), build utilities (image gen, guardrails, canary, lighthouse). | Repo Cartographer | `npm run build`, CI |
| `scripts/` | Developer utility scripts: dev server, smoke test, Cypress runner, CSS order check. Not part of the build. | Docs Steward | Local dev, CI smoke steps |
| `admin/` | Python 3.12 GUI (`product_manager/`) for editing `data/product_data.json`. Separate runtime from Node storefront. | Product Manager | Manual use only |
| `config/` | Static config files read by build tools (e.g., `category_og_icon_map.json`). | Manual edits | tools/, preflight |
| `infra/cloudflare/` | Cloudflare Workers source for edge security headers. Deployed via `npm run cloudflare:deploy:edge-security-headers`. | Security agent | Cloudflare (manual deploy) |
| `docs/` | All architectural, operational, ADR, and onboarding documentation. | Docs Steward | Agents, contributors |
| `reports/` | Generated audit/test evidence (`lighthouse/`, `orphan-assets/`, `smoke/`, `live-contract/`, `mutation/`). Git-ignored except baselines. | CI/CD | Reviews, incident triage |
| `.github/workflows/` | GitHub Actions CI/CD pipeline definitions. | CI Guardian | GitHub Actions |

---

## Build data-flow

```
data/product_data.json     ─┐
data/categories.json        │
data/category_registry.json ├─► tools/preflight.js  (npm run preflight)
assets/images/              │         │
assets/fonts/               │         │  copies/symlinks/validates
config/                    ─┘         │  inputs into astro-poc/
                                      ▼
                               astro-poc/src/
                               astro-poc/public/
                                      │
                               astro-poc/  (npm --prefix astro-poc run build)
                                      │
                                      ▼
                               astro-poc/dist/     ← deployed to GitHub Pages
```

**Rule:** `npm run build` is the only supported build path. It always runs preflight first. Never invoke `astro build` directly (ADR-0005: preflight must not be skipped).

---

## Module dependency map (`src/js/`)

```
src/js/
├── utils/          Pure utility functions — no DOM, no side-effects, safe to import anywhere
├── modules/        Domain modules with optional DOM/browser dependencies
│   ├── cart.mjs            CartManager: add, remove, quantity, persistence (localStorage)
│   ├── logger.mjs          Structured logger with PII redaction
│   ├── fetchProducts.mjs   Product data fetch, parse, and in-memory cache
│   └── analytics.mjs       Event tracking abstraction
└── *.d.ts          Type definitions scoped by tsconfig.typecheck.json
```

Typecheck scope is declared in [tsconfig.typecheck.json](../../tsconfig.typecheck.json) (`src/js/utils/**`, `src/js/modules/**`). Typecheck for the Astro app runs separately via `npm run typecheck:astro`.

---

## Test layer map

| Layer | Runner | File pattern | Invoked by |
|-------|--------|-------------|-----------|
| Unit / spec | Vitest (jsdom) | `test/**/*.spec.{js,mjs,ts}` | `npm test` |
| Legacy integration | node:test | `test/**/*.test.js` | `npm test` |
| Contract | Vitest | `test/*.contract.test.js` | `npm test` |
| Guardrail | Vitest | `test/*.guardrail.test.js` | `npm test` |
| Build metadata | Vitest | `test/*.build-metadata.test.js` | `npm test` |
| E2E — Astro | Playwright | `test/e2e-astro/**/*.spec.ts` | `npm run test:e2e` |
| E2E — legacy | Cypress | `cypress/e2e/**/*.cy.ts` | `npm run test:cypress` |
| Mutation | Stryker | `test/cart.spec.js` et al. | `npx stryker run` |
| Visual regression | Playwright | `test/e2e/visual-regression.spec.ts` | `npm run test:e2e:visual` |

`npm test` = `node test/run-all.js && vitest run` (legacy suite first, then Vitest).

---

## CI/CD workflow map

| Workflow file | Trigger | Primary purpose |
|--------------|---------|----------------|
| `static.yml` | push `main`, manual | Build Astro + deploy to GitHub Pages |
| `ci.yml` | push/PR `main` | Lint → build → tests → guardrails → lighthouse |
| `images.yml` | push `assets/images/originals/**`, manual | Generate image variants, auto-commit |
| `semgrep.yml` | push/PR `main`, weekly cron, manual | SAST scan → SARIF → Code Scanning |
| `secret-scan.yml` | push/PR, weekly cron, manual | Credential scan on versioned files |
| `admin.yml` | changes in `admin/**` | Python pytest for admin tooling |
| `post-deploy-canary.yml` | PR `main`, post-deploy, manual | Canary contract + live probe (self-hosted) |
| `live-contract-monitor.yml` | daily cron, manual | Live site health + security headers check |
| `dependency-review.yml` | PR | Supply chain review |
| `product-data-guard.yml` | changes in `data/product_data.json` | Product data contract validation |
| `rollback.yml` | manual | Orchestrated rollback |
| `cloudflare-edge-security-headers.yml` | manual | Deploy Cloudflare Workers security headers |

**Note:** Live probes run on a **self-hosted runner** (Linux x64) to avoid Cloudflare 403 challenges on GitHub-hosted runners (ADR-0004).

---

## Key architectural constraints

These are non-negotiable rules derived from the ADRs. Violating them will break the build or production site.

| Constraint | Source | Impact of violation |
|------------|--------|-------------------|
| Never skip preflight before Astro build | ADR-0005 | Missing OG images, broken category pages |
| `data/` and `assets/` are read-only build inputs — tools must not write back | ADR-0005 | Data corruption, non-deterministic builds |
| `astro-poc/` is the canonical runtime; legacy `pages/` path is archived | ADR-0003 | Deploying wrong artifact |
| Self-hosted runner required for live-contract probes | ADR-0004 | False 403 failures in CI |
| `npm ci` mandatory in CI; `npm install` forbidden when lockfile is present | AGENTS.md | Non-deterministic dependency trees |
| `SYNC_API_REQUIRE_AUTH=true` + `SYNC_API_TOKEN` required in production Sync API | AGENTS.md | Unauthenticated write access to product data |
