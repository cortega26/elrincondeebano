# El Rincón de Ébano

Static, mobile-first storefront for [elrincondeebano.com](https://www.elrincondeebano.com/),
built with Astro and a versioned product catalog. The repository contains the
production storefront, catalog and image inputs, build tooling, automated tests,
and operational runbooks.

## At a glance

| Area                         | Source of truth                                                                |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Production app               | [`astro-poc/`](./astro-poc/)                                                   |
| Browser entry point          | [`astro-poc/src/scripts/storefront.js`](./astro-poc/src/scripts/storefront.js) |
| Product and category data    | [`data/`](./data/)                                                             |
| Source assets                | [`assets/`](./assets/)                                                         |
| Build and validation tooling | [`tools/`](./tools/) and root [`package.json`](./package.json)                 |
| Contributor task router      | [`docs/START_HERE.md`](./docs/START_HERE.md)                                   |

The shipped artifact is a static Astro site in `astro-poc/dist/`. There is no
required application server. The former Node/EJS storefront is an archived
reference, not part of the deployment contract.

## Quick start

Prerequisite: Node `24.x`. The repository is an npm workspace, so the root
lockfile covers both the tooling and the Astro app.

```bash
npm run bootstrap
npm run dev
```

`npm run bootstrap` performs a deterministic workspace install with `npm ci`.
The development server prints its local URL after startup. Environment variables
are optional for normal storefront work; see
[`docs/onboarding/LOCAL_DEV.md`](./docs/onboarding/LOCAL_DEV.md) for admin and
Cloudflare tasks.

## Build and validate

```bash
npm run build
npm run validate
npm run validate:release
```

| Command                    | Use it for                                                                        |
| -------------------------- | --------------------------------------------------------------------------------- |
| `npm run build`            | Canonical production build: preflight, generated assets, then Astro               |
| `npm run build:fast`       | Code-only build: skip preflight (images/data unchanged). See "Fast build" below   |
| `npm run validate`         | Local confidence: lint, types, selector guard, tests, build, and asset guardrails |
| `npm run validate:release` | Ship gate: release stages plus browser tests and the live share-preview probe     |
| `npm run test:e2e`         | Canonical Playwright suite in `test/e2e-astro/`                                   |
| `npm run lighthouse:audit` | Performance evidence for rendering, navigation, bundle, or critical-fetch changes |

Run `build` and `test:e2e` sequentially on Windows because both use generated
Astro output. The release gate includes a live network probe and is therefore
slower and dependent on the deployed site.

## How the build works

```text
data/ + assets/ + config/
          |
          v
   npm run preflight
          |
          v
   Astro static build
          |
          v
   astro-poc/dist/
```

Always build from the repository root with `npm run build`. Calling Astro
directly skips the shared preflight contract and can produce incomplete output.

### Fast build (skip preflight)

For code-only changes (CSS, TypeScript, Astro components) where catalog data
and images haven't changed, use the fast build:

```bash
npm run build:fast
```

This skips the image generation pipeline and runs only the Astro build.
Use `npm run build` (full) for CI and when catalog data or images have changed.

## Working in the repository

- Start with [`docs/START_HERE.md`](./docs/START_HERE.md) to select the correct
  code surface and validation tier.
- Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening a pull request.
- Apply the maintainability rules in
  [`docs/architecture/ENGINEERING_PRIORITIES.md`](./docs/architecture/ENGINEERING_PRIORITIES.md),
  including the repository's pragmatic DRY, SOLID, and KISS guidance.
- For agent or API-assisted work, follow
  [`docs/operations/AI_EFFICIENCY.md`](./docs/operations/AI_EFFICIENCY.md) to
  reduce token and tool consumption without weakening verification.
- When commands, ownership, or behavior change, update the affected docs in the
  same pull request. The freshness policy is in
  [`docs/operations/DOCUMENTATION.md`](./docs/operations/DOCUMENTATION.md).

## Documentation map

| Need                     | Document                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| First setup              | [`docs/onboarding/BOOTSTRAP.md`](./docs/onboarding/BOOTSTRAP.md)                 |
| Local development        | [`docs/onboarding/LOCAL_DEV.md`](./docs/onboarding/LOCAL_DEV.md)                 |
| Repository architecture  | [`docs/architecture/CODEBASE_MAP.md`](./docs/architecture/CODEBASE_MAP.md)       |
| Validation requirements  | [`docs/operations/VALIDATION_MATRIX.md`](./docs/operations/VALIDATION_MATRIX.md) |
| Operations and incidents | [`docs/operations/RUNBOOK.md`](./docs/operations/RUNBOOK.md)                     |
| Share-preview contract   | [`docs/operations/SHARE_PREVIEW.md`](./docs/operations/SHARE_PREVIEW.md)         |
| Documentation ownership  | [`docs/operations/DOCUMENTATION.md`](./docs/operations/DOCUMENTATION.md)         |
| Historical decisions     | [`docs/adr/README.md`](./docs/adr/README.md)                                     |

## Production contract

- Supported public routes: `/`, `/<category>/`, and `/p/<sku>/`.
- Catalog and assets are versioned build inputs; generated output is not edited
  by hand.
- Social metadata and image versioning are centralized in
  [`astro-poc/src/lib/seo.ts`](./astro-poc/src/lib/seo.ts).
- Shopper state uses `astro-poc-*` local-storage keys. The old `cart` key is a
  read-only upgrade alias.

## License and maintainer

Licensed under ISC. Built and maintained by **Carlos Ortega** — automation,
data systems, and web technical-hygiene consulting at
[tooltician.com](https://tooltician.com/).
