# Quality Guardrails (Prompt 1)

## Scope

This document defines the baseline reliability rules for production changes in
El Rincon de Ebano.

## Global Definition of Done

A change is done only when all items below are true:

1. `npm run lint` passes with no errors.
2. `npm test` passes.
3. `npm run build` passes and generates a valid `build/` snapshot.
4. `npm run guardrails:assets` passes when images, catalog references, templates,
   or build tooling are touched.
5. `npm run test:e2e` passes when routes, navigation, cart, rendering,
   service worker, or checkout-related UX are affected.
6. Manual smoke checklist is executed for user-facing changes:
   `npm run smoke:manual` and `docs/operations/SMOKE_TEST.md`.
7. Evidence (commands and outcomes) is attached to the PR.

## Sensitive Production Areas

The following areas require extra caution and explicit rollback notes:

1. Routing and category URLs (`templates/`, `tools/build-pages.js`,
   `data/category_registry.json`).
2. SEO metadata, sitemap, robots, structured data (`tools/generate-sitemap.js`,
   `tools/inject-structured-data.js`, `robots.txt`).
3. Cart and checkout-related flows (`src/js/modules/cart.mjs`,
   `src/js/modules/checkout.mjs`).
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
   - `npm test`
   - `npm run build`
   - `npm run test:e2e` (if affected area had e2e coverage)
4. Validate smoke checklist before redeploy.
5. Document incident summary and root cause in the PR thread.
