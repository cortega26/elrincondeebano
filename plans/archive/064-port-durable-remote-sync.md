# Plan 064: Port the durable authenticated remote-sync engine

> **Executor instructions**: Remote sync remains a required migration capability.
> Build it against a fake local server and disposable repositories only. Never use a
> real bearer token, remote catalog, or production endpoint in tests.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/server/adapters/syncAdapter.ts admin/content-manager/src/server/routes/conflicts.ts admin/content-manager/src/domain/conflicts admin/content-manager/src/server/repositories/conflictRepository.ts admin/content-manager/src/web/app/routes/ConflictsPage.tsx admin/product_manager/sync.py`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 057, 059, 062
- **Category**: migration / direction / security
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F13
- **Direction covered**: D04; architectural decision is to implement, not de-scope

## Why this matters

The Python manager has a persistent queue, authenticated push, incremental pull,
retry/backoff, and conflict ingestion. TS advertises conflicts but returns 501 for both
transport directions, and saved config does not reconfigure the live adapter. Since the
goal is full fallback-free migration, remote sync must become a durable service rather
than a misleading UI capability.

## Current state

- `src/server/adapters/syncAdapter.ts:29-70` returns 501 for configured push and pull.
- `routes/conflicts.ts:115-128` reports these capabilities as not implemented; config
  save at lines 131-177 updates disk but not the constructed adapter until restart.
- `admin/product_manager/sync.py:259+` normalizes a persistent retry queue; lines 387+
  enqueue, 445+ push authenticated patches, 477+ pull changes, and 516+ process retries.
- `ConflictService` and `ConflictRepository` already provide local conflict seams; extend
  them through change sets/history rather than inventing a parallel conflict store.
- Plan 057 owns secure token sourcing and redacted configuration responses.

## Commands you will need

| Purpose    | Command                                                                | Expected on success |
| ---------- | ---------------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- sync conflict`               | all pass            |
| Browser    | `npm -w admin/content-manager run test:e2e -- --grep "sync             | conflict"`          | workflows pass |
| Manager    | `npm run admin:typecheck && npm run admin:test && npm run admin:build` | exit 0              |
| Security   | `npm run security:secret-scan`                                         | no findings         |
| Regression | `npm run validate`                                                     | exit 0              |

## Scope

**In scope**:

- durable queue schema/repository/service and sync adapter transport
- secure URL policy, bounded HTTP client, retries/backoff, correlation/idempotency
- push/pull, cursor persistence, conflict translation, runtime reconfiguration
- conflict center status/actions and executable Python/TS parity fixtures

**Out of scope**:

- Defining or changing the remote server API without an explicit contract decision.
- General Git push/pull (publication and Plan 061).
- Real-network acceptance tests or storing credentials in repository data.

## Git workflow

- Branch: `feat/064-durable-remote-sync`
- Use conventional commits by queue, transport, conflicts, and UI slices.

## Steps

### Step 1: Freeze the transport and queue contract

Characterize Python request/response, queue, retry, cursor, and conflict semantics with
fixtures. Define Zod schemas for queued operations, remote patches/changes, responses,
and persisted state. Decide URL allowlist/HTTPS policy and local-test exception.

**Verify**: differential fixture tests agree on operation identity, retry eligibility,
conflict fields, and cursor advancement; ambiguous remote behavior is documented as a
STOP decision, not guessed.

### Step 2: Build an atomic durable queue

Persist queue entries with command/change-set IDs, product/base revision, attempts,
next-attempt time, sanitized last error, and terminal state. Use atomic replace, bounded
retention, single-consumer locking, idempotent enqueue, and restart recovery.

**Verify**: corrupted file, concurrent processors, duplicate enqueue, clock boundary,
restart, ENOSPC, and terminal-item retention tests pass.

### Step 3: Implement bounded authenticated transport

Use a standard fetch client with timeouts, cancellation, response-size limits, schema
validation, safe redirects, and token sourced only from Plan 057's provider. Send
correlation/idempotency headers; redact credentials and sensitive bodies from logs.

**Verify**: fake-server tests cover 200, 400, 401/403, 409, 412, 429/Retry-After, 5xx,
timeout, disconnect, invalid JSON/schema, oversized body, and redirect rejection.

### Step 4: Implement push, pull, and conflict lifecycle

Push queued change-set operations; translate 409/412 into durable conflicts without
dropping queue evidence. Pull incrementally from the last committed cursor, validate all
changes, stage them as remote-authored change sets, and advance cursor only after atomic
apply. Resolution/retry must be audited and idempotent.

**Verify**: disconnect/restart/conflict/resolution/retry scenarios converge exactly once;
no failed pull advances the cursor or partially changes catalog data.

### Step 5: Make runtime control truthful

Saving non-secret config reconfigures scheduling atomically. Expose configured state,
last success/error, queue counts, next attempt, pause/resume, manual push/pull, and
actionable conflicts. Never reveal the token.

**Verify**: browser tests cover configure, pause/resume, queued offline edit, reconnect,
conflict resolve/retry, and refresh/restart persistence.

## Test plan

- Port Python sync fixtures and add a local fake Fastify remote.
- Use fake timers only at the queue/service boundary; include at least one real-timer
  integration for cancellation/shutdown.
- Assert queue/catalog/conflict/cursor state after each failure response.
- Add secret-redaction assertions for logs, files, API, and reports.

## Done criteria

- [ ] No sync operation returns placeholder 501.
- [ ] Queue, cursor, and conflicts are atomic, bounded, idempotent, and restart-safe.
- [ ] Push/pull handle the complete accepted response matrix.
- [ ] Runtime configuration takes effect without restart and never exposes credentials.
- [ ] Python parity and browser workflows produce current certification evidence.
- [ ] Focused, E2E, security, manager, and root gates pass.

## STOP conditions

- The remote API contract cannot be confirmed from Python/tests/documentation.
- A retry class could duplicate a non-idempotent remote mutation.
- Secure credential sourcing from Plan 057 is unavailable.
- Testing would require a real remote, credential, or operator catalog.

## Maintenance notes

Treat remote schemas and queue format as versioned compatibility contracts. Reviewers
should focus on exactly-once effects, cursor advancement, redaction, and shutdown.
