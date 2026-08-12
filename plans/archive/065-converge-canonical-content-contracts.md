# Plan 065: Converge Python, TypeScript, and Astro content contracts

> **Executor instructions**: Begin with compatibility evidence and a migration policy.
> Do not tighten schemas directly against production files without a dry-run inventory
> and explicit handling for every invalid or unknown field.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/shared/schemas admin/content-manager/src/domain/products admin/product_manager/models.py astro-poc/src/lib/data-schemas.ts plans/fixtures/055 docs/adr/0008-catalog-data-authority.md`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 056, 059
- **Category**: architecture / migration
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F15

## Why this matters

Python, TS, and Astro independently validate the same records with different rules.
TS can accept data Python rejects, Astro has its own required/optional choices, and Zod's
default unknown-key behavior can undermine forward-compatible round trips. Full migration
and rollback require one authoritative policy with explicit adapters for consumers.

## Current state

- `admin/product_manager/models.py:135-202` enforces discount ≤ price, asset roots and
  extensions, AVIF fallback presence, and fallback format.
- `admin/content-manager/src/shared/schemas/product.ts:11-37` validates field shapes but
  omits several cross-field/path invariants and strips unknown object keys by default.
- `astro-poc/src/lib/data-schemas.ts:12+` independently models storefront products with
  different optionality and omits manager revision/identity metadata.
- `productService.ts:107` relies on the TS schema for creation.
- `plans/fixtures/055/` contains the shared compatibility corpus and Python/Astro golden
  capture scripts; extend this rather than creating an unrelated fixture family.
- ADR 0008 already names repository authority and must remain the decision source.

## Commands you will need

| Purpose       | Command                                                                              | Expected on success    |
| ------------- | ------------------------------------------------------------------------------------ | ---------------------- |
| TS parity     | `npm run admin:parity`                                                               | complete corpus passes |
| Python golden | `admin/product_manager/.venv/bin/python plans/fixtures/055/capture_python_golden.py` | exit 0                 |
| Astro golden  | `node plans/fixtures/055/capture_astro_golden.mjs`                                   | exit 0                 |
| Manager       | `npm run admin:typecheck && npm run admin:test`                                      | exit 0                 |
| Regression    | `npm run validate`                                                                   | exit 0                 |

## Scope

**In scope**:

- authoritative schema policy/ADR update and shared compatibility corpus
- TS shared product/category/storefront schemas and domain refinements
- Python and Astro adapters/validators needed for convergence
- dry-run diagnostics and explicit migration tooling if existing data needs repair

**Out of scope**:

- Changing product identity format or catalog authority.
- Silent destructive normalization of real catalog data.
- Coupling Astro runtime directly to Fastify or the admin package.

## Git workflow

- Branch: `refactor/065-canonical-content-contracts`
- Commit compatibility tests before behavior changes.

## Steps

### Step 1: Write the authoritative field policy

For every catalog/category/storefront field, document owner, type, required/default,
cross-field rules, path policy, metadata visibility, unknown-key behavior, and consumer
adaptation. Decide intentionally whether unknown fields are preserved or rejected; never
silently strip them on read/write.

**Verify**: a machine-readable field matrix has an owner and fixture for every field;
the ADR records any intentional consumer differences.

### Step 2: Expand differential compatibility fixtures

Cover all optional fields, boundaries, invalid discounts, legacy labels, asset paths,
missing fallback, unknown fields, Unicode, archived/stock states, and metadata. Capture
accept/reject plus normalized output for Python, TS, and Astro.

**Verify**: the harness reports every unexplained difference and fails on stale goldens.

### Step 3: Establish a canonical schema package/policy

Make TS shared schemas the repository-owned contract where feasible, with explicit
domain refinements. Derive or mechanically test Python/Astro adapters against it; avoid
three hand-maintained authoritative rule sets. Keep storefront projection deliberately
smaller while proving it cannot reinterpret canonical fields.

**Verify**: schema mutation tests catch changed discount, identity, path, and unknown-field
policies; all consumers pass the compatibility corpus.

### Step 4: Add dry-run migration diagnostics

Scan production-shaped files read-only and report rule violations, proposed conversions,
and ambiguous cases. If transformations are needed, create a separately approved,
backup-first migration with reversible output; do not execute it in this plan's tests.

**Verify**: dry run performs zero writes and returns non-zero for ambiguous/unrepairable
records with exact IDs/fields, never secret values.

## Test plan

- Extend `plans/fixtures/055` capture scripts and contract suites.
- Add property/boundary cases for price/discount, paths, IDs, order, and metadata.
- Test unknown fields through load → edit unrelated field → save.
- Run full Python fallback tests after shared behavior changes.

## Done criteria

- [ ] One documented authoritative policy owns every content field and invariant.
- [ ] Python, TS, and Astro have zero unexplained compatibility differences.
- [ ] Unknown-field behavior is explicit and lossless under the accepted policy.
- [ ] Production-shaped validation has a zero-write dry-run report.
- [ ] Parity/golden, manager, Python, Astro, and root validation pass.

## STOP conditions

- Existing data violates a proposed rule without an unambiguous reversible mapping.
- A consumer needs incompatible semantics not captured as an explicit adapter.
- Generated-code sharing would introduce an unsupported runtime dependency.
- Golden refresh would hide rather than explain a behavioral difference.

## Maintenance notes

Future schema changes require field-matrix, all-consumer fixtures, migration impact, and
unknown-field round-trip evidence in the same PR.
