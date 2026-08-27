# 165 — Re-scope the Python "parity" gate to a schema round-trip regression

- **Source**: Auditoría 10, TEST-07 + DIR-04 · **Status**: DONE · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/scripts/parity-report.ts admin/content-manager/scripts/certification-report.ts plans/fixtures/055/ admin/content-manager/package.json docs/operations/CUTOVER.md`

## Problem

The "parity" gate compares the TS schemas against fixtures captured from the **retired** Python app (plan 069). The name overstates what it verifies, and its failure mode is silently weak.

- `admin/content-manager/scripts/parity-report.ts:64-71` reads `plans/fixtures/055/product_catalog.json` and compares the TS parse against the static golden `plans/fixtures/055/golden/python_roundtrip.json` — captured by `plans/fixtures/055/capture_python_golden.py`, a script whose Python pipeline no longer exists.
- Missing golden degrades to a WARNING and still exits 0 (`parity-report.ts:123-124, 222-223`).
- The fixtures are explicitly synthetic (9 products, `plans/fixtures/055/README.md:5-12`) and were meant to be moved to `src/shared/test-fixtures/` in the migration's Phase 1 (`README.md:47-50`) — Phase 1 completed with the Python retirement, but they stayed put.
- 16 certification rows and `admin:validate`/`admin:certify` hang off the "parity" framing (`certification-report.ts:109-113, 132-267`), and no "parity" step runs in CI (only local `admin:validate`).

The VALUE it preserves — schema round-trip stability, Unicode handling, revision preservation — is real and should be kept; only the framing and location are stale.

## Scope

**In**: `admin/content-manager/scripts/parity-report.ts` (rename message/framing, move to "schema round-trip regression", make missing goldens a HARD failure), `admin/content-manager/scripts/certification-report.ts` (rename the 16 rows' framing), the fixtures moved to `admin/content-manager/src/shared/test-fixtures/` (or `test/fixtures/` — prefer a location the admin test/typecheck include), `admin/content-manager/package.json` (script name + `admin:validate` chain), `plans/fixtures/055/` (leave the historical goldens with a README note that Python is retired), `docs/operations/CUTOVER.md` (note that "Python parity" is superseded by schema-contract regression).

**Out**: The goldens' content, the `parity` algorithm, the Astro storefront's schema (if the plan's "regenerate from the Astro projection" option is chosen — prefer the simple rename+hard-fail over regenerating, which touches plan 154's scope).

## Steps

1. Move the fixtures into the admin package (`admin/content-manager/src/shared/test-fixtures/` per the original plan's own note), update the import paths in `parity-report.ts`.
2. Rename the report and its messages: "parity" → "schema round-trip regression" everywhere in `parity-report.ts`, `certification-report.ts`, and `package.json` script names if any (`admin:parity` — rename to `admin:contract` if the maintainer accepts; otherwise keep the script name and rename only the framing text — check what CI/README reference `admin:parity` first).
3. Flip missing-golden from warning to ERROR (the script must fail when the golden file is absent).
4. Add a note to `plans/fixtures/055/README.md` and `CUTOVER.md` that Python parity is superseded.

## Tests

- The report is self-verifying: with goldens present → exit 0; rename a golden away → exit non-zero (asserted by running the script both ways).
- `npm run admin:parity` (or renamed script) green; `npm run admin:test` green; `npm run lint` green.

## Done criteria

- [ ] No "parity" framing against the retired Python remains in the report/certification output (grep `parity` in `parity-report.ts`/`certification-report.ts` → only historical mentions or none).
- [ ] Missing golden fails the script (verified both ways).
- [ ] Fixtures live under the admin package; `admin:validate`/`admin:certify` still green.

## Maintenance

This is hygiene with a real signal cost: a gate named "parity" implies a live counterpart that no longer exists, and its warnings-only failure mode invites trusting a check that checks nothing. If plan 154 (validation unification) lands, the golden fixtures become the contract fixture for the shared schemas — keep them in the admin package for that.

## Rollback

`git revert <sha>`.

## STOP conditions

- If anything in CI references `admin:parity` or `plans/fixtures/055` (re-verify the workflow grep — the audit found no CI parity step), stop and report before renaming.
