# Plan 084: Make `validate`/`typecheck` cover the whole monorepo and lint the `.tsx` surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- package.json eslint.config.cjs .github/workflows docs/operations AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: dx / tests
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

`npm run validate` — the documented PR and release gate in `AGENTS.md` and
`docs/operations/VALIDATION_MATRIX.md` — validates the storefront and the
legacy tree but **silently excludes the canonical manager**: root
`typecheck` runs `typecheck:legacy && typecheck:astro`, root `test` runs
only `test/` globs, and `validate` composes those. A regression in
`admin/content-manager/` passes every documented gate. Separately, the
manager's entire React surface (`src/web/app/**/*.tsx`) is outside ESLint
and lint-staged (neither glob matches `.tsx`), so the "zero-warning
pre-commit" guarantee in `CLAUDE.md` is false for the newest code in the
repo.

After this plan: one command validates the monorepo (storefront + manager;
Python fallback stays separate and documented), and `.tsx` is linted with
the same zero-warning discipline.

## Current state

Verified facts:

- `package.json`:
  - `"typecheck": "npm run typecheck:legacy && npm run typecheck:astro"`
  - `"validate": "npm run lint && npm run typecheck && npm run check:e2e-selectors && npm test && npm run build && npm run guardrails:assets"`
  - `"admin:typecheck"`, `"admin:test"`, `"admin:build"`, `"admin:parity"` exist but appear in NO composition (grep the scripts).
- `eslint.config.cjs` — file globs `**/*.{js,mjs,cjs,ts,mts}` and
  `**/*.{ts,mts}`: no `.tsx`.
- `package.json` `lint-staged` — same globs, no `.tsx`.
- `admin/content-manager/` has no ESLint config of its own; root `eslint .`
  matches its `.ts` files today (parsed by a TS6-era parser while the
  workspace uses TS 7 — plan 082/DEPS-06 context) but no `.tsx`.
- `AGENTS.md` PR checklist — "lint + typecheck en verde" with no admin step.
- `docs/operations/VALIDATION_MATRIX.md:15-23` — validate stages, no admin
  step.
- Python fallback validation exists separately: `python -m pytest
admin/product_manager/tests` (164 tests) — keep it separate; do not fold
  pytest into `npm run validate` in this plan.

## Commands you will need

| Purpose   | Command                             | Expected on success                |
| --------- | ----------------------------------- | ---------------------------------- |
| Typecheck | `npm run typecheck` (after change)  | exit 0                             |
| Lint      | `npm run lint` (after change)       | exit 0 (may need triage in Step 2) |
| Tests     | `npm test` + `npm run admin:test`   | exit 0                             |
| Full gate | `npm run validate` (optional; slow) | exit 0                             |

## Scope

**In scope**:

- `package.json` (script composition)
- `eslint.config.cjs` (globs)
- `docs/operations/VALIDATION_MATRIX.md` + `AGENTS.md` (document the scope
  of each gate)
- `admin/content-manager/` — ONLY if the lint triage requires a config for
  the workspace (prefer root-glob changes first)

**Out of scope**:

- Folding pytest into the npm gate (documented separate; plan 069's cutover
  decides the Python future).
- Fixing all pre-existing lint issues (see Step 2's triage rule).
- The `test-ts` CI job (plan 082 owns CI).

## Git workflow

- Branch: `advisor/084-unify-monorepo-validation`.
- Commit per step, conventional style (`build: compose admin checks into validate`, `lint: lint tsx files`), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Compose the admin checks into the root gates

In `package.json`:

- `"typecheck"` → `npm run typecheck:legacy && npm run typecheck:astro && npm run admin:typecheck`
- `"test"` → `node test/run-all.js && vitest run && npm run admin:test`
- `"validate"` → add `&& npm run admin:typecheck && npm run admin:test` (or
  rely on the composed typecheck/test — pick ONE mechanism and be explicit).

Run each changed script and fix ONLY script-level problems (missing
workspace resolution etc.). Note: this will make `npm test` slower (~+10 s)
— acceptable.

**Verify**: `npm run typecheck` exit 0; `npm test` exit 0; `npm run validate`
exit 0 if it was green before (if it fails, the failure is a pre-existing
gate problem — report it rather than hiding it).

### Step 2: Lint the `.tsx` surface

Add `.tsx` to the ESLint globs and lint-staged patterns:

- `eslint.config.cjs`: add `**/*.tsx` (and keep `.ts`/`.mts`).
- `package.json` `lint-staged`: extend `*.{ts,mts}` → `*.{ts,mts,tsx}`.

Run `npx eslint admin/content-manager/src/web --ext .tsx` (or `npm run
lint:root`). **Triage rule**: fix only (a) parse errors and (b) the first
~10 real issues by severity; then open a follow-up commit listing the rest
in its message. Do not use `eslint-disable` comments unless a rule is
demonstrably wrong for this codebase (then note it and report).

**Verify**: `npm run lint` exit 0 (with the follow-up commit applied);
`npx lint-staged` dry-run (or a staged test file) matches `.tsx`.

### Step 3: Document the gate scope

Update `AGENTS.md` checklist and `VALIDATION_MATRIX.md`: `validate` covers
storefront + TypeScript manager; Python fallback is validated via
`python -m pytest admin/product_manager/tests` (keep that line).

**Verify**: `grep -n "admin" docs/operations/VALIDATION_MATRIX.md` shows the
new scope line.

## Test plan

- The script compositions ARE the test: `npm run typecheck`, `npm test`,
  `npm run validate` exit 0.
- A trivial `.tsx` lint violation (temporarily add an unused var to a test
  file, run lint, remove it) proves the glob works — do it on a scratch
  file, not a real one, and revert it.

## Done criteria

- [ ] Root `typecheck` and `test` include the admin workspace (grep the
      scripts in package.json)
- [ ] `validate` includes the admin checks
- [ ] ESLint globs and lint-staged include `.tsx`; `npm run lint` exits 0
- [ ] AGENTS.md + VALIDATION_MATRIX.md document what each gate covers
- [ ] `plans/README.md` status row 084 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The admin typecheck/tests were already failing at execution time (pre-070
  state) — report the failures; do not weaken the gate to pass.
- The `.tsx` lint run surfaces a systemic pattern (e.g. the whole web app
  violates a rule) — triage per Step 2's rule and report the scale.
- `npm run validate` was not green before your change (pre-existing) —
  verify with `git stash` if needed, and report rather than masking.

## Maintenance notes

- With `admin:test` inside `npm test`, the root and workspace vitest runs
  share a lockfile but separate configs — a future vitest major bump must
  update both `vitest.config.mts` and `admin/content-manager/vitest.config.ts`.
- Plan 082's `test-ts` CI job becomes partially redundant with the composed
  root gates — keep both until CI and local agree, then consolidate.
- Reviewer focus: the composed `test` script's failure messages should name
  the failing segment (the `&&` chain prints which step failed) — if that
  proves confusing, switch to a small runner script.
