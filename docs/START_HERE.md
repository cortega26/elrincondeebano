# Start Here

Single entry point for agents and contributors. Use this file to choose the
right code surface, validation path, and supporting documentation before making
changes.

## Cold start

1. Confirm the runtime baseline: Node 24.x.
2. Follow [`docs/onboarding/BOOTSTRAP.md`](./onboarding/BOOTSTRAP.md).
3. Use `npm run validate` for a fast local baseline.
4. Use `npm run validate:release` before release or when a change touches
   shipped behavior.

## Task router

| If you need to change...                          | Start in...                                             | Then run...                                                                         | Read next...                                  |
| ------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| Storefront UI or browser runtime                  | `astro-poc/src/`, `src/js/`                             | `npm run validate:release`                                                          | `docs/architecture/CODEBASE_MAP.md`           |
| Product data or category taxonomy                 | `data/`, `admin/product_manager/`                       | `npm run validate:categories && npm run build && npm run guardrails:assets`         | `docs/architecture/CATEGORY_REGISTRY.md`      |
| SEO, OG images, or share previews                 | `astro-poc/src/lib/seo.ts`, `tools/generate-*.mjs`      | `npm run build && npm test && npm run monitor:share-preview`                        | `docs/operations/SHARE_PREVIEW.md`            |
| Edge security headers or CSP                      | `infra/cloudflare/`, `tools/security-header-policy.mjs` | `npm test && npm run monitor:live-contract:strict`                                  | `docs/operations/EDGE_SECURITY_HEADERS.md`    |
| Build pipeline or generated assets                | `tools/`, `config/`, root `package.json`                | `npm run validate:release`                                                          | `docs/repo/STRUCTURE.md`                      |
| CI workflows or release gating                    | `.github/workflows/`, `tools/`, `package.json`          | `npm run validate:release`                                                          | `docs/operations/RUNBOOK.md`                  |
| Performance, scalability, or maintainability work | `astro-poc/`, `src/js/`, `tools/`, `docs/`              | `npm run validate:release` plus `npm run lighthouse:audit` when UX/perf is affected | `docs/architecture/ENGINEERING_PRIORITIES.md` |
| Docs, runbooks, or ADRs                           | `docs/`                                                 | `npm run validate`                                                                  | `docs/README.md`                              |

## Canonical commands

| Goal                     | Command                         |
| ------------------------ | ------------------------------- |
| Fast local confidence    | `npm run validate`              |
| Full release gate        | `npm run validate:release`      |
| Build only               | `npm run build`                 |
| Browser suite only       | `npm run test:e2e`              |
| Live share-preview probe | `npm run monitor:share-preview` |

## Ground rules

- `npm run build` is the only supported build path.
- Do not run `npm --prefix astro-poc run build` directly; it skips preflight.
- Treat `data/` and `assets/` as versioned source-of-truth inputs.
- Use `docs/architecture/ENGINEERING_PRIORITIES.md` when a change is driven by
  performance, scalability, maintainability, or doc-quality goals.
- Follow the ADRs for decisions that affect runtime topology, validation, or
  deployment.
