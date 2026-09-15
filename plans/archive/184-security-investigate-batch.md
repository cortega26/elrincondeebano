# Plan 184: Security hardening investigate-batch (serialization, CSV, headers, apex, jobs, holder, media prefix)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/lib/serialization.ts admin/content-manager/src/server/routes/importRoutes.ts admin/content-manager/src/server/app.ts infra/cloudflare/edge-security-headers/wrangler.toml admin/content-manager/src/server/services/previewBuild.ts admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/web/app/credentialStore.ts admin/content-manager/src/server/repositories/mediaRepository.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: security
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Seven LOW-confidence hardening candidates from the deep audit. None is
proven reachable (loopback-only admin, no HTML-sink reflection found,
defense layers already present), so this plan investigates each and fixes
only what reproduces — with a verdict per item recorded in the commit
messages. Do NOT ship speculative hardening that changes behavior without
evidence; several items' correct outcome is "accepted risk, documented."

## Current state

Candidate locations (all verified by advisor read unless noted):

1. `astro-poc/src/lib/serialization.ts:1-3` —
   `JSON.stringify(value).replace(/<\//g, '<\\/')`. Sinks:
   `pages/index.astro:183`, `pages/combos.astro:54` (experience data),
   `components/StructuredData.astro:191` (JSON-LD). No reflection through an
   HTML sink was found (names flow via `textContent`) — defense-in-depth only.
2. `importRoutes.ts` `escapeCsv` (quotes on `,[",\n\r]` only) — formula
   injection on export-open; needs operator-workflow confirmation.
3. `app.ts:330-339` `onSend` CSP (`default-src`/`script-src` self,
   `style-src` self+unsafe-inline, nosniff/DENY/referrer) vs
   `tools/security-header-policy.mjs:20-38` public baseline (adds
   `object-src`, `base-uri`, `frame-ancestors`).
4. `infra/cloudflare/edge-security-headers/wrangler.toml:5-7` — worker routes
   cover only `www.*`; whether apex serves HTML directly is unverified.
5. `previewBuild.ts:105-116` job result embeds up to 2000 chars of
   stdout/stderr (paths included) → `GET /jobs/:id` is class `read`
   (`routePolicy.ts:107`).
6. `credentialStore.ts:8` — credential in `localStorage` under fixed key,
   loaded on start, stored indefinitely.
7. `mediaRepository.ts:197-200` — `if (!absPath.startsWith(this.repoRoot))`
   prefix check vs shared `isContainedWithin` (`shared/identity.ts:70-78`).

Conventions: keep every fix additive and loopback-safe; add assertions to
the existing security-headers integration test where headers change; never
paste secret values anywhere (locations + types only).

## Commands you will need

| Purpose   | Command                                         | Provenance | Expected on success |
| --------- | ----------------------------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                                        | declared   | exit 0              |
| Typecheck | `npm run typecheck` + `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm test` (root) + `npm run admin:test`        | declared   | all pass            |

## Scope

**In scope**: investigate all 7; fix ONLY items that reproduce with a test
proving it. One commit per fixed item; one summary commit for verdicts.

**Out of scope**: any behavior change without a reproducing test; apex DNS
changes (report only); session-store migration without owner sign-off
(record recommendation instead).

## Git workflow

- Branch: `advisor/184-security-investigate-batch`
- See Scope; e.g. `fix(admin): use segment containment in media backstop (plan 184)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

Install + typechecks + both suites unmodified. Green or STOP.

### Step 1: Investigate each item, fix only what reproduces

1. **Serialization**: write a hostile-catalog-string test against
   `safeScriptJSON` (`<script`, `<!--`, `-->`, U+2028/29). If anything raw
   survives → extend escaping (`<`, `>`, `&`, U+2028/29) centrally + keep
   the test. If nothing survives → record "sufficient", no change.
2. **CSV formula**: confirm with the operator workflow whether exports open
   in formula-evaluating spreadsheets. Only with confirmation: prefix-sanitize
   cells starting with formula introducers + export unit test. Without:
   record "accepted risk".
3. **Admin headers**: check no admin view uses `<object>`/`<base>`; if clean,
   add `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` +
   assert in the security-headers test. If anything relies on them, record
   and skip.
4. **Apex**: probe what apex `/` returns today (redirect vs HTML). If HTML
   without edge headers → report (do NOT change DNS/worker routes here;
   file the edge change as follow-up). If redirect → record "covered".
5. **Job path scrub**: check which job types embed absolute paths; apply the
   doctor/media-job scrub convention (repo root → basename) to job
   result/error strings before persistence + test asserting no absolute
   path survives `GET /jobs/:id`. If no job type embeds paths → record.
6. **Credential holder**: recommend (do not implement without need):
   sessionStorage/memory holder vs localStorage persistence. Implement ONLY
   if the owner confirms in this session; otherwise record the accepted-risk
   note with rotation guidance.
7. **Media prefix**: swap to `isContainedWithin` + add a sibling-prefix unit
   case (`data/.media-staging2` vs root `data/.media-staging` shape). This
   one is safe to just do (behavior-preserving for accepted paths, covered
   by media validation tests).

**Verify** after each fix: relevant suite green.

## Test plan

- New unit cases only for items that reproduce (serialization, headers,
  job scrub, media prefix are the likely ones).
- Verdicts for non-reproducing items recorded in commit messages + the
  plans/README row note.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Both typechecks + both suites exit 0.
- [ ] Every one of the 7 items has a recorded verdict (fixed + test, or
      documented accepted-risk / needs-owner-input).
- [ ] No behavior change exists without a proving test.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated (note which items fixed).

## STOP conditions

Stop and report back (do not improvise) if:

- Any location does not match Current state (drift).
- A fix requires DNS/worker/UX-owner decisions (apex routes, session-store
  migration, CSV workflow) — record and move on, do not decide unilaterally.
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Re-audit rule: these 7 must not be re-reported as findings without new
  evidence — the verdicts here are the record.
- Reviewer: check each "accepted risk" verdict is genuinely low-exposure
  (loopback/admin-only) and not hand-waving.
- **Deferred:** apex edge-route change (only if item 4 proves HTML served
  without headers); session holder migration (only on owner sign-off).
