# Plan 194: Unify revision-guarded writes across product and category routes; table-drive productService.edit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/routes/categoryRoutes.ts admin/content-manager/src/server/routes/catalog-command.ts admin/content-manager/src/server/routes/helpers.ts admin/content-manager/src/domain/products/productService.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/171-catalog-cache-miss-isolation.md, plans/175-changeset-apply-robustness.md
- **Category**: tech-debt
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Two structural duplications on the mutation path, both proven Paisley by the
plans that came before: (1) category routes hand-roll `load → service →
write → if (!wrote.ok)` per route against `CategoryRepository` while product
routes use the converged `runCatalogCommand` — every revision-guard, envelope,
and idempotency fix (plans 171/175) must now be repeated per route, and the
contracts already drift (products return `command_id/resulting_revision`,
categories return `rev` or bare records), so clients retry/undo against
inconsistent shapes. (2) `productService.edit` repeats the same
`rev += 1` + `field_last_modified` block nine times (plus a tenth variant in
`bulkApply`) — adding one product field means touching interface, edit
branch, bulk map, route envelope, and client, which routinely lands
partially. IMPORTANT CORRECTION from vetting: `runCatalogCommand` is
product-catalog-specific (loads/writes `ProductRepository`) while categories
use a separate `CategoryRepository` with its own rev guard — so this plan
generalizes the helper, it does not blindly "adopt" it.

## Current state

Verified by advisor read:

```ts
// categoryRoutes.ts:52-77 — per-route hand-rolled write (×14 routes, 0 uses of runCatalogCommand)
const registry = repos.categories.load();
const result = categoryService.create(registry, body);
if (!result.ok) { return reply.status(409).send({...}); }
const wrote = await repos.categories.write(registry, readBaseRevision(request.body));
if (!wrote.ok) { return reply.status(wrote.statusCode).send({...}); }
...
return reply.status(201).send({ ...result.category, rev: wrote.rev });
```

```ts
// catalog-command.ts:9-30 — product-specific helper (repos.products.loadCatalog/writeCatalog baked in)
// helpers.ts:2-5 — Repositories { products, categories, storefront }; changeSetApplier.ts:5 imports the TYPE from routes/helpers (route→service→route cycle; plan 197 owns the type move — do NOT move types here, import from current locations)
```

```ts
// productService.ts:176-325 — nine `if (changes.X !== product.X)` blocks, each with rev += 1 + field_last_modified literal; bulkApply:530-552 repeats the metadata write with a switch-to-field map
```

Conventions: plan 094 typed error codes (never string-match messages);
`201` on category create; `command_id/resulting_revision` product envelope;
contract tests pin 409/retry behavior — keep them green and unchanged.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**: `categoryRoutes.ts` (migrate route by route),
`catalog-command.ts` (generalize: parametrize load/write/envelope over the
target repo, defaulting to current product behavior), `productService.ts`
(table-drive `edit` + share the applier with `bulkApply`).

**Out of scope**: response-envelope unification beyond additive alignment
(do not break existing category clients — keep `rev` fields, ADD
`command_id`/`resulting_revision` alongside); the `Repositories` type move
(plan 197); single-edit validation semantics (unchanged).

## Git workflow

- Branch: `advisor/194-write-path-unification`
- Commit per route-group + one for the table refactor; e.g.
  `refactor(admin): generalize catalog command for category writes (plan 194)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + characterization

Requires plans 170, 171, 175 DONE (this code sits on their contracts). Full
admin suite green. Add (or confirm existing) characterization tests pinning:
category create/edit 409 shapes, product command envelope fields, per-field
rev bumps + `field_last_modified` entries for each of the 9 edit branches
(extend existing category/product contract tests — do not create a parallel
suite).

**Verify**: green; characterization in place; otherwise STOP.

### Step 1: Generalize the command helper; migrate category routes one by one

- Extend `runCatalogCommand` (or add a sibling `runRegistryCommand` in the
  same file — prefer the smaller diff that reviewers can verify) accepting
  `load`/`write` for the target repo while keeping the product call
  signature source-compatible (existing 5 product call sites + plan 175's
  reservation logic untouched in behavior).
- Migrate `categoryRoutes.ts` one route at a time, preserving status codes
  (201 create, 404/409/422 mapping) and ADDING `command_id`/
  `resulting_revision` to category success payloads (additive).
- After each route-group commit, run the contract tests.

**Verify**: typecheck + contract tests green after every group.

### Step 2: Table-drive field application in productService

Replace the nine `if` blocks with an allowed-fields table
(field → apply + validate) plus ONE metadata writer (`rev += 1` +
`field_last_modified[field]`), shared by `edit` and `bulkApply` (bulk keeps
its `by: 'bulk'` attribution and plan 088/102 skip semantics — pin with the
Step-0 tests). No behavior change: same branches, same guards, same order
(price-before-discount effective-discount logic preserved exactly).

**Verify**: typecheck + full admin suite green (characterization proves
equivalence).

## Test plan

- Step-0 characterization (rev/metadata per branch, 409 shapes, envelopes).
- Per-group contract runs; final full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] `grep -n "repos.categories.write" admin/content-manager/src/server/routes/categoryRoutes.ts` shows only helper-delegated calls (no hand-rolled `if (!wrote.ok)` blocks remain).
- [ ] `grep -c "rev += 1" admin/content-manager/src/domain/products/productService.ts` shows exactly 2 (one shared writer + reorder's, or as documented in the commit).
- [ ] Category success payloads carry `command_id`/`resulting_revision`.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `CategoryRepository.write` semantics differ from assumed (rev guard shape)
  — report the actual signature instead of forcing the abstraction.
- Envelope alignment breaks an existing client test (keep the old fields;
  report the conflict).
- The table refactor changes any guard outcome vs characterization (revert
  that hunk; the refactor must be behavior-identical).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New mutation routes MUST use the generalized helper (leave that sentence
  in `catalog-command.ts`'s header comment); new product fields go in the
  allowed-fields table (single place).
- Reviewer: diff each migrated route's status codes against the old code —
  that is the entire risk surface.
- **Deferred:** unifying the two repositories' storage (plan 196's call).
