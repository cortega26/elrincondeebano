# Plan 207: Fix contributor-entry docs drift (map, structure, priorities, debugging, lint row)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- docs/architecture/CODEBASE_MAP.md docs/repo/STRUCTURE.md docs/architecture/ENGINEERING_PRIORITIES.md docs/operations/DEBUGGING.md AGENTS.md docs/operations/RUNBOOK.md docs/operations/QUALITY_GUARDRAILS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/205-contributor-docs-rewrite.md
- **Category**: docs
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The entry-point docs agents navigate by describe modules and suites that no
longer exist: CODEBASE_MAP documents a `src/js/` tree (retired plan 155)
with a `node:test` layer no runner invokes; STRUCTURE.md's workspace layout
omits the admin workspace while its own legacy detail lists `cypress/` and
Python tooling (retired plans 069/111, cypress long gone); scaling/perf
triage points at `test/e2e/` and `src/js/` (both absent — live E2E is
`test/e2e-astro/`); and AGENTS.md's lint row implies Astro is uncovered when
`npm run lint` runs `lint:root && lint:astro` (plan 209 owns the admin half
of that story). Every storefront task starts with wasted navigation cycles.
Docs-only; AGENTS.md stays canonical.

## Current state

Verified by advisor read (doc line → contradicting source):

- `CODEBASE_MAP.md:17,53-71` → `src/js/` cart/logger/analytics modules +
  `tsconfig.typecheck.json` scope vs `src/` glob empty +
  `tsconfig.typecheck.json:11` empty include. `:78-86` → `node:test`
  legacy-integration layer via `npm test` vs `package.json:61`
  (vitest + admin vitest), zero `node:test` imports in `test/`. (Test-layer
  table also lists `test/cart.spec.js` et al. for mutation — verify current
  names against `stryker.conf.mjs` while editing.)
- `STRUCTURE.md:5-6` → "root package and the `astro-poc` workspace" vs
  three workspaces (`package.json:91-94`, BOOTSTRAP.md:21-25). `:68-70` →
  legacy detail lists `test/` + `cypress/` suites and `admin/` as "Python
  content manager tooling" vs globs empty + `:33` itself noting Python
  retired (self-contradiction in one file).
- `ENGINEERING_PRIORITIES.md:74-75` → supplemental `test/e2e/` vs glob
  `test/e2e/**/*` empty (retired plan 110). `DEBUGGING.md:37` → triage paths
  `astro-poc/src/`, `src/js/`, `tools/` vs `src/` absent.
- `AGENTS.md:25-27` → plans "001–127", stamp 2026-08-13, master roadmap 127
  vs plans 128–169 all DONE (169 DONE 2026-08-31) — bump range/date to the
  audit-11 reality (coordinate with plan 205: this plan owns the range bump;
  205 owns the typecheck row). `AGENTS.md:38` → lint "NO cubre admin... igual
  que astro-poc" (ambiguous) vs `package.json:33-35` (`lint:root &&
lint:astro`) and QUALITY_GUARDRAILS:98 (correctly: root + astro-poc).

Conventions: markdownlint per START_HERE; doc-ownership per
DOCUMENTATION.md; update page metadata/dates where the files carry them.

## Commands you will need

| Purpose    | Command                                              | Provenance | Expected on success                   |
| ---------- | ---------------------------------------------------- | ---------- | ------------------------------------- |
| Docs lint  | `npx markdownlint-cli2 'docs/**/*.md' '*.md'`        | declared   | exit 0                                |
| Glob proof | `ls src cypress admin/product_manager test/e2e 2>&1` | declared   | all missing (proves staleness claims) |

## Scope

**In scope**: the 7 files' stale rows/sections listed above + AGENTS.md
plan-range bump.

**Out of scope**: RUNBOOK plans-path + SW versions + ADR index/ordering
(plan 208); CONTRIBUTING/CLAUDE/typecheck rows (plan 205); admin lint story
(plan 209 — but keep the AGENTS lint-row wording compatible with it).

## Git workflow

- Branch: `advisor/207-entry-docs-drift`
- One commit (or two: map/structure vs priorities/debugging/agents).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm each drift (no changes)

Requires plan 205 DONE (overlapping rows reconciled — 205 owns
CONTRIBUTING/CLAUDE/typecheck; this plan owns the files above). Re-run the
glob proof + grep each cited line. Drop fixed items with a note.

**Verify**: live drift list matches; otherwise narrow scope.

### Step 1: Rewrite the module/test maps

- CODEBASE_MAP: replace the `src/js/` section with the live storefront map
  (`astro-poc/src/scripts/storefront/` modules + ownership), collapse the
  test-layer table to Vitest + Playwright with correct invokers (verify
  mutation row against `stryker.conf.mjs` file list).
- STRUCTURE.md: add the admin workspace to the layout; delete `cypress/`
  - Python-admin rows (keep the retired-notice wording already in the
    directory table); fix the workspace-install statement.
- ENGINEERING_PRIORITIES + DEBUGGING: `test/e2e/` → `test/e2e-astro/` (+
  admin e2e); `src/js/` → live storefront scripts path.

**Verify**: every path named exists (spot-check with ls); markdownlint green.

### Step 2: AGENTS.md range bump + lint-row clarification

- Range/date → 001–169 closed + audit-11 entry (match plans/README reality;
  do not editorialize future audits).
- Lint row → root-ignore plus the two executed gates (`lint:root`,
  `lint:astro`) with admin covered by its own config in pre-commit/CI
  (word it so plan 209's `admin:lint` addition still fits — "currently"
  language if 209 is TODO).

**Verify**: rows match `package.json:33-35`, `eslint.config.cjs:29-30`,
and plans/README; markdownlint green.

## Test plan

- Docs-only: markdownlint + existence checks for every path/module/table
  entry touched (ls/grep proofs recorded in commit).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] No `src/js/`, `cypress/`, `test/e2e/` (non-historical), Python-admin,
      or `node:test`-as-layer language remains outside explicitly-marked
      historical notes (grep clean).
- [ ] Every path/table entry resolves to something that exists.
- [ ] AGENTS.md range/date + lint row match reality.
- [ ] markdownlint exits 0.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 205 changed the same rows (reconcile file ownership; do not
  double-edit).
- A "dead" path actually exists somewhere (premise wrong for that item —
  drop it).
- The mutation row's current file list can't be determined (leave that cell
  for the test owner with a TODO note).

## Maintenance notes

- CODEBASE_MAP/STRUCTURE are agent navigation critical path — they must be
  touched by every topology change (retirement, new workspace, suite move);
  say so in the commit so reviewers enforce it.
- Reviewer: verify each replacement path by opening it, not by grep alone.
- **Deferred:** none.
