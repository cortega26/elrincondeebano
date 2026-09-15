# Plan 214 (spike): Adopt incremental typed-client generation for new endpoints

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/web/api/client.ts admin/content-manager/src/web/api/__prototype__/ admin/content-manager/src/server/openapi.ts admin/content-manager/test/contract/openapi.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M (spike + two-endpoint pilot)
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/192-web-contract-coverage.md, plans/197-client-fetch-layering.md (prototype-file coordination)
- **Category**: direction
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters (product value)

Every new endpoint today requires hand-touching client + OpenAPI doc + test
with a silent-422 failure mode — and drift already recurred three times
(dead methods, missing `publishAt`, misdocumented shapes). Spike 163's
written verdict is explicit: REJECT full rewrite, ADOPT fallback + reserve
hand-rolled generation for new endpoints, with a working prototype proving a
missing `publishAt` becomes a compile error. This spike wires that
incremental path (dev-only codegen, zero runtime deps, zero call-site churn)
and pilots it on two new/changed methods — capturing the compile-time
guarantee where drift actually enters, without the wave-3 runtimeRFC cost.

## Current state (evidence, verified by advisor)

- `plans/archive/163-spike-evaluation.md:89-113` — verdict REJECT-full /
  ADOPT-fallback + incremental; §6 migration shape (read fully first).
- `web/api/__prototype__/{typedClient.prototype.ts, openapi.d.ts}` —
  working prototype (missing `publishAt` ⇒ compile error); ZERO importers
  outside prototype dirs (grep-verified); duplicates `request()` +
  `ApiRequestError` (plan 197 owns dedup — coordinate).
- `web/api/client.ts:296-778` — ~34 hand-written methods.
- Contract test carries the `publishAt` shape assertion as the permanent
  guard; `openapi.ts` (+ `routes/openapi.ts`) serves the single-source
  zod→OpenAPI doc (plan 150 memoizes it; plan 133 aligned it).

Conventions: types erase at build (no bundle change); no new runtime dep
(`openapi-fetch`/`zodios` need a wave-3 RFC per DEPENDENCY_POLICY — this
plan stays dev-only precisely to avoid it); `client.ts` remains the
delegating shim during the pilot (facade stability per plan 197).

## Commands you will need

| Purpose   | Command                                                         | Provenance | Expected on success                    |
| --------- | --------------------------------------------------------------- | ---------- | -------------------------------------- |
| Install   | `npm ci`                                                        | declared   | exit 0                                 |
| Typecheck | `npm run admin:typecheck`                                       | declared   | exit 0                                 |
| Tests     | `npm run admin:test`                                            | declared   | all pass                               |
| Codegen   | `npx openapi-typescript <doc> -o <out>` (dev-only step to wire) | declared   | generates `__generated__/openapi.d.ts` |

## Scope

**In scope**: dev-only codegen step emitting `__generated__/openapi.d.ts`;
two new/changed methods migrated to the prototype wrapper pattern behind
the `client.ts` shim; CI freshness check (generated file current or build
fails); prototype-dir disposition (adopted-into-generated vs deleted).

**Out of scope**: migrating the ~34 existing methods (explicitly rejected by
the spike — no call-site churn); any runtime client library; changing the
zod→OpenAPI source (single-source stays).

## Git workflow

- Branch: `advisor/214-incremental-typed-client`
- Commits: codegen wiring → pilot method 1 → pilot method 2 → prototype
  disposition.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + coordination

Green suite. Check plans 197/198 status for prototype-file ownership (if
197 already deleted the duplicate `request()`, build on that; if 198
deleted the dir, restore-from-git what this pilot needs and note it).

**Verify**: green; file ownership clear; otherwise STOP.

### Step 1: Wire dev-only codegen

Add the `openapi-typescript` dev-step (pinned version per DEPENDENCY_POLICY;
dev-only so no RFC needed — verify that reading of the policy and cite it)
emitting `__generated__/openapi.d.ts` from the served doc (or the builder —
whichever the spike §6 names; the doc must be the single source either
way). Add the CI freshness check (regenerate + `git diff --exit-code` on
the generated file, or the repo's equivalent contract-test style).

**Verify**: typecheck green; freshness check fails when the doc changes
without regen (prove once, revert the probe).

### Step 2: Pilot two methods

Migrate two new/changed methods to the wrapper pattern (pick methods with
recent drift history if any — else the next two touched by other plans).
`client.ts` delegates (shim, no call-site churn). Keep the shape assertions
as the permanent guard (they catch what types can't: runtime envelope
drift).

**Verify**: typecheck + full suite green; git diff shows no caller changes.

### Step 3: Dispose the prototype

Prototype dir either graduates (its pattern is now THE pattern — delete the
duplicates per plan 197's rule, keep a pointer comment) or is deleted (if
the pilot supersedes it). No third state (no permanent `__prototype__/`).

**Verify**: no `__prototype__/` (or a documented pointer only); suite green.

## Test plan

- Freshness check (proven by one intentional drift + revert).
- Pilot methods covered by existing integration tests (plan 192's pins) —
  they must pass unchanged (proving the shim is transparent).
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Codegen step wired (dev-only, pinned) + freshness check proven.
- [ ] Two methods on the wrapper pattern; zero caller diffs.
- [ ] Shape assertions retained as runtime guard.
- [ ] Prototype dir resolved (graduated or deleted, no limbo).
- [ ] `npm run admin:typecheck` + `npm run admin:test` exit 0.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- DEPENDENCY_POLICY actually requires an RFC even for the dev-only tool
  (report the clause; do not install without it).
- The wrapper pattern cannot cover the pilot methods without caller-visible
  changes (the spike's premise is wrong for these — pick others or report).
- Plan 197/198 already resolved the prototype files incompatibly
  (reconcile; don't double-edit).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New endpoints use the wrapper pattern from day one (header-comment rule
  in `client.ts`); old methods migrate opportunistically (touch-it-adopt-it),
  never in bulk.
- Stale generated snapshots fail CI by design — when the freshness check
  fires, regen, don't hand-edit the generated file (comment at its top).
- Reviewer: confirm zero runtime deps added (lockfile diff must show only
  the dev tool).
- **Deferred:** full migration (rejected by design — this plan is the
  steady state, not a stepping stone).
