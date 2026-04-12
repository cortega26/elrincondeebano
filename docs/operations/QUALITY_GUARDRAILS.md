# Quality Guardrails (Prompt 1)

## Scope

This document defines the baseline reliability rules for production changes in
El Rincon de Ebano.

## Global Definition of Done

A change is done only when all items below are true:

1. `npm run lint` passes with no errors.
2. `npm run typecheck` passes, including Astro-native validation for `astro-poc/`.
3. `npm test` passes.
4. `npm run build` passes and generates a valid `astro-poc/dist/` deployment snapshot.
5. `npm run guardrails:assets` passes when images, catalog references, templates,
   or build tooling are touched.
6. `npm run test:e2e` passes when routes, navigation, cart, rendering,
   service worker, checkout-related UX, or product-page metadata are affected. The
   canonical suite is `playwright.astro.config.ts` over `test/e2e-astro/`.
7. `npm run monitor:share-preview` passes when supported shareable routes,
   SEO metadata, OG assets, or category/product preview inputs change.
8. Manual smoke checklist is executed for user-facing changes:
   `npm run smoke:manual` and `docs/operations/SMOKE_TEST.md`.
9. Share-preview changes also require the workflow in
   [`SHARE_PREVIEW`](./SHARE_PREVIEW.md), including a Meta Sharing Debugger
   re-scrape and a real WhatsApp verification before final release signoff.
10. Evidence (commands and outcomes) is attached to the PR.

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
