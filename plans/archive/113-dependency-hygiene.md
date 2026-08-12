# 113 — Dependency hygiene: remove dead devDeps, fix playwright skew, document TS 7

- **Source**: Auditoría 9, DEPS-02/03/04/05/01 (X1/X2)
- **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `b3805e1`

## Problem

Four manifest issues verified in the audit:

1. **Unused devDeps**: `package.json:118` `pa11y-ci ^4.1.1` (pulls puppeteer +
   a Chromium download on every `npm ci`; zero references repo-wide) and
   `package.json:127` `ws ^8.21.2` (zero imports).
2. **Phantom tool**: `turbo ^2.10.8` (`package.json:122`) + `turbo.json` +
   the `turbo` passthrough script (`package.json:24`) — configured but never
   invoked by any script/workflow; `npx turbo build` would bypass the real
   pipeline (`package.json:29` preflight + workspace build).
3. **Playwright skew**: `admin/content-manager/package.json:35`
   `@playwright/test ^1.62.1` vs `:42` `playwright ^1.61.1` — same release
   train, different ceilings; at the next minor bump `@playwright/test@1.63.x`
   would resolve against `playwright@1.61.x` (driver/API mismatch).
4. **TS major skew**: root/astro-poc on TS `^6.0.3`, admin on `^7.0.2`; the
   toolchain (`typescript-eslint@8.66.0` peer `<6.1.0`, `@astrojs/check`
   peer `^5||^6`) does not support TS 7 — admin's own lint parses with the
   TS 6 API. A clean "fix" (align to one major) is blocked upstream, so the
   deliverable is a documented decision, not a migration.

## Scope

**In**: root `package.json`, `turbo.json` (delete), the lockfile,
`admin/content-manager/package.json` (playwright range), the vendored
`anymatch` fork docs (`vendor/anymatch/`), and a note in `plans/README.md`
or `docs/operations/DEPENDENCY_POLICY.md` for the TS decision.

**Out**: real dependency upgrades, any build pipeline.

## Steps

1. Remove `pa11y-ci`, `ws`, `turbo` from root devDependencies; delete
   `turbo.json` and the `turbo` passthrough script. Regenerate the lockfile
   with `npm ci && npm install --package-lock-only` (root — never
   `npm install` per repo policy; use `npm install --package-lock-only` only
   if needed and re-run `npm ci` to verify).
2. Align the admin playwright ranges: `"playwright": "^1.62.1"` (or drop the
   bare `playwright` if `@playwright/test` covers all imports — check
   `admin/content-manager/test/e2e/` for direct `playwright` imports first;
   keep it if `playwright/index` is imported).
3. Update the vendored `vendor/anymatch/anymatch-3.1.3.tgz` package.json
   description from "Astro 6" to "Astro 7 (unstorage) dependency closure —
   picomatch 4 patch" and record the patch (upstream is frozen since 2022;
   see `plans/archive/011-dependencies-hygiene.md`).
4. Document the TS decision in `docs/operations/DEPENDENCY_POLICY.md`:
   admin stays on TS 7 until typescript-eslint/@astrojs/check support it;
   root/astro-poc stay on 6; the skew is deliberate and re-checked at each
   major toolchain release. Add `npm ls typescript typescript-eslint
@playwright/test playwright` as a manual hygiene check in `admin:doctor`
   (add it if the script doesn't already do it).

## Tests

- `npm ci` clean (no peer warnings about TS 7).
- `npm ls pa11y-ci ws turbo` → empty.
- `npm ls @playwright/test playwright` → both resolve to a single 1.62.x.
- `npm run validate` green (full gate — proves nothing referenced the removed deps).

## Done criteria

- [ ] `pa11y-ci`, `ws`, `turbo` absent from the manifest and the lockfile.
- [ ] Playwright ranges aligned; `npm ls` shows one copy.
- [ ] TS skew documented in DEPENDENCY_POLICY.md; admin:doctor gains the hygiene check.
- [ ] `npm run validate` green.

## Maintenance

The dependency policy doc is the canonical place for the TS decision; revisit
after each `typescript-eslint` major. `npm audit` stays the vulnerability
gate (currently 0 high/critical).

## Rollback

`git revert <sha>` (manifest + lockfile only).
