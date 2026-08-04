# Plan 080: Add optimistic concurrency to category mutations and constrain path-interpolated IDs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md (071 recommended)
- **Category**: correctness / security
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

Products get optimistic concurrency (a `rev` field, a base-revision check,
and a per-repo `MutationLock`); **categories and the conflict/change-set
stores get none**. Two operators (or the operator plus the Python fallback
tool, which the transition window explicitly allows) editing categories
concurrently → last-writer-wins with silent loss, no 409. The same routes
write the canonical `data/category_registry.json` that the storefront build
consumes.

Separately, three repositories interpolate client-supplied IDs into file
paths with no validation: `changeSetRepository.ts:15` (`resolve(this.dir,
\`${id}.json\`)`), `conflictRepository.ts:12`(same), and`backup.ts:73` (`resolve(backupsDir, id)`). A crafted id with `../` (or
percent-encoded slashes, which Fastify decodes in params) escapes the
intended directory — the backup case was verified by code reading; the
others share the exact pattern. IDs are server-generated today
(`changeSet.ts:51`→`cs-<ts>-<rand>`, no separators), so constraining them
breaks no legitimate caller.

After this plan: category mutations carry a revision check and a lock like
products do, and no repository interpolates an unvalidated id into a path.

## Current state

Verified code (read directly):

- `admin/content-manager/src/server/routes/catalog.ts:367-388` (`PATCH
/categories/:id`), `:417-438` (`POST /categories/reorder`), `:440-483`
  (`POST /nav-groups`, `DELETE /nav-groups/:id`) — all do
  `load()` → mutate → `write()` with no revision parameter and no lock.
- `admin/content-manager/src/domain/categories/categoryService.ts:56-90` —
  `edit` mutates and returns; no revision concept.
- `admin/content-manager/src/shared/schemas/category.ts:38-41` —
  `categoryRegistrySchema` has no `rev` field.
- The product pattern to mirror: `productRepository.ts:20` (`MutationLock`),
  `:75-87` (lock + `current.rev !== baseRevision` → 409).
- `admin/content-manager/src/server/repositories/changeSetRepository.ts:15,19`:
  ```ts
  load(id) { ... resolve(this.dir, `${id}.json`) ... }
  ```
- `conflictRepository.ts:12` — same pattern.
- `backup.ts:73` — `resolve(backupsDir, id)`.
- `changeSet.ts:51` — `generateChangeSetId(): string` returns
  `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.

Repo conventions: same as plans 071-078 (TS 7, vitest, `app.inject`
integration tests, temp-repo fixtures). Existing category tests:
`test/integration/subcategoryBundles.test.ts`, `test/contract/schemas.test.ts`.

## Commands you will need

| Purpose   | Command                                                      | Expected on success |
| --------- | ------------------------------------------------------------ | ------------------- |
| Typecheck | `npm run admin:typecheck`                                    | exit 0              |
| Tests     | `npm run admin:test`                                         | exit 0              |
| Targeted  | `npx vitest run test/integration/subcategoryBundles.test.ts` | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/shared/schemas/category.ts` (add `rev`)
- `admin/content-manager/src/server/repositories/categoryRepository.ts` (rev
  bump on write, lock, base-revision check — mirror productRepository)
- `admin/content-manager/src/server/routes/catalog.ts` (category mutation
  routes: accept `base_revision`, return 409 on mismatch; id validation)
- `admin/content-manager/src/server/repositories/changeSetRepository.ts`,
  `conflictRepository.ts` (id validation)
- `admin/content-manager/src/server/routes/backup.ts` (id validation)
- `admin/content-manager/src/web/app/routes/CategoriesPage.tsx` (send
  `base_revision`; handle 409 with a reload-and-retry message)
- `admin/content-manager/test/` — new/updated tests

**Out of scope**:

- Adding revision to conflicts/change-sets themselves (plan 062).
- The storefront's category consumption (plan 065/066).
- Anything in the Python fallback.

## Git workflow

- Branch: `advisor/080-harden-category-concurrency`.
- Commit per logical half (concurrency, then id paths), conventional style
  (`fix(admin): revision-guard category mutations`, `fix(admin): validate path-interpolated ids`), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `rev` to the category registry schema

