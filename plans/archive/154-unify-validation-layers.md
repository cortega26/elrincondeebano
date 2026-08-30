# 154 — Unify the four parallel validation layers on canonical zod schemas

- **Source**: Auditoría 10, DEBT-03 · **Status**: DONE · **Priority**: P3 · **Effort**: L
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/shared/schemas/ astro-poc/src/lib/data-schemas.ts tools/utils/product-contract.js admin/content-manager/src/web/`

## Problem

Product/category/storefront validation exists in 4 parallel layers that have already drifted:

1. `admin/content-manager/src/shared/schemas/product.ts:16-98` — canonical zod, strict: `price` required `int().positive().max(1_000_000)`, `image_path` regex-constrained to `assets/images/`, category regex forbids path separators (plan 100).
2. `astro-poc/src/lib/data-schemas.ts:12-48` — a SECOND zod `productSchema`: `price` is `nonnegative().optional()`, `image_path` accepts any string, and the `discount > price` superRefine is re-implemented at `:29-41` with a different message.
3. `tools/utils/product-contract.js:99-176` — a THIRD, hand-rolled JS validator (no zod) requiring `is_archived`, the avif-companion rule (`requiresAvifCompanion` :47-52), `field_last_modified` — none of which the zod layers check.
4. The web layer uses ZERO zod (`grep zod src/web` → none): `ProductForm.tsx:66-83` just does `Number(price)`/`Number(discount)` and trusts the server.

A rule change (raise max price, tighten asset paths) must be made in 3+ places with different syntaxes, and the layers already disagree — the admin will accept a product the Astro build's validator rejects or vice-versa.

## Scope

**In**: `admin/content-manager/src/shared/schemas/*`, `astro-poc/src/lib/data-schemas.ts`, `tools/utils/product-contract.js`, `admin/content-manager/src/web/**` (add client-side zod to the forms), the guardrail tests that assert on the tools validator's error strings (`test/build-contract.guard.test.js`, `test/product-data.contract.test.js`), and the build wiring that imports the tools validator.

**Out**: The storefront build's output bytes, the admin API's accepted payloads (the strict zod layer is the target — relaxations that loosened validation are rejected).

## Steps (phased — each phase keeps the suite green)

1. **Choose the canonical shape**: the admin zod schemas stay canonical. Extract the tools-validator semantics that zod does NOT yet express (`is_archived` presence, avif-companion for raster, `field_last_modified` shape) into zod refinements on the admin schemas — so the zod schema set becomes a superset of the tools validator's rules.
2. **Share the schema set**: move the canonical schemas to a location both workspaces import (a `data/`-level shared package or a root `shared/` module both `astro-poc` and `admin` import; the repo is npm-workspaced — an `admin/content-manager` export path or a new workspace works). `astro-poc/src/lib/data-schemas.ts` becomes a thin re-export with the storefront-specific allowances only where the storefront legitimately needs them (e.g. price optional for projection) — and where it diverges, the divergence is explicit and commented, not silent.
3. **Tools validator**: `tools/utils/product-contract.js` either becomes a zod-based check or is removed in favor of importing the shared schemas (update `sync-data.mjs`'s call site and the guardrail tests in lockstep — their error strings must be regenerated to the zod messages, asserted by the tests you update).
4. **Web forms**: add zod parsing to `ProductForm.tsx` (parse on submit; surface `.issues` as field errors) using the shared schema. This is the lowest-value step (the server is the real boundary) — do it last and keep it small.

## Tests

- Every phase runs: `npm run admin:test` + root `npx vitest run` + `npm run typecheck` + `npm run build` (the build runs the tools validator via preflight — if the messages change, the contract tests must be updated in the SAME commit).
- New: a parity test asserting admin zod ⊇ tools-validator rules — feed both validators the same sample corpus (reuse `plans/fixtures/055` fixtures) and assert agreement on accept/reject.
- Run the full gate at the end: `npm run validate`.

## Done criteria

- [ ] `astro-poc/src/lib/data-schemas.ts` no longer independently re-implements product rules (re-exports the canonical schema or documents each divergence).
- [ ] `tools/utils/product-contract.js` rules expressible via the canonical zod schemas (or the file is removed and `sync-data.mjs` uses the shared schemas).
- [ ] `grep -rn "safeParse\|superRefine" admin/content-manager/src/web` → the forms use the shared schemas.
- [ ] `npm run validate` green.

## Maintenance

This is the repo's largest consistency debt — any future field rule lands in ONE place. Because the storefront build and the admin are separate workspaces, the shared-module choice is the load-bearing decision; a reviewer should verify the shared module doesn't leak server code into the browser bundle (imports must be leaf zod schemas only).

## Rollback

Per phase: `git revert <phase sha>`. This plan should be executed in phases with a commit each.

## STOP conditions

- If unifying a rule would CHANGE the set of products the storefront build accepts vs today (build rejects something it currently accepts), stop and report the specific rule — the direction must be decided explicitly, not silently.
