# Plan 208: Fix ops/ADR doc drift (runbook paths, SW versions, ADR index/order, API surface)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- docs/operations/RUNBOOK.md docs/adr/ docs/operations/EDGE_SECURITY_HEADERS.md docs/operations/OBSERVABILITY.md docs/api/ admin/content-manager/src/server/openapi.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: docs
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Ops docs with wrong procedures cause incident-time harm, not just
confusion: RUNBOOK routes complex-work specs into the historical
`docs/audit/` (where the archive checker never enforces them); two docs
assert different SW cache-version schemes while the code uses a third
(stale-asset invalidation silently fails after SW releases); the ADR index
still shows the funnel decision as "Proposed/pending" after the owner
decided no-go (inviting re-litigation orcorn re-enabling collection); the
release-gate stage order in ADR 0007/CONTRIBUTING inverts the executable;
and the only machine-verified API contract (post-133 OpenAPI) is
undiscoverable from `docs/api/`. All single-table/cell fixes, all verified.

## Current state

Verified by advisor read (doc → contradicting source):

- `RUNBOOK.md:242-248` → create `docs/audit/plan-YYYYMMDD-<slug>.md` vs
  AGENTS.md:75-79 (plans live in `plans/`, DONE→`plans/archive/` via
  `check-plan-archive.mjs`) + DOCUMENTATION.md:19-21 (`docs/audit/` is
  historical).
- `RUNBOOK.md:109` → `ebano-static-v6/dynamic-v4/products-v5` vs
  `adr/0006:51-53` → `v7/v5/v6` vs `service-worker.js:7-11` → date-based
  `ebano-*-2026-05-01-b` (+ `html` namespace neither doc lists).
- `docs/adr/README.md:29` → 0010 `Proposed`, "go/no-go pendiente" vs
  `0010:3-4` header `Decided — no-go (2026-08-27, plan 167)` +
  plans/README:117 (167 DONE 2026-08-28) + OBSERVABILITY:27
  (`enabled: false`).
- `adr/0007:24-30` (+ `CONTRIBUTING.md:45` copy) → stages test(3)/build(4)
  vs `validate-release.mjs:14-37` build→test + VALIDATION_MATRIX:33-39
  (build 3, test 4).
- `EDGE_SECURITY_HEADERS.md:151` → probe "en el runner self-hosted" vs
  RUNBOOK:36 + CODEBASE_MAP:111 (migrated to GitHub-hosted `ubuntu-24.04`,
  2026-07). [Migrated-runner premise per docs; confirm no silent
  re-introduction while editing.]
- `adr/0006:107` → `src/js/modules/pwa.js`, `service-worker-manager.mjs`
  (tree absent, plan 155) + `:85` bump procedure edits only
  `astro-poc/public/service-worker.js` (two byte-synced copies exist).
- `docs/api/utils.md:1-53` — entire `docs/api/` covers 4 util functions vs
  `GET /api/v1/openapi.json` served (`routes/openapi.ts:7-8`, policy
  `routePolicy.ts:17`, pinned by `test/contract/openapi.test.ts`, plan 133
  DONE). Lowest-priority lens: admin API is loopback-local — may be
  intentionally undocumented (needs maintainer verdict).
- `adr/0010:105-106,136,144` pins `storefront.js:1103` (`:50`) vs live
  initializer now at `storefront.js:1114` with `enabled: false`
  (OBSERVABILITY:70). [Line drift; prefer symbol anchors.]

Conventions: ADR index must stay in sync with ADR files (index maintenance
note); doc-ownership per DOCUMENTATION.md; markdownlint per START_HERE.

## Commands you will need

| Purpose   | Command                                                                                                | Provenance | Expected on success                 |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------- |
| Docs lint | `npx markdownlint-cli2 'docs/**/*.md' '*.md'`                                                          | declared   | exit 0                              |
| SW proof  | `grep -n "ebano-" service-worker.js \| head; cmp service-worker.js astro-poc/public/service-worker.js` | declared   | prefixes recorded; copies identical |

## Scope

**In scope**: the 8 fixes above (RUNBOOK ×2, ADR index, ADR 0007 order,
EDGE runner line, ADR 0006 refs, docs/api decision, funnel pins).

**Out of scope**: CONTRIBUTING's release-gate copy belongs to plan 205's
CONTRIBUTING rewrite ONLY if 205 hasn't taken it — check first (this plan
may own just the ADR side); code changes (none); SW version semantics
(docs follow code, not vice versa).

## Git workflow

- Branch: `advisor/208-ops-adr-docs-drift`
- One commit (or two: runbook/adr-index vs api/refs).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm each drift (no changes)

Re-verify all 8 bullets live (SW `cmp` included). Coordinate the
CONTRIBUTING:45 copy with plan 205. Drop fixed items with a note.

**Verify**: live list matches; otherwise narrow scope.

### Step 1: Fix the procedural tables

- RUNBOOK plans section → create under `plans/`, close via the archive
  rule, link AGENTS.md instead of `docs/audit/`.
- SW versions: pick the date-scheme as truth (confirm via the `cmp` + code
  prefixes), update BOTH tables including the `html` prefix, restate ADR
  0006's bump-table rule + "keep current" reminder.
- ADR index 0010 → decided no-go with date/plan; keep the one-line
  default-no-go consequence.
- ADR 0007 + (if owned here) CONTRIBUTING copy → build(3)/test(4) matching
  the executable + VALIDATION_MATRIX.
- EDGE runner bullet → GitHub-hosted `ubuntu-24.04`, keep
  challenge/inconclusive semantics.
- ADR 0006 → live registration path refs + two-copy bump note.

**Verify**: markdownlint green; every version string matches code.

### Step 2: Decide the docs/api question + refresh pins

- Investigate-and-decide: one-page OpenAPI pointer (generation/verification
  commands) OR record that `docs/api/` stays utils-only with live
  `/api/v1/openapi.json` + contract test canonical. Get owner verdict if
  reachable; default (no owner): the pointer page (cheap, high
  discoverability) clearly marked as pointer-not-copy.
- Funnel pins → current initializer location or symbol anchors
  (`initObservability` + revisit comment).

**Verify**: links resolve; markdownlint green.

## Test plan

- Docs-only: markdownlint + `cmp` proof + link/anchor resolution for every
  touched reference.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] All 8 items fixed or decided with verdicts recorded.
- [ ] SW version strings in both docs match `service-worker.js` prefixes.
- [ ] ADR index 0010 reads decided no-go; ADR 0007 order matches executable.
- [ ] markdownlint exits 0.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The SW copies differ (`cmp` fails — sync them per the build copy step
  first; docs follow the synced truth).
- The docs/api decision needs a published-API strategy call beyond a
  pointer page (record options; do not design an API program here).
- Plan 205 owns the CONTRIBUTING copy (do not double-edit — ADR side only).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- The ADR index row rule ("keep in sync with new ADR files") is what failed
  for 0010 — cite it in the commit so the next ADR follows it.
- Docs version tables (SW, gates) must be verified against code in the same
  commit that changes the code — note that rule where each table lives.
- Reviewer: `cmp` the SW copies yourself; click every fixed anchor.
- **Deferred:** none.
