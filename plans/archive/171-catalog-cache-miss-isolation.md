# Plan 171: Close the catalog cache-miss isolation leak

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/repositories/productRepository.ts admin/content-manager/src/domain/products/productService.ts admin/content-manager/src/server/routes/catalog-command.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`ProductRepository.loadCatalog()` honors the plan-105 isolation guarantee on
the cache _hit_ path (`structuredClone`) but returns the live cached object on
the cache _miss_ path — so the first request after any invalidation hands its
mutable catalog to the service layer, and a rejected edit still poisons the
cache (false 409s, GETs observing unsaved state). This silently reintroduces
exactly the bug class plan 105 fixed. The fix is two lines plus regression
tests.

## Current state

Relevant files and roles:

- `admin/content-manager/src/server/repositories/productRepository.ts` —
  mtime+size-keyed catalog cache; `loadCatalog()` (lines 54–108),
  `writeCatalog()` (lines 110–138+).
- `admin/content-manager/src/domain/products/productService.ts` — mutates the
  catalog in place (`edit()`, `create()`, `bulkApply()`).
- `admin/content-manager/src/server/routes/catalog-command.ts` — `apply`
  mutates first, `writeCatalog` revision-checks later (lines 36–60).

Excerpts (verified by advisor read):

```ts
// productRepository.ts:59-66 — hit path clones ...
if (this.cache?.key === cacheKey) {
  // Plan 105: hand out a private copy ...
  return structuredClone(this.cache.catalog);
}
```

```ts
// productRepository.ts:106-107 — ... but miss path leaks the live reference
this.cache = { key: cacheKey, catalog: result.data };
return result.data;
```

```ts
// productService.ts (edit, price branch) — mutates BEFORE the discount guard
product.price = params.changes.price; // rev bump follows
product.rev += 1;
// ... later branch may `return { ok: false, ... 422 }` AFTER the mutation
```

```ts
// catalog-command.ts:36-44 — apply runs on the (shared) catalog; failure
// returns without invalidating the cache
const catalog = repos.products.loadCatalog();
const baseRev = catalog.rev;
const result = await apply(catalog);
if (!result.ok) { ...return 4xx... }
```

Repo conventions: services mutate in place and rely on repository isolation;
`writeCatalog` invalidates eagerly (`this.cache = null`, line 117). Tests use
temp repos via `createApp({ repoRoot: tmp })` + `app.inject` — see
`admin/content-manager/test/contract/credential.test.ts` for the fixture
pattern. This plan must stay consistent with ADR 0009 (single authoritative
catalog) — it changes isolation only, not the data contract.

## Commands you will need

| Purpose      | Command                                                                                                                                                  | Provenance | Expected on success |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install      | `npm ci`                                                                                                                                                 | declared   | exit 0              |
| Typecheck    | `npm run admin:typecheck`                                                                                                                                | declared   | exit 0, no errors   |
| Tests        | `npm run admin:test`                                                                                                                                     | declared   | all pass            |
| Lint (admin) | `npx eslint src/server/repositories/productRepository.ts src/domain/products/productService.ts --config eslint.config.mjs` (cwd `admin/content-manager`) | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/repositories/productRepository.ts`
- `admin/content-manager/test/contract/catalog-isolation.test.ts` (create)

**Out of scope**:

- `catalog-command.ts` idempotency reorder (plan 175 owns it) — do not move
  the idempotency check here.
- Any change to the write path, revision semantics, or response envelopes.
- `structuredClone` removal or frozen-view optimization (perf plan 188 owns
  that trade-off discussion; this plan only extends cloning to the miss path).

## Git workflow

- Branch: `advisor/171-catalog-cache-miss-isolation`
- Commit per step; message style: conventional commits, e.g.
  `fix(admin): clone catalog on cache-miss path (plan 171)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE (clean tree). Run Install, then Typecheck and the
contract test subset on the unmodified checkout.

**Verify**: all commands pass before changing anything; otherwise STOP.

### Step 1: Clone on the cache-miss path

In `loadCatalog()`, change the miss-path return to hand out a private copy,
mirroring the hit path:

```ts
this.cache = { key: cacheKey, catalog: result.data };
return structuredClone(result.data);
```

Do NOT clone-on-store instead: the cache must keep a pristine copy because
services mutate whatever `loadCatalog()` returns.

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Add isolation regression tests

Create `admin/content-manager/test/contract/catalog-isolation.test.ts`
(model on `credential.test.ts` temp-repo + `app.inject` pattern) with:

1. Miss-path isolation: cold-load, mutate the returned object in a second
   `loadCatalog()` consumer (or via a 422-rejected `PATCH` with discount >
   price), then assert a fresh `GET /api/v1/products` shows pre-mutation
   values and the next write does not 409.
2. Rejected-edit poisoning: `PATCH` price up + discount above price →
   expect 422; then `GET` the product → price unchanged; then a valid edit
   with the original rev → succeeds (no false 409).
3. Concurrent-request simulation (sequential is fine): two loads, mutate one,
   assert the other is unaffected.

**Verify**: `npm run admin:test` → all pass, including the 3 new tests
(run the file by name filter and confirm 3 passing).

## Test plan

- New file `test/contract/catalog-isolation.test.ts`, 3 cases above.
- Pattern: `test/contract/credential.test.ts` (temp repo, `createApp`,
  `app.inject`, `rmSync` cleanup in `finally`).
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with the 3 new isolation tests passing.
- [ ] `grep -n "return result.data" admin/content-manager/src/server/repositories/productRepository.ts` returns no matches (miss path clones).
- [ ] `git diff --name-only 0847089c...HEAD` lists only the in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The miss-path code does not match the excerpt (drift).
- A repository other than `ProductRepository` is needed for the fix.
- `writeCatalog`'s eager invalidation is gone (the fix's safety assumption).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Every per-request `loadCatalog()` now pays one `structuredClone`; if
  profiling ever flags it, the correct optimization is frozen/shared views
  (plan 188), never returning the live reference.
- Reviewer: confirm no caller relied on mutating the returned catalog and
  having it persist without `writeCatalog` (that would have been a bug, but
  check the diff for such callers).
- **Deferred:** moving the idempotency check ahead of `apply` → plan 175.
