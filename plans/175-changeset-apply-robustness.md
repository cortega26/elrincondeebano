# Plan 175: Make change-set apply crash-safe, single-flight, and replay-honest

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/routes/changeSetRoutes.ts admin/content-manager/src/server/routes/catalog-command.ts admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/shared/schemas/changeSet.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/171-catalog-cache-miss-isolation.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Three related write-path holes: (1) `POST /change-sets/:id/apply` saves
`publishing` then `await applier.apply(cs)` with no try/catch — any throw
(or process death between the two saves) strands the set in `publishing`,
from which no transition is legal except `published`/`failed`, so the
operator can never retry without hand-editing JSON. (2) Two concurrent
applies both pass the `validated` check before either saves `publishing`
(check-then-act, no lock) — double mutation-engine runs. (3) `runCatalogCommand`
mutates the catalog via `apply()` first and `writeCatalog` checks the
idempotency store later — a replayed create returns an unpersisted phantom
product with a bumped revision. Each is operator-visible data harm; together
they are one coherent "apply must be atomic, guarded, and replay-honest"
change.

## Current state

Relevant files:

- `admin/content-manager/src/server/routes/changeSetRoutes.ts` — apply
  handler (lines ~215–250).
- `admin/content-manager/src/shared/schemas/changeSet.ts` —
  `ALLOWED_TRANSITIONS` (lines 53–61): `publishing: ['published','failed']`.
- `admin/content-manager/src/server/routes/catalog-command.ts` — lines 36–60
  (load → apply → write; idempotency checked inside `writeCatalog`).
- `admin/content-manager/src/server/repositories/productRepository.ts` —
  `writeCatalog` lines 110–138 (idempotency `has` at 118, conflict caching
  at 130–138; `create()` pushes into `catalog.products` in the service
  before the write).

Excerpts (verified by advisor read):

```ts
// changeSetRoutes.ts — no try/catch around apply; throw skips `failed`
cs.status = 'publishing';
cs.updated_at = new Date().toISOString();
changeSets.save(cs);
const result = await applier.apply(cs);
if (!result.ok) { cs.status = 'failed'; ... }
```

```ts
// changeSet.ts — publishing can only go to published/failed
publishing: ['published', 'failed'],
```

```ts
// catalog-command.ts:36-44 — mutation precedes idempotency check
const catalog = repos.products.loadCatalog();
const baseRev = catalog.rev;
const result = await apply(catalog);   // create() already pushed + bumped rev
...
const writeResult = await repos.products.writeCatalog(catalog, commandId, baseRev);
```

Conventions: typed transition validation via `isValidTransition`; error
envelopes `{ error: { code, message } }`; `409 ILLEGAL_TRANSITION` for bad
transitions; idempotency store keyed by `command_id`. Tests: contract tests
with temp repos + `app.inject`. Note the web client mints a fresh UUID per
call (`client.ts` several sites), so replay mainly bites proxies/manual
retries — still fix, but do not redesign the client here.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/changeSetRoutes.ts` (apply only)
- `admin/content-manager/src/server/routes/catalog-command.ts`
  (check-and-reserve command id before `apply`)
- `admin/content-manager/src/server/repositories/productRepository.ts`
  (only the idempotency reservation support, if needed)
- `admin/content-manager/src/shared/schemas/changeSet.ts` (only if a
  recovery transition is added)
- `admin/content-manager/test/contract/changeSetApplyRobustness.test.ts` (create)

**Out of scope**:

- Persisting full response envelopes for true replay (beyond reserve +
  honest conflict; document as follow-up if needed).
- Durable (disk) apply locks — in-memory single-flight suffices for the
  single-process admin; do not build a lock file.
- Client UUID behavior (already fresh per call; untouched).

## Git workflow

- Branch: `advisor/175-changeset-apply-robustness`
- Commit per step; e.g. `fix(admin): crash-safe single-flight apply; idempotency before mutation (plan 175)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plans 170 and 171 DONE. Install + typecheck + admin tests
unmodified. Pay attention: plan 171 changed `loadCatalog` isolation;
confirm contract tests pass before starting.

