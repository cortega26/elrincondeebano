# Plan 189: Stop paying triple builds and per-job reinstalls in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- .github/workflows/ci.yml .github/actions/setup-node-and-deps/action.yml package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/185-build-probe-memoization.md
- **Category**: perf
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Each CI run pays ~3× full preflight + Astro build (`build-and-check` builds,
copies dist, builds again, diffs hashes) plus 4–5 separate `npm ci`
installs (every job runs setup-node-and-deps; only static-checks/verify
skip it), while root and admin vitest run serially in one `npm test`.
Sharing one build artifact, caching workspaces, and splitting suites into
parallel jobs cuts minutes per push — but the double-build exists to prove
determinism, so the change must preserve that signal provably, not remove it.

## Current state

Relevant files:

- `.github/workflows/ci.yml:105-119` — `build-and-check`: `npm run build`,
  copy dist to `build-determinism-a`, `npm run build` again, diff sha256.
  Job timeout 15 minutes.
- `.github/actions/setup-node-and-deps/action.yml:17-43` — Node 24.x +
  `npm ci` per job; npm cache keyed on `package-lock.json` only.
- `package.json:61` — `npm test` = `vitest run && npm run admin:test`
  (serial, one job).
- `playwright.astro.config.ts:12-23` — E2E serial (`fullyParallel: false`,
  single Chromium project, `retries: 1`).

Conventions: CI Guardian rules (pinned action versions, least privilege —
check the workflow headers and preserve them); determinism proof is a
release-grade signal (ADR 0007 names the validation contract; do not weaken
it without an ADR note).

## Commands you will need

| Purpose    | Command                                                                        | Provenance | Expected on success          |
| ---------- | ------------------------------------------------------------------------------ | ---------- | ---------------------------- |
| CI lint    | `npx --yes actionlint` (only if already used in repo; else visual diff review) | declared   | no findings / careful review |
| Tests      | `npm test`                                                                     | declared   | all pass (unchanged code)    |
| YAML check | `node -e "require('js-yaml')..."` or python yaml safe-load of edited files     | declared   | parses                       |

## Scope

**In scope**: `ci.yml` job graph, composite action caching, `npm test`
job split (root vs admin parallel jobs).

**Out of scope**: changing WHAT is built/tested (same stages, same gates);
Playwright sharding beyond what's here (admin matrix owns its fan-out —
plan 206); self-hosted runners (repo migrated to `ubuntu-24.04` — keep).

## Git workflow

- Branch: `advisor/189-ci-build-cache-split`
- Commit per slice (artifact share → caches → suite split).
- Do NOT push or open a PR unless the operator instructed it. (CI changes
  can only be proven in CI — mark the plan BLOCKED pending a CI run if the
  operator cannot trigger one, with the exact workflow + branch to watch.)

## Steps

### Step 0: Record current costs

From the last green CI run on the base branch, record per-job wall times
(build-and-check, test jobs, install times). If no CI access, record local
`time npm run build` ×2 + `time npm ci` as a proxy and note the substitution.

**Verify**: numbers recorded in the working notes; otherwise STOP (no
baseline, no claim).

### Step 1: Share one build for the determinism comparison

Restructure `build-and-check` so preflight's expensive image steps run ONCE
(artifact the first `dist` + the preflight outputs), then run only the
deterministic Astro phase twice for the hash diff — OR keep two full builds
but run them as parallel jobs sharing a cached preflight layer. Whichever
preserves the exact current diff semantics (`find ... sha256sum | diff`).
The second build must still start from identical inputs (same checkout,
same dependency tree) — document how the restructure guarantees that.

**Verify**: YAML parses; workflow diff reviewed line by line; determinism
semantics preserved by construction (state the argument in the commit).

### Step 2: Cache workspaces + Playwright browsers across jobs

Extend the composite action (or job-level `actions/cache`) to cache
`node_modules`/workspace installs and the Playwright browser path keyed on
lockfile + workflow file. Keep `persist-credentials: false` and pinned
versions untouched.

**Verify**: YAML parses; cache keys include everything that affects the
payload (lockfile; browser version file if one exists).

### Step 3: Split root vs admin suites into parallel jobs

`npm test` stays as the local one-command runner, but CI runs root vitest
and admin vitest as parallel jobs (fail-fast preserved at the workflow
level). Keep the serial local behavior documented.

**Verify**: YAML parses; required-checks settings (branch protection, if
any) still satisfiable by the new job names — CHECK branch protection
rules before renaming any job (renamed required jobs silently unblock
merges; if uncertain, keep job names and only parallelize inside).

## Test plan

- No code tests change. Proof is a green CI run on the plan branch showing
  (a) determinism diff still executes and passes, (b) total workflow time
  down vs Step-0 baseline, (c) all gates still required and passing.
- Local verification: YAML parse + `npm test` green (code untouched).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Edited YAML files parse; action versions still pinned.
- [ ] Determinism comparison still runs on identical inputs (reviewer
      confirms the argument in the commit).
- [ ] No required-check job renamed without branch-protection update
      (or no renames at all).
- [ ] CI run on the branch green with recorded time improvement (or plan
      marked BLOCKED pending CI with the watch instructions).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Branch protection references job names you must rename (STOP before
  breaking required checks).
- The determinism signal cannot be preserved under artifact sharing
  (keep the double-build; take only caches + split, and record that).
- No CI run can be triggered to prove the change (mark BLOCKED, do not
  claim victory on YAML review alone).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New CI jobs MUST reuse the composite action (no bespoke setup steps) —
  note the rule in the commit.
- Cache keys must be bumped deliberately when toolchains change; document
  the key scheme where the cache is defined.
- Reviewer: re-verify least-privilege permissions on any touched workflow.
- **Deferred:** Playwright sharding (plan 206's call); preflight artifact
  caching beyond the hash-state (plan 185's Step 3 covers the state dir).
