# Plan 243: Decompose `createApp()` — config, lifecycle, and one route-registration table

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/server/app.ts admin/content-manager/src/server/routes/registerRoutes.ts`
> If `app.ts` changed (plans 223/229 edit it), re-read and adapt; any
> unexplained divergence is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: 223, 229 (they edit `app.ts`/route files first)
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`app.ts:72-529` — a 457-line `createApp()` holding Fastify setup, CORS/
security, credential bootstrap, repo/service construction, the 60 s sync
interval and **18 route registrations** (`:150-166` buries the timer
lifecycle mid-function). It is the second-most-churned file in the repo
(26 commits since 2026-07); every new module re-edits it (comms = 9 lines
in plan 217) and reviewers cannot diff intent because boot, wiring and
registration are interleaved. Extracting a typed registration module leaves
`createApp` as config + lifecycle.

## Current state

Read `admin/content-manager/src/server/app.ts` in full before editing.
Landmarks: `export function createApp(opts?: AppOptions): FastifyInstance`
at `:72`; route `app.register(...)` blocks inline; global `preHandler`
credential gate (from plan 223, a `!remoteOrigin &&` health exemption);
sync interval + `onClose` around `:150-166`; the `createApp({ repoRoot: tmp })`

- `app.inject` test convention across `test/contract/*` and
  `test/integration/*`.

## Commands you will need

| Purpose      | Command                                                                                                                                    | Provenance | Expected on success |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install      | `npm ci`                                                                                                                                   | declared   | exit 0              |
| Typecheck    | `npm run admin:typecheck`                                                                                                                  | declared   | exit 0              |
| Admin tests  | `npm run admin:test`                                                                                                                       | declared   | all pass            |
| Boundary net | `npx vitest run test/integration/writeBoundary.test.ts test/contract/routePolicy.test.ts test/integration/startServer.test.ts` (cwd admin) | declared   | all pass            |
| E2E smoke    | `npm run admin:test:e2e`                                                                                                                   | declared   | pass                |

## Scope

**In scope**:

- `admin/content-manager/src/server/app.ts`
- `admin/content-manager/src/server/routes/registerRoutes.ts` (create)

**Out of scope**: route handler bodies, services, hooks' semantics.

## Git workflow

- Branch: `advisor/243-createapp`
- Commit: `refactor(admin): extract route registration from createApp (plan 243)`.

## Steps

### Step 0: Baseline

Install + admin tests + the boundary net files. Red → STOP.

### Step 1: Define `AppDeps`

From what the registrations actually close over, define a single typed
object (`repos`, `services`, `repoRoot`, `enableWrites`,
`launchCredential`, `remoteOrigin`, preview flags, `logger`, …). No `any`;
`grep -c "any"` on the new file should be 0 (except documented).

### Step 2: Move the registrations

Create `registerRoutes(app: FastifyInstance, deps: AppDeps): void` with the
18 `app.register(...)` calls in the **same order**. Preserve:

- plugin prefixes/encapsulation,
- the conditional registrations (flag-gated preview routes),
- `await`-ability: if `createApp` currently awaits registrations, make
  `registerRoutes` async and await it identically.

Hold the global `preHandler` and sync-interval/`onClose` in `createApp`
(hooks are lifecycle, not routes).

**Verify**: `npm run admin:typecheck` → exit 0; `npm run admin:test` → all
pass; boundary net → all pass.

### Step 3: Route availability proof

Run `test/contract/routePolicy.test.ts` + the operator e2e suite; they
enumerate every route and would fail if registration order/prefix broke.

**Verify**: both green.

### Step 4: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `wc -l admin/content-manager/src/server/app.ts` ≤ 220
- [ ] `grep -c "app.register" admin/content-manager/src/server/routes/registerRoutes.ts` = 18 (or the count you verified at HEAD)
- [ ] `npm run admin:test` exits 0; routePolicy + writeBoundary green
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A registration cannot move without changing execution order or
  encapsulation (report the route and the coupling).
- Any integration test fails after the move for an ordering reason.

## Maintenance notes

- New routes register in `registerRoutes.ts`; `createApp` only wires
  lifecycle.
- Reviewer: diff the registration list one-by-one against HEAD; ordering
  is the contract.
- **Deferred:** splitting `AppDeps` construction itself (future, if it
  grows).
