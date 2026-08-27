# 162 — Scheduled publication UI (finish plan 127 F3.1)

- **Source**: Auditoría 10, DIR-01 · **Status**: DONE · **Priority**: P3 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/web/api/client.ts admin/content-manager/src/web/app/routes/PublicationPage.tsx admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/server/openapi.ts`

## Problem

Plan 127 F3.1 shipped **server-side only**: the operator cannot schedule, see, reschedule, or cancel a publication from the UI. The headline operations feature is curl-only.

Server supports scheduling fully: `publication.ts:151-164` validates `publishAt` (422 for past dates) and `:254-255` calls `jobRunner.scheduleAt`. But:

- The typed client can't send it — `client.ts:510-518` `publish(commitMessage, push)` has no `publishAt`.
- `PublicationPage.tsx` has no date input (only "Commit" / "Commit + Push", `:480-493`).
- There is no way to enumerate pending jobs: only `GET /jobs/:id` and `POST /jobs/:id/cancel` (`publication.ts:272,294`), and the Cancel button renders only when `job.status === 'running'` (`PublicationPage.tsx:494`) — a pending scheduled job can never be cancelled.
- The OpenAPI doc even omits the publications request body (`openapi.ts:309-314`).

Known limitation to surface: `JobRunner` is in-memory (jobRunner.ts) — a scheduled job only fires if the admin process is running at that moment. The UI must say this, not let the operator discover it.

## Scope

**In**: `admin/content-manager/src/server/routes/publication.ts` (add a job-list route: `GET /jobs` returning id/type/status/progress/started_at/scheduled info — jobRunner already holds the data), `admin/content-manager/src/server/services/jobRunner.ts` (only if a "scheduled for" field needs exposing; keep it minimal), `admin/content-manager/src/web/api/client.ts` (`publish(..., publishAt?)` + `listJobs()` + existing cancel), `PublicationPage.tsx` (datetime input + pending-jobs list with working Cancel + the "admin must be running" notice), `admin/content-manager/src/server/openapi.ts` + its contract test (declare the new route/body per plan 133's shape rules).

**Out**: Actual restart-persistence of scheduled jobs (that is a follow-up design decision; document the limitation in the UI instead), the route-policy classification (the new GET is a read; confirm `routePolicy.ts` covers `/jobs`).

## Steps

1. Spike first (small, same plan): confirm job persistence semantics — read `jobRunner.ts` and verify a scheduled job does NOT survive restart (it is in-memory; confirm there is no job store on disk). Document the finding in the UI copy.
2. Add `GET /api/v1/jobs` (pending/running list, minimal fields) and register it; update `routePolicy.ts` to classify it as read; declare it in `openapi.ts`.
3. Client: `publish(commitMessage, push, publishAt?)` sends `publishAt` when provided; `listJobs()`; verify `cancelJob` already exists.
4. `PublicationPage.tsx`: datetime-local input on the publish form (disabled when empty = immediate); a "Programadas/pendientes" section listing pending jobs with a working Cancel (extend the running-only condition to `pending`); the "el admin debe estar corriendo a la hora programada" notice.
5. Tests: client contract (`openapi.test.ts` shape assertions per plan 133), a web component test (harness pattern) for the date input → `publish` called with `publishAt`, and the pending-job cancel flow; integration test for `GET /jobs`.

## Tests

- Integration (`test/integration/publication.test.ts` pattern): schedule with `publishAt`, `GET /jobs` shows it pending, cancel it → `GET /jobs/:id` status `cancelled`, and it does not fire (advance past due time — injectable clock exists in `jobRunner.test.ts`).
- Web: `test/web/` harness — datetime input renders, submit sends `publishAt`.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Operator can schedule, list, and cancel a pending publication from the UI.
- [ ] The restart limitation is surfaced in the UI.
- [ ] `GET /jobs` registered + classified in routePolicy + declared in OpenAPI (shape-asserted per plan 133).
- [ ] `npm run admin:test` green.

## Maintenance

The in-memory JobRunner is the design constraint: if scheduled publication becomes load-bearing, restart-persistence (a durable job store) is the follow-up. A reviewer should confirm the job-list route returns no internal fields beyond the UI's needs (queue internals stay server-side).

## Rollback

`git revert <sha>`.

## STOP conditions

- If `jobRunner` DOES persist jobs across restart (the spike contradicts the assumption), stop and report — the UI limitation copy and the design both change.
