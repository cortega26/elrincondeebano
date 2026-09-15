# Plan 212 (spike): Make scheduled publication survive admin restarts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/server/services/recoveryJournal.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (spike; build follows on ADOPT)
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: direction
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters (product value)

The headline operations feature (schedule → list → cancel from the UI,
plan 162) silently dies on restart or deploy — jobs live in a `Map` +
`setTimeout`, `shutdown()` cancels pending timers, and the UI itself warns
"el admin debe estar corriendo". The operator learns a scheduled publish
never fired only by noticing the site didn't change: the worst failure mode
for a publishing tool. Plan 162 names restart-persistence as its explicit
follow-up. This spike designs the durable outbox (shape, overdue policy,
clock semantics) and prototypes one restart round-trip; it does not ship
persistence.

## Current state (evidence, verified by advisor)

```ts
// jobRunner.ts:22-23,61-94 — in-memory Map + setTimeout; scheduleAt defers in memory (injectable clock, plan 127 F3.1)
// jobRunner.ts:179-195 — shutdown() clears timers, cancels pending
// publication.ts:151-164 validation + :264 scheduleAt wiring (plan 162) + UI notice
// plans/archive/162-scheduled-publication-ui.md:17,48 — restart-persistence named as follow-up
```

Conventions: single-operator loopback scope (keeps the design small);
`recoveryJournal.ts` exists (candidate neighbor for the outbox — evaluate,
don't assume); injectable clock makes restart simulation testable;
idempotency with the publication job is mandatory (never double-publish
after a crash).

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success                                        |
| --------- | ------------------------- | ---------- | ---------------------------------------------------------- |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0                                                     |
| Tests     | `npm run admin:test`      | declared   | all pass (spike adds throwaway tests only, reverted after) |

## Scope

**In scope**: durable-outbox design (store shape, overdue/missed-fire
policy, clock semantics), one restart round-trip prototype (scratch,
reverted), verdict + build-plan sketch.

**Out of scope**: shipping persistence; multi-node scheduling; cron
expressions (single `publishAt` per job is the shipped surface — keep it).

## Git workflow

- Branch: `advisor/212-durable-schedule-spike`
- One commit with the design record; prototype reverted before committing
  (report-only spike).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + read the shipped surface

Green suite. Read plan 162's file + `jobRunner` + `recoveryJournal` fully.
Reproduce the loss once (schedule 60 s out, restart/inject shutdown, show
it never fires) as the spike's Exhibit A — with the injectable clock and/or
a real restart, whichever is honest.

**Verify**: loss reproduced and recorded; otherwise STOP (premise wrong).

### Step 1: Design the outbox

Decide and record: store shape (minimal durable outbox — e.g. gitignored
JSON journal beside the recovery journal vs reusing `recoveryJournal.ts` —
compare crash-atomicity needs); overdue/missed-fire policy (fire-late vs
skip-stale with operator notice — recommend with reasoning); clock
semantics (wall vs monotonic across restarts); idempotency key binding the
scheduled job to exactly-once publication; UI surfacing for
recovered/missed schedules.

### Step 2: Prototype one restart round-trip

Scratch implementation: schedule → persist → simulate restart (new
JobRunner + reload) → fires exactly once. Then REVERT the prototype
(report-only). If the prototype reveals the design is wrong, revise the
design (that IS the spike working).

**Verify**: round-trip log recorded; tree clean of prototype code.

## Test plan

- Spike: throwaway round-trip proof (reverted). The follow-up build plan
  gets real tests (restart simulation via the injectable clock as a
  permanent fixture).
- Verification: suite green on the clean tree.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Loss reproduced (Exhibit A recorded).
- [ ] Design record committed: store shape, overdue policy, clock
      semantics, idempotency binding, UI surfacing, build-plan sketch with
      effort re-estimate.
- [ ] Prototype reverted (diff shows no prototype code).
- [ ] `npm run admin:test` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The loss does NOT reproduce (schedules already survive somehow — report
  the mechanism; the premise is wrong).
- Durability requires a second state file with crash-recovery semantics the
  team won't own (recommend honestly: wall-clock reminder instead of
  durable scheduling — say so).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Revisit trigger: any missed-fire incident (then the build plan activates
  with this design).
- If the build is approved, its acceptance test is the restart round-trip
  made permanent — say so in the design record.
- **Deferred:** the build itself (needs ADOPT + the overdue-policy owner
  call).
