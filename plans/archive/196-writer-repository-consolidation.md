# Plan 196: Finish the atomic-write consolidation; close the JsonFileRepository migration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/services/atomicWriter.ts admin/content-manager/src/server/services/atomicFileWriter.ts admin/content-manager/src/server/services/backupPolicy.ts admin/content-manager/src/server/repositories/storefrontRepository.ts admin/content-manager/src/server/repositories/jsonFileRepository.ts admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/server/repositories/mediaRepository.ts admin/content-manager/scripts/backfill-product-ids.ts tools/sync-avif-assets.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (writer changes risk data loss — fault-injection coverage first)
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: tech-debt
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Three write pipelines plus two non-atomic writers: `AtomicWriter` (class,
journal+verify+own `pruneBackups`) vs `atomicFileWriter.writeJsonFileAtomic`
(function + shared `pruneFileBackups`) vs `StorefrontRepository`'s hand-rolled
two-file tmp+rename+prune; meanwhile `backfill-product-ids.ts` does bare
tmp+rename with no backup/verify and executes at import top level, and
`sync-avif-assets.js` rewrites `product_data.json` with bare `writeFileSync`
(a crash mid-write corrupts the catalog with no backup). In parallel, the
plan-152 `JsonFileRepository` migration sits half-done (2 of 5 repos
adopted, 3 carry "intentionally stays off" comments plus re-implemented
load→parse→zod→cache→validate) — every cache/validation fix needs parallel
edits and the semantics already drift. Vetting correction: `atomicFileWriter`
and `storefrontRepository` ALREADY share `pruneFileBackups` from
`backupPolicy.ts` — only `AtomicWriter.pruneBackups` is still separate. Verify
each claim below before changing it.

## Current state

Verified by advisor read (with the prune correction):

- `services/atomicWriter.ts:47,114` — class + `pruneBackups(maxBackups)`
  (separate implementation); used by `ProductRepository` (journal semantics,
  load-bearing for plans 092/105 — see the comment at
  `productRepository.ts:24-28`, which DEFERS rebasing onto the base).
- `services/atomicFileWriter.ts:1-40` — `writeJsonFileAtomic` (tmp+rename+
  backup+prune via `backupPolicy.pruneFileBackups`); extracted from
  `categoryRepository.ts:100-133` (plan 152).
- `repositories/storefrontRepository.ts:40-45` — "intentionally stays" on
  two-file flow (uses `pruneFileBackups`, lines 116–143: tmp+backup+rename
  per file, plan 067 bounded retention + plan 081 unconditional bundles).
- `jsonFileRepository.ts:26` base; adopted by `categoryRepository.ts:21`,
  `syncQueueRepository.ts:48`. Off-base with comments: `productRepository`
  (journal+idempotency+structuredClone), `storefrontRepository` (two-file
  atomicity), `mediaRepository.ts:18` (own cache semantics).
- `scripts/backfill-product-ids.ts:33-60` — top-level side effects on import
  (read/write catalog at module scope) + bare tmp+rename, no backup/verify.
- `tools/sync-avif-assets.js:117` — bare `writeFileSync(productsJsonPath…)`
  after the per-product loop. (Plan 186 may have added write-if-changed —
  coordinate: write-if-changed reduces frequency but NOT crash-atomicity.)

Conventions: fault-injection tests exist for `AtomicWriter` (plan 108
ported durability fault-injection); extend that pattern, don't invent a new
one. Writer changes need backup/restore proof per path.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success                        |
| --------- | ------------------------- | ---------- | ------------------------------------------ |
| Install   | `npm ci`                  | declared   | exit 0                                     |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0                                     |
| Tests     | `npm run admin:test`      | declared   | all pass (esp. durability/fault-injection) |

## Scope

**In scope**: route script writers through the canonical writer (or a
script-safe variant); merge or document the two prune implementations;
resolve the 3 "intentionally stays off" repos to migrated-or-permanent with
contract tests; main-guard the backfill script.

**Out of scope**: changing journal/idempotency semantics; two-file
transactionality beyond what storefront already has; touching
`ProductRepository`'s cache (plans 171/188 own it).

## Git workflow

- Branch: `advisor/196-writer-repository-consolidation`
- Commit per slice (scripts → prune → repo decisions).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + fault-injection pins

Green suite. Confirm the plan-108 fault-injection tests cover `AtomicWriter`
paths; add equivalent crash-mid-write cases for `writeJsonFileAtomic` and
the storefront two-file write BEFORE changing anything (failing-first where
the gap is real).

**Verify**: green; new pins pass on current code; otherwise STOP.

### Step 1: Route the script writers through atomic writes

- `backfill-product-ids.ts`: replace bare tmp+rename with the canonical
  writer (or `writeJsonFileAtomic` if journal semantics don't apply to
  scripts — decide and document), add backup+verify; add an
  `import.meta.url` main-check so importing the module has NO side effects
  (fixes the accidental-import corruption vector).
- `sync-avif-assets.js`: same treatment for the products-JSON rewrite
  (coordinate with plan 186's write-if-changed — atomicity composes with it).

**Verify**: typecheck + tests green; main-guard proven (import in a test →
no fs touch).

### Step 2: Merge or bless the prune duplication

Compare `AtomicWriter.pruneBackups` vs `backupPolicy.pruneFileBackups`
semantics (retention counting, prefix matching, error tolerance). If
equivalent → route `AtomicWriter` through the shared function. If they
differ deliberately (journal-aware retention?) → document WHY in both files'
headers and drop this slice with a note. Do not merge on assumption.

**Verify**: backup-retention tests green either way.

### Step 3: Resolve the three holdouts (migrate or permanent)

For EACH of product/storefront/media repositories: either extend the base
with the needed hooks (multi-target writes, verify, journal) and migrate,
or record it PERMANENTLY separate with a contract test pinning why (cache
semantics, two-file atomicity, journal coupling). Remove the ambiguous
"deferred" comments — every repo ends `extends JsonFileRepository` or
`// PERMANENTLY separate because <reason + test name>`. Default expectation:
product stays (journal+idempotency load-bearing), storefront stays
(two-file), media migrates or documents — but prove, don't assume.

**Verify**: full admin suite green; no "deferred/intentionally stays"
ambiguity remains (grep clean).

## Test plan

- Step-0 fault-injection pins (+ main-guard test, prune-equivalence test,
  per-holdout contract tests).
- Existing durability/backup/Undo suites green.
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] Backfill import has no side effects (test-proven); both script writers
      go through an atomic writer with backup.
- [ ] Prune duplication merged or documented-divergent in both headers.
- [ ] `grep -rn "intentionally stays\|deferred" admin/content-manager/src/server/repositories/` returns only PERMANENT-with-reason comments (or nothing).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Fault-injection pins show the canonical writer itself is broken on some
  path (fix that first as a bug — report, do not consolidate onto a broken
  base).
- A holdout cannot migrate without changing journal/two-file semantics
  (record permanent + contract test; that IS the deliverable, not a failure).
- The backfill script is already retired/deleted (drop Step 1's backfill
  half with a note).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New JSON writers MUST extend `JsonFileRepository` + `writeJsonFileAtomic`
  unless they write a permanent-separation contract test in the same commit
  (put that rule in `jsonFileRepository.ts`'s header).
- Reviewer: the writer-swap diffs are the entire data-loss surface — review
  backup/verify/rename ordering line by line.
- **Deferred:** journal semantics unification (only if a second journaled
  writer ever appears).
