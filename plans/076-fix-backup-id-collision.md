# Plan 076: Fix backup ID collision — unique IDs for concurrent backups

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
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: correctness / tests
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

Backup IDs are millisecond-timestamp strings. Two backups in the same
millisecond (rapid operator clicks, a retry, or a scheduled+manual backup
overlap) resolve to the **same directory name**, so the second overwrites
the first — data loss on the backup path itself. The flakiness is already
hitting CI: `test/integration/backupRestore.test.ts:208` asserts
`expect(id1).not.toBe(id2)` for two back-to-back backups and **failed
locally** on a `vitest run --coverage` pass (reproduced: both ids were
`'2026-08-03T23-51-36-516Z'`). The `admin.yml` `test-ts` job runs
`npx vitest run --coverage` as a required step, so CI is intermittently red
for no product reason.

After this plan: backup IDs are unique (timestamp + monotonic counter or
random suffix), the flaky test is deterministic, and the CI coverage step
stops flaking on this.

## Current state

Verified code (read directly):

- `admin/content-manager/src/server/routes/backup.ts:40-44`:
  ```ts
  app.post("/backup", async (_request, reply) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = resolve(backupsDir, timestamp);
    mkdirSync(backupDir, { recursive: true });
    ...
    return { backup_id: timestamp, files: backedUp, ... };
  ```
- The restore route (`backup.ts:71-115`) resolves `resolve(backupsDir, id)`
  from the client param — unique IDs keep it compatible (no format change
  beyond the suffix).
- `test/integration/backupRestore.test.ts:208` — the assertion that flakes.

## Commands you will need

| Purpose   | Command                                                                        | Expected on success    |
| --------- | ------------------------------------------------------------------------------ | ---------------------- |
| Typecheck | `npm run admin:typecheck`                                                      | exit 0                 |
| Tests     | `npm run admin:test`                                                           | exit 0                 |
| Reproduce | `npx vitest run test/integration/backupRestore.test.ts --reporter=verbose` 10× | no failure (after fix) |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/backup.ts` (ID generation)
- `admin/content-manager/test/integration/backupRestore.test.ts` (strengthen
  if needed)
- Any other place that generates the same timestamp pattern for backup dirs —
  grep `replace(/[:.]/g, "-")` across `src/` and fix all hits that create
  directories (the `atomicWriter.ts:69` backup name and
  `storefrontRepository.ts:79` are per-file backups with the same collision
  risk — include them if the fix is the same helper).

**Out of scope**:

- The read-only-mode bypass on `/backup/:id/restore` (plan 071).
- Backup retention/pruning policy (plan 067).

## Git workflow

- Branch: `advisor/076-fix-backup-id-collision`.
- Single commit: `fix(admin): unique backup IDs to prevent same-millisecond collisions` + `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make IDs unique

Extract a small helper (in `backup.ts` or `src/server/services/` if reused)
that appends a uniqueness suffix:

```ts
let backupSeq = 0; // module-level monotonic counter
function uniqueTimestamp(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  backupSeq += 1;
  return `${ts}-${backupSeq}`;
}
```

Use it for the backup directory name and the `backup_id` return value.
For per-file backups in `atomicWriter.ts:69` and
`storefrontRepository.ts:79` (same pattern), apply the same suffix so
concurrent file backups never collide either — match each file's existing
naming (they use the same ISO pattern).

**Verify**: `npm run admin:typecheck` exit 0.

### Step 2: Deterministic test

Update `backupRestore.test.ts` so the uniqueness assertion can't be flaky:
keep `expect(id1).not.toBe(id2)` (now deterministic), and add an assertion
that both backups exist on disk:

```ts
expect(existsSync(join(backupsDir, id1))).toBe(true);
expect(existsSync(join(backupsDir, id2))).toBe(true);
```

**Verify**: `npx vitest run test/integration/backupRestore.test.ts` 10
consecutive runs → 10 passes (run in a loop).

## Test plan

- Existing `backupRestore.test.ts` + the on-disk assertions (Step 2).
- If you touched `atomicWriter.ts`/`storefrontRepository.ts` naming, run
  their tests: `npx vitest run test/integration/repositories.test.ts` (and
  any failure-injection tests) → all pass.
- Full suite: `npm run admin:test` exit 0.

## Done criteria

- [ ] Two `POST /backup` calls in the same millisecond produce distinct IDs
      (test proves it)
- [ ] Both backup directories exist after back-to-back backups (test proves it)
- [ ] `npm run admin:test` exit 0; backupRestore test passes 10/10 in a loop
- [ ] `plans/README.md` status row 076 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Some consumer parses backup IDs as pure ISO timestamps (grep `backup_id`,
  `backup_` in `src/` and `src/web/` — the UI lists backups by id; if a
  parser exists, the suffix must stay parseable or the parser must be
  updated — that is in scope).

## Maintenance notes

- The monotonic counter resets per process — fine for a single-server tool;
  if the admin ever runs multi-process, switch to `randomUUID()` from
  `node:crypto` (already used in `launchCredential.ts`).
- Plan 071 makes `/backup` require the credential; this plan makes its IDs
  safe — land both before relying on backups in the fallback window.
