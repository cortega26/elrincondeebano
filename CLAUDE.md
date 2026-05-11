# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command                         | Purpose                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `npm run bootstrap`             | Full cold-start install (root + astro-poc)                               |
| `npm run dev`                   | Start Astro dev server (runs in astro-poc/)                              |
| `npm run build`                 | Preflight + Astro production build (output: astro-poc/dist/)             |
| `npm test`                      | Fast local tests: `node test/run-all.js && vitest run`                   |
| `npm run test:e2e`              | Playwright E2E tests (config: playwright.astro.config.ts)                |
| `npm run typecheck`             | Root JS check + `astro check`                                            |
| `npm run lint`                  | ESLint root + astro-poc                                                  |
| `npm run format`                | Prettier write                                                           |
| `npm run validate`              | Full local baseline: lint → typecheck → test → build → guardrails:assets |
| `npm run validate:release`      | Ship gate: validate + test:e2e + monitor:share-preview                   |
| `npm run guardrails`            | Orphan asset detection, secret scanning                                  |
| `npm run monitor:share-preview` | Live check for social preview unfurls                                    |
| `npm run lighthouse:audit`      | Performance audit                                                        |

## Architecture

**Monorepo** with a single production artifact: a static Astro 6 site deployed to GitHub Pages. No frontend framework (vanilla JS + Astro components).

- **`astro-poc/`** — Active production storefront. Astro 6 static site. Entry point: `astro-poc/src/scripts/storefront.js`. Modules in `astro-poc/src/scripts/storefront/`.
- **`src/`** — Legacy JS modules (being migrated into astro-poc). Still referenced by some tests.
- **`test/`** — All tests. Three tiers: Node `node:test` files (`*.test.js`, run via `test/run-all.js`), Vitest spec files (`*.spec.js`, run via `vitest run`), Playwright E2E (`test/e2e-astro/*.spec.ts`).
- **`data/`** and **`assets/`** — Shared inputs consumed by the Astro build pipeline.
- **`tools/`** — CLI tools for preflight, image processing, monitoring, guardrails.
- **`docs/`** — ADRs, architecture docs, operations runbooks, onboarding.

## Key conventions

- **Node 24.x** only (`.node-version`, `.nvmrc`, `.tool-versions` all pin it).
- **Package manager: npm**. Use `npm ci` for deterministic installs, never `npm install` in CI.
- **Bilingual** (Spanish/English) with Chilean Spanish locale for currency (`es-CL`).
- **Cart persistence**: localStorage keys prefixed `astro-poc-`. Legacy `cart` key is read-only compat alias.
- **Testing**: Node tests use `node:test`/`node:assert` (no imports needed). Vitest specs use `describe`/`it`/`expect` globals. E2E uses Playwright with TypeScript.
- **Linting**: ESLint flat config with zero-warning pre-commit hook via husky + lint-staged.
- **Formatting**: Prettier (`semi: true`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 100`).
- **Pre-commit**: `npx lint-staged` (ESLint + Prettier on staged files). Never skip with `--no-verify`.
- **Build pipeline**: Preflight (category sync → image generation → validation) → Astro build → postbuild (legacy pages, sitemap, asset contract validation).
- **Social preview** supported routes: `home`, `/<category>/`, `/p/<sku>/`. Centralized in `astro-poc/src/lib/seo.ts`.
