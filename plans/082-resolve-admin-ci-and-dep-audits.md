# Plan 082: Align admin CI with the retirement notice and clear the npm audit highs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- .github/workflows admin package.json package-lock.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md (076 recommended — the flaky coverage step)
- **Category**: dependencies / CI
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

Two CI/dependency problems compound:

1. **The retired Streamlit app is still tested.** `.github/workflows/admin.yml`
   `test-web` installs `admin/web/requirements*.txt` and runs
   `python -m pytest web/tests/` — but `docs/archive/streamlit-retirement-notice.md`
   (2026-07-16, per ADR 0008) retires `admin/web`. CI pays minutes per run
   testing a component the docs declare dead, keeping a second Python
   dependency surface under dependabot and maintenance.
2. **`npm audit --omit=dev` is red with 5 HIGH**, and the weekly
   `security-audit.yml` gate fails on it:
   - `react-router-dom@^7.18.1` (content-manager runtime dep) is inside the
     vulnerable range of GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF bypass,
     `>=7.12.0 <8.2.0`); no in-range fix — `fixAvailable` is a major bump to
     7.11.0 (below the range). Exploitability is unverified (the app is an
     SPA, not RSC), but the advisory stands.
   - `fast-uri` (host confusion, via `fastify@^5.10.0`) and `find-my-way`
     (HTTP/2 DDoS, `<=9.6.0`) — both fixable in-range; the content-manager
     server runs these at runtime.
   - `svgo` (build chain) and `undici@8.7.0` — fixable in-range.

After this plan: CI matches the documented retirement (Streamlit job gone or
explicitly gated), the runtime dependency advisories are resolved or
explicitly documented as exceptions, and the audit gate is green.

## Current state

Verified facts:

- `.github/workflows/admin.yml` — `test-web` job (~lines 66-98) installs
  `admin/web/requirements*.txt` + runs pytest; the uncommitted `test-ts`
  job (lines 101+, `working-directory: admin/content-manager`) does
  `npx tsc -p tsconfig.json --noEmit`, `npx vitest run`, `npx vitest run
--coverage`, `npm run build`, `npx playwright test -c playwright.config.ts`,
  and `node --import tsx scripts/certification-report.ts`.
- `docs/archive/streamlit-retirement-notice.md` — retires `admin/web`,
  "Archive admin/web/" (files affected listed at `:21-25`).
- `npm audit --omit=dev --json` (run 2026-08-03): 5 high / 2 moderate /
  0 critical; highs: `fast-uri` (fix: true), `find-my-way` (fix: true),
  `react-router-dom` (fix: major), `svgo` (fix: true), `undici` (fix: true).
- `.github/workflows/security-audit.yml` — weekly `npm audit --audit-level=high`.
- `admin/web/` is still tracked with its own `requirements.txt` and
  `requirements.lock.txt` (`streamlit>=1.40.0`, `watchfiles`).
- `test-ts` job does NOT run `npm audit` for the workspace.

## Commands you will need

| Purpose        | Command                                                       | Expected on success                                |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Audit          | `npm audit --omit=dev`                                        | 0 vulnerabilities (or documented exceptions)       |
| Bump workspace | `npm install -w admin/content-manager fastify@latest`         | exit 0, audit drops the fast-uri/find-my-way highs |
| Typecheck      | `npm run admin:typecheck`                                     | exit 0                                             |
| Tests          | `npm run admin:test`                                          | exit 0                                             |
| Workflow lint  | `node tools/ci/check-workflows.mjs` (if exists) or YAML parse | exit 0                                             |

## Scope

**In scope**:

- `.github/workflows/admin.yml` (drop `test-web` or gate it; extend
  `test-ts` with `npm audit --omit=dev`)
