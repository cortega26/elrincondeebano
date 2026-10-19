# Plan 253: Bodyless POSTs must not send a JSON Content-Type (prunePreview / git pull silently 400)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat <planned-at>..HEAD -- admin/content-manager/src/web/api/requestCore.ts admin/content-manager/src/web/api/changes.ts admin/content-manager/src/server/routes/backup.ts admin/content-manager/src/server/routes/gitRoutes.ts admin/content-manager/test/integration/clientIntegration.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW–MED
- **Depends on**: 229 (landed; this bug was found while migrating those calls)
- **Category**: bug
- **Planned at**: commit `ad738701`, 2026-10-18
- **Coordination**: plan 231 also edits `test/integration/clientIntegration.test.ts`
  — if 231 is still in flight, put this plan's tests in a NEW focused file
  (e.g. `test/integration/bodylessRequests.test.ts`) to avoid same-file
  conflicts, and say so.

## Why this matters

`requestCore.ts` sets `Content-Type: application/json` on requests that carry
no body. Fastify answers such requests with **400
`FST_ERR_CTP_EMPTY_JSON_BODY`**. Discovered by plan 229's live probe:

- `POST /api/v1/backup/prune-preview` (HistoryPage "prune preview") — the
  handler never runs; the page swallowed the non-ok silently, so the feature
  looked like a no-op.
- `POST /git/pull` (pull action) — same shape.

Because the callers only checked `res.ok` and ignored non-ok, this stayed
invisible; plan 229 preserved the exact behavior when moving the calls to
the typed client (prunePreview remains bodyless per the OpenAPI
`requestBody: never`). The root fix belongs in the shared fetch core: a
request without a body must not claim a JSON body.

## Current state

- `admin/content-manager/src/web/api/requestCore.ts` — single browser fetch
  core; sets default headers including `Content-Type: application/json` for
  JSON requests (read the exact conditional before editing).
- `admin/content-manager/src/web/api/changes.ts` — `prunePreview` sends a
  bodyless POST (typed from the generated doc).
- The git-pull call site (locate it — likely `client.ts`/`sync.ts` domain
  slice; the route is server-side `gitRoutes`/`gitAdapter`).
- Evidence from plan 229: live probe reproduced 400 on both; the OpenAPI doc
  declares prune-preview with `requestBody: never` after plan 252.

## Commands you will need

| Purpose        | Command                                                                              | Provenance | Expected on success |
| -------------- | ------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install        | `npm ci`                                                                             | declared   | exit 0              |
| Red test first | `npx vitest run test/integration/bodylessRequests.test.ts` (new) or the focused file | declared   | RED before the fix  |
| Admin tests    | `npm run admin:test`                                                                 | declared   | all pass            |
| Typecheck      | `npm run admin:typecheck`                                                            | declared   | exit 0              |
| Lint (admin)   | `npm run admin:lint`                                                                 | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/api/requestCore.ts`
- The specific page/client call sites IF the chosen fix is per-site instead
  (report which approach you took; prefer the core fix)
- A new test file under `admin/content-manager/test/integration/`

**Out of scope**:

- Changing Fastify's body parsing or the routes.
- The pages' non-ok swallowing behavior (separate concern; do not add
  user-visible changes here).

## Git workflow

- Branch: `advisor/253-bodyless-content-type`
- Commit: `fix(admin): omit JSON content-type on bodyless requests (plan 253)`.

## Steps

### Step 0: Establish a green baseline

Install + `npm run admin:test`. Red → STOP.

### Step 1: Red test (reproduction first)

New integration test against a temp-repo `createApp`:

- `POST /api/v1/backup/prune-preview` **through the client** (the
  `ContentManagerClient` method) → expect 2xx (currently 400).
- `POST /git/pull` through its client path → expect 2xx (or the documented
  response), on a temp repo where a pull is a no-op.
  Assert the reproduced failure is the content-type issue (surface the error
  message in the assertion), then fix.

**Verify**: the new test fails before Step 2 with the 400/empty-body error.

### Step 2: Fix the core

In `requestCore.ts`, only attach `Content-Type: application/json` when a body
is present (and never for `FormData`/`Blob` bodies — verify existing handling
and keep it). Keep every other header/behavior identical. If the cleanest
fix turns out to be per-site (e.g. the core intentionally defaults), STOP and
report before choosing.

**Verify**: the new test passes; `npx vitest run test/integration/clientIntegration.test.ts`
still passes (plan 231 may have extended it — do not revert their work).

### Step 3: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:typecheck` →
exit 0; `npm run admin:lint` → exit 0.

## Test plan

- New focused integration test (red→green) covering `prunePreview` and the
  git-pull path with bodyless POSTs.
- Existing client integration suite stays green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] The new test exists, was RED before the fix (record the failure), and is GREEN after
- [ ] `grep -n "content-type" admin/content-manager/src/web/api/requestCore.ts` shows the conditional (body-present guard)
- [ ] `npm run admin:test` exits 0; typecheck exit 0; lint exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A server handler _expects_ an empty JSON body on one of these routes (fix
  sketch becomes "send `{}`" instead — report which route).
- The git-pull path cannot be exercised on a temp repo (report; scope the
  test to prune-preview and note the gap).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Reviewer: confirm no other request shape regressed (multipart uploads keep
  their own content-type; JSON bodies still send theirs).
- **Deferred:** the pages' silent non-ok handling (UX) — untouched here.
