# Plan 205: Rewrite stale contributor docs (CONTRIBUTING, typecheck contract, CLAUDE)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- CONTRIBUTING.md CLAUDE.md AGENTS.md tsconfig.typecheck.json tsconfig.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: docs
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Contributors (human and agent) following CONTRIBUTING waste full environment
cycles on dead paths: a Python-admin setup for a deleted runtime, `node:test`
conventions no runner invokes, a typecheck scope spanning a retired legacy
package, and a SARIF anchor pointing at a heading that does not exist.
CLAUDE.md re-synced in plan 112 has drifted again in three rows agents use
for cold start. All docs-only, all verified line-by-line below.

## Current state

Verified by advisor read (doc claim → contradicting source):

- `CONTRIBUTING.md:132-141` → `cd admin/product_manager && ... python gui.py`
  vs `admin/` contains only `content-manager/` (glob
  `admin/product_manager/**/*` empty; retired plan 069 per AGENTS.md:7-12).
- `CONTRIBUTING.md:62` → "`npm test` is node:test (legacy) + Vitest" and
  `:145-147` → create `test/<name>.test.js` with node:test vs
  `package.json:61` (`vitest run && npm run admin:test`) and
  `vitest.config.mts:11` (already includes `test/**/*.{spec,test}.*` under
  Vitest); zero `node:test` imports under `test/`.
- `CONTRIBUTING.md:60-62` → typecheck `tsc --noEmit (root + astro-poc)`,
  `:102` gates `src/js/**` on typecheck vs `package.json:64-66`
  (`typecheck:legacy` retired to echo, plan 155; `typecheck` = astro check +
  admin tsc); `src/` tree absent.
- `AGENTS.md:37` ("legacy + astro + admin"), `CLAUDE.md:18` (same),
  `CONTRIBUTING.md:61` ("root + astro-poc") — three-way disagreement with
  `package.json:64-66`.
- `tsconfig.typecheck.json:11` → `"include": []`, no references in
  scripts/configs; root `tsconfig.json:4-8` lax (`strict: false`).
- `CONTRIBUTING.md:163` → `AGENTS.md#guardrails-citests` vs anchor exists
  ONLY in CONTRIBUTING itself (grep-verified); live SARIF surface is
  `docs/operations/RUNBOOK.md:175-196`.
- `CLAUDE.md:13` → bootstrap "root + astro-poc" vs three workspaces
  (`package.json:91-94`, BOOTSTRAP.md:21-25); `:18` legacy typecheck scope;
  `:24` reduces `guardrails` to orphan+secret vs 9 stages in
  `tools/guardrails/run.mjs:8-18`.

Conventions: AGENTS.md is canonical ("AGENTS.md manda"); doc-ownership per
`DOCUMENTATION.md`; markdownlint per START_HERE rule.

## Commands you will need

| Purpose      | Command                                                   | Provenance | Expected on success |
| ------------ | --------------------------------------------------------- | ---------- | ------------------- |
| Docs lint    | `npx markdownlint-cli2 'docs/**/*.md' '*.md'`             | declared   | exit 0              |
| Anchor check | `grep -rn "guardrails-citests" AGENTS.md CONTRIBUTING.md` | declared   | resolves after fix  |

## Scope

**In scope**: CONTRIBUTING.md (setup/test/typecheck/SARIF rows),
AGENTS.md typecheck row (+ plan-range bump if plan 207 doesn't own it —
check first), CLAUDE.md three rows, `tsconfig.typecheck.json` disposition
(delete or repurpose with a comment — if anything references it, keep and
document).

**Out of scope**: CODEBASE_MAP/STRUCTURE/engineering docs (plan 207);
runtime code (none); wiring `src/js` into a checker (nothing to wire it
to — `src/` is gone; retire the gate language instead).

## Git workflow

- Branch: `advisor/205-contributor-docs-rewrite`
- One commit (docs-only, but keep it reviewable — split setup vs
  typecheck vs CLAUDE if large).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm each drift (no changes)

Re-verify every bullet above on the live tree (one may have been fixed by
plan 170's landing or another plan — check 207's status too). Drop fixed
ones with a note.

**Verify**: live drift list matches; otherwise narrow scope.

### Step 1: Rewrite CONTRIBUTING's dead paths

- Replace the Python admin section with `npm run admin:dev` /
  `admin:validate` per `admin/content-manager/README.md`.
- Test rows → Vitest root + admin Vitest (file patterns from
  `vitest.config.mts`); remove `node:test`/`.mts-in-src` guidance (or mark
  historical in one line — prefer deletion with the plan numbers cited).
- Typecheck rows → astro check + admin typecheck; remove the `src/js/**`
  gate language (retired with plan 155); fix the SARIF anchor to the live
  RUNBOOK section.

**Verify**: every command named exists in `package.json`; every anchor
resolves; markdownlint green.

### Step 2: Align AGENTS.md + CLAUDE.md + dead tsconfig

- AGENTS.md: typecheck row → astro + admin with plan-155 note (coordinate
  the plan-range bump with plan 207 — one of you does it, not both).
- CLAUDE.md: bootstrap → three workspaces; typecheck → astro + admin;
  guardrails → nine-stage summary matching `run.mjs` (one line + pointer,
  not a copy of the list). Keep the plan-112 header, bump date/scope note.
- `tsconfig.typecheck.json`: delete if unreferenced (verify with a full
  grep including CI workflows and docs), else repurpose + comment. If
  deleted, remove its mentions from CODEBASE_MAP (or leave for plan 207
  with an explicit handoff note — do not half-edit another plan's files).

**Verify**: greps clean; markdownlint green.

## Test plan

- Docs-only: markdownlint + anchor resolution + command-existence checks
  (every `npm run <x>` named must exist in the owning `package.json`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] No `admin/product_manager`, `node:test`-as-runner, `src/js/**` gate,
      or legacy-typecheck language remains in CONTRIBUTING/AGENTS/CLAUDE
      (grep clean, modulo one-line historical notes with plan numbers).
- [ ] Every `npm run <cmd>` named in the three files exists in a manifest.
- [ ] Every `#anchor` link resolves to a heading that exists.
- [ ] markdownlint exits 0.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Something still references `tsconfig.typecheck.json` (keep it and
  document instead of deleting).
- Plan 207 already owns overlapping rows (reconcile — split files cleanly,
  do not double-edit).
- Any named command does not exist (report; do not invent commands).

## Maintenance notes

- These three files rot fastest — the doc-freshness policy
  (`DOCUMENTATION.md`) should name an owner cadence; if it doesn't, say so
  in the commit.
- Reviewer: click every anchor; run every command name.
- **Deferred:** none.