**Verify**: green; otherwise STOP.

### Step 1: try/finally to `failed` + single-flight guard on apply

- Wrap `await applier.apply(cs)` in try/catch: on throw, set status
  `failed`, save, and return 500 `{ code: 'APPLY_FAILED', ... }`. The set
  must never be left in `publishing` by a throw.
- Add a module-level in-memory `Set<string>` of applying change-set ids:
  if the id is present, return 409 `{ code: 'APPLY_IN_FLIGHT' }`; add before
  the `validated` check passes through to save, remove in `finally`.
- Recovery: allow operators to retry a `publishing` set left by a _process
  crash_ (not by this code anymore) — add `publishing → failed` as an
  explicit operator recovery transition (PATCH), OR document that restart +
  PATCH to `failed` is the path. Prefer the explicit transition; it must go
  through `isValidTransition` (update `ALLOWED_TRANSITIONS` +
  `publishing: ['published','failed']` gains no new silent paths — recovery
  is operator-initiated via PATCH, not automatic).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Check-and-reserve the command id before `apply`

In `runCatalogCommand`, before `apply(catalog)`: if the idempotency store
already `has(commandId)`, return the stored outcome WITHOUT running `apply`
(no mutation, no phantom product, no bumped `resulting_revision` — return
the previously recorded status). Reserve the id (mark in-progress) before
`apply` so a concurrent replay during the write cannot double-run; release
the reservation on failure paths that do not persist an outcome.

If `PersistentIdempotencyStore` has no reservation primitive, add a minimal
one (`reserve`/`has`) — do not redesign the store. Keep `writeCatalog`'s
existing check as the second line of defense (do not remove it).

Also: do NOT cache `conflict` outcomes under the command id in a way that
permanently poisons retries — a stale-rev conflict must allow a later retry
with a fresh id (verify current behavior; adjust only if the test in Step 3
proves poisoning).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 3: Add robustness tests

Create `test/contract/changeSetApplyRobustness.test.ts`:

1. Throwing applier (inject a failing service or mock at the route-test
   level) → set ends `failed`, retry of apply is legal.
2. Concurrent double-apply (two `app.inject` without awaiting between) →
   exactly one runs the engine (second gets `APPLY_IN_FLIGHT` or a clean
   post-completion outcome — assert no double history entries).
3. Replay: create with id X → 200; replay same id X → same outcome WITHOUT a
   duplicate product in `GET /products` and WITHOUT rev advance.
4. Recovery: hand-place a set in `publishing` (simulating pre-fix crash) →
   operator PATCH to `failed` succeeds, then normal flow resumes.

**Verify**: `npm run admin:test` → all pass including the 4 new tests.

## Test plan

- New contract file, 4 cases above; existing change-set/contract tests
  (transition validation, 409 retry) unchanged and green.
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with the 4 new robustness tests passing.
- [ ] `grep -n "APPLY_IN_FLIGHT" admin/content-manager/src/server/routes/changeSetRoutes.ts` matches.
- [ ] `grep -n "reserve\|has(commandId)" admin/content-manager/src/server/routes/catalog-command.ts` matches (pre-apply check present).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The apply handler already has try/catch or a lock (drift — plans 170/171
  may have touched it).
- The idempotency store cannot support reservation without a schema change
  (report the store shape; do not migrate it here).
- Double-apply turns out to be already impossible via Fastify concurrency
  (single-threaded event loop still interleaves awaits — but if the test
  proves otherwise, report and narrow the plan to crash-safety).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- In-memory single-flight does not survive process death — that case is
  covered by the `publishing → failed` recovery transition, not by the lock.
  If the admin ever becomes multi-process, both must be revisited.
- Reviewer: scrutinize the reservation release paths (every non-persisting
  failure must release, or ids leak into permanent rejection).
- **Deferred:** persisted response-envelope replay (true idempotent replay
  of the original payload) — needs a store decision; this plan returns
  honest outcomes without re-running, which closes the phantom-product harm.
