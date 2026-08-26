# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Vigencia (plan 112, 2026-08-12): este archivo se re-sincronizó con
> `AGENTS.md` (que es la fuente canónica). Si un comando no existe en
> `package.json`, AGENTS.md manda.

## Commands

| Command                         | Purpose                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run bootstrap`             | Full cold-start install (root + astro-poc)                                                                   |
| `npm run dev`                   | Start Astro dev server (runs in astro-poc/); el admin es `npm run admin:dev`                                 |
| `npm run build`                 | Preflight + Astro production build (output: astro-poc/dist/); usa `npm run build:fast` para iterar           |
| `npm test`                      | `vitest run` (root) + `npm run admin:test` (Content Manager)                                                 |
| `npm run test:e2e`              | Playwright E2E storefront (config: playwright.astro.config.ts; hace build completo primero)                  |
| `npm run typecheck`             | Cobertura total: legacy + astro (`astro check`) + `admin:typecheck`                                          |
| `npm run lint`                  | ESLint root + astro-poc; el admin se lint-ea en pre-commit y CI (`admin.yml`)                                |
| `npm run format`                | Prettier write                                                                                               |
| `npm run validate`              | Full local baseline: lint → typecheck → check:e2e-selectors → build → test → check:plans → guardrails:assets |
| `npm run validate:release`      | Ship gate: e2e + live share-preview probe (audits run separately in `security-audit.yml`)                    |
| `npm run admin:certify`         | Gate del cutover del Content Manager (certification report)                                                  |
| `npm run guardrails`            | Orphan asset detection, secret scanning                                                                      |
| `npm run monitor:share-preview` | Live check for social preview unfurls                                                                        |
| `npm run lighthouse:audit`      | Performance audit                                                                                            |

## Architecture

**Monorepo** (npm workspaces) con dos artefactos: el storefront estático Astro 7 (producción, GitHub Pages + Cloudflare edge) y el Content Manager TypeScript (admin canónico).

- **`astro-poc/`** — Storefront de producción. Astro 7 static site, vanilla JS (sin framework de UI). Entry point: `astro-poc/src/scripts/storefront.js`. Módulos en `astro-poc/src/scripts/storefront/`.
- **`admin/content-manager/`** — Content Manager canónico (TypeScript: Fastify + React + Vite). Todo se maneja con `npm run admin:*` (dev, build, test, certify, doctor).
- **`src/`** — Legacy JS modules (being migrated into astro-poc). Still referenced by some tests.
- **`test/`** — Vitest specs root (`*.spec.js`/`*.test.*`, run via `vitest run`), Playwright E2E storefront (`test/e2e-astro/*.spec.ts`). El admin tiene su propia suite en `admin/content-manager/test/`.
- **`data/`** y **`assets/`** — Catálogo autoritativo (ADR 0009); el admin escribe en el repo, el storefront lo consume en build.
- **`tools/`** — CLI tools for preflight, image processing, monitoring, guardrails.
- **`docs/`** — ADRs, architecture docs, operations runbooks, onboarding.
- **`plans/`** — Planes de implementación activos (índice: `plans/README.md`).

## Key conventions

- **Node 24.x** only (`.node-version`, `.nvmrc`, `.tool-versions`, `engines` all pin it).
- **Package manager: npm**. Use `npm ci` for deterministic installs, never `npm install` in CI.
- **Bilingual** (Spanish/English) with Chilean Spanish locale for currency (`es-CL`).
- **Cart persistence**: localStorage keys prefixed `astro-poc-`. Legacy `cart` key is read-only compat alias (storage contract en `astro-poc/src/scripts/storefront/storage-contract.ts`).
- **Testing**: Vitest specs use `describe`/`it`/`expect` globals. E2E usa Playwright con TypeScript (`test/e2e-astro/` storefront; `admin/content-manager/test/e2e/` admin).
- **Linting**: ESLint flat config con pre-commit zero-warning via husky + lint-staged. Nunca uses `--no-verify`.
- **Formatting**: Prettier (`semi: true`, `singleQuote: true`, `trailingComma: 'es5'`, `printWidth: 100`).
- **Build pipeline**: Preflight (category sync → image generation → validation) → Astro build → postbuild (legacy pages, sitemap, asset contract validation).
- **Social preview** supported routes: `home`, `/<category>/`, `/p/<sku>/`. Centralized in `astro-poc/src/lib/seo.ts`.
