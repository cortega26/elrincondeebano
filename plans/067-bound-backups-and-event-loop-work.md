# Plan 067: Bound backup retention and remove synchronous listing growth

> **Executor instructions**: Preserve recovery value before pruning. Retention must be
> deterministic and tested with fixture directories; do not delete real repository
> backups while implementing or verifying this plan.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/server/repositories/categoryRepository.ts admin/content-manager/src/server/repositories/storefrontRepository.ts admin/content-manager/src/server/routes/backup.ts admin/content-manager/src/server/services/atomicWriter.ts tools/prune-backups.js`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 057, 062
- **Category**: performance / operations
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F19

## Why this matters

Category/storefront writes and restores create timestamped backups without retention.
Listing synchronously traverses and stats every backup on Fastify's event loop, so disk
usage and request latency grow together. The product writer already has a bounded-backup
pattern; apply a unified policy without sacrificing protected restore points.

## Current state

- `categoryRepository.ts:62+` renames the prior registry to a timestamped backup with no
  pruning.
- `storefrontRepository.ts:78-99` creates one or two backups per write with no pruning.
- `routes/backup.ts:21-38` synchronously enumerates/statSyncs every directory and file.
- Restore at `backup.ts:81-103` creates another permanent pre-restore snapshot.
- `services/atomicWriter.ts:73-95` demonstrates bounded count pruning for product data,
  but silently ignores cleanup errors; reuse the concept with explicit policy/evidence.

## Commands you will need

| Purpose    | Command                                                                | Expected on success    |
| ---------- | ---------------------------------------------------------------------- | ---------------------- |
| Focused    | `npm -w admin/content-manager run test -- backup repository`           | all pass               |
| Perf check | `npm -w admin/content-manager run test -- backupPerformance`           | bounded fixture passes |
| Manager    | `npm run admin:typecheck && npm run admin:test && npm run admin:build` | exit 0                 |
| Regression | `npm run validate`                                                     | exit 0                 |

## Scope

**In scope**:

- unified backup metadata/retention policy and repository helpers
- category/storefront/manual/pre-restore backup creation and pruning
- asynchronous or indexed backup listing with pagination
- operator-visible retention/cleanup diagnostics and tests

**Out of scope**:

- Deleting existing real backups during implementation.
- Cloud backup, compression, or off-repository archival.
- Changing restore semantics owned by Plan 062 beyond consuming unified metadata.

## Git workflow

- Branch: `perf/067-bounded-admin-backups`
- Commit: `perf(admin): bound backup retention and listing`.

## Steps

### Step 1: Define backup classes and retention

Document count/age policy for automatic file backups, manual snapshots, and pre-restore
snapshots. Protect the newest valid point and any snapshot referenced by active recovery.
Make configuration bounded and validated.

**Verify**: policy table tests cover clock ties, protected entries, corrupt metadata,
zero/invalid config, and mixed backup classes.

### Step 2: Centralize verified creation and pruning

Create one helper that writes/copies to temp, verifies manifest/hash, promotes, records
metadata, then prunes only after success. Cleanup failures must be visible but must not
invalidate a successfully protected canonical write.

**Verify**: injected copy/verify/rename/prune failures preserve newest recovery points
and return actionable status.

### Step 3: Make listing bounded and non-blocking

Maintain an atomic metadata index or move filesystem enumeration off the request loop.
Add pagination and bounded detail retrieval; reconcile index/disk drift explicitly.

**Verify**: a fixture with thousands of snapshots returns the first page within an
accepted deterministic test budget and does not invoke synchronous stat per file on the
request path.

### Step 4: Expose retention state safely

Show class, timestamp, file count/size, protected reason, and cleanup warnings in the
recovery UI. Provide explicit manual prune preview/confirmation, never implicit deletion.

**Verify**: UI/contract tests cover protected and failed-cleanup states.

## Test plan

- Repository tests with fake time and temporary directories.
- Failure injection at create, verify, index replace, and delete.
- Performance regression fixture for high file counts.
- Restore integration confirms pruned/unpruned metadata remains coherent.

## Done criteria

- [ ] Every backup producer uses one bounded policy.
- [ ] Pruning never removes protected/newest valid recovery points.
- [ ] Backup list is paginated and free of unbounded synchronous filesystem work.
- [ ] Cleanup failures are observable and recovery remains usable.
- [ ] Focused/performance/full validation passes.

## STOP conditions

- Retention requirements for manual/pre-restore snapshots cannot be determined.
- Existing backups lack enough metadata to classify safely.
- Index reconciliation could delete unrecognized operator-created files.
- A performance assertion is inherently flaky on CI; use operation counts instead.

## Maintenance notes

New repository writers must register their backup class. Review retention changes as
data-loss-sensitive even though the implementation is operational cleanup.
