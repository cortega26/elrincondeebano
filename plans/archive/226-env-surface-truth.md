# Plan 226: Env surface truth — add the 5 missing vars, remove the 3 dead ones, fix the security claims, and guard it mechanically

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- .env.example docs/operations/QUALITY_GUARDRAILS.md docs/architecture/CODEBASE_MAP.md test/env-surface.contract.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Category**: dx/docs
- **Risk**: LOW
- **Depends on**: 223 (admin `.env.example` credential text) for a consistent story
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`.env.example:6-7` states the maintenance rule ("new `process.env.*` vars
MUST be added here in the same commit"), but the audit verified via a full
`process.env` grep that 5 live vars are missing, and 3 documented vars have
**no readers at all** while the security docs still mandate them:

- Missing: `LOG_LEVEL` (`tools/utils/logger.mjs:15`),
  `ADMIN_REMOTE_ORIGIN` (`admin/content-manager/src/server/app.ts:75`),
  `LIVE_MONITOR_BYPASS_TOKEN` (`tools/live-contract-monitor.mjs:23`),
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID`
  (`infra/cloudflare/waf/deploy-*.mjs`).
- Dead: `SYNC_API_REQUIRE_AUTH`, `SYNC_API_STRICT_STARTUP`, `SYNC_API_BASE`
  exist only in `.env.example` and docs (verified: no code reader outside
  the file). `QUALITY_GUARDRAILS.md:100` still says "`SYNC_API_REQUIRE_AUTH=true`
  y `SYNC_API_STRICT_STARTUP=true` en producción" and `CODEBASE_MAP.md:130`
  lists them as the production control — an operator following the checklist
  sets variables nothing reads, while the real control surface is the admin
  credential + `SYNC_API_TOKEN` (sync adapter/conflicts) + Cloudflare Access.

## Current state

Root `.env.example` sections; the sync block at lines 25-40 (contents
quoted above in this repo — read it before editing). `CONTRIBUTING.md:26`
tells contributors to copy the file before running "admin tools or
Cloudflare scripts" — exactly the flows whose vars are missing.

`docs/operations/QUALITY_GUARDRAILS.md:100`:
`- **Secretos:** ... "SYNC_API_REQUIRE_AUTH=true" y "SYNC_API_STRICT_STARTUP=true" en producción.`

`docs/architecture/CODEBASE_MAP.md:130`:
`| "SYNC_API_REQUIRE_AUTH=true" + "SYNC_API_TOKEN" required in production Sync API | AGENTS.md | Unauthenticated write access to product data |`

## Commands you will need

| Purpose    | Command                                            | Provenance | Expected on success |
| ---------- | -------------------------------------------------- | ---------- | ------------------- |
| Install    | `npm ci`                                           | declared   | exit 0              |
| New test   | `npx vitest run test/env-surface.contract.test.js` | declared   | all pass            |
| Full tests | `npm test`                                         | declared   | all pass            |
| Lint       | `npm run lint`                                     | declared   | exit 0              |

## Scope

**In scope**:

- `.env.example`
- `docs/operations/QUALITY_GUARDRAILS.md` (line 100 only)
- `docs/architecture/CODEBASE_MAP.md` (line 130 only; the sibling row about
  `npm ci` stays)
- `test/env-surface.contract.test.js` (create; repo-root vitest suite)

**Out of scope**:

- `admin/content-manager/.env.example` (plan 223).
- Any code change to make the dead vars live — they are dead by decision
  (Python-era sync retired); do not wire them.
- `CONTRIBUTING.md` wording (it already points at the right file).

## Git workflow

- Branch: `advisor/226-env-surface`
- Commit: `docs(env): align .env.example and security docs with reality (plan 226)`.

## Steps

### Step 0: Establish a green baseline

Install + `npm test` smoke on the root suite (`npx vitest run test/tools-logger.test.js`)
to confirm tooling works. Red → STOP.

### Step 1: Add the 5 missing vars to `.env.example`

Add, grouped with default + owning workflow (match the file's existing
comment style):

- Tools logging: `# LOG_LEVEL=info` — owning: `tools/utils/logger.mjs`
  (all tools; default info; accepts debug/info/warn/error).
- Admin remote mode: `# ADMIN_REMOTE_ORIGIN=` — owning:
  `admin/content-manager/src/server/app.ts`; warning text mirroring
  `admin/content-manager/README.md:33-49` (exact HTTPS origin; every
  `/api/v1/*` request then requires `x-admin-credential`; deny-by-default
  Cloudflare Access first).
- Live monitor: `# LIVE_MONITOR_BYPASS_TOKEN=` — owning:
  `tools/live-contract-monitor.mjs` + `.github/workflows/live-contract-monitor.yml`
  (WAF skip header; CI secret, reference only).
- Cloudflare WAF deploys: `# CLOUDFLARE_API_TOKEN=` / `# CLOUDFLARE_ZONE_ID=`
  — owning: `infra/cloudflare/waf/deploy-*.mjs`
  (`npm run cloudflare:*`); never commit real values.

Also extend the "CI-provided" section with `GITHUB_OUTPUT`,
`GITHUB_SERVER_URL`, `GITHUB_REPOSITORY` (read by tools/workflows).

### Step 2: Delete the dead sync vars

Remove the `SYNC_API_REQUIRE_AUTH` / `SYNC_API_STRICT_STARTUP` /
`SYNC_API_BASE` blocks (lines 30-37). Keep `SYNC_API_TOKEN` (live readers:
`admin/content-manager/src/server/adapters/syncAdapter.ts:79`,
`routes/conflicts.ts:143`). Add one line noting the sync target now lives in
gitignored `data/sync-config.json` (point at the admin README).

### Step 3: Rewrite the two security claims

- `QUALITY_GUARDRAILS.md:100` → replace the SYNC_API sentence with the real
  control surface: "Nunca registrar valores sensibles... El control de
  escritura del admin es la credencial de lanzamiento (`ADMIN_CREDENTIAL` /
  `data/.admin-credential` 0600) y, para sync remoto, `SYNC_API_TOKEN`
  (config en `data/sync-config.json`, fuera del repo). En modo remoto,
  Cloudflare Access deny-by-default es prerrequisito."
- `CODEBASE_MAP.md:130` → "Admin writes require the launch credential;
  remote mode requires it on every `/api/v1` request behind a
  deny-by-default Cloudflare Access policy | ADR 0011/README admin |
  Unauthenticated write access to product data".

**Verify**: `grep -rn "SYNC_API_REQUIRE_AUTH\|SYNC_API_STRICT_STARTUP" .env.example docs/` → no matches.

### Step 4: Mechanical guard

Create `test/env-surface.contract.test.js` (root vitest):

1. Collect `process.env.<NAME>` occurrences from `tools/**`, `scripts/**`,
   `astro-poc/src/**`, `admin/content-manager/src/**`, `infra/**`,
   `.github/**` (skip `node_modules`, `dist`, `*.test.*` fixtures).
2. Build the documented set from `.env.example` (both assignment lines and
   commented lines; strip `#`).
3. Allowlist for runtime-provided names: `CI_SKIP_BUILD_CONTRACT`,
   `GITHUB_*`, `npm_*`, `NODE_*`, `SOURCE_DATE_EPOCH` is documented — keep
   the allowlist explicit in the test with a comment per entry.
4. Assert every collected name is either documented or allowlisted; fail
   listing the missing names with the instruction "add it to .env.example
   (plan 204 rule)".

**Verify**: `npx vitest run test/env-surface.contract.test.js` → pass. If it
finds additional names beyond the 5, ADD them to `.env.example` in this
plan (they are the same class) and note them in the commit message.

### Step 5: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0;
`npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules'` → clean for the
two edited docs.

## Test plan

- New `test/env-surface.contract.test.js` (the guard that makes the plan-204
  rule mechanical).
- Pattern for doc-lint: existing markdownlint invocation in
  `.github/workflows/quality-gates.yml:146`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/env-surface.contract.test.js` exits 0
- [ ] `grep -n "LOG_LEVEL\|ADMIN_REMOTE_ORIGIN\|LIVE_MONITOR_BYPASS_TOKEN\|CLOUDFLARE_API_TOKEN\|CLOUDFLARE_ZONE_ID" .env.example` shows all five
- [ ] `grep -rn "SYNC_API_REQUIRE_AUTH\|SYNC_API_STRICT_STARTUP\|SYNC_API_BASE" .env.example docs/` returns nothing
- [ ] `npm test` exits 0, `npm run lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The env grep in Step 4 surfaces names that belong to vendored code or
  test-local stubs (do not document those; extend the allowlist with a
  comment instead — report the list either way).
- Any doc claim turns out to be half-true (e.g. a hidden reader for
  `SYNC_API_BASE` appears) — report instead of deleting.
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- The contract test is the enforcement for the plan-204 rule; extend the
  allowlist only with a one-line reason.
- Reviewer: confirm no real token values were pasted into `.env.example`
  (reference-only entries, empty values).
- **Deferred:** none.
