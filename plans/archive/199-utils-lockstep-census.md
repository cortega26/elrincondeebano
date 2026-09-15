# Plan 199: Investigate utils sprawl and catalog lockstep (census, then decide)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- tools/utils/ tools/guardrails/_utils.mjs admin/content-manager/src/shared/schemas/product.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: tech-debt
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Two LOW-confidence structural smells that are expensive to fix wrong:
(1) `tools/utils/` mixes 12 modules (catalog, registry, OG, contract,
mapper, manifest, output-dir, cli, stage-runner) with a CJS/ESM constants
duality (`constants.js` CJS source vs `image-pipeline.mjs` re-export shim),
and `tools/guardrails/_utils.mjs` duplicates generic shell helpers used ad
hoc across monitors. (2) Adding a catalog field historically touches ~8
sites (schema → service → repository → route envelopes → client → openapi →
UI forms) with no checklist or codegen — partial landings cause 422s and
silent field drops. Both need a census before any consolidation: the wrong
abstraction (notably codegen for lockstep) costs more than the checklist, per
the repo's own KISS rule (`ENGINEERING_PRIORITIES.md`).

## Current state

Verified by advisor read:

```sh
# tools/utils/ — 12 files, mixed ownership
category-catalog.js category-og.mjs category-registry.js cli.mjs constants.js
deterministic-time.js image-pipeline.mjs manifest.js output-dir.js
product-contract.js product-mapper.js stage-runner.mjs
# tools/guardrails/ — _utils.mjs (sh/readFile/changedFiles shell helpers) beside 9 checks
```

```js
// image-pipeline.mjs:26-53 — ESM re-export shim over CJS constants.js
export const normalizeAssetPath = constants.normalizeAssetPath; ...
// gap-fill + sync-avif import from constants.js; generate-images imports from image-pipeline.mjs
```

```ts
// Lockstep illustration (is_archived/image_avif_path-class fields touch):
shared/schemas/product.ts → domain/products/productService.ts → server/repositories/productRepository.ts →
routes/productRoutes.ts envelope types → web/api/client.ts → openapi.ts → ProductForm.tsx/FilterBar.tsx
```

## Commands you will need

| Purpose | Command                                                                                                                                  | Provenance | Expected on success                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------- |
| Census  | `grep -rln "from.*tools/utils/\|require.*tools/utils" tools/ scripts/ astro-poc/ --include="*.mjs" --include="*.js" \| sort` (read-only) | declared   | importer list                       |
| Tests   | `npm test`                                                                                                                               | declared   | all pass (if any safe change ships) |

## Scope

**In scope**: importer census, duality verdict, a field-addition checklist
doc (if cadence justifies), tiny safe cleanups ONLY if zero-risk (e.g. a
comment naming the canonical import path).

**Out of scope**: module-system migration, `tools/utils/` reorganization,
codegen, any behavior change. This plan decides; a follow-up plan executes —
and only if the census justifies it.

## Git workflow

- Branch: `advisor/199-utils-lockstep-census`
- At most one small commit (checklist doc and/or canonical-path comments).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Census (no changes)

- List every importer of each `tools/utils/` file and of
  `guardrails/_utils.mjs` (command above, extended to all relevant
  extensions). Build the fan-in table: file → importers → which of the two
  constants paths each uses.
- For lockstep: `git log --oneline -20` on `shared/schemas/product.ts`;
  for the last 3 field-addition commits, count files touched per change
  (`git show --stat`). This measures cadence and blast radius factually.

**Verify**: tables recorded in working notes; no files changed.

### Step 1: Decide (document, don't build)

- Utils: if one constants path dominates (>80% of importers), record the
  verdict (canonical path + which files should migrate) as a follow-up plan
  sketch IN THE REPORT (do not migrate here). Otherwise record "not worth
  consolidating" with the fan-in numbers. Same for `_utils.mjs` folding
  (only if ≥3 ad-hoc duplicates of the same helper exist).
- Lockstep: if ≥3 consecutive lockstep changes prove the shape, write the
  field-addition checklist doc (new small file under `docs/architecture/`
  or as a header comment where field types are declared — prefer the
  smallest discoverable place; check `DOCUMENTATION.md` ownership rules
  first) listing the ~8 touch sites in order. Explicitly do NOT build
  codegen. If cadence is lower, record "checklist not yet justified."

**Verify**: decisions recorded with numbers; any doc file follows the
repo's doc-ownership rules.

## Test plan

- No behavior change → no new tests. If the checklist doc ships, verify
  every listed path exists (machine-checkable: a test or a `check:` script
  is overkill — reviewer verifies links resolve).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Fan-in table + lockstep cadence numbers recorded (in commit message
      and/or the checklist doc).
- [ ] Verdict per item: follow-up sketch, checklist doc, or "not worth
      doing" with one-line reasoning.
- [ ] `npm test` green IF anything shipped; otherwise tree untouched except
      the optional doc.
- [ ] `git diff --name-only 0847089c...HEAD` lists at most the checklist doc
      (+ index row).
- [ ] `plans/README.md` status row updated with verdicts.

## STOP conditions

Stop and report back (do not improvise) if:

- The census shows an in-flight migration (someone already consolidating) —
  reconcile instead of duplicating.
- The checklist touch-sites cannot be enumerated stably (surfaces keep
  moving — then even the doc would rot; record that instead).

## Maintenance notes

- Revisit ONLY when a third consecutive lockstep change lands (the trigger
  is defined — no periodic re-audits).
- Reviewer: confirm the "not worth doing" verdicts have numbers, not vibes.
- **Deferred:** any migration/codegen follow-ups sketched here (each needs
  its own plan with the census as evidence).
