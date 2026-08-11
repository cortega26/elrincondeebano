# Plan 062: Enforce durable change sets, history, undo, and recovery

> **Executor instructions**: Treat this as the central mutation architecture. Land it
> in vertical slices, keep the app runnable after each slice, and never fabricate legal
> transitions. Recovery tests must use disposable repositories and injected failures.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/shared/schemas/changeSet.ts admin/content-manager/src/server/routes/changes.ts admin/content-manager/src/server/repositories/changeSetRepository.ts admin/content-manager/src/server/routes/backup.ts admin/content-manager/src/web/app/routes/HistoryPage.tsx admin/content-manager/src/web/app/App.tsx`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 057, 058, 059, 060
- **Category**: architecture / bug / direction
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F10, F14
- **Direction covered**: D02 changes and recovery control center

## Why this matters

Change sets are currently disconnected JSON records whose status can be mass-assigned;
ordinary mutations write canonical files directly. History is reconstructed from partial
current metadata, and undo is volatile bulk UI state. The retirement architecture needs
one durable command log supporting review, validation, apply, undo/redo, backups, and
recovery after restart.

## Current state

- `routes/changes.ts:43-60` shallow-merges arbitrary PATCH fields, including status.
- Tests currently demonstrate direct movement to `published` without a transition policy.
- Catalog/storefront/media routes write repositories directly rather than appending
  operations to a draft.
- `routes/changes.ts:333-358` builds history only from current `field_last_modified`.
- `ProductsPage.tsx:282-311` stores only bulk undo in memory and may approximate inverse
  values when no preview exists.
- `HistoryPage.tsx:3-80` displays field/timestamp/revision but no before/after snapshot.
- Backup and publication recovery APIs exist, but `App.tsx` exposes no unified operator UI.
- Python `history_store.py:38-55` persists bounded atomic history and bulk UI supports
  undo/redo; characterize behavior but improve concurrency semantics in TS.

## Commands you will need

| Purpose    | Command                                                                    | Expected on success |
| ---------- | -------------------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- changeSet history recovery undo` | all pass            |
| Browser    | `npm -w admin/content-manager run test:e2e -- --grep "changes              | recovery            | undo"` | workflows pass |
| Manager    | `npm run admin:typecheck && npm run admin:test && npm run admin:build`     | exit 0              |
| Regression | `npm run validate`                                                         | exit 0              |

## Scope

**In scope**:

- change-set schemas, domain service, repository, routes, and migrations
- mutation command integration for product/category/storefront/import/media references
- append-only history and revision-aware undo/redo/discard
- change review, backup inventory/restore preview, and publication recovery UI
- failure/restart/concurrency tests

**Out of scope**:

- Executing media transformations (Plan 063) or remote sync (Plan 064).
- Publishing to a real remote.
- Replacing Git as the repository system of record.

## Git workflow

- Branch: `feat/062-durable-change-control-center`
- Use multiple conventional commits by vertical slice.

## Steps

### Step 1: Define and enforce the state machine

Create a domain service with explicit transitions such as draft → reviewed → validated
→ applying → applied/published, plus discarded/failed recovery states. Define allowed
operations, immutable identity, revision, timestamps, actor, and validation/publication
evidence. Remove generic status PATCH.

**Verify**: table-driven tests cover every legal/illegal transition and survive mutation
testing of transition predicates.

### Step 2: Store complete durable operations

Record command type, entity ID, base/new revisions, before/after values, owned files,
media intents, and request/idempotency identity. Use atomic writes and restart-safe
loading. Provide a migration for existing draft files; never silently discard them.

**Verify**: corrupted/partial/old-version/restart/failure-injection tests either recover
or fail with actionable diagnostics without touching canonical data.

### Step 3: Route mutations through drafts and exact apply

Adapt product, category, storefront, import, and later media commands to create/update a
draft, review it, validate the exact manifest, and apply once. Preserve an explicit
fast path only for operations the architecture intentionally designates, with evidence.

**Verify**: no canonical content changes before apply; apply output exactly matches the
reviewed operations and stale base revisions fail.

### Step 4: Implement durable history and revision-aware undo/redo

History reads append-only applied operations, not current metadata. Undo creates a new
inverse change set from exact before values and current revision; redo likewise creates
a new audited command. Never rewrite history or approximate numeric/boolean inverses.

**Verify**: all mutation types undo/redo after restart; stale inverse, deleted entity,
schema drift, and partial-media cases fail safely with explanation.

### Step 5: Build the control-center UI

Add “Cambios y recuperación” for pending drafts, diff review, validation evidence,
apply/discard, history detail, undo/redo, backup inventory, restore preview/confirmation,
and pending publication recovery. Make destructive scope explicit and keyboard accessible.

**Verify**: Playwright completes edit → review → validate → apply → undo → redo after
reload and covers restore/recovery confirmation and cancellation.

## Test plan

- New domain state-machine and repository failure-injection suites.
- Integrate existing mutation/import/publication tests with draft semantics.
- Browser tests for empty/loading/error/conflict/stale/recovery states.
- Mutation tests must kill altered transition and revision checks.

## Done criteria

- [ ] Illegal or arbitrary change-set transitions are impossible at API and domain layers.
- [ ] Normal content mutations are reviewable before canonical apply.
- [ ] History contains exact before/after and revision evidence for every mutation.
- [ ] Undo/redo are durable, audited, revision-aware, and restart-safe.
- [ ] Operator UI exposes drafts, backups, restore preview, and recovery.
- [ ] All focused/E2E/manager/root validation passes.

## STOP conditions

- Existing change sets cannot be migrated losslessly.
- A mutation cannot express exact owned files or before/after values.
- Undo would require overwriting a newer revision.
- Restore semantics could mix files from different snapshots.

## Maintenance notes

The change-set schema becomes a durable internal API: version it and require migrations.
Every new mutation must define preview, apply, history, inverse, and recovery semantics.
