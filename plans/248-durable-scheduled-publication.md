# Plan 248: Durable scheduled publication (adopt the plan-212 design)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/server/services/publicationRecovery.ts admin/content-manager/src/server/services/recoveryJournal.ts admin/content-manager/src/web/app/routes/PublicationPage.tsx admin/content-manager/src/server/app.ts`
> If any changed, re-read before starting; unexplained divergence is a
> STOP condition.

## Status

- **Priority**: P2 (direction — operator-selected)
- **Effort**: M
- **Risk**: MED (exactly-once publication)
- **Depends on**: none; reads the archived design record at
  `plans/archive/212-durable-schedule-spike.md`
- **Category**: direction
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Scheduled publications live in a `Map` + `setTimeout`
(`jobRunner.ts:61-94`, `shutdown()` at `:183-199` clears them) and the UI
confesses it: "las publicaciones programadas son en memoria y no sobreviven
a un reinicio" (`PublicationPage.tsx:614-615`). The spike (plan 212, DONE)
reproduced the loss, wrote the design record, and recorded
"BUILD on ADOPT" with acceptance = a permanent restart round-trip test.
Nothing shipped (`data/scheduled-publications.json` does not exist). New
context since the spike: the one-click `SyncStoreButton` made publishing
routine, and OCI remote operation makes restarts ordinary. A silently
missed publication is the worst failure mode a publishing tool can have —
the operator discovers it only by noticing the site did not change.

## Current state

- `jobRunner.ts` — injectable clock (plan 127 F3.1), `scheduleAt(type, fn,
when)`, `shutdown()`.
- `routes/publication.ts:151-164` validation + `:264` scheduleAt wiring
  (plan 162) + the UI notice.
- `services/publicationRecovery.ts` + `services/recoveryJournal.ts` —
  candidate neighbors for the outbox (evaluate; do not assume).
- Idempotency: `services/idempotencyStore.ts`/`persistentIdempotencyStore.ts`
  exist — the publication flow already uses an idempotency key; the outbox
  claim must bind to it (never double-publish after a crash).
- Read `plans/archive/212-durable-schedule-spike.md` sections "Current
  state", "Steps 1-2" and its completion note for the recorded design
  (store shape comparison, overdue policy analysis, clock semantics,
  idempotency binding, UI surfacing).

## Commands you will need

| Purpose       | Command                                                                                                                                                 | Provenance | Expected on success |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install       | `npm ci`                                                                                                                                                | declared   | exit 0              |
| Typecheck     | `npm run admin:typecheck`                                                                                                                               | declared   | exit 0              |
| Focused tests | `npx vitest run test/integration/publication.test.ts test/integration/publicationAdvanced.test.ts test/integration/restartRecovery.test.ts` (cwd admin) | declared   | all pass            |
| Admin tests   | `npm run admin:test`                                                                                                                                    | declared   | all pass            |
| E2E           | `npm run admin:test:e2e`                                                                                                                                | declared   | pass                |

## Scope

**In scope**:

- `admin/content-manager/src/server/services/` — a `scheduledPublications`
  module (new or inside `jobRunner` per the design record) + wiring
- `admin/content-manager/src/server/routes/publication.ts` (+ the pending
  list endpoint it serves)
- Boot recovery wiring (`app.ts`/`start.ts` — wherever recovery journal
  boot runs today)
- `admin/content-manager/src/web/app/routes/PublicationPage.tsx`
- Tests: `test/integration/publication*.test.ts`, `restartRecovery.test.ts`,
  a new contract test for the outbox store

**Out of scope**:

- Multi-node scheduling, cron expressions (single `publishAt` per job is
  the shipped surface).
- Changing the in-memory `jobRunner` API for other job types.

## Git workflow

- Branch: `advisor/248-durable-schedule`
- Commits: store+claim → boot recovery → UI surfacing → tests.

## Steps

### Step 0: Baseline + read the design record

