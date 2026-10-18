# Plan 229: Route the 15 raw `/api/v1` page calls through the typed client (and guard it)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/web/app/routes/MediaPage.tsx admin/content-manager/src/web/app/routes/HistoryPage.tsx admin/content-manager/src/web/app/routes/ConflictsPage.tsx admin/content-manager/src/web/api/media.ts admin/content-manager/src/web/api/changes.ts admin/content-manager/src/web/api/conflicts.ts admin/content-manager/src/web/api/client.ts admin/content-manager/test/contract/openapi.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 227 (satisfied), **252 (blocker — OpenAPI declarations)**
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18
- **BLOCKED (2026-10-18, round 1)**: the STOP condition fired — **0/18**
  method+path pairs used by `MediaPage`/`HistoryPage`/`ConflictsPage` are
  declared in `buildOpenApi()` (only their GET list endpoints exist). The
  plan's premise that the document covered them is false. Prerequisite:
  plan 252 declares the 18 operations + a routes↔doc completeness guard;
  re-dispatch this plan after 252 lands, then proceed as written.

## Why this matters

`requestCore.ts:9-10` states the maintenance rule — _"new API methods go in
their domain module under `src/web/api/` and use this core. New fetch
wrappers are banned."_ — but 15 call sites still hand-build URLs via
`fetchWithCredential`/local `post()` helpers, with untyped responses:

- `MediaPage.tsx:137,171,205,241` (upload, intent create/run/discard, batch)
- `HistoryPage.tsx:118,125,135,162,186,193,203,222,237` (change-set
  apply/discard/get/undo/redo, history revert, backup prune-preview/prune/restore)
- `ConflictsPage.tsx:140,165` (resolve, retry)

The OpenAPI contract test (`test/contract/openapi.test.ts:16,24-27`) only
scans `src/web/api/*.ts`, so **none** of these 15 paths are covered by the
drift guard: renaming an endpoint fails no test and no typecheck — the page
just 404s at runtime. Responses are cast by hand, so shape changes are
invisible at compile time.

## Current state

Call-site inventory (verified):

```
MediaPage.tsx:137   fetchWithCredential('/api/v1/media/upload', …)
MediaPage.tsx:171   fetchWithCredential('/api/v1/media/intents', …)
MediaPage.tsx:205    `/api/v1/media/intents/${id}/${action …}`
MediaPage.tsx:241   fetchWithCredential('/api/v1/media/intents/batch', …)
HistoryPage.tsx:118  post(`/api/v1/change-sets/${id}/apply`)
HistoryPage.tsx:125  post(`/api/v1/change-sets/${id}/discard`)
HistoryPage.tsx:135  fetchWithCredential(`/api/v1/change-sets/${id}`, …)
HistoryPage.tsx:162  post(`/api/v1/history/${productId}/revert`)
HistoryPage.tsx:186  post(`/api/v1/change-sets/${id}/undo`)
HistoryPage.tsx:193  post(`/api/v1/change-sets/${id}/redo`)
HistoryPage.tsx:203  fetchWithCredential('/api/v1/backup/prune-preview', {POST})
HistoryPage.tsx:222  post('/api/v1/backup/prune', { ids })
HistoryPage.tsx:237  post(`/api/v1/backup/${id}/restore`)
ConflictsPage.tsx:140 `/api/v1/conflicts/${conflictId}/resolve`
ConflictsPage.tsx:165 `/api/v1/conflicts/${conflictId}/retry`
```

