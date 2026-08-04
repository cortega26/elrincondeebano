# Plan 078: Close the atomic-writer recovery gap — restore-on-failure and a wired recovery journal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The atomic writer has a window where the canonical file does not exist: it
renames `target → backup` first, then `tmp → target`. If the second rename
fails (disk error, kill, ENOSPC), the catch block only deletes the tmp file —
the canonical `data/product_data.json` stays **absent**, with the good state
stranded in a `.backup_*` file that nothing restores. Every subsequent
`loadCatalog()` throws, and the whole admin app 500s until a human
hand-recovers. The design already has a recovery journal
(`recoveryJournal.ts`, ndjson-based) that would enable this, but it is never
instantiated anywhere — it's dead code, and `doctor.ts` even computes
`recoveryNeeded` from stale `.tmp` files without acting on it.

After this plan: a failed second rename restores the backup automatically;
the journal is wired into the repositories that write canonical files; and
startup surfaces pending recoveries instead of silently 500ing.

## Current state

Verified code (read directly):

- `admin/content-manager/src/server/services/atomicWriter.ts:40-45` and `:55-65`:
  ```ts
  const backedUp = existsSync(this.targetPath);
  if (backedUp) { renameSync(this.targetPath, backupPath); }
  renameSync(tmpPath, this.targetPath);          // :45 — failure here loses the target
  ...
  } catch (err) {
    this.cleanup();                              // :56 — only unlinks the tmp file
    this.recoveryJournal?.failOperation(...);
    return { success: false, ... };
  ```
- `atomicWriter.ts:28-29,52,57` — `recoveryJournal?.startOperation(...)`,
  `completeOperation(...)`, `failOperation(...)` are all optional-chained.
- `admin/content-manager/src/server/repositories/productRepository.ts:28`:
  `this.writer = new AtomicWriter(this.filePath);` — **no journal passed**.
  Same for `categoryRepository.ts:71-75` and `storefrontRepository.ts:86-99`
  (the latter writes two files sequentially — experience then bundles — with
  the same rename gap).
- `recoveryJournal.ts` — imported nowhere outside `atomicWriter.ts` itself
  (grep-verified; `publicationRecovery.ts` is a different class used by the
  publication route).
- `admin/content-manager/src/server/services/doctor.ts:141` — computes
  `recoveryNeeded` from stale `.tmp` files; nothing consumes it.
- Existing failure-injection coverage: `test/integration/failureInjection.test.ts`.

## Commands you will need

