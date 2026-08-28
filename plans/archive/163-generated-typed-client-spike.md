# 163 — Spike: generate the typed API client from the OpenAPI/zod contract

- **Source**: Auditoría 10, DIR-02 · **Status**: DONE · **Priority**: P3 · **Effort**: M (spike)
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/web/api/client.ts admin/content-manager/src/server/openapi.ts admin/content-manager/test/contract/openapi.test.ts docs/operations/DEPENDENCY_POLICY.md`

## Problem

Plan 127 F2.3 generated the OpenAPI doc from zod and added a contract test — but the client is still hand-written (`client.ts`, 34 methods), and shape drift has now recurred three times (plan 115's dead methods, the missing `publishAt`, and plan 133's misdocumented shapes). The contract test validates only _path coverage_ (client routes ⊆ OpenAPI paths); it cannot catch a missing request field. Every new endpoint requires touching client + doc + test by hand, and the failure mode is a silent 422 in production.

The F2.3 investment should _prevent_ drift, not just detect it after the fact.

## Scope

**In**: This is a **spike/design plan** — its deliverable is a decision + prototype, not a full rewrite. Deliverables: (1) a dependency-policy-compliant tool evaluation (zodios vs openapi-fetch vs a hand-rolled minimal generator), (2) a working prototype for ONE client method end-to-end, (3) a written recommendation (adopt / reject) with the migration shape for `client.ts`, and (4) if rejected, the fallback: extend the contract test to compare request _shapes_ (per plan 133) so drift is caught.

**Out**: A full migration of `client.ts` (that is the follow-up if the spike adopts), changes to `DEPENDENCY_POLICY.md` (only the RFC note, per its own process).

## Steps

1. Read `docs/operations/DEPENDENCY_POLICY.md` and apply its evaluation gates to the candidates (zodios — schema-authoring; openapi-fetch — schema-consumption, needs the doc to be accurate, which plan 133 just made it). Note the repo constraint: no runtime dep without a wave-3 RFC; the generated client must stay in the browser bundle (leaf zod schemas only — the `extendZodWithOpenApi` comment in `openapi.ts:39-47` already documents this constraint).
2. Prototype one method (e.g. `listProducts` or `publish`) through the chosen generator: generate types from `openapi.json`, call the route, handle the envelope + 409 `ApiRequestError` semantics the current client guarantees. Assert the prototype passes the existing contract test's shape checks.
3. Write the recommendation: adoption costs (touch every call site, generate step in the build), benefits (drift class eliminated), and the exact fallback if rejected (shape-assertion extension of `test/contract/openapi.test.ts`).
4. Record the outcome in this plan's status row in `plans/README.md` and, if adopted, a follow-up plan for the full migration.

## Tests

- The spike's own verification: the prototype method satisfies the plan-133 shape assertions; `npm run admin:test` green with the prototype wired in only if trivial (prefer a separate prototype file not imported by the app).
- `npm run admin:typecheck` + `npm run lint` green.

## Done criteria

- [ ] Tool evaluation written against DEPENDENCY_POLICY gates.
- [ ] One working prototype method (types generated from `openapi.json`, real request round-trip).
- [ ] A written adopt/reject recommendation with migration shape or the shape-assertion fallback.

## Maintenance

This is the strategic response to a drift class the repo has hit three times. Whatever the decision, plan 133's shape assertions must remain the permanent guard. A reviewer should check the prototype doesn't weaken the client's redaction/error semantics (plan 057's token-redaction posture lives in `client.ts` today).

## Rollback

N/A (spike — no production code expected to change; if a prototype file was added, it is removed or kept behind an explicit flag).

## STOP conditions

- If the DEPENDENCY_POLICY hard-rejects all candidates (no dependency may be added for this), do NOT force it — deliver the fallback (shape assertions) as the recommendation.
