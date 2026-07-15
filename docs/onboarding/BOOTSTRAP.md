# Bootstrap

Canonical cold-start instructions for agents and contributors.

## Runtime baseline

- Node 24.x
- Deterministic workspace install: `npm ci`

Keep `.nvmrc`, `.node-version`, `.tool-versions`, CI workflows, and
`package.json` aligned to the same Node 24 baseline.

## Canonical cold start

1. Select Node 24 (`nvm use 24`, `mise use node@24`, or equivalent).
2. Run `npm run bootstrap`.
3. Run `npm run validate`.

## Why use the bootstrap command?

This repository is an npm workspace with two packages:

- `/`
- `astro-poc/`

The root lockfile covers both packages, and `npm run bootstrap` currently wraps
the correct deterministic root install (`npm ci`). Use the named command so the
onboarding contract remains stable if installation steps change later. Do not
run a second install inside `astro-poc/`.

## Optional environment setup

Run `cp .env.example .env` only if you are working on `admin/` tooling,
Cloudflare workflows, or other tasks that need local secrets.

## Known-good verification

- `npm run build`
- `npm run test:e2e`
- `npm run validate:release` before release work
