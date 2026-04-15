# ADR 0003: Migrate storefront from EJS/Node to Astro static site

- Date: 2025-Q3
- Status: Accepted

## Context

The legacy storefront used an EJS template engine served from a Node.js process. This required a live server, made deployments stateful, and made caching complex. The target deployment platform (GitHub Pages) only supports fully static sites.

The legacy code is archived in `_archive/legacy-storefront/` and `docs/archive/LEGACY_STOREFRONT.md`.

## Decision

Migrate the production storefront to Astro, building into `astro-poc/dist/` as a fully static site. The Astro app lives in `astro-poc/` as a **separate npm root** to isolate its dependency tree from root-level tooling (guards, tests, image pipelines).

## Consequences

### Positive

- Zero-server deployment to GitHub Pages.
- Full static-site generation (SSG) benefits: no runtime, instant deploys.
- Astro's island architecture allows selective client-side hydration.
- Canonical build is a single command: `npm run build` from the repo root.

### Costs / constraints

- **Dual npm root:** two `npm ci` calls are required for a cold-start install (`npm run bootstrap` wraps both).
- **Shared inputs:** `data/` and `assets/` at the repo root are shared between the Astro build and root tooling. The preflight pipeline bridges them into the Astro build; skipping preflight produces a stale `dist/`.
- **Do not restore the legacy path:** EJS templates in `_archive/` must never be imported or rebuilt. They are reference material only.
- **`astro-poc/` prefix is intentional legacy naming:** the directory name reflects its origin as a proof-of-concept migration; it is now the production codebase and its name should not be interpreted as experimental.
