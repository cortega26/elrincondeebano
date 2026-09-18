# Plan 180: Harden import preview — credential, size pre-gate, preview pruning

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/security/routePolicy.ts admin/content-manager/src/server/app.ts admin/content-manager/src/server/routes/importRoutes.ts admin/content-manager/src/server/repositories/previewRepository.ts admin/content-manager/src/shared/schemas/importExport.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: security
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`POST /import/preview` is the one `preview`-classed route that performs a
durable disk write (`previews.save`) and unbounded input processing — yet
only `mutation` routes require the launch credential, so it bypasses the
"mutations need a credential" guarantee. Its 5 MB cap is measured by
re-serializing the already-parsed body (after Fastify parsed up to the 20 MB
global limit sized for base64 media), paying full parse + second
serialization on oversized payloads. And previews (4× overlapping full
copies each) are never deleted — unbounded disk growth under
`data/import-previews/`. Three small fail-closed changes, one coherent
"preview is a privileged write" story. No secrets involved; no rotation needed.

## Current state

Relevant files:

- `admin/content-manager/src/server/security/routePolicy.ts` — line 83:
  `{ method: 'POST', path: '/api/v1/import/preview', class: 'preview' }`.
- `admin/content-manager/src/server/app.ts` — `bodyLimit: 20 * 1024 * 1024`
  (line ~91); credential required only for `routeClass.class === 'mutation'`
  (lines 262–282); loopback bypass via `isLoopbackRequest` (unchanged here).
- `admin/content-manager/src/server/routes/importRoutes.ts` — preview
  handler: post-parse cap `Buffer.byteLength(JSON.stringify(rawProducts)) >
MAX_IMPORT_BYTES` → 413 (lines ~134–143); `previews.save(preview)` with
  `incoming + additions + updates + unchanged` (lines ~202–214).
- `admin/content-manager/src/server/repositories/previewRepository.ts` —
  `save`/`load` only, no delete/TTL/cap (37 lines total).
- `admin/content-manager/src/shared/schemas/importExport.ts` —
  `MAX_IMPORT_BYTES = 5 * 1024 * 1024`.

Conventions: route-policy guarantee test
(`test/contract/routePolicy.test.ts`) asserts every registered route's class
— updating the table updates the contract; credential failures return 401
`UNAUTHORIZED`. Note `start.ts` refuses non-loopback `HOST` at boot, so the
credential gate is defense-in-depth on top of loopback binding — keep both.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- The five files above.
- `admin/content-manager/test/contract/importPreviewHardening.test.ts` (create)

**Out of scope**:

- Loopback bypass semantics (plan 182 owns it).
- Changing `MAX_IMPORT_BYTES`, `bodyLimit`, or media upload caps.
- CSV import (plan 213 owns the round-trip decision).

## Git workflow

- Branch: `advisor/180-import-preview-hardening`
- Commit per step; e.g. `fix(admin): require credential for import preview; prune previews (plan 180)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE (it touches `importRoutes.ts`/`importExport.ts`).
Install + typecheck + admin tests unmodified.

**Verify**: green; otherwise STOP.

### Step 1: Reclassify preview-persisting route as `mutation`

In `routePolicy.ts`, change `POST /api/v1/import/preview` from `preview` to
`mutation`. Rationale (leave as code comment): it performs a durable disk
write, unlike pure previews. Verify the loopback operator flow still works
without a credential (loopback bypass applies to `mutation` too) and update
the route-policy guarantee test expectations if they enumerate classes.

**Verify**: `npm run admin:typecheck` → exit 0; route-policy tests pass.

### Step 2: Content-length pre-gate before parsing

In the preview handler, before touching the parsed body: if
`request.headers['content-length']` exceeds `MAX_IMPORT_BYTES` (plus a small
margin for JSON framing — document the constant, e.g. 64 KB), return 413
immediately. Keep the existing post-parse measurement as the authoritative
check (do NOT remove it — content-length is client-controlled). Do NOT lower
the global `bodyLimit` (media uploads need it for base64 inflation).

**Verify**: typecheck green.

### Step 3: Prune previews (delete on apply + cap on save)

- Add `delete(id)` to `PreviewRepository` (respect `isSafeId` like
  save/load).
- Call it after successful `POST /import/apply` (and when a preview is
  superseded, if the code tracks that — if not, apply-time deletion only).
- Cap the directory: on `save`, if more than N (default 50 — document as
  constant) preview files exist, delete oldest by mtime. Lazy prune keeps
  it a pure repository concern, no job needed.

**Verify**: typecheck green.

### Step 4: Add hardening tests

Create `test/contract/importPreviewHardening.test.ts`:

1. Preview without credential, non-loopback host → 401 (loopback → passes,
   proving operator flow intact).
2. Oversized content-length → fast 413 (assert 413 without needing a huge
   body — send the header with a small body; the pre-gate must trigger).
3. Successful apply deletes its preview (`load` → null afterwards).
4. 51 rapid previews → directory holds ≤ 50 (oldest evicted).

**Verify**: `npm run admin:test` → all pass including the 4 new tests.

## Test plan

- New contract file, 4 cases above; route-policy guarantee test updated.
- Existing import tests (`importPreviewLimits.test.ts` from plan 170)
  unchanged and green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with the 4 new hardening tests passing.
- [ ] `grep -n "import/preview" admin/content-manager/src/server/security/routePolicy.ts` shows class `mutation`.
- [ ] `grep -n "delete(" admin/content-manager/src/server/repositories/previewRepository.ts` matches.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 170's landing changed the preview handler shape (reconcile first).
- Reclassification breaks the loopback operator UI flow (credential prompt
  appearing on localhost) — that means the bypass assumption is wrong;
  report instead of shipping UX breakage.
- The content-length pre-gate cannot distinguish framed size from body size
  cleanly (report margin analysis; do not block legitimate 5 MB imports).

## Maintenance notes

- If a future preview route persists state, it must be classed `mutation`
  — add that sentence to the `routePolicy.ts` header comment.
- Reviewer: confirm the prune cap (50) against operator usage (preview per
  click); adjust the constant, not the mechanism.
- **Deferred:** none. (Credential lifetime/session scoping is plan 184's
  investigate batch.)