`npm ci` + focused tests green. Read the archived spike fully; extract its
recorded decisions into the PR description. If the design record is
incomplete (no store shape/policy), STOP and report (do not re-spike
inline).

### Step 1: The outbox store

Per the design record (adapt only with documented reason):
`data/scheduled-publications.json` (gitignored), atomic writes via the
existing writer utilities, entries carrying at minimum:
`{ job_id, publish_at (ISO wall-clock), created_at, status: 'pending' |
'firing' | 'failed', claim?: { token, claimed_at }, error? }`.
Implement as a small module with `upsertPending`, `list`, `claimDue(now)`
(→ status `firing` + token written atomically **before** firing),
`complete(job_id)`, `fail(job_id, error)`.

### Step 2: Wire schedule/unreschedule/cancel + boot recovery

- Schedule path (routes/publication.ts `:264` area): persist `pending`
  first, then arm the in-memory job; cancel/reschedule updates the outbox
  (status/removal).
- Boot (same place the recovery journal runs): for each entry —
  - `pending` and `publish_at <= now` → claim → fire → complete/fail;
  - `pending` and future → re-arm the in-memory timer;
  - `firing` (crash mid-fire) → resolve via the publication
    idempotency key: if the idempotency store shows the publication
    committed, complete; else mark `failed` with a note (operator decides).
- **Overdue policy (default per audit): fire-late if overdue ≤ 24 h (with
  a UI notice "publicado tarde"); if overdue > 24 h, do NOT fire — mark
  `failed` with `recovered_overdue` and surface it.** These two constants
  (`FIRE_LATE_MAX_HOURS = 24`) are configurable constants in the module —
  the owner can change them later; do not build a settings UI.

### Step 3: Exactly-once proof

The acceptance test (permanent, not throwaway): with the injectable clock,
schedule a publication, simulate restart (new server/app instance over the
same repo root; `ADMIN_SKIP_RECOVERY_CHECK` semantics do not apply here —
use the real boot path), assert it fires exactly once (publication rev /
commit count), and that a second boot after completion does not re-fire.
Add: overdue fire-late (clock jump +2 h → fires, notice surfaced),
stale skip (clock jump +48 h → failed + surfaced), cancel-before-due
(no fire).

### Step 4: UI surfacing

`PublicationPage.tsx`: the pending list shows outbox-backed schedules
(including recovered/re-armed ones) and a distinct notice for
late-published/missed entries (read from the endpoint — extend the
response with a `recovered`/`missed` field rather than inferring in the
client).

### Step 5: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:typecheck` →
exit 0; `npm run admin:test:e2e` → pass; `npm run admin:lint` → exit 0.

## Test plan

- New: restart round-trip (exactly-once), overdue fire-late, stale skip,
  cancel, crash-mid-fire (`firing` recovery with/without idempotency hit).
- Patterns: `test/integration/publication.test.ts`,
  `restartRecovery.test.ts` (temp repo + real boot), contract tests for the
  store module.
- The restart test is the plan's reason to exist — it must be permanent.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls data/scheduled-publications.json` after a scheduled run (gitignored; `.gitignore` entry added)
- [ ] restart round-trip test exists and passes; exactly-once asserted
- [ ] `npm run admin:test` exits 0
- [ ] UI shows recovered/missed entries (e2e assertion or documented manual check)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The design record's idempotency binding cannot be applied (report the
  blocker; exactly-once is non-negotiable).
- Crash-atomicity requires a journal with semantics the repo does not own
  (report; the alternative is a wall-clock reminder instead of durable
  scheduling — the spike said so).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Revisit trigger: any missed-fire incident → the constants and the
  recovery policy are the first places to look.
- The outbox is gitignored state like `data/.comms/`: backups/restores must
  not include it (check `BACKUP_FILES`).
- **Deferred:** reminders/notifications for missed publications beyond the
  UI notice.
