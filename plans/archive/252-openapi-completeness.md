# Plan 252: Declare the 18 admin UI operations in OpenAPI and pin routes↔doc completeness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <planned-at>..HEAD -- admin/content-manager/src/server/openapi.ts admin/content-manager/test/contract/openapi.test.ts admin/content-manager/test/contract/routePolicy.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none
- **Category**: tests / tech-debt
- **Planned at**: commit `3305f064`, 2026-10-18

## Why this matters

Plan 229 stopped on its own STOP condition: **0 of the 18 method+path pairs
used by the admin UI** (`MediaPage`, `HistoryPage`, `ConflictsPage`) are
declared in `buildOpenApi()`. The audit's TD-04 assumed the document
declared them — it does not. Consequences:

- The typed client cannot cover these calls without failing
  `test/contract/openapi.test.ts` (the existing scan of `src/web/api/*.ts`
  asserts every client route is declared).
- Renaming or reshaping any of these endpoints still fails no test and no
  typecheck: the exact drift class TD-04/plan 229 exists to close.
- The OpenAPI document is misleading as an API contract: five domains are
  represented only by their GET list endpoint.

This plan declares the operations (server-side contract work) and adds a
completeness guard so a new route cannot exist without a declaration.

## Current state

`admin/content-manager/src/server/openapi.ts` declares products and
categories comprehensively, but for these domains only GET list endpoints:
`GET /api/v1/media` (`:269`), `GET /api/v1/history` (`:406`),
`GET /api/v1/change-sets` (`:412`), `GET /api/v1/backup` (`:418`),
`GET /api/v1/conflicts` (`:430`).

The routes that exist server-side (verified):

- `server/routes/mediaUploadRoutes.ts:68` — `POST /api/v1/media/upload`
- `server/routes/mediaIntentRoutes.ts:53` — `POST /api/v1/media/intents`
- `mediaIntentRoutes.ts` — `POST /api/v1/media/intents/{id}/run`,
  `.../{id}/cancel`, `.../{id}/apply`, `DELETE /api/v1/media/intents/{id}`
  (the `discard` UI action maps to the bare DELETE — confirmed at `:345`),
  `POST /api/v1/media/intents/batch`
- `server/routes/changeSetRoutes.ts:179/218/316/362` —
  `POST /api/v1/change-sets/{id}/apply`, `.../discard`, `.../undo`, `.../redo`
- `server/routes/changeSetRoutes.ts` — `PATCH /api/v1/change-sets/{id}`
  (validate/update; used by `HistoryPage.tsx:135`)
- `server/routes/historyRoutes.ts:154` — `POST /api/v1/history/{productId}/revert`
- `server/routes/backup.ts:45/49/75` —
  `POST /api/v1/backup/prune-preview`, `POST /api/v1/backup/prune`,
  `POST /api/v1/backup/{id}/restore`
- `server/routes/conflicts.ts:53/108` —
  `POST /api/v1/conflicts/{id}/resolve`, `.../retry`

Existing declaration pattern to follow: `registry.registerPath({...})`
with zod schemas from `shared/schemas/**` (see the product/category blocks
in `openapi.ts`, e.g. `:81-215`).

Route-table sources for the completeness guard: check
`server/security/routePolicy.ts` (classification table) and
`test/contract/routePolicy.test.ts` — if one enumerates every route
exhaustively, reuse it; otherwise parse `app.printRoutes({ commonPrefix:
false })` in the test (temp-repo `createApp` pattern).

## Commands you will need

| Purpose         | Command                                                                                                        | Provenance | Expected on success |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install         | `npm ci`                                                                                                       | declared   | exit 0              |
| Admin typecheck | `npm run admin:typecheck`                                                                                      | declared   | exit 0              |
| Focused tests   | `npx vitest run test/contract/openapi.test.ts test/contract/routePolicy.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests     | `npm run admin:test`                                                                                           | declared   | all pass            |
| Lint (admin)    | `npm run admin:lint`                                                                                           | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/openapi.ts`
- `admin/content-manager/test/contract/openapi.test.ts`
- `admin/content-manager/test/contract/routePolicy.test.ts` (only if the
  guard reuses its table)