- `admin/web/` (archive or delete per the retirement notice — decide with
  the operator's notice text; `git rm` the tracked files)
- `admin/content-manager/package.json` + `package-lock.json` (fastify bump,
  react-router decision)
- Root `package.json`/`package-lock.json` only if undici/svgo bumps land
  there
- `docs/archive/streamlit-retirement-notice.md` — update "Files affected"
  to reflect what was actually done
- `.github/workflows/security-audit.yml` — only if it needs a documented
  exception mechanism

**Out of scope**:

- The flaky `vitest run --coverage` step (plan 076) and the e2e build time
  (plan 084) — though landing 076 before this plan keeps `test-ts` honest.
- Removing the Streamlit code from `docs/` (plan 079).
- Any storefront dependency change.

## Git workflow

- Branch: `advisor/082-resolve-admin-ci-and-dep-audits`.
- Commit per concern: `ci(admin): drop retired Streamlit test job`,
  `fix(deps): bump fastify and clear npm audit highs` —
  `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Retire the Streamlit CI job

Per the retirement notice, remove the `test-web` job from `admin.yml` and
`git rm -r admin/web` (or move to `_archive/` if the notice's archive
language wins — follow the notice text; `_archive/` is gitignored, so
deleting tracked files + keeping a copy on disk in `_archive/` is the
literal reading). Update the notice's "Files affected" section to say what
landed.

**Verify**: `grep -n "test-web" .github/workflows/admin.yml` → no match;
`git ls-files admin/web | wc -l` → 0.

### Step 2: Bump the fastify stack

`npm install -w admin/content-manager fastify@latest` — pulls patched
fast-uri/find-my-way. Then `npm audit --omit=dev` at root.

**Verify**: the fast-uri and find-my-way highs are gone; `npm run
admin:typecheck` and `npm run admin:test` exit 0.

### Step 3: Decide the react-router advisory

Read how the app uses react-router: `src/web/app/App.tsx` uses
`createBrowserRouter` from `react-router-dom` — SPA mode, no RSC. Two
acceptable outcomes:

- **Bump to 8.x** (`npm install -w admin/content-manager react-router-dom@latest`)
  — the v7→v8 API surface changes; fix compile errors (likely import
  adjustments in `App.tsx`). Preferred if the bump is clean.
- **Document the exception** — if the bump breaks the app: add a
  `security-audit.yml` allowlist mechanism (check how the workflow invokes
  audit; add `--omit` or a documented `audit-level` change with a comment
  pointing at GHSA-qwww-vcr4-c8h2 and the SPA-mode rationale) AND add an
  `npm audit --json | jq` exception note in the workflow comments.

Either way, record the decision in the commit message and in
`admin/content-manager/README.md` (plan 079 creates it).

**Verify**: `npm audit --omit=dev` → 0 high (bump path) OR the workflow
documents the single remaining exception (exception path); `npm run
admin:typecheck` + `admin:test` + `npm run admin:build:web` exit 0.

### Step 4: Gate the workspace in its own CI job

Add to the `test-ts` job (after tests): `npm audit --omit=dev` so the
content-manager workspace can't regress. If Step 3 took the exception path,
the job must tolerate the documented exception (same mechanism as the
weekly workflow).

**Verify**: `npx audit --omit=dev` from the workflow's working-directory
succeeds (run it locally from `admin/content-manager`).

### Step 5: Full verification

**Verify**: `npm run admin:validate` (typecheck + test + build + parity) —
if parity fails for pre-existing reasons (plan 056), note it and verify the
individual steps instead.

## Test plan

- No new unit tests — this is dependency/CI work. The verification is:
  `npm audit --omit=dev` → 0 high; `npm run admin:typecheck` exit 0;
  `npm run admin:test` exit 0; `npm run admin:build:web` exit 0; the
  `test-ts` job steps all runnable locally.
- Manual: `act` if available, or a dry read of the workflow YAML.

## Done criteria

- [ ] `test-web` job removed; `admin/web` not in `git ls-files`; retirement
      notice updated
- [ ] `npm audit --omit=dev` reports 0 high (or exactly one documented
      exception with a comment citing GHSA-qwww-vcr4-c8h2)
- [ ] `test-ts` includes `npm audit --omit=dev`
- [ ] `npm run admin:typecheck`, `npm run admin:test`, `npm run admin:build:web` exit 0
- [ ] `plans/README.md` status row 082 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The react-router 8.x bump produces more than import-level changes
  (report the breakage and take the exception path).
- `admin/web` deletion conflicts with an operator instruction to keep the
  Streamlit prototype runnable during the fallback window (the notice says
  retired — but if you find CI/docs that still call it active, report).
- A fastify bump breaks the server tests in ways unrelated to audit fixes.

## Maintenance notes

- The `test-ts` job now owns the workspace's dependency gate — keep it in
  sync with `admin.yml`'s other jobs (same setup action).
- If RSC mode is ever enabled in the app, the react-router exception must be
  re-evaluated (that changes exploitability).
- The retirement notice will need one more touch when plan 069 completes
  the full cutover.
