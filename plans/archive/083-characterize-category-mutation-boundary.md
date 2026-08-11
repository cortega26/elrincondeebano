# Plan 083: Characterize the category mutation boundary with contract and route tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src admin/content-manager/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/070-commit-canonical-content-manager.md (080 recommended — its concurrency changes will want these tests)
- **Category**: tests
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The category taxonomy is the second most important write surface of the
content manager — its routes write the canonical `data/category_registry.json`
that the storefront build consumes — yet it has the worst coverage in the
repo: `categoryService.ts` sits at **0 %** (77 statements), the mutation
routes (`POST/PATCH/DELETE /categories`, `/categories/reorder`,
`nav-groups`) have **zero** test references (only `GET /api/v1/categories`
is tested), and the "category in use" delete guard is untested. The discount
filter on the storefront side is similarly unguarded: `ensureDiscountToggle`
is tested against a **copy** of the function, not the module.

These tests are characterization: they pin the CURRENT behavior so that
plan 080's concurrency changes and future refactors can't silently break
the taxonomy, and they flush out contradictions (like the category
requiredness conflict in plan 074) early.

## Current state

Verified facts:

- `admin/content-manager/src/domain/categories/categoryService.ts` — 77
  statements, 0 % coverage (measured with `npx vitest run --coverage`).
- `admin/content-manager/src/server/routes/catalog.ts:338-483` — category
  and nav-group mutation routes; the delete guard "category in use" at
  `:390-397`.
- `test/integration/api.test.ts:208,266` — the only category references:
  GET routes.
- `test/ensureDiscountToggle.test.js:12-40` — defines `ensureDiscountToggle`
  inline (a copy); the real implementation is
  `src/js/modules/catalog-manager.mjs:42`, used at `:394`.
- Pattern to follow: `test/integration/mutationApi.test.ts` (route tests
  with `app.inject` over a temp repo) and `test/contract/productService.test.ts`
  (domain contract tests).
- Note: `categoryService` is about to change in plan 080 (revision guard).
  If 080 lands first, characterize the NEW behavior; if these tests land
  first, they double as the safety net FOR 080. Either order works — the
  plan's tests must match the code at execution time.

## Commands you will need

| Purpose    | Command                                 | Expected on success   |
| ---------- | --------------------------------------- | --------------------- |
| Typecheck  | `npm run admin:typecheck`               | exit 0                |
| Tests      | `npm run admin:test`                    | exit 0                |
| Coverage   | `npx vitest run --coverage` (workspace) | categoryService % > 0 |
| Root tests | `npm test`                              | exit 0                |

## Scope

**In scope**:

- `admin/content-manager/test/contract/categoryService.test.ts` (new)
- `admin/content-manager/test/integration/categoryMutationApi.test.ts` (new)
- `test/ensureDiscountToggle.test.js` (fix to import the module — the
  catalog-manager module is legacy `src/js`; keep the test but make it test
  the real function)
- Nothing in `src/` unless a test exposes a bug that blocks the test itself
  (then STOP and report)

**Out of scope**:

- Implementing the revision guard (plan 080), the discount invariant
  (plan 074), or any storefront change.
- Deleting or refactoring `src/js/modules/catalog-manager.mjs`.

## Git workflow

- Branch: `advisor/083-characterize-category-mutation-boundary`.
- Commit per test file, message style `test(admin): characterize category mutation routes` / `test: test the real ensureDiscountToggle module` — `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterize CategoryService

Modeled on `test/contract/productService.test.ts` (read it first — it
constructs the service with a fake/enabled flag and asserts return shapes).
Cover the CURRENT behavior of `categoryService`:

- create category (valid + invalid input)
- edit (name, order, subcategories)
- delete with products still using the category (the guard at
  catalog.ts:390-397 may live in the route or the service — cover whichever
  owns it; if it's the route, cover it in Step 2)
- reorder

Mark assertions that feel like bugs (e.g. missing validation) with a
`// KNOWN-BEHAVIOR: pinning current semantics — revisit with plan 074/080`
comment instead of "fixing" them.

**Verify**: `npx vitest run test/contract/categoryService.test.ts` → all
pass; coverage for `domain/categories` > 0.

### Step 2: Characterize the category mutation routes

Modeled on `test/integration/mutationApi.test.ts` (temp repo +
`app.inject`): for each of `POST /categories`, `PATCH /categories/:id`,
`DELETE /categories/:id`, `POST /categories/reorder`,
`POST /nav-groups`, `DELETE /nav-groups/:id`:

- happy path → 2xx and the file on disk changed
- 401 without credential (once plan 071's boundary is live; if 071 hasn't
  landed yet, the routes currently respond 200/4xx — note the actual status
  and mark the assertion `// depends on plan 071` so it can be flipped)
- the delete-in-use guard → 409/400 with a message

**Verify**: `npx vitest run test/integration/categoryMutationApi.test.ts` → all pass.

### Step 3: Fix the copy-test

In `test/ensureDiscountToggle.test.js`, replace the inline copy with an
import of the real function:

```js
import { ensureDiscountToggle } from '../src/js/modules/catalog-manager.mjs';
```

If the module can't be imported in the node:test context (it touches DOM at
module scope), stub the DOM globals the module needs — check
`test/catalog-manager.test.js:41` (it already imports the module, so the
pattern exists). Keep all existing assertions; add one that the module's
function is the one being tested (`assert.equal(typeof ensureDiscountToggle, "function")`).

**Verify**: `npm test` exit 0; `node --test test/ensureDiscountToggle.test.js` passes with the real import.

### Step 4: Coverage gate

**Verify**: `npx vitest run --coverage` in the workspace → `domain/categories`

> 0 % (no threshold change needed; just confirm the number is no longer 0).
> Record the new number in the commit message.

## Test plan

- Step 1: contract tests for every public `categoryService` method.
- Step 2: route tests for every category/nav-group mutation (happy,
  auth-gated, delete-in-use).
- Step 3: the real `ensureDiscountToggle` tested.
- Full: `npm run admin:test` + `npm test` exit 0.

## Done criteria

- [ ] `categoryService` contract tests exist and pass (coverage > 0 for `domain/categories`)
- [ ] Category mutation routes covered incl. the delete-in-use guard
- [ ] `ensureDiscountToggle.test.js` imports the real module
- [ ] `npm run admin:typecheck`, `npm run admin:test`, `npm test` exit 0
- [ ] `plans/README.md` status row 083 updated

## STOP conditions

Stop and report back (do not improvise) if:

- A characterization test exposes a bug so severe it blocks writing the
  tests (e.g. a route 500s on its own happy path) — report with the failing
  case; do not fix production code in this plan.
- `catalog-manager.mjs` can't be imported in the node:test context with
  reasonable stubs — report what it needs.
- Plan 080 landed first and the route signatures changed — re-read the
  routes and characterize the new behavior (that's the intended safety net).

## Maintenance notes

- These are characterization tests: when plan 074/080 change behavior,
  update the pinned assertions in the SAME change as the behavior change.
- The `// depends on plan 071` markers must be flipped when 071 lands —
  grep for them in the new file.
- The storefront-side `ensureDiscountToggle` lives in legacy `src/js` —
  when plan 031/ARCH-06 retires that tree, this test moves to the migrated
  module or dies with it (note it).
