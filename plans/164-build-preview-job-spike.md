# 164 — Spike: "Build + preview" job inside the admin

- **Source**: Auditoría 10, DIR-03 · **Status**: TODO · **Priority**: P3 · **Effort**: M (spike)
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/web/app/routes/PublicationPage.tsx docs/operations/RUNBOOK.md .github/pull_request_template.md`

## Problem

The operator's core loop is edit → publish, but seeing the rendered result is a four-step manual ritual outside the app: "`npm run build` → `npx serve astro-poc/dist -l 4174` → `npm run smoke:manual`" (`RUNBOOK.md:235-240`, `SMOKE_TEST.md:9-19`), and the PR template requires a manual smoke checklist on every PR (`.github/pull_request_template.md:20`). Meanwhile the admin already has everything needed: a durable job runner (`jobRunner.ts`), a static server that serves a `dist/` directory (`app.ts:307`), and preflight checks that validate data but render no pixels (`PublicationPage.tsx:287-437` shows checkmarks, not pages).

This is a **spike/design plan**: validate feasibility, then specify the build.

## Scope

**In**: A feasibility prototype: a `build-preview` job type that shells `npm run build:fast` (child_process from the repo root — the admin already spawns git and sharp subprocesses), serves `astro-poc/dist` on a loopback port via a new read-class route reusing the containment rules (`app.ts:213-244` hardening history, plan 090/132), and returns a localhost link. Deliver: the job shape, the route spec, the UI sketch for "Build + open preview" in the publication flow, and the evidence export path (so the smoke checklist becomes in-app evidence instead of hand-typed).

**Out**: A full production implementation (the follow-up plan if the spike adopts), `npm run build` (full preflight — the preview job uses `build:fast` only; the full build stays the operator's release gate), changes to `RUNBOOK`/PR template (only after adoption).

## Steps

1. Verify the assumptions: (a) `jobRunner.ts` can run a long job without blocking the server (read `processQueue` — it's sequential; confirm a build job won't starve sync/SSE, or scope a serial queue with a status surface); (b) the static route can serve `astro-poc/dist` with the existing containment helper; (c) `build:fast` completes in a tolerable window (the audit measured the full build as slow; measure `build:fast`).
2. Prototype the job + route behind an explicit flag or in a scratch branch; run it against a real `dist/`.
3. Write the recommendation: the job spec, the route spec (path, read-class classification in `routePolicy.ts`), the UI placement, and the PR-evidence flow. Note the contention trade-off (build inside the admin consumes CPU; the dev server may contend).
4. Record the outcome in this plan's status row; if adopted, a follow-up build plan.

## Tests

- The spike's own verification: the prototype job completes, the served preview renders the built site, the route rejects path escapes (reuse `test/tools.staticServer.security.test.mjs` style assertions for the new route).
- `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Prototype job builds `astro-poc/dist` via `build:fast` and serves it on a loopback URL.
- [ ] Route containment proven (escape attempts rejected).
- [ ] Written recommendation (adopt / reject) with job spec + route spec + UI sketch.

## Maintenance

The smoke ritual is mandatory in every PR — this spike is the highest-leverage DX win available because it productizes a ritual the project already documents. A reviewer should check the prototype doesn't let the preview route serve paths outside `astro-poc/dist` (same containment class as plan 090).

## Rollback

N/A (spike — no production wiring expected; if a prototype route was added behind a flag, it is removed unless adopted).

## STOP conditions

- If `build:fast` cannot complete within a tolerable window in a temp measure, stop and report — the job design must assume a long-running async job with a status surface, not a blocking child.
