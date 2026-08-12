# 110 — Retire the dead e2e surface (scripts, legacy specs, orphaned configs)

- **Source**: Auditoría 9, D1 (TDA-05 + DX-1/DX-2/DX-8 + DOCS-04)
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

The manifest ships e2e entry points that fail on invocation, plus 8 tracked
specs no config references:

- `package.json:67-68` — `test:e2e:visual` / `test:e2e:visual:update` run
  `playwright test test/e2e/visual-regression.spec.ts`, which **does not
  exist** (verified: no such file anywhere).
- `package.json:85-86` — `test:e2e:media` / `test:e2e:storefront` run
  `-c playwright.media.config.ts` / `-c playwright.storefront.config.ts`
  from the repo root; those configs only exist under
  `admin/content-manager/`. The root wrappers fail with "config not found"
  (the workspace scripts `admin:test:e2e:*` work — the root ones are dead).
- `test/e2e/` still tracks 8 Playwright specs (`catalog-infinite-scroll.spec.ts`,
  `flicker.spec.ts`, `mobile-navbar-toggle.spec.ts`, …) that no config
  references — `playwright.astro.config.ts:11` uses `testDir: 'test/e2e-astro'`,
  and `vitest.config.mts:12` excludes `test/e2e/**`.
- AGENTS.md:47-49 documents these as "obsoletos" but still present — the
  docs layer and the manifest disagree.

## Scope

**In**: root `package.json`, `test/e2e/` (delete), `vitest.config.mts`
(remove the now-pointless exclude), AGENTS.md (reword the gotcha to "removed"),
`docs/repo/STRUCTURE.md:110` (the "Supplemental/manual Playwright" row).

**Out**: `test/e2e-astro/` (the live suite), admin e2e configs, CI workflows
(none reference the removed scripts — verify with grep before deleting).

## Steps

1. Grep-proof before deleting: `grep -rn "test:e2e:visual\|test/e2e/\|playwright.media.config\|playwright.storefront.config" package.json .github/ docs/ tools/` — confirm nothing live references them (the admin workspace scripts are separate entries with their own names; keep those).
2. Delete the four root scripts (`test:e2e:visual`, `test:e2e:visual:update`, `test:e2e:media`, `test:e2e:storefront`) from `package.json`.
3. Delete `test/e2e/` (8 dead specs) and the `test/e2e/**` exclusion in `vitest.config.mts`.
4. Reword AGENTS.md:47-49 — replace "obsoletos (…) no agregues specs ahí" with "retirados el 2026-08-XX: `test/e2e/` y los scripts `test:e2e:visual*` fueron eliminados (plan 110); la suite viva es `test/e2e-astro/`".
5. Update `docs/repo/STRUCTURE.md:110` to drop the dead-suite row.
6. Run `tools/check-e2e-class-selectors.mjs` (or the selectors check in `npm run validate`) — confirm it doesn't scan `test/e2e/`.

## Tests

- `npm run validate` green (its `check:e2e-selectors` step must not depend on the deleted dir — verify in the validation flow before/after).
- `npm run test:e2e` (the live astro suite) green.
- Grep the repo for `visual-regression` and `test/e2e/` — zero hits outside git history.

## Done criteria

- [ ] `npm run test:e2e:visual` no longer exists in the manifest.
- [ ] `test/e2e/` deleted from the tree; `vitest.config.mts` exclude gone.
- [ ] AGENTS.md + STRUCTURE.md no longer mention the dead suite.
- [ ] `npm run validate` green.

## Maintenance

This closes the trap AGENTS.md already warned about. When adding e2e specs,
the live dirs are `test/e2e-astro/` (storefront) and
`admin/content-manager/test/e2e/` (admin).

## Rollback

`git revert <sha>` (restores scripts + specs; no behavior change anywhere).
