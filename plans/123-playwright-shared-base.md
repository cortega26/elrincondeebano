# 123 — Shared Playwright base config for the admin e2e matrix

- **Source**: Auditoría 9, DX-6
- **Status**: TODO · **Priority**: P3 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

`admin/content-manager/` has six near-identical Playwright configs
(`playwright.config.ts` + `.import`, `.changes`, `.media`, `.storefront`,
`.scope`) that duplicate ~85% of their body — reporter/retries/trace/
screenshot/workers/projects/webServer boilerplate — differing only in
`testMatch`, port (3101-3104), server command, and JSON output path. The
default `playwright.config.ts:25-31` must hand-maintain a `testIgnore` list
of exactly the other five specs.

Impact: a change to retries/trace/reporter must be made six times; the
`testIgnore` list is a footgun (a new config added without updating it runs
its specs twice).

## Scope

**In**: `admin/content-manager/` — a new `playwright.base.ts` (or
`config/playwright.base.ts`) + the six configs.

**Out**: the test specs, CI (`admin.yml` invokes each config by name — keep
the names), ports (keep distinct).

## Steps

1. Create `playwright.base.ts` exporting a factory
   `defineAdminConfig(overrides)` that applies the shared options
   (reporter, retries, trace, screenshot, workers, the chromium project,
   webServer boilerplate with injectable command/port).
2. Rewrite the six configs to call the factory with only their deltas
   (`testMatch`, port, server command, output JSON path). Keep every config
   file's exports/name identical so `admin.yml` needs zero changes.
3. Replace the `testIgnore` hand-list in `playwright.config.ts` with the
   factory's per-config `testMatch` (the default config only runs its own
   spec) — or keep the ignore list but derive it from the factory so it
   can't drift.
4. Run all six configs locally — same tests, same results as baseline.

## Tests

- Run all six configs on the current tree: `--list` counts must match the
  baseline (record before/after counts in the commit).
- Spot-run each config once (the CI runs them all on push — CI green is the
  final gate).
- `npm run admin:typecheck` + `npm run lint` green.

## Done criteria

- [ ] Six configs each ≤ 25 lines, sharing one base.
- [ ] `--list` test counts identical to baseline per config.
- [ ] `admin.yml` unchanged; CI green.

## Maintenance

New admin e2e suites get a config via the factory + a `testMatch`; the
default config no longer needs an ignore list. Ports stay unique per config
(they are part of the webServer contract).

## Rollback

`git revert <sha>` — config-only refactor; revert restores the six files.
