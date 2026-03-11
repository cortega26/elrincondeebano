# Legacy Storefront Archive

Status: archived operational surface as of 2026-03-11.

## What this means

- The active storefront in `main` is Astro under [`astro-poc/`](/home/carlos/VS_Code_Projects/Tienda%20Ebano/astro-poc).
- Root `npm run build` now builds the Astro storefront through the shared asset preflight.
- The historical Node + EJS pipeline remains in the repo only as a reference and disaster-recovery artifact generator.

## Archived commands

- `npm run build:legacy`
- `npm run test:e2e:legacy`

These commands are no longer part of required CI, release, or deploy flows.

## Why it was archived

- Production already deploys `astro-poc/dist`.
- Keeping two active storefront build paths in `main` created operational drift in SEO, previews, and verification.
- The archive preserves historical scripts without allowing them to silently diverge from production behavior.

## Guardrail

If a change is intended for the public website, validate Astro first:

```bash
npm run build
npm run test:e2e
```

Only use the legacy commands when investigating historical behavior or recovering archived assets.
