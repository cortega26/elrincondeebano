# 155 — Retire the root src/js zombie surface (extract live functions first)

- **Source**: Auditoría 10, DEBT-04 · **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- src/js/ tsconfig.typecheck.json test/ tools/benchmarks/memoize-benchmark.mjs astro-poc/`

## Problem

Root `src/js/` is a zombie surface: dead in production, kept alive by 35 test files + `typecheck:legacy`.

- The deployed bundle imports only `astro-poc/src/scripts/storefront.js` (`astro-poc/src/layouts/BaseLayout.astro:161-163`); `astro-poc/dist/_astro/` contains zero legacy modules.
- The ONLY consumers of root `src/js/` are `tsconfig.typecheck.json:11` (`typecheck:legacy` includes `src/js/**`) and 35 root vitest files (`test/cart.spec.js` imports `../src/js/script.mjs`, `test/cart.unit.test.mjs` imports `src/js/modules/cart.mjs`, `test/checkout.test.js:5` imports `src/js/modules/checkout.mjs`, `test/modules.dom.test.js`, etc.), plus `tools/benchmarks/memoize-benchmark.mjs:151` and `tools/guardrails/checkout-guard.mjs:3`.
- A parallel live implementation exists: `src/js/modules/cart.mjs` (localStorage key `'cart'`) vs astro-poc's `cart-view.js` + `storage-contract.ts` (key `astro-poc-cart` with legacy migration at `storage-contract.ts:33-40`) — same domain, different storage, different DOM. They must not drift; they already share a browser via the migration path.
- Every `npm test` pays the maintenance cost of a surface the site no longer ships.

## Scope

**In**: The still-relevant pure functions (cart math, product filtering, srcset/image helpers) migrated into astro-poc-side modules or root `test/`-importable modules; then `src/js/` deleted; `tsconfig.typecheck.json` updated (drop `src/js/**`); the 35 legacy test files retired; `tools/benchmarks/memoize-benchmark.mjs` and `tools/guardrails/checkout-guard.mjs` repointed or removed.

**Out**: The astro-poc live storefront modules (they are NOT legacy — plan 140 tests them), `service-worker.js`, `data/`.

## Steps

1. **Depends on plan 140 first** (it must land before this starts — the money-math coverage must exist in the live modules before the legacy coverage is deleted).
2. **Extract**: identify the pure functions the legacy tests actually assert (cart math in `cart.mjs`, filter logic, `image-srcset.mjs` width constants, `cfimg.mjs`, `product-data.mjs`). For each, either (a) move the function into a live astro-poc module and re-point the legacy test's import, or (b) if the function is genuinely dead (no live consumer), do NOT extract it — it dies with `src/js/`.
3. **Repoint or delete consumers**: `tools/guardrails/checkout-guard.mjs` — check what it guards (the dead `checkout.mjs`); if its protection is covered by plan 140's new tests, delete it and its test; if not, repoint it at the live module. `tools/benchmarks/memoize-benchmark.mjs` — if it benchmarks a dead `src/js/script.mjs` memoize (the perf audit confirmed it measures nothing live), delete it (or repoint at a live memoize if one exists).
4. **Delete** `src/js/` and the 35 legacy test files (archive them under `_archive/` if the repo prefers keeping evidence — check how `_archive/` is used; `git ls-files _archive` is empty, so it's a working area, not a tracked archive — prefer plain deletion with this plan's commit as the record).
5. Update `tsconfig.typecheck.json` to drop `src/js/**`; ensure `npm run typecheck:legacy` still passes (or is removed from `typecheck` if it becomes empty).

## Tests

- The re-pointed/extracted functions' tests pass in their new home (`npx vitest run <new/modified files>`).
- Plan 140's money-math tests (live modules) remain green.
- `npm run typecheck` green (legacy typecheck updated or removed).
- `npm run lint` green; root `npm test` green after the deletions.

## Done criteria

- [ ] `src/js/` deleted (grep `src/js` → only historical references in docs/CHANGELOG).
- [ ] No test imports `../src/js/` or `src/js/` (grep `test/`).
- [ ] `typecheck:legacy` either removed or passes without `src/js`.
- [ ] `npm test` and `npm run typecheck` green.

## Maintenance

The legacy-migration path in `storage-contract.ts:33-40` (old `'cart'` key → `astro-poc-cart`) is the ONLY remaining legacy coupling after this plan — keep it until no browser has a legacy cart, but the migration reads the old key without importing legacy code, so it survives the deletion intact. A reviewer should confirm nothing in the e2e suite referenced a legacy module.

## Rollback

`git revert <sha>` (restores `src/js/` and the tests; the extract step's commits are independent and safe to keep).

## STOP conditions

- If plan 140 has not landed, do NOT start this plan (dependency).
- If any test that imports `src/js/` asserts behavior NOT covered by a live-module test after the extraction mapping, stop and report — do not delete coverage silently.