`categoryRegistrySchema` gains `rev: z.number().int().nonnegative()` (with a
sensible default for files that predate it — check how the product schema
handles `rev` defaults and mirror it; keep read-path lenient like plan 074).

**Verify**: `npm run admin:typecheck` exit 0; `test/contract/schemas.test.ts`
still green.

### Step 2: Revision-guard category writes

In `categoryRepository`, mirror `productRepository.writeCatalog`: acquire a
`MutationLock`, load current, compare `current.rev` with the client's
`base_revision`, 409 on mismatch, else write and bump `rev`. The category
routes read `base_revision` from the request body (add to the zod schema or
parse explicitly — match the products route's style at
`catalog.ts:119-180`).

**Verify**: extend `test/integration/subcategoryBundles.test.ts` (or a new
`categoryConcurrency.test.ts` modeled on the product concurrency tests):
PATCH with stale `base_revision` → 409; fresh → 200 and `rev` bumped.

### Step 3: Update the categories UI for 409

`CategoriesPage.tsx` — on 409 from a category mutation, reload the category
list and show "La categoría cambió; recarga y reintenta" instead of a silent
failure. (Inspect how ProductsPage handles 409 — mirror it.)

**Verify**: `npm run admin:typecheck` exit 0; `npm run admin:build:web` exit 0.

### Step 4: Validate path-interpolated ids

Add a shared helper (e.g. in `src/shared/identity.ts` or a new
`src/server/services/pathSafety.ts`):

```ts
export function isSafeId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 128 &&
    !id.includes('/') &&
    !id.includes('\\') &&
    !id.includes('..') &&
    /^[A-Za-z0-9._-]+$/.test(id)
  );
}
```

Use it in `changeSetRepository.load`, `conflictRepository.load` (and any
`save` taking an id), and `backup.ts` (`POST /backup/:id/restore`) —
returning 400 INVALID_ID on failure. Keep the generated ids
(`cs-...`, timestamps) passing the regex.

**Verify**: grep `resolve(this.dir` and `resolve(backupsDir` → every site
guards the id first. Add tests: `test/contract/pathSafety.test.ts` (new)
for the helper; integration: PATCH `/change-sets/..%2F..%2Fdata%2Fx` →
400 (not a file read); POST `/backup/..%2F..%2Fdata/restore` → 400.

### Step 5: Full-suite verification

**Verify**: `npm run admin:test` exit 0 (all 289 + new tests);
`npm run admin:typecheck` exit 0.

## Test plan

- `test/integration/categoryConcurrency.test.ts` (new) — stale-rev 409,
  fresh-rev success, concurrent patch serialization (two in-flight injects).
- `test/contract/pathSafety.test.ts` (new) — helper units.
- Integration id-traversal probes (Step 4) — encoded-slash ids → 400.
- Existing category/subcategory tests stay green.

## Done criteria

- [ ] Category registry has `rev`; stale `base_revision` → 409 (test proves)
- [ ] Category writes hold a lock (concurrent patch test proves serialization)
- [ ] `isSafeId` guard on all three id-interpolation sites; traversal-style
      ids → 400 (tests prove)
- [ ] CategoriesPage handles 409 with a reload message
- [ ] `npm run admin:typecheck` and `npm run admin:test` exit 0
- [ ] `plans/README.md` status row 080 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The category registry file already exists without `rev` and adding the
  field breaks an existing consumer (the Python fallback reads
  `category_registry.json` — check `admin/product_manager/` parsers; if they
  fail on an extra field, report; do not remove the field).
- `CategoriesPage.tsx` doesn't have a 409-handling pattern to mirror (report
  what the page currently does on errors).
- The encoded-slash probes behave differently than expected (record actual
  statuses — Fastify may normalize before the handler; whatever the outcome,
  the guard must make the result deterministic).

## Maintenance notes

- This is the same pattern products use — when plan 062 builds the change-set
  control center, revisions for conflicts/change-sets should reuse this
  helper, not reimplement it.
- The id regex allows `.` and `-`; if a future id format needs other
  characters, extend the regex + tests together.
- Reviewer focus: the 409 UX — the reload must preserve the operator's
  unsaved form state where possible (mirror ProductsPage's approach exactly).