| Purpose   | Command                                                                                          | Expected on success |
| --------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| Typecheck | `npm run admin:typecheck`                                                                        | exit 0              |
| Tests     | `npm run admin:test`                                                                             | exit 0              |
| Targeted  | `npx vitest run test/integration/failureInjection.test.ts test/integration/repositories.test.ts` | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/services/atomicWriter.ts`
- `admin/content-manager/src/server/services/recoveryJournal.ts` (wire-up;
  adjust its API only if the tests demand it)
- `admin/content-manager/src/server/repositories/productRepository.ts`,
  `categoryRepository.ts`, `storefrontRepository.ts` (pass the journal)
- `admin/content-manager/src/server/app.ts` or `start.ts` (instantiate the
  journal once; expose pending-recovery info)
- `admin/content-manager/src/server/services/doctor.ts` (consume pending
  recoveries or at least surface them)
- `admin/content-manager/test/` — failure-injection tests

**Out of scope**:

- The publication route's own recovery journal (`publicationRecovery.ts` —
  separate system, leave alone).
- Backup retention (plan 067) and backup ID collisions (plan 076).
- The Python fallback's file writes.

## Git workflow

- Branch: `advisor/078-close-atomic-writer-recovery-gap`.
- Commit per step, conventional style (`fix(admin): restore previous catalog file when atomic rename fails`), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Restore-on-failure in AtomicWriter

In the catch block, before `cleanup()`, attempt to restore the previous
state when the target is missing and a backup exists:

```ts
} catch (err) {
  try {
    if (!existsSync(this.targetPath) && existsSync(backupPath)) {
      renameSync(backupPath, this.targetPath);   // restore last good state
    }
  } catch { /* restoration is best-effort; the journal entry is the fallback */ }
  this.cleanup();
  ...
}
```

**Verify**: a new unit test in `test/contract/atomicWriter.test.ts` (new
file; or extend an existing writer test): (a) happy path writes and backs
up; (b) simulate the second-rename failure — use an injectable failure hook
in `AtomicWriter` (constructor option `simulateRenameFailure?: boolean` used
only in tests, or monkey-patch `fs.renameSync` via `vi.spyOn`) — and assert
the target file still exists with the previous content. `npm run admin:test`
exit 0.

### Step 2: Wire the journal as a shared singleton

Instantiate one `RecoveryJournal` at app construction (`app.ts` near the
repos setup) and pass it into `ProductRepository` (which already accepts an
optional journal via `AtomicWriter`), `CategoryRepository`, and
`StorefrontRepository`. Keep the constructor signature backward-compatible
(optional param).

**Verify**: grep `new AtomicWriter` → every site passes the journal;
`npm run admin:typecheck` exit 0.

### Step 3: Surface pending recoveries at startup and in doctor

In `start.ts` (after `createApp`), check the journal for
`started`/`failed` entries not yet completed: if any exist, log a clear
warning naming the file and the backup candidates, and (if operator mode)
offer the choice: restore from `.backup_*` or continue. Implement the
minimal version: log + exit non-zero in operator mode when a
`failOperation`-style entry has no corresponding recovery (fail-closed
startup), unless `ADMIN_SKIP_RECOVERY_CHECK=1` is set. Wire `doctor.ts`'s
`recoveryNeeded` computation to the same journal.

**Verify**: create a journal entry by running a failing write in a temp
repo test (or manually: write a journal file with a `failed` op), start the
server → it logs the warning and refuses operator mode; with
`ADMIN_SKIP_RECOVERY_CHECK=1` → starts.

### Step 4: Test the full failure path

Extend `test/integration/failureInjection.test.ts` with a case: product
write where the second rename fails → response is a 500 with the writer
error, AND `loadCatalog` via GET /products still works (backup restored).
Also cover: journal contains the failed op; doctor reports `recoveryNeeded`.

**Verify**: `npx vitest run test/integration/failureInjection.test.ts` → all pass.

## Test plan

- `test/contract/atomicWriter.test.ts` (new) — happy path, restore-on-failure,
  journal start/complete/fail called.
- `test/integration/failureInjection.test.ts` — extended end-to-end case.
- `test/integration/repositories.test.ts` — still green with the journal
  wired (its temp-repo writes now journal; assert the journal file location
  stays under the temp repo's `data/` or a dedicated dir — decide the path
  and assert it).
- Full suite: `npm run admin:test` exit 0.

## Done criteria

- [ ] Second-rename failure leaves the canonical file present with previous
      content (test proves it)
- [ ] `RecoveryJournal` instantiated once and passed to all three
      repositories (grep `new AtomicWriter` — no journal-less sites)
- [ ] Startup refuses operator mode when a failed write is unrecovered,
      unless `ADMIN_SKIP_RECOVERY_CHECK=1` (test proves it)
- [ ] `npm run admin:typecheck` and `npm run admin:test` exit 0
- [ ] `plans/README.md` status row 078 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `recoveryJournal.ts`'s API (journal file location, entry shape) turns out
  to be half-implemented in ways the tests contradict — map the API first;
  adjusting it is in scope only if the changes stay additive.
- The storefrontRepository two-file write (experience + bundles) needs
  transactional semantics beyond a journal entry (e.g. cross-file rollback)
  — that is plan 063 territory; scope this plan to single-file restore and
  note the gap.
- Restore-on-failure conflicts with an existing test's expected error
  behavior (report the conflict).

## Maintenance notes

- After this lands, `doctor.ts` and `start.ts` share one recovery source —
  future work on backups (plan 067) should reuse the same journal.
- The `ADMIN_SKIP_RECOVERY_CHECK` escape hatch is a deliberate
  operator-only override; document it in `.env.example` (plan 079) and keep
  it from being set in CI.
- Reviewer focus: the journal's log volume (one entry per write op) — if the
  repo grows large, the journal file must be rotated or capped (plan 067
  covers retention).
