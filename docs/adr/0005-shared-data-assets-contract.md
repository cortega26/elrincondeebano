# ADR 0005: Shared data/ and assets/ as build inputs to the Astro storefront

- Date: 2025-Q3
- Status: Accepted

## Context

Product data (`product_data.json`, `categories.json`) and image assets need to be accessible to multiple consumers:

- The **Astro storefront build** (rendering product pages, category pages, OG images).
- **Root-level tooling** (admin product manager, image generation pipelines, guardrail validators, category sync scripts).

Duplicating these files or keeping separate copies would create divergence bugs and complicate the admin workflow.

## Decision

`data/` and `assets/` live at the **repo root** and are the single source of truth for all consumers. The **preflight pipeline** (`npm run preflight`) processes them (syncing AVIF variants, generating OG images, validating the category registry) before the Astro build runs. The Astro app reads from these root directories via its build-time configuration.

The canonical build sequence is always:

```
npm run preflight   # processes data/ and assets/ → outputs into astro-poc/
npm run build       # npm run build already includes preflight as its first step
```

## Consequences

### Positive

- Single source of truth for product data and images — the admin tool writes to `data/product_data.json` and the next build automatically picks up changes.
- Category registry and image pipeline stay in sync with the storefront without manual copying.

### Costs / constraints for agents

- **Never skip preflight.** `npm run build` already calls `npm run preflight` internally. Running `npm --prefix astro-poc run build` directly bypasses preflight and produces a stale or broken `dist/`. Always use `npm run build` from the repo root.
- **Validate before building.** The gates `npm run validate:categories` and `npm run guardrails:assets` must pass before a release build. A failing validation indicates a data integrity issue that will propagate into the deployed site.
- **No generated artifacts in git.** Files written into `astro-poc/dist/`, `coverage/`, and `output/` are gitignored and must never be committed. `reports/` is the exception — it holds committed evidence artifacts.
- **Product data backups** in `_products/` and `data/product_data.backup_*` are safety snapshots created by the admin tool. Do not delete them manually; use `npm run prune:backups` to apply the retention policy.
