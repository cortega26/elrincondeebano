# Plan 204: Document the real env surface; fix format ignores; align Node/port story

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- .env.example admin/content-manager/README.md .prettierignore admin/content-manager/eslint.config.mjs docs/onboarding/BOOTSTRAP.md docs/onboarding/LOCAL_DEV.md scripts/dev-server.mjs`
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

Docs/example-only drift with concrete onboarding cost: `.env.example`
covers ~6 variables while the code reads ~20 (new contributors misconfigure
admin/sync/smoke/image builds and hit `PORT` collisions across storefront
E2E 8081 / admin 3000 / harnesses 3101-3104 off one shared `PORT`); the admin
README claims `.env.example` lists six variables it does not contain; `npm
run format` (`prettier --write .`) can rewrite admin `dist/reports/coverage`
trees its own ESLint already ignores (large noisy diffs mid-verification);
and version pins disagree in form (`.nvmrc 24`, Volta `24.0.0`, CI `24.x`).
No runtime change anywhere in this plan.

## Current state

Verified by advisor read:

```ini
# .env.example — only PORT, PLAYWRIGHT_*, SYNC_API_* (+ a comment naming ADMIN_CREDENTIAL).
# Missing as settable entries despite code use:
ADMIN_MODE/HOST/REPO_ROOT/ADMIN_CREDENTIAL/ADMIN_SKIP_RECOVERY_CHECK (start.ts:7-8,16,31,34,46),
SYNC_API_TOKEN (syncAdapter.ts:79, conflicts.ts:143), INCLUDE_ADMIN_PANEL (LOCAL_DEV.md:43),
SMOKE_BASE_URL (smoke-*.mjs), SKIP_IMAGE_OPT, PREFLIGHT_SKIP_OG, CFIMG_ENABLE/DISABLE,
FONTS_*, LH_SKIP_BUILD, BUILD_TIMESTAMP/SOURCE_DATE_EPOCH/BUILD_OUTPUT_DIR, PRUNE_KEEP/PRUNE_LOCATIONS
```

```md
<!-- admin/content-manager/README.md:57-60 claims .env.example lists ADMIN_MODE, PORT, HOST, REPO_ROOT, ADMIN_CREDENTIAL, SYNC_API_TOKEN — it does not -->
```

```
# .prettierignore — excludes root dist/build/coverage/reports, astro-poc/dist, astro-poc/.astro
# MISSING (but admin eslint.config.mjs:15-21 ignores them):
admin/content-manager/dist/**, reports/**, coverage/**, playwright-report/**, test-results/** (+ build-determinism-a|b)
```

```
# versions: .nvmrc 24 / .node-version 24 / .tool-versions "nodejs 24" / engines >=24 <25 + Volta 24.0.0 / CI 24.x / BOOTSTRAP "nvm use 24"
# ports: dev-server.mjs:13 defaults 8080, .env.example documents 8081, LOCAL_DEV shows 8080 + 4173, admin start.ts 3000, harnesses 3101/3102 off shared PORT
```

Conventions: `.env.example` is the documented contract ("See .env.example
for the full variable list"); doc-ownership rules in
`docs/operations/DOCUMENTATION.md` apply to onboarding edits.

## Commands you will need

| Purpose   | Command                                                             | Provenance | Expected on success                                                  |
| --------- | ------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| Check     | `npx prettier --check .` (before/after)                             | declared   | fewer/identical checked files; no source reformatting beyond ignores |
| Docs lint | `npx markdownlint-cli2 'docs/**/*.md' '*.md'` (per START_HERE rule) | declared   | exit 0                                                               |

## Scope

**In scope**: `.env.example` entries, admin README env list, `.prettierignore`
mirrors, version/port doc alignment (BOOTSTRAP/LOCAL_DEV/`.nvmrc` family —
coordinate the Volta decision with plan 200's Step 5: whoever lands first
wins, the other reconciles).

**Out of scope**: changing any default/port/pin value (document only);
`CONTRIBUTING`/CLAUDE rewrites (plan 205); runtime code (none).

## Git workflow

- Branch: `advisor/204-env-format-versions`
- Commit per area (env → format → versions/ports).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Prove the gaps (no changes)

- `grep -rhoP "process\.env\.[A-Z_]+" admin/content-manager/src astro-poc/src tools scripts | sort -u` vs `.env.example` entries — record the missing set.
- `npx prettier --check .` — record whether admin generated trees get touched.

**Verify**: gaps recorded; otherwise STOP (premise stale).

### Step 1: Complete .env.example + fix admin README claim

Add grouped, commented entries for every variable from Step 0 with defaults
and owning workflow (Playwright/E2E, admin, sync, smoke, images, fonts,
lighthouse, determinism, prune). Correct the admin README env list to match
(or point it at `.env.example` as the single contract — prefer the pointer).

**Verify**: every `process.env.*` from Step 0 is now documented or
explicitly internal (record which are internal and why).

### Step 2: Mirror ESLint ignores into .prettierignore

Add the admin generated trees (+ `build-determinism-a|b`) to
`.prettierignore`, mirroring `admin/eslint.config.mjs:15-21`. Re-run
`--check` to prove no source file was intentionally formatted under those
trees (if one was, keep formatting it explicitly and note the exception).

**Verify**: `--check` output shows the trees excluded; no source diff churn.

### Step 3: One version story + port table (docs only)

Choose exact-vs-range once (align `.nvmrc`/`.node-version`/Volta/CI/
BOOTSTRAP — same decision as plan 200 Step 5; check its status first and do
not contradict it). Publish a single port table (storefront dev, E2E, smoke,
admin, harnesses) with per-service overrides replacing the shared-`PORT`
confusion, in LOCAL_DEV (and link from BOOTSTRAP). Change NO values.

**Verify**: markdownlint green; tables consistent across files.

## Test plan

- No product tests. Proof: env-coverage grep clean, prettier check,
  markdownlint green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Every code-read env var documented in `.env.example` (or recorded internal).
- [ ] Admin README env claim matches reality.
- [ ] `.prettierignore` covers the admin generated trees; `--check` clean.
- [ ] Single version story + port table present and consistent (or explicit
      pointer to plan 200's decision if it landed first).
- [ ] markdownlint exits 0 on touched docs.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A variable's default/owner cannot be determined from code (mark UNKNOWN,
  do not guess values).
- Plan 200 already decided versions/ports differently (reconcile to it;
  do not create a second story).
- `--check` reveals source files that DEPEND on formatting under ignored
  trees (report; do not silently unformat them).

## Maintenance notes

- New env vars MUST be added to `.env.example` in the same commit (header
  comment rule in `.env.example`).
- The `.prettierignore` ↔ ESLint-ignores pair must stay in sync — note the
  coupling in both files.
- Reviewer: spot-check 3–4 variable defaults against the code cited.
- **Deferred:** per-service `PORT_*` overrides in code (docs first; code only
  on real collision evidence).
