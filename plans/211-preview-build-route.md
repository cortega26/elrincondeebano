# Plan 211 (spike→build): Wire the proven build+preview job into publication flow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/services/previewBuild.ts admin/content-manager/src/server/prototype/previewRoute.ts admin/content-manager/src/server/security/routePolicy.ts admin/content-manager/src/web/app/routes/PublicationPage.tsx docs/operations/RUNBOOK.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/198-god-module-slice-1.md (prototype-file coordination)
- **Category**: direction
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters (product value)

The operator's core loop (edit → see rendered result) is still a manual
four-step ritual outside the app (`build` → `serve dist` → `smoke:manual` →
hand-typed checklist per RUNBOOK:235-240 + PR template:20) while the spike
(verdict ADOPT, `build:fast` measured ~3.3 s) plus a production-shaped
`runPreviewBuild`/`schedulePreviewBuild` already exist — only one route file
stands between "checkmarks, not pages" preflight and real pixels plus
downloadable PR evidence. Risk is serial-queue contention (~3 s occupying
the single worker) and loopback-only serving under the plan-090 containment
invariants — both mitigated in the spec below.

## Current state (evidence, verified by advisor)

- `plans/archive/164-spike-build-preview-recommendation.md:5-6` — verdict
  ADOPT with §3 job/route/UI spec (read it fully first — it IS the build
  spec, not background).
- `previewBuild.ts:1-172` — production-shaped service (spawns
  `build:fast`, timeout 120 s, stdout/stderr slices; verified lines 25–40,
  100–120).
- `server/prototype/previewRoute.ts:6,99` — route under `prototype/`,
  unwired (zero non-prototype importers — grep-verified).
- RUNBOOK:235-240 + `.github/pull_request_template.md:20` — the manual
  ritual this absorbs.

Conventions: plan-090 path containment for served preview output;
`routePolicy.ts` classification for the new route (preview-that-writes?
classify honestly per plan 180's rule); `jobRunner` single-flight +
disabled-while-running button; `PublicationPage.tsx` (718 lines) hosts the
UI block. Full `npm run build` stays the release gate (preview is
pre-verification, not a substitute).

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**: move `prototype/previewRoute.ts` → `routes/` behind
`PREVIEW_BUILD_ENABLED` flag; `POST /preview/build` + `GET /preview/*`
with containment tests; PublicationPage "Build + abrir vista previa" block
with evidence export; route-policy classification.

**Out of scope**: replacing `npm run build` as the release gate; public
(non-loopback) preview serving; build-log streaming UI (poll the job like
other jobs); deleting the prototype dir (plan 198 owns leftovers —
coordinate).

## Git workflow

- Branch: `advisor/211-preview-build-route`
- Commit per slice (route → policy+tests → UI).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Read the spike + coordinate

Read the §3 spec end-to-end. Check plans 184 (job path-scrub verdict) and
198 (prototype ownership) status — adopt their outcomes, don't re-decide.
Baseline green or STOP.

### Step 1: Flag-gated route with containment

Move the route to `routes/`, gate on `PREVIEW_BUILD_ENABLED`, classify in
`routePolicy.ts` (justify preview vs mutation in a comment — it triggers
compute + writes preview dist; plan 180's rule says writes ⇒ mutation… or
argue temp-dist is scratch; record the call explicitly). Containment tests:
preview serves ONLY the preview dist root (segment-contained, plan-090
style), single-flight (second build while running → 409/busy, button
disabled state has a server truth to read).

**Verify**: typecheck + new containment tests green.

### Step 2: PublicationPage block + evidence export

"Build + abrir vista previa" block: trigger, progress (poll job), open
preview (loopback URL), download evidence bundle for PR attachment
(replacing the hand-typed checklist for preview-verified changes — update
the PR template line ONLY if the operator confirms; otherwise leave the
template and note the proposal).

**Verify**: typecheck + web tests green; manual loop verified locally once
(record the local proof — E2E for this stays optional).

## Test plan

- Containment tests (escape attempts → 403/404, busy → 409), policy test
  (flag off → 404/disabled; unauthenticated non-loopback → 401).
- UI block tests (harness pattern: disabled-while-running, evidence link).
- Verification: full `npm run admin:test` green + one local end-to-end loop.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] Containment + policy + UI tests pass.
- [ ] One local edit→preview loop proven and recorded.
- [ ] Full `npm run build` still the release gate (untouched).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Containment cannot reuse the plan-090 helpers (report; do not invent a
  second containment model).
- Serial-queue contention blocks other jobs unacceptably in practice
  (measure; if bad, scope down to off-hours/manual-trigger only and report).
- Plan 198 already moved/deleted the prototype file (reconcile; don't
  double-edit).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- If preview builds get slow, the knob is the flag + queue priority, not a
  second worker (single-operator assumption).
- Reviewer: verify loopback-only serving explicitly (no LAN exposure of
  preview dist).
- **Deferred:** build-log streaming; public share-links for preview (needs
  an auth model that doesn't exist).
