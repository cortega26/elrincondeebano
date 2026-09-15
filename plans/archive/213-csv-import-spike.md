# Plan 213 (spike): Close the CSV loop — import to match filtered export

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/routes/importRoutes.ts admin/content-manager/src/shared/schemas/importExport.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (spike; build follows on ADOPT)
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/180-import-preview-hardening.md (byte-cap interaction)
- **Category**: direction
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters (product value)

A one-directional pair with the operator already living in spreadsheets:
`GET /export.csv` emits filtered slices with Python-parity columns, but
`POST /import/preview` accepts only a JSON `products` array — edits made in
the exported CSV must be hand-retyped as JSON, exactly the manual workaround
the admin exists to eliminate (adjacent evidence: the parking widget already
reads a published Google Sheets CSV for bookings). CSV dialect hazards are
real (quoting, encoding, `True/False` stock parity, identity matching), so
this spike specifies the mapping + prototypes ONE round-trip through the
existing preview/resolution pipeline (no new write path) before anyone
commits to the surface.

## Current state (evidence, verified by advisor)

```ts
// importRoutes.ts:47-119 — GET /export.csv with filters (q, category, archived,
// out_of_stock, discounts) + CSV_EXPORT_COLUMNS + Python-parity (True/False stock, int price/discount/order)
// importRoutes.ts:121-130 — POST /import/preview accepts ONLY { products: [...] } JSON
// repo-wide grep for CSV import parsing (fromCsv/parseCsv/csv-import): only export-side comments — no import path exists
// importExport.ts — MAX_IMPORT_BYTES 5MB shared cap (plan 170/180 own its enforcement)
```

Conventions: plan 060 protocol (preview binds input hash + base rev; apply
takes preview id + resolutions — CSV must ride this, not bypass it);
`CSV_EXPORT_COLUMNS` order is the mapping contract; stock `True/False`
Python parity; byte cap applies to the CSV text too (coordinate with plan
180's pre-gate).

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success                        |
| --------- | ------------------------- | ---------- | ------------------------------------------ |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0                                     |
| Tests     | `npm run admin:test`      | declared   | all pass (spike adds throwaway tests only) |

## Scope

**In scope**: CSV→Product mapping spec over `CSV_EXPORT_COLUMNS`, one
filtered-export → edit → import-preview round-trip prototype (scratch,
reverted), open-questions list (delimiter, identity key, cap interaction).

**Out of scope**: shipping CSV import; new write paths; UI upload affordance
(follow-up build's call).

## Git workflow

- Branch: `advisor/213-csv-import-spike`
- One commit with the mapping spec + verdict; prototype reverted first.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm operator need (do not skip)

The MED confidence is entirely "do operators actually round-trip exports?"
If the operator (via dispatcher) says no → record "rejected, no evidence of
need" and finish (cheapest correct outcome). If yes/unknown → proceed with
the technical spike AND record the workflow evidence cited.

**Verify**: need verdict recorded; otherwise STOP.

### Step 1: Specify the mapping

CSV→`Product` over `CSV_EXPORT_COLUMNS`: delimiter policy (comma-only?
semicolon tolerance?), encoding (UTF-8 + BOM handling), `True/False` →
boolean, ints, empty cells (absent vs explicit-clear semantics per field),
identity key on re-import (id column if present else name::description via
`normalizeImportIdentity` — state the precedence), row-error reporting shape
(reuse `ImportValidationError`), byte-cap measuring on the CSV text.

### Step 2: Prototype ONE round-trip (scratch, reverted)

Filtered export → edit two cells in the CSV → parse → feed the EXISTING
`toPreviewResponse`/conflict+resolution flow → apply on a temp repo →
catalog matches the JSON-path result. Then REVERT. If any dialect case
breaks the pipeline, that's a finding for the spec, not a fix.

**Verify**: round-trip log recorded; tree clean of prototype code.

## Test plan

- Spike: throwaway round-trip proof (reverted). Follow-up build gets real
  tests (dialect matrix + idempotency + cap cases).
- Verification: suite green on the clean tree.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Need verdict recorded (or rejection with reasoning).
- [ ] Mapping spec committed (delimiter/encoding/columns/identity/errors/cap).
- [ ] Round-trip prototype log recorded (or the blocking finding).
- [ ] Open questions listed with recommended answers.
- [ ] `npm run admin:test` exits 0; no prototype code in diff.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- No operator need (finish as rejected — do not build speculative surface).
- The round-trip requires a NEW write path (that kills the "reuse preview"
  premise — report; the effort estimate changes fundamentally).
- Identity on re-import is ambiguous in ways the spec can't resolve (report
  the collision cases; don't invent id semantics here).

## Maintenance notes

- If adopted, the build plan's home is this spec + plan 060 protocol +
  plan 180 cap enforcement (name all three).
- Revisit trigger: operators observed hand-converting CSV→JSON (then need
  is proven regardless of this spike's answer).
- **Deferred:** the build itself (needs ADOPT + identity answers).
