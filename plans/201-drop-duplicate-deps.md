# Plan 201: Drop duplicate deps (bare playwright, undici)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- package.json admin/content-manager/package.json tools/fetch-fonts.mjs test/setup-globals.js test/helpers/dom-test-utils.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: migration
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Two carried duplicates with zero functional value and standing re-skew
hazard: bare `playwright ^1.62.1` beside `@playwright/test ^1.62.1` (lock
installs both driver payloads; the next independent minor bump re-creates
the plan-113 driver/API skew) with zero source imports; and `undici ^8.10.0`
duplicating Node 24's native `fetch`/Web APIs on the repo's only supported
runtime (`engines >=24 <25`, natives always present — the test shim's own
comment cites Node 20 compat, which is outside engines/CI). Every `undici`
CVE triggers triage for 4 files that could use the platform. Removal is
1 manifest line + 4 file edits + lock regen, proven by the E2E + fonts +
unit runs.

## Current state

Verified by advisor read/grep:

```json
// admin/content-manager/package.json:50 (+:40 @playwright/test, same 1.62.1 — skew fixed, dup remains)
"playwright": "^1.62.1",
// zero source imports from bare 'playwright' repo-wide (all e2e/unit import '@playwright/test';
// tools/snapshot-site.mjs:5, tools/live-browser-contract.mjs:3 use @playwright/test's chromium)
```

```json
// package.json:122
"undici": "^8.10.0",
```

```js
// tools/fetch-fonts.mjs:4
import { fetch } from 'undici';
// test/setup-globals.js:12 (+ preserves natives on Node 24+ — shim is dead code there)
// test/helpers/dom-test-utils.js:2 — const { File } = require('undici');
```

Conventions: `DEPENDENCY_POLICY.md` removal path (check it); E2E proves
browser resolution (`@playwright/test` alone); `npm run fonts` proves the
fetch swap. Bare-`playwright` removal affects install only — zero source
files import it.

## Commands you will need

| Purpose       | Command                                                                  | Provenance | Expected on success             |
| ------------- | ------------------------------------------------------------------------ | ---------- | ------------------------------- |
| Install/lock  | `npm install --package-lock-only` (scoped) then `npm ci`                 | declared   | exit 0                          |
| Browser proof | `npm ls playwright @playwright/test`                                     | declared   | only @playwright/test remains   |
| E2E smoke     | `npm run admin:test:e2e` (or one isolated config) + storefront E2E smoke | declared   | pass (proves driver resolution) |
| Fonts         | `npm run fonts`                                                          | declared   | exit 0                          |
| Tests         | `npm test`                                                               | declared   | all pass                        |

## Scope

**In scope**: the 2 manifest lines + lock + the 4 undici-importing files.

**Out of scope**: any other dep (plans 200/202/203); `@playwright/test`
version changes; native-fetch behavior alignment beyond the header check.

## Git workflow

- Branch: `advisor/201-drop-duplicate-deps`
- Two commits (playwright, undici); e.g.
  `chore(deps): drop bare playwright; @playwright/test covers all imports (plan 201)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

`npm ls playwright @playwright/test` (both installed today); `npm run fonts`
green; `npm test` green unmodified.

**Verify**: recorded; otherwise STOP.

### Step 1: Remove bare `playwright`

Delete the line from admin `devDependencies`, regenerate lock, confirm
`npm ls playwright` shows no bare install and `@playwright/test` still
resolves browsers (E2E smoke). Zero source edits expected.

**Verify**: E2E smoke green.

### Step 2: Migrate 4 files to native fetch, drop `undici`

- `fetch-fonts.mjs`: `import { fetch } from 'undici'` → global `fetch`;
  check header/redirect behavior (fonts fetch with custom headers at
  lines ~17,25,64,82 — verify identical request semantics).
- `setup-globals.js`: reduce to assertion/no-op guard (keep the file —
  other globals may live there; remove only the undici require if natives
  cover everything on Node 24).
- `dom-test-utils.js`: same treatment for the `File` require.
- Remove the dep + regen lock only when no importer remains (grep proves).

**Verify**: `npm run fonts` green; `npm test` green; grep for undici →
zero matches.

## Test plan

- E2E smoke (driver proof), fonts run (fetch proof), full `npm test`.
- Verification: `npm ls` outputs + green runs recorded in commits.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm ls playwright` shows no bare install; E2E smoke green.
- [ ] `grep -rn "undici" package.json admin/content-manager/package.json tools/ test/ astro-poc/src/ admin/content-manager/src/` returns no matches (excluding lock history).
- [ ] `npm run fonts` + `npm test` exit 0.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any file imports bare `playwright` (premise wrong — report, keep the dep).
- Native `fetch` header/redirect behavior differs for fonts in a way tests
  catch (report the diff; keep undici for that file only).
- Some other importer of undici exists (report; extend or narrow).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New browser-test code MUST import `@playwright/test` (never bare
  `playwright`) — the plan-113 lesson; note it where the E2E configs live.
- New code MUST use global fetch (Node 24-only runtime) — note it in the
  contributors' doc touched by plan 205 if natural; otherwise a code comment
  in `fetch-fonts.mjs`.
- Reviewer: lockfile diff should remove entries, not add any.
- **Deferred:** none.
