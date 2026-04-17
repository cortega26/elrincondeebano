# Bootstrap

Canonical cold-start instructions for agents and contributors.

## Runtime baseline

- Node 24.x
- Deterministic install: `npm ci`

Keep `.nvmrc`, `.node-version`, `.tool-versions`, CI workflows, and
`package.json` aligned to the same Node 24 baseline.

## Canonical cold start

1. Select Node 24 (`nvm use 24`, `mise use node@24`, or equivalent).
2. Run `npm run bootstrap`.
3. Run `npm run validate`.

## Why not plain `npm ci`?

This repository has two npm roots:

- `/`
- `astro-poc/`

Running only root `npm ci` leaves the Astro storefront dependencies uninstalled.
`npm run bootstrap` is the only supported cold-start path because it installs
both roots in the correct order.

## Optional environment setup

Run `cp .env.example .env` only if you are working on `admin/` tooling,
Cloudflare workflows, or other tasks that need local secrets.

## Known-good verification

- `npm run build`
- `npm run test:e2e`
- `npm run validate:release` before release work
