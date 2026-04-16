# Quality Guardrails (Prompt 1)

## Scope

This document defines the baseline reliability rules for production changes in
El Rincon de Ebano.

## Global Definition of Done

A change is done only when all items below are true:

1. `npm run validate:release` passes for any release candidate or change that
   affects shipped behavior.
2. `npm run guardrails:assets` passes when images, catalog references, templates,
   or build tooling are touched.
3. `npm run test:e2e` passes when routes, navigation, cart, rendering,
   service worker, checkout-related UX, or product-page metadata are affected. The
   canonical suite is `playwright.astro.config.ts` over `test/e2e-astro/`.
4. `npm run monitor:share-preview` passes when supported shareable routes,
   SEO metadata, OG assets, or category/product preview inputs change.
5. Manual smoke checklist is executed for user-facing changes:
   `npm run smoke:manual` and `docs/operations/SMOKE_TEST.md`.
6. Share-preview changes also require the workflow in
   [`SHARE_PREVIEW`](./SHARE_PREVIEW.md), including a Meta Sharing Debugger
   re-scrape and a real WhatsApp verification before final release signoff.
7. Evidence (commands and outcomes) is attached to the PR.

## Sensitive Production Areas

The following areas require extra caution and explicit rollback notes:

1. Routing and category URLs (`astro-poc/src/lib/catalog.ts`,
   `astro-poc/src/pages/c/[category].astro`, `data/category_registry.json`).
2. SEO metadata, sitemap, robots, structured data (`astro-poc/src/lib/seo.ts`,
   `astro-poc/scripts/postbuild-sitemap.mjs`, `robots.txt`, `docs/operations/SHARE_PREVIEW.md`).
3. Cart, repeat-order, and checkout-related flows (`astro-poc/src/scripts/storefront.js`,
   `astro-poc/src/scripts/storefront/*.js`, `astro-poc/src/components/Navbar.astro`).
4. Product catalog and inventory contracts (`data/product_data.json`,
   `data/categories.json`, `data/category_registry.json`).
5. Images and asset pipeline (`tools/generate-images.mjs`,
   `tools/rewrite-images.mjs`, `tools/lint-images.mjs`).
6. Service worker and caching (`service-worker.js`, `src/js/modules/pwa.js`,
   `src/js/modules/service-worker-manager.mjs`).

## Change Policy

1. No breaking changes without migration plan.
2. Public contract changes (URL, slug, schema, API shape) require:
   1. tests that cover expected behavior;
   2. migration plan;
   3. rollback instructions.
3. No large refactors in the same PR as behavior or contract changes.
4. Risky changes must be reversible in one revert commit.

## Small PR Plan

1. PR0: Tooling and guardrails baseline (lint/test/build/smoke gates).
2. PR1: Test foundation and flaky-test hardening.
3. PR2+: Targeted improvements (CI, security, performance, UX), one concern per PR.

## Rollback Steps (Risky Changes)

Use this process in PR descriptions for risky changes:

1. Identify the exact commit SHA to revert.
2. Run `git revert <sha>` in a dedicated rollback branch.
3. Re-run:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e` (if affected area had e2e coverage)
4. Validate smoke checklist before redeploy.
5. Document incident summary and root cause in the PR thread.

## Guardrails CI/Tests (checklist)

- **Ejecución determinista:** `node -v` debe coincidir con `22.x`; usar `npm ci` (prohibido `npm install` con lockfile presente).
- **Build estricto:** `npm run build` sin warnings críticos; artefactos en `astro-poc/dist/`. `npm run guardrails:assets` en verde.
- **Tests:** `npm ci && npm test` completos tras modificaciones. Prohibido `test.skip`, `--forceExit`, `--passWithNoTests` o eliminar asserts sin reemplazo.
- **Cobertura:** baseline objetivo 80%. Mutation testing (Stryker) en lógica crítica (Cart, Analytics, Logger); no reintroducir survivors.
- **Linter/formatter:** `npm run lint`, `npm run typecheck` (para `src/js/**`), `npm run format` en verde.
- **SARIF:** si se genera manualmente, sanitizar con `jq` y verificar esquema `2.1.0`. Nunca construir JSON con `echo` + interpolaciones.
- **Secretos:** nunca registrar valores sensibles en logs o `git diff`. `SYNC_API_REQUIRE_AUTH=true` y `SYNC_API_STRICT_STARTUP=true` en producción.
- **Permisos mínimos:** `contents: read`, `pages: write` — sólo lo necesario por workflow.
- **Presupuesto de cambio:** objetivo ≤400 líneas netas por PR; refactors grandes requieren desglose.

## Política de cambio y PR

- Ramas con formato `tipo/slug`, p. ej. `docs/agents-refresh-YYYYMMDD`.
- Commits en Conventional Commits (`docs(agents): ...`).
- PRs incluyen evidencia de `npm test`, `npm run build`, `npm run test:e2e` y auditorías relevantes.
- Actualizar docs relacionadas en el mismo PR cuando cambia un comportamiento.
- Adjuntar `npm audit --production` cuando se toquen dependencias.
- Patch/minor permitidos si pruebas y auditorías en verde. Major requieren RFC documentado.
