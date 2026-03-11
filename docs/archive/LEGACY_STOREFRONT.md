# Legacy Storefront Archive

Status: retired build path as of 2026-03-11.

## What this means

- The active storefront in `main` is Astro under [`astro-poc/`](/home/carlos/VS_Code_Projects/Tienda%20Ebano/astro-poc).
- Root `npm run build` now builds the Astro storefront through the shared asset preflight.
- The historical Node + EJS pipeline no longer has supported package scripts or CI entrypoints.
- The retired source was moved to [`_archive/legacy-storefront/`](/home/carlos/VS_Code_Projects/Tienda%20Ebano/_archive/legacy-storefront).

## Archived contents

- Templates: [`_archive/legacy-storefront/templates/`](/home/carlos/VS_Code_Projects/Tienda%20Ebano/_archive/legacy-storefront/templates)
- Builders: [`_archive/legacy-storefront/tools/`](/home/carlos/VS_Code_Projects/Tienda%20Ebano/_archive/legacy-storefront/tools)
- Historical tests: [`_archive/legacy-storefront/tests/`](/home/carlos/VS_Code_Projects/Tienda%20Ebano/_archive/legacy-storefront/tests)

These commands were removed from the active package surface and are no longer part of CI, release, or deploy flows.

## Why it was archived

- Production already deploys `astro-poc/dist`.
- Keeping two active storefront build paths in `main` created operational drift in SEO, previews, and verification.
- Production now has a single supported storefront build path.

## Guardrail

If a change is intended for the public website, validate Astro first:

```bash
npm run build
npm run test:e2e
```

Use `npm run build` and `npm run test:e2e` for any current storefront verification.
