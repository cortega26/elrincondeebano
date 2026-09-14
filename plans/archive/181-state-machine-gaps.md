# Plan 181: Close small state-machine and reporting gaps (cancel, quotepath, hash-gate, migration lock)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/server/adapters/gitAdapter.ts tools/preflight-hash.mjs admin/content-manager/src/server/repositories/productRepository.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Four small, independent, fail-closed gaps: (1) `cancelJob` returns `true`
for terminal `failed` jobs (meaningless flag, caller reports success).
(2) `gitAdapter` parses `status --porcelain` paths verbatim, but git quotes
unicode paths by default (`core.quotepath`) — and unicode image names exist
(`app.ts` handles them) — so `ownedPaths` prefix-matching can spuriously
block publication with "Unrelated staged file". (3) `preflight-hash.mjs`
TOCTOUs between `existsSync`/`statSync`/`readFileSync` and interpolates
`--step` into a filename unsanitized. (4) Schema-migration writes run on the
read path with no `MutationLock` against a fixed `.tmp` name (rare torn-write
window if a migration coincides with a concurrent write). Each is a
LOW-confidence item individually; together they are one safe hardening batch
with per-item verification.

## Current state

Relevant files:

- `admin/content-manager/src/server/services/jobRunner.ts` — `cancelJob`
  (lines 104–122): returns `false` only for missing/`completed`/`cancelled`.
- `admin/content-manager/src/server/adapters/gitAdapter.ts` — `run(['status',
'--porcelain', '--branch'])` (line 56); path parsing lines ~125–150
  (`line.substring(3).trim()`, verbatim compare against
  `manifest.ownedPaths` in `publicationService.ts:62-64`).
- `tools/preflight-hash.mjs` — `hashInputFiles` (lines 20–34):
  `existsSync` → `statSync` → `readFileSync` sequence; `readStepState`/
  `writeStepState` interpolate `step` into `${step}.json` (lines ~37–51).
- `admin/content-manager/src/server/repositories/productRepository.ts` —
  migration write on read path (lines 99–104) via `this.writer.write(...)`;
  `MutationLock` exists (`lock` field) but is only used in `writeCatalog`.

Excerpts (verified by advisor read):

```ts
// jobRunner.ts cancelJob — `failed` falls through to `return true`
if (job.status === 'completed' || job.status === 'cancelled') return false;
job.cancelRequested = true;
if (job.status === 'pending') { ...cancelled... }
return true;   // also true for 'failed' (and 'running', correctly)
```

```ts
// gitAdapter.ts:56 — no quotepath control
return this.run(['status', '--porcelain', '--branch']);
```

```js
// preflight-hash.mjs — TOCTOU + unsanitized step
if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
  return null;
}
hash.update(fs.readFileSync(abs));
const file = path.join(STATE_DIR, `${step}.json`);
```

```ts
// productRepository.ts:99-104 — write on the read path, no lock
if (didMigrate) {
  this.writer.write(result.data, 'catalog-migration', 1);
  this.cache = null;
}
```

Conventions: job outcomes are operator-visible (`GET /jobs/:id`); git
parsing must stay byte-faithful; preflight tools are build-path code with
tests in `test/preflight-hash-gate.test.js` (landed by plan 170).

## Commands you will need

| Purpose   | Command                                                                  | Provenance | Expected on success |
| --------- | ------------------------------------------------------------------------ | ---------- | ------------------- |
| Install   | `npm ci`                                                                 | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck`                                                | declared   | exit 0              |
| Tests     | `npm run admin:test` + `npx vitest run test/preflight-hash-gate.test.js` | declared   | all pass            |

## Scope

**In scope**:

- The four files above + tests for each fix.
- `admin/content-manager/test/contract/jobCancel.test.ts` (create, or
  extend existing jobRunner tests if present)

**Out of scope**:

- `jobRunner.shutdown` semantics, publication flow changes, preflight gate
  redesign (state caching is plan 185).
- `AtomicWriter` internals (only the call-site locking).

## Git workflow

- Branch: `advisor/181-state-machine-gaps`
- One commit per gap; e.g. `fix(admin): cancelJob returns false for terminal failed jobs (plan 181)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline + reproduce each gap

