# Plan 170: Land or revert the dirty working tree and establish a green baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- package.json admin/content-manager/src/server/routes/importRoutes.ts admin/content-manager/src/shared/schemas/importExport.ts admin/content-manager/src/web/app/routes/ImportPage.tsx astro-poc/src/scripts/parking-reservation.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (blocks every other plan touching the files below)
- **Category**: tests
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The working tree on branch `advisor/b1-elrincon-remainder` is dirty: five
tracked files are modified and seven new files are untracked, including two
build tools (`tools/preflight-hash.mjs`, `tools/run-parallel.mjs`) that the
modified `package.json` preflight already invokes. A clean clone at the base
commit therefore fails `npm run build` (missing tools), while this tree may
pass — no later plan has a trustworthy baseline until this is resolved. The
untracked files are labeled "Plan 013" steps 1–4 (import byte-cap duplicate,
parking timeouts, hash-gated parallel preflight, money characterization), so
this is in-flight work to finish and commit, not debris — but that decision
belongs to the operator, and every later plan depends on it.

## Current state

Modified tracked files (`git status --short` at `0847089c`):

- `package.json` — `preflight` (line 29) invokes untracked
  `tools/run-parallel.mjs`; `images:logo/og:home/og:parking` invoke untracked
  `tools/preflight-hash.mjs`:

```sh
"preflight": "npm run categories:sync && node admin/content-manager/scripts/migrate-catalog.mjs && node tools/run-parallel.mjs ..."
```

- `admin/content-manager/src/server/routes/importRoutes.ts` — byte-cap block
  measuring `Buffer.byteLength(JSON.stringify(rawProducts), 'utf8')` against
  `MAX_IMPORT_BYTES` (5 MB, `shared/schemas/importExport.ts`), returning 413.
- `admin/content-manager/src/shared/schemas/importExport.ts` — exports
  `MAX_IMPORT_BYTES = 5 * 1024 * 1024`.
- `admin/content-manager/src/web/app/routes/ImportPage.tsx` — modified (client
  cap counterpart; confirm with `git diff`).
- `astro-poc/src/scripts/parking-reservation.js` — +135 lines
  (`fetchWithTimeout`, `toHolidaySet`, `createBookingLookup`, `MAX_NIGHTS`
  picker clamp).

Untracked files (all `??` in git status):

- `tools/preflight-hash.mjs` — content-hash gate (`hashInputFiles`,
  `shouldSkipStep`; state in `reports/preflight-hashes`, gitignored).
- `tools/run-parallel.mjs` — parallel runner with failure propagation
  (`runCommandsParallel`).
- `test/preflight-hash-gate.test.js`, `test/parking-reservation-timeout.spec.js`,
  `test/storefront-totals.spec.js`,
  `admin/content-manager/test/integration/importPreviewLimits.test.ts`,
  `admin/content-manager/test/web/importPage.test.tsx`.

Repo conventions that apply: atomic commits per plan with `git mv` archive
rule for DONE plans (`tools/check-plan-archive.mjs`); tests live in `test/`
(root vitest, include `test/**/*.{spec,test}.{js,mjs,ts}`) and
`admin/content-manager/test/`; never `--no-verify`.

## Commands you will need

| Purpose       | Command                             | Provenance | Expected on success                           |
| ------------- | ----------------------------------- | ---------- | --------------------------------------------- |
| Status        | `git status --short`                | declared   | shows the files above (or clean after step 1) |
| Tests         | `npm test`                          | declared   | exit 0 (root vitest + admin vitest)           |
| Baseline      | `npm run validate`                  | declared   | exit 0                                        |
| Archive check | `node tools/check-plan-archive.mjs` | declared   | prints OK                                     |

## Scope

**In scope** (the only files you should modify):

- Committing (or reverting) exactly the 5 modified + 7 untracked files above.
- `plans/README.md` status row for this plan.

**Out of scope** (do NOT touch, even though they look related):

- Any source change beyond version-control operations — if a test fails, fix
  the test/workmanship only if the failure is trivially caused by the new
  files; otherwise STOP.
- All other plans' files. Land the tree as-is; do not refactor it.

## Git workflow

- Branch: stay on the current branch (`advisor/b1-elrincon-remainder`) unless
  the operator instructed otherwise.
- One commit for the whole landing (message style matches repo: e.g.
  `feat(preflight): hash-gated parallel image steps + import/parking guards (plan 170)`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Inspect the drift

Run `git status --short` and `git diff --stat`. Confirm the tree still shows
the 5 modified + 7 untracked files from Current state.

- If the tree is already clean (someone committed), verify
  `node tools/check-plan-archive.mjs` passes and skip to Done criteria.
- If files differ from the lists above, STOP and report the delta.

**Verify**: `git status --short` output matches the Current state lists
(or is clean, with the new files present in `git log --oneline -3`).

### Step 1: Decide land vs revert with the operator's default

Default: LAND (the work is labeled, tested, and referenced by `package.json`).
Revert ONLY if the operator explicitly says so.

- Land: `git add` exactly the 12 files, commit (no `--no-verify`; pre-commit
  hooks must pass).
- Revert: `git checkout -- <5 modified files>` and `rm` the 7 untracked files
  ONLY after operator confirmation — never delete uncommitted work on your
  own authority. If reverting, also revert the `package.json` preflight lines
  that reference the deleted tools (same commit).

**Verify**: `git status --short` shows no unexpected entries; the commit exists
in `git log --oneline -3`.

### Step 2: Prove the baseline is green

Run `npm test` (both runners). If green, run `npm run validate` only if time
permits — at minimum `npm run lint`, `npm run typecheck`, and
`npm run build:fast` must pass. Record exact results in the commit/PR notes.

**Verify**: `npm test` → exit 0; `npm run lint` → exit 0;
`npm run typecheck` → exit 0.

## Test plan

- No new tests in this plan. The landed files bring their own:
  `test/preflight-hash-gate.test.js`, `test/parking-reservation-timeout.spec.js`,
  `test/storefront-totals.spec.js`,
  `admin/content-manager/test/integration/importPreviewLimits.test.ts`,
  `admin/content-manager/test/web/importPage.test.tsx`.
- Existing suite is the pattern: `npm test` must stay green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git status --short` is clean (landed) or matches HEAD (already landed).
- [ ] `npm test` exits 0.
- [ ] `npm run lint` and `npm run typecheck` exit 0.
- [ ] `node tools/check-plan-archive.mjs` prints OK.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The tree contains files not listed here (unknown in-flight work).
- `npm test` fails on the landed tree and the failure is not trivially
  attributable to the new files.
- A `declared` command does not exist or fails on the unmodified checkout
  (broken baseline — report command + exact output).
- The operator has already landed this work under a different commit (then
  just verify and mark DONE).

## Maintenance notes

- Every later plan's drift check assumes this plan landed: their `Planned at`
  SHA `0847089c` predates the landing commit, so executors must diff against
  this plan's landing SHA for the 12 files, not just `0847089c`.
- **Deferred:** none.