Client module pattern to follow: `src/web/api/publications.ts` and
`src/web/api/comms.ts` — functions `(request: ApiRequestFn, …args)` returning
typed promises, consumed by `client.ts` and re-exposed. Existing modules:
`categories.ts, client.ts, comms.ts, filterParams.ts, importExport.ts,
media.ts, products.ts, publications.ts, requestCore.ts, storefront.ts,
sync.ts, system.ts`. `media.ts` already exists (upload/intents partly? read
it first — extend, don't duplicate).

## Commands you will need

| Purpose          | Command                                                                                                                      | Provenance | Expected on success |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install          | `npm ci`                                                                                                                     | declared   | exit 0              |
| Admin tests      | `npm run admin:test`                                                                                                         | declared   | all pass            |
| Contract guard   | `npx vitest run test/contract/openapi.test.ts` (cwd `admin/content-manager`)                                                 | declared   | all pass            |
| Admin e2e (best) | `npm run admin:test:e2e` (config `playwright.config.ts`) + `npm run admin:test:e2e:media` + `npm run admin:test:e2e:changes` | declared   | pass                |
| Typecheck        | `npm run admin:typecheck`                                                                                                    | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/api/media.ts` (extend)
- `admin/content-manager/src/web/api/changes.ts` (create: change-sets,
  history, backup)
- `admin/content-manager/src/web/api/conflicts.ts` (create)
- `admin/content-manager/src/web/api/client.ts` (facade wiring only)
- `admin/content-manager/src/web/app/routes/{MediaPage,HistoryPage,ConflictsPage}.tsx`
- `admin/content-manager/test/contract/openapi.test.ts` (guard extension)

**Out of scope**:

- Server routes/OpenAPI documents (they already declare these paths — if one
  is missing, STOP and report; do not invent it here).
- UI behavior changes; response handling must stay identical.
- `fetchWithCredential` itself (still the core shim under `client.ts`).

## Git workflow

- Branch: `advisor/229-admin-client-coverage`
- Commits: `refactor(admin): route media/history/conflicts calls through the typed client (plan 229)`.

## Steps

### Step 0: Establish a green baseline

Install + `npm run admin:test` + focused openapi test on the unmodified
checkout. Red → STOP.

### Step 1: Add the missing client methods

Read `src/web/api/media.ts`, `publications.ts`, `comms.ts` first. Then:

- `changes.ts`: `applyChangeSet(id)`, `discardChangeSet(id)`,
  `getChangeSet(id)`, `undoChangeSet(id)`, `redoChangeSet(id)`,
  `revertHistory(productId)`, `prunePreview()`, `pruneBackups(ids)`,
  `restoreBackup(id)` — typed return values matching the server envelopes
  (copy the existing response interfaces from the pages where they exist).
- `conflicts.ts`: `resolveConflict(id, payload)`, `retryConflict(id)`.
- `media.ts`: `uploadMedia(formData)`, `createIntent(body)`,
  `runIntent(id)`, `cancelIntent(id)` (the `:205` template with
  `action === 'discard' ? '' : action` is a weird route — inspect the
  server route and mirror its actual accepted URLs exactly), `batchIntents(body)`.
  For upload keep the raw-`Response` pattern used elsewhere (the client
  already returns `rawResponse` for uploads — reuse it).
- Wire them in `client.ts` following the publications/comms pattern so
  pages can call `client.*`.

One path = one client method; no path concatenation outside the modules.

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Migrate the three pages

Replace each call site with the client method, preserving input handling,
error display and refresh behavior exactly (the pages have `post()`/error
helpers — keep the helpers for UI feedback; only the HTTP goes through the
client). Delete page-local URL literals.

**Verify**: `grep -n "api/v1" admin/content-manager/src/web/app/routes/MediaPage.tsx admin/content-manager/src/web/app/routes/HistoryPage.tsx admin/content-manager/src/web/app/routes/ConflictsPage.tsx` → only allowlisted, non-fetch references remain (expected: none; report any exception with a comment).

### Step 3: Extend the drift guard

In `test/contract/openapi.test.ts` (or a sibling guard in the same file):

1. Keep the existing scan of `src/web/api/*.ts` (now it covers the 15 new
   paths).
2. Add: no file under `src/web/app/**` may import/use `fetchWithCredential`
   nor contain the string literal `/api/v1/` — with an explicit allowlist
   array (empty; if a diagnostics page links the OpenAPI URL, allowlist that
   single literal with a comment). Fail listing offenders.

**Verify**: `npx vitest run test/contract/openapi.test.ts` (cwd
`admin/content-manager`) → pass; temporarily add a raw path in a scratch
copy to confirm the guard fails (do not commit).

### Step 4: Integration + e2e

Run the admin suites that exercise these pages: `npm run admin:test`; then
the admin e2e configs for media and changes
(`npm run admin:test:e2e:media`, `npm run admin:test:e2e:changes`) and the
operator suite (`npm run admin:test:e2e`). These need a build; budget time
or note if skipped with the reason.

**Verify**: suites green (or documented skip with reason in the PR).

### Step 5: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0;
`npm run admin:typecheck` → exit 0.

## Test plan

- The openapi guard extension (Step 3) is the regression test.
- Existing admin e2e (`media-workbench.spec.ts`, `change-set.spec.ts`,
  `scope.spec.ts`) must stay green — they are the behavior net.
- If `clientIntegration.test.ts` has a pattern for one-domain smoke tests,
  add one round-trip for the new `changes.ts` methods (cheap).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:test` exits 0
- [ ] `grep -rn "fetchWithCredential" admin/content-manager/src/web/app` returns nothing (no raw wrappers in pages)
- [ ] `grep -rn "'/api/v1/\|\`/api/v1/" admin/content-manager/src/web/app/routes/MediaPage.tsx admin/content-manager/src/web/app/routes/HistoryPage.tsx admin/content-manager/src/web/app/routes/ConflictsPage.tsx` returns only allowlisted lines
- [ ] `npx vitest run test/contract/openapi.test.ts` (cwd `admin/content-manager`) exits 0 with the new guard
- [ ] admin e2e media/changes suites pass (or documented skip)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A path used by a page is NOT declared in the OpenAPI document (report the
  path; the server side must be fixed by its owner first).
- A page's response handling depends on an untyped shape that the server
  contract does not describe (report; do not invent types).
- `fetchWithCredential` usage outside `src/web` appears in the guard scan
  (report the file).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- New admin HTTP calls must land in a `src/web/api/*.ts` module; the guard
  in openapi.test.ts enforces it.
- Reviewer: confirm the `media/intents/:id/` template reproduces the exact
  server URLs (the `discard` special case is easy to get backwards).
- **Deferred:** none.