Requires plan 170 DONE. Baseline green. Then reproduce (do not fix yet):

1. `cancelJob` on a `failed` job → returns `true` (assert in a scratch test).
2. Stage a unicode-named asset (if fixtures allow) and check porcelain
   quoting behavior; at minimum confirm `git -c core.quotepath` default
   quotes non-ASCII in this repo's git version.
3. Delete a preflight input mid-`hashInputFiles` (or simulate by pointing at
   a FIFO/unreadable) → uncaught throw instead of force-run.
4. Confirm migration-write path takes no lock (code reading suffices).

If ANY item does not reproduce, drop it from the plan with a commit-message
note (do not force a fix for a non-bug).

**Verify**: baseline green; reproductions recorded.

### Step 1: Fix cancel/quotepath/hash-gate (LOW risk trio)

- `cancelJob`: return `false` for terminal states (`completed`,
  `cancelled`, `failed`) — only `pending`/`running` accept cancellation.
- `gitAdapter`: pass `-c core.quotepath=off` for the status invocation (or
  unquote `"..."`-wrapped paths when parsing). Prefer the `-c` flag (one
  line, no parser change); verify existing publication/conflict tests pass.
- `preflight-hash.mjs`: wrap the exists/stat/read sequence so stat/read
  races are treated as missing inputs (return null → force-run, never
  crash); sanitize `--step` to `[A-Za-z0-9-_]` (reject anything else with a
  clear error).

**Verify**: typecheck + targeted tests pass.

### Step 2: Lock the migration write (MED risk, careful)

Take `this.lock` around the `didMigrate` write in `loadCatalog` (acquire +
release with try/finally), or defer the migration persist to the next
`writeCatalog` if locking the read path risks deadlock with the in-lock
re-read in `writeCatalog` (line 128 calls `loadCatalog` while holding the
lock — a non-reentrant lock would deadlock!). Inspect `MutationLock` first:
if non-reentrant, use the defer-to-next-write approach or a best-effort
`tryAcquire` that skips the persist on contention (migration re-runs
idempotently next load thanks to the version marker).

**Verify**: typecheck + admin tests pass, especially concurrent-write tests.

### Step 3: Add regression tests

- `cancelJob('failed-id')` → `false`; cancel on `pending` → `true` +
  `cancelled`.
- Porcelain with unicode fixture → parsed path matches `ownedPaths` (or a
  unit test on the parser with a quoted sample line).
- `hashInputFiles` with a vanishing input → `null` (force-run), no throw;
  `--step '../evil'` → clean rejection.
- Migration + concurrent write → no torn catalog (or documents the
  tryAcquire-skip behavior).

**Verify**: `npm run admin:test` + preflight gate tests green.

## Test plan

- Per-gap cases above; existing job/git/preflight/migration tests green.
- Verification: both suites green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` + preflight gate tests exit 0 with new cases passing.
- [ ] `grep -n "'failed'" admin/content-manager/src/server/services/jobRunner.ts` shows failed treated as terminal in `cancelJob`.
- [ ] `grep -n "quotepath" admin/content-manager/src/server/adapters/gitAdapter.ts` matches.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Any gap does not reproduce (drop it, do not invent).
- `MutationLock` is non-reentrant AND defer/tryAcquire isClean impossible
  without restructuring (report the lock shape).
- The quotepath fix changes any currently-passing git test expectation
  (report the diff; the parser may depend on quoting).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- The migration path runs once per schema version — the lock is
  catastrophic-insurance, not a hot path; keep it simple.
- Reviewer: confirm the `--step` sanitizer cannot break existing step names
  (`images-logo`, `images-og-home`, `images-og-parking` — all match the class).
- **Deferred:** none.
