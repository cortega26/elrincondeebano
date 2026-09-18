# Plan 195: Deduplicate shared pure helpers (undo stacks, discount math, identity normalization)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/web/app/routes/undo.ts admin/content-manager/src/web/app/routes/categoryUndo.ts admin/content-manager/src/server/routes/productRoutes.ts admin/content-manager/src/server/repositories/productRepository.ts astro-poc/src/lib/product-card-helpers.ts tools/utils/product-mapper.js astro-poc/src/lib/catalog.ts admin/content-manager/src/server/routes/changes-common.ts admin/content-manager/scripts/backfill-product-ids.ts admin/content-manager/src/server/repositories/categoryRepository.ts astro-poc/src/lib/product-identity.ts admin/content-manager/src/shared`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (normalization changes identity keys — parity tests first)
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: tech-debt
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Three verbatim-or-near duplication clusters where the next fix must land N
times or silently diverges: (1) `undo.ts` / `categoryUndo.ts` carry
byte-identical `loadStack`/`saveStack`/`StackRef`/`moveEntryOnSuccess` — the
plan-099 "failed undo stays retryable" invariant now lives in two files.
(2) Discount percentage is computed three ways (2-decimal admin vs integer
storefront/card vs a third inline filter variant) — surfaces disagree
(12.5% vs 13%), breaking filter/sort parity and snapshots. (3) Identity
normalization exists in 5+ flavors (NFD-strip vs whitespace-collapse vs
inline trim; djb2 `generateStableId` vs `generateStableSku`) — same
product/category resolves differently per surface (missed matches, duplicate
SKUs). Pure-function consolidation with parity tests; the normalization
slice needs the most care.

## Current state

All excerpts verified by advisor read:

```ts
// undo.ts:111-157 vs categoryUndo.ts:47-89 — byte-identical helpers, only the const renamed
export const MAX_UNDO_LEVELS = 20;  // vs MAX_CATEGORY_UNDO_LEVELS = 20
export function loadStack(key: string): UndoEntry[] { ... sessionStorage ... }
export function saveStack(key: string, entries: UndoEntry[]): void { ... }
export interface StackRef<T> { current: T[]; }
export async function moveEntryOnSuccess<T>(source, target, operation) { ...pop/try/push... }
```

```ts
// productRoutes.ts:134-135 + :152-154 — 2 decimals, twice inline
discount_percentage: p.price > 0 ? Math.round((p.discount / p.price) * 10000) / 100 : 0,
// product-card-helpers.ts:22-24 — integer
const discountPercent = hasDiscount ? Math.round((discount / price) * 100) : 0;
// productRepository.ts:199-200 — third inline variant (discount filters)
// catalog.ts getAll discountPercent — (p.discount / p.price) * 100 unrounded (plan 091 comment)
```

```ts
// catalog.ts:123 normalizeCategoryToken — trim+lowercase
// product-contract.js:27 normalizeCategoryKey — same trim+lowercase (dup)
// catalog.ts:330 normalizeSearchToken — NFD-strip
// changes-common.ts:24 normalizeImportIdentity — whitespace-collapse, NO NFD (documented ASCII-only parity, plan 060)
// backfill-product-ids.ts:20 normalizeIdentityPart — whitespace-collapse (same as import? verify, don't assume)
// categoryRepository.ts:110 — inline trim().toLowerCase()
// product-mapper.js:63 generateStableId vs product-identity.ts:17 generateStableSku — near-identical djb2 loops, different prefixes
```

Conventions: `shared/` (admin) + `astro-poc/src/lib` (storefront) are the
canonical homes (plan 154 established zod-canonical sharing); web
`undoStack` extraction must preserve `sessionStorage` keys and entry shapes
(plan 174 may change value sourcing — coordinate: this plan moves code, it
does not change what values flow).

## Commands you will need

