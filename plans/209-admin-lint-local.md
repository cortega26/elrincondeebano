# Plan 209: Give the admin a local full-tree lint + close the lint-staged hole

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- package.json admin/content-manager/package.json admin/content-manager/eslint.config.mjs eslint.config.cjs AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: dx
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`npm run lint` is false-green for the admin tree: root `lint` runs
`lint:root + lint:astro` only, root eslint ignores the admin tree by design,
and the admin workspace defines NO `lint` script — full admin lint exists
only as a CI one-liner and via staged-file lint-staged. Failures surface in
CI or not at all, lengthening the loop. Worse, lint-staged's admin pattern
covers only `*.{ts,tsx}`, while admin `.mjs`/`.js` scripts
(`rotate-credential.mjs`, `migrate-catalog.mjs`, `e2e-import-server.mjs`,
`bench-catalog-snapshot.mjs`) are ignored by root patterns too (explicit
`--ignore-pattern 'admin/content-manager/**'`) and by root config — so those
files get NO pre-commit lint at all (CI covers them, after context switch).

## Current state

Verified by advisor read:

```json
// package.json:33-35 — no admin gate
"lint": "npm run lint:root && npm run lint:astro",
// package.json:147-149 — admin staged pattern TS-only
"admin/content-manager/**/*.{ts,tsx}": ["eslint --config admin/content-manager/eslint.config.mjs", "prettier --write"],
// package.json:151-158 — root JS/TS patterns explicitly ignore the admin tree
// admin/content-manager/package.json:7-28 — no "lint" script (grep: NO match)
```

```js
// eslint.config.cjs:29-30 — root ignores both packages by design
// admin/content-manager/eslint.config.mjs:15-21 ignores (dist/reports/coverage/...); :28-33 files: src + scripts incl. js/mjs
// CI covers scripts: .github/workflows/admin.yml:45 — npx eslint src scripts test --config eslint.config.mjs
```

```md
<!-- AGENTS.md:38 documents the split but offers no local full-tree command -->
```

Conventions: keep the root/admin config split (designed — different parsers
and rule severities); wire discovery, don't merge configs. lint-staged runs
with `--concurrent false` per AGENTS.md gotchas — preserve flags.

## Commands you will need

| Purpose          | Command                                                                                        | Provenance              | Expected on success         |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------- | --------------------------- |
| Admin lint (new) | `npm run admin:lint`                                                                           | declared (created here) | exit 0                      |
| Root lint        | `npm run lint`                                                                                 | declared                | exit 0 (now includes admin) |
| Staged dry-run   | `npx lint-staged --dry-run` (if supported) or stage a fixture `.mjs` change and run pre-commit | declared                | admin .mjs picked up        |

## Scope

**In scope**: admin `lint` script + root `admin:lint` alias + root `lint`
wiring; lint-staged admin pattern extension; AGENTS.md lint-row touch-up
(compatible with plan 207's wording — coordinate).

**Out of scope**: fixing any pre-existing admin lint ERRORS the new gate
surfaces beyond what's needed for green (if the tree is red, fix or
triage-and-report — see Step 1); merging the two eslint configs; sonarjs
severity changes.

## Git workflow

- Branch: `advisor/209-admin-lint-local`
- Two commits (lint wiring; lint-staged hole).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline — how red is the admin tree?

Run the CI one-liner locally
(`npx eslint src scripts test --config eslint.config.mjs` from
`admin/content-manager`). Record errors vs warnings.

- If ERRORS exist: triage — fix trivially-safe ones (unused imports,
  formatting-adjacent) in this plan; report the rest and STOP the wiring
  half until the tree can go green (a red-by-default gate trains
  contributors to ignore it).
- If clean: proceed.

**Verify**: baseline recorded; otherwise STOP with the triage list.

### Step 1: Add local full-tree admin lint

- Add `"lint": "eslint src scripts test --config eslint.config.mjs"`
  (mirror the CI one-liner exactly — same command locally and in CI) to
  `admin/content-manager/package.json`.
- Add root alias `"admin:lint": "npm -w admin/content-manager run lint"`
  (match the existing `admin:*` alias pattern) and include it in root
  `lint` (order: root → astro → admin, or match whatever order the repo
  prefers — document the choice; keep total runtime sane).
- Update AGENTS.md:38 row to name all three gates (coordinate wording with
  plan 207 — check its status; do not contradict it).

**Verify**: `npm run lint` runs all three and exits 0 on the clean tree.

### Step 2: Close the lint-staged hole

Extend the admin lint-staged entry to `{ts,tsx,js,mjs,cjs}` (or add an
admin-scripts entry mirroring the workspace config's `files:` globs —
prefer mirroring so staged coverage can never drift from CI coverage
again). Dry-run against a staged `.mjs` fixture (e.g. whitespace-only
touch of `rotate-credential.mjs`, reverted after) proving the file is
picked up.

**Verify**: fixture run proves `.mjs` coverage; fixture reverted.

## Test plan

- No product tests. Proof: three-gate `npm run lint` green + staged-fixture
  demonstration + CI one-liner still identical to the workspace script.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` executes root + astro + admin gates and exits 0.
- [ ] `npm run admin:lint` exists and equals the CI one-liner.
- [ ] Staged `.mjs` fixture provably triggers admin eslint (record output).
- [ ] AGENTS.md lint row names all three gates (or defers cleanly to 207).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The admin tree has pre-existing ERRORS beyond trivial fixes (report the
  triage; do not land a red-by-default gate).
- Wiring admin lint into root `lint` breaks the `--max-warnings=0` posture
  of root patterns (admin config may warn where root errors — reconcile
  explicitly, don't silently lower bars).
- Plan 207 already rewrote the AGENTS row incompatibly (reconcile wording).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- The staged pattern MUST mirror the workspace config's `files:` globs —
  note the coupling in `package.json` so the next config change updates both.
- CI one-liner and workspace `lint` script MUST stay identical (one is the
  other's local form) — note the coupling at both sites.
- Reviewer: confirm no warning-level drift was hidden to reach green.
- **Deferred:** unifying the two configs' rule severities (only if
  contributors report whiplash — not now).
