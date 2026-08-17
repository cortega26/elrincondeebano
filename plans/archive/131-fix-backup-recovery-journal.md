# 131 — Fix backup recovery-protection reading the wrong journal

- **Source**: Auditoría 10, CORR-04 · **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/services/backupManager.ts admin/content-manager/src/server/services/atomicWriter.ts admin/content-manager/src/server/services/recoveryJournal.ts admin/content-manager/src/server/services/backupPolicy.ts`

## Problem

The "never prune backups referenced by a pending recovery" guarantee is dead on two counts.

`admin/content-manager/src/server/services/backupManager.ts:177-195` reads a JSON file nothing writes:

```ts
private recoveryReferencedIds(): Set<string> {
  const referenced = new Set<string>();
  try {
    const journalPath = resolve(this.repoRoot, 'data', 'recovery-journal.json');
    if (!existsSync(journalPath)) return referenced;
    const parsed = JSON.parse(readFileSync(journalPath, 'utf-8'));
    const pending = Array.isArray(parsed) ? parsed : (parsed.entries ?? []);
    for (const entry of pending) {
      const path: string | undefined = entry?.backupPath;
      ...
```

The live journal is **NDJSON** at `data/recovery-journal.ndjson` (`recoveryJournal.ts:18`), written per line by `appendFileSync` (`:22`) with entries of shape `{timestamp, operation, targetFile, backupPath?, status: 'started'|'completed'|'failed', commandId?}`. Grep confirms no writer of `recovery-journal.json` exists.

Second gap: `AtomicWriter` (`atomicWriter.ts:58-108`) computes the backup path (`:60` `this.backupPath()` → `product_data.json.backup_<uniqueTimestamp>`) but the journal entry it writes (`:64` `startOperation('atomic-write', fileName, commandId)`) never includes `backupPath` — so even a correctly-read journal would protect nothing.

Consequence: after a failed mid-rename write, the pre-write backup is prunable by `pruneBackups` (`atomicWriter.ts:114-140`) — the protection `backupPolicy.ts:41-49` claims to provide.

## Scope

**In**: `admin/content-manager/src/server/services/atomicWriter.ts` (record `backupPath` in the journal entry), `backupManager.ts` (`recoveryReferencedIds` → read the NDJSON, derive pending entries, collect their `backupPath`), tests `test/contract/atomicWriter.faultInjection.test.ts` + `test/contract/backupManager`/`backupRetention` suites.

**Out**: `recoveryJournal.ts` (the `RecoveryEntry.backupPath` field already exists — no schema change). `getPendingRecoveries()` semantics (reuse its key logic, do not change it).

## Steps

1. `AtomicWriter.write`: pass the backup path to the journal. `startOperation` is called at `:64` before the backup rename at `:77`; the path is already computed at `:60`. Extend `startOperation(operation, targetFile, commandId?, backupPath?)` — or add the field on the entry — so the `started` entry carries `backupPath`.
2. `backupManager.recoveryReferencedIds`: read `data/recovery-journal.ndjson`, split lines, `JSON.parse` each, and keep only entries that are **pending** per the same key semantics as `RecoveryJournal.getPendingRecoveries` (`recoveryJournal.ts:63-82`: `status === 'started'` with no matching `completed`/`failed` for `operation::targetFile::commandId`). Collect `entry.backupPath`, derive the backup id from the basename. On parse error of any line, skip that line (never fail the prune for a malformed journal — but keep conservative behavior: if the file is unreadable, protect nothing as today).
3. Keep `backupPolicy`'s contract unchanged — it should now actually receive referenced ids.

## Tests

- `atomicWriter.faultInjection.test.ts` (pattern exists): assert a written journal entry contains the `backupPath` used for the rename.
- Backup retention test: seed a `started` journal entry (with `backupPath`) lacking a terminal entry → assert the referenced backup is NOT pruned; then append the matching `completed` entry → assert it IS pruned.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Journal entries from AtomicWriter include `backupPath`.
- [ ] `recoveryReferencedIds` reads the `.ndjson` file and protects pending-entry backups (tested both directions).
- [ ] `npm run admin:test` green.

## Maintenance

Any future writer that joins AtomicWriter must produce its backup path before `startOperation`. A reviewer should confirm no other consumer of `recovery-journal.json` (the wrong filename) exists after this change — grep for it.

## Rollback

`git revert <sha>`.

## STOP conditions

- If an existing test asserts the old `recovery-journal.json` behavior, do not delete that assertion silently — stop and report.