| Purpose   | Command                                                    | Provenance | Expected on success |
| --------- | ---------------------------------------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                                                   | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` + root `npm run typecheck:astro` | declared   | exit 0              |
| Tests     | `npm test` (both suites)                                   | declared   | all pass            |

## Scope

**In scope**: extract shared undo-stack module; one `discountPercent`
helper per runtime (+ call-site swaps); canonical normalizers + parity
tests; delete the losing copies.

**Out of scope**: changing WHICH percentage precision is correct (owner
call if surfaces disagree — default: keep each surface's current rounding,
computed in ONE place per surface... no: single helper, single precision —
if snapshots diverge, the commit must show the delta and the owner confirms;
see Step 2); import-identity parity semantics (plan 060 documented
ASCII-only — preserve, do not "fix" Unicode); backfill script behavior.

## Git workflow

- Branch: `advisor/195-shared-helper-dedup`
- One commit per cluster (undo → discount → normalization).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + parity pins

Green suites. Add failing-first parity tests: discount outputs per surface
(record current values — these LOCK current behavior before the move);
cross-surface identity cases (same product via import-normalizer,
storefront token, backfill part — record agreements AND the documented
diffs).

**Verify**: green; parity table recorded in commit notes; otherwise STOP.

### Step 1: Extract undo stack (LOW risk)

New `admin/content-manager/src/web/app/undoStack.ts` with generic
`loadStack`/`saveStack`/`StackRef`/`moveEntryOnSuccess` (+ max-levels param);
both `undo.ts` and `categoryUndo.ts` import it (keep their entry types and
storage keys). Existing undo tests pin semantics.

**Verify**: typecheck + admin tests green.

### Step 2: Unify discount math (needs precision decision)

One `discountPercent(price, discount)` helper in admin `shared/` and one in
`astro-poc/src/lib` (same formula, same rounding — same language family,
two bundles; do not over-engineer cross-bundle sharing). Replace all four
call sites. Snapshot updates will show the delta (12.5% vs 13% class) —
if ANY snapshot changes, STOP and confirm the chosen precision with the
owner before proceeding (the commit must name the chosen precision and why).

**Verify**: typechecks + suites green; snapshots reviewed.

### Step 3: Converge normalization (careful)

Pick ONE canonical normalizer per concept (token vs identity-key) in
`shared/` + astro lib; route all call sites to them; add the cross-surface
parity test as permanent. DO NOT change `normalizeImportIdentity`'s
ASCII-only contract (plan 060 parity note) — converge the undocumented
copies TO the documented ones. `generateStableId`/`generateStableSku`: unify
implementation, keep both output prefixes if either is persisted anywhere
(grep persisted data first — prefix change rewrites ids).

**Verify**: full `npm test` green; parity tests pass.

## Test plan

- Step-0 parity pins (discount values, identity agreements/diffs).
- Existing undo/snapshot/parity tests unchanged and green.
- Verification: `npm test` (both suites) green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Both typechecks + `npm test` exit 0.
- [ ] `grep -n "function loadStack" admin/content-manager/src/web/app/routes/categoryUndo.ts` returns no matches (imports shared).
- [ ] `grep -rn "Math.round((p.discount / p.price)\|Math.round((discount / price)" admin/content-manager/src astro-poc/src` returns no matches (single helper used).
- [ ] Cross-surface identity parity test exists and passes.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Discount unification changes snapshots (owner must pick precision first).
- Either stable-id prefix is persisted in data (unification would rewrite
  ids — report, keep both).
- `normalizeImportIdentity`'s callers depend on the non-NFD behavior in ways
  the parity note doesn't cover (report the cases).
- Plan 174 changed undo value-sourcing concurrently (reconcile order —
  this plan moves code only).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New product/category fields with derived math or keys go in these shared
  helpers from day one — note the rule in each helper's header comment.
- Reviewer: the precision decision (Step 2) and prefix persistence check
  (Step 3) are the two load-bearing judgments — verify both explicitly.
- **Deferred:** cross-bundle (admin↔astro) single-source helpers (needs a
  shared-package decision — plan 154 stopped at schema sharing for a reason).