- A new guard test file under `admin/content-manager/test/contract/` only
  if none fits.

**Out of scope**:

- Client methods and page refactors (plan 229 owns those, after this lands).
- Changing any route handler or response shape. The document must describe
  what ships; if a handler's shape is genuinely unavailable, STOP.
- The `comms`/`preview` domains' remaining operations (separate future
  work; do not expand the pair list).

## Git workflow

- Branch: `advisor/252-openapi-completeness`
- Commits: `docs(admin): declare media/history/changes/backup/conflicts operations (plan 252)`.

## Steps

### Step 0: Establish a green baseline

Install, then the focused tests and `npm run admin:test`. Red → STOP.

### Step 1: Declare the 18 operations

For each pair in "Current state", register a path with the existing zod
schemas (bodies/responses derived from the handlers and their integration
tests — do not invent fields). Conventions:

- Path params as `{id}` / `{productId}` (OpenAPI style; the Fastify syntax
  `:id` is not used in the doc).
- Media `discard` is `DELETE /api/v1/media/intents/{id}` (no `/discard`
  suffix).
- Mark mutations with the same summary/tag style as the surrounding
  product/category entries.
- Reuse response envelopes (`{ product, rev, conflicts }` etc.) exactly as
  the handlers return them.

**Verify**: `npx vitest run test/contract/openapi.test.ts` (cwd admin) →
all pass; the document parses (`npm run admin:typecheck`).

### Step 2: Completeness guard (routes ↔ document)

Add a test (extend `openapi.test.ts` or a sibling contract test) that:

1. Builds the app with `createApp({ repoRoot: <temp>, logger: false })`
   (follow the temp-repo pattern) and enumerates the registered routes —
   prefer `app.printRoutes({ commonPrefix: false })`; if the route policy
   table already enumerates every `/api/v1` route exhaustively, reusing it
   is acceptable (state which source you used).
2. For every `/api/v1` route, asserts a matching path+method exists in the
   generated document, excluding an explicit allowlist (`/api/v1/health`,
   `/api/v1/openapi.json`, `/api/v1/openapi.csv` if present) with a comment
   per entry.
3. Fails with `METHOD path` lines for any undeclared route.

**Discrimination check** (record in the PR): temporarily remove one
declaration → the guard fails naming that pair; restore.

**Verify**: focused contract tests green.

### Step 3: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:typecheck` →
exit 0; `npm run admin:lint` → exit 0.

## Test plan

- Existing `openapi.test.ts` must stay green (it now covers more client
  routes once plan 229 lands; this plan only adds declarations).
- New completeness guard with the allowlist.
- Discrimination check recorded.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "media/intents" admin/content-manager/src/server/openapi.ts` ≥ 5
- [ ] `grep -n "change-sets/{id}/undo\|change-sets/{id}/redo\|conflicts/{id}/resolve\|backup/{id}/restore" admin/content-manager/src/server/openapi.ts` shows all four families
- [ ] The completeness guard exists and passes; removing one declaration makes it fail
- [ ] `npm run admin:test` exits 0; `npm run admin:typecheck` exits 0; `npm run admin:lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A handler's request/response shape cannot be derived from code + tests
  (report the handler; do not guess fields).
- The route table cannot be enumerated reliably (report what you tried).
- A route is intentionally undocumented for a reason you find in code
  (report; it belongs in the allowlist with a comment, but the owner
  decides).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- New admin routes must be declared in `openapi.ts` in the same PR; the
  completeness guard enforces it. This is the durable fix for the TD-04
  class.
- Reviewer: confirm the declared request/response shapes match the
  integration tests, not just the TypeScript types.
- **Deferred:** declaring the comms/preview domains' remaining operations
  (same method, separate scope).
