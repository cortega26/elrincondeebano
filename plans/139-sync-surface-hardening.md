# 139 — Sync surface hardening: SSE connection cap + config file perms

- **Source**: Auditoría 10, SEC-03 (partial) + SEC-04 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/conflicts.ts admin/content-manager/.gitignore .gitignore`

## Problem

Two concrete gaps on the sync surface (scoped to what is unambiguously net-positive; the read endpoints' auth classification is a documented by-design decision, out of scope):

**1. SSE stream has no connection cap.** `GET /api/v1/sync/events` (`admin/content-manager/src/server/routes/conflicts.ts:181-206`) opens an unbounded `text/event-stream` — every connection runs two `setInterval`s (5s status push at `:195`, 25s heartbeat at `:196-198`) against a single-user local server. Any local process (or a misbehaving tab) can open unlimited connections and pin the server's timers/sockets forever:

```ts
send();
const pushTimer = setInterval(send, 5_000);
const heartbeat = setInterval(() => {
  reply.raw.write(': ping\n\n');
}, 25_000);
```

**2. `sync-config.json` is written world-readable, non-atomically, and is not gitignored.** `conflicts.ts:272-275` writes `data/sync-config.json` with `writeFileSync(..., { encoding: 'utf-8', flush: true })` — no `mode`, no tmp+rename (defaults to umask → 0644). The path is NOT in `.gitignore` (only `data/.admin-credential` at `.gitignore:96`). The schema models an `api_token` field (`syncAdapter.ts:6`); the API refuses to write it (`conflicts.ts:239-246`), but a hand-edited config — or a future code path — can place a token in a world-readable, `git add .`-committable file. The repo's secret-scan guardrail runs only on schedule.

## Scope

**In**: `admin/content-manager/src/server/routes/conflicts.ts`, `.gitignore` (root — add `data/sync-config.json`), tests `test/integration/syncWorkflow.test.ts` + `test/contract/credential.test.ts` (only if a perms assertion belongs there; prefer `syncWorkflow`).

**Out**: The read-endpoint auth classification (`routePolicy.ts`), the SSE payload, `git/status` field trimming.

## Steps

1. SSE cap: track active SSE connections on the route (module-level counter with a max, e.g. 2 — single-user UI holds 1). When the cap is reached, reply `429` with a JSON error (`SSE_CONNECTIONS_LIMITED`) instead of opening the stream. Decrement in the existing `close` handler (`:200-203`).
2. Config write: replace the plain `writeFileSync` at `:272-275` with tmp+rename (write `<path>.tmp`, `renameSync`) and pass `{ mode: 0o600 }`; mirror the repo's atomic-writer convention.
3. Add `data/sync-config.json` to the root `.gitignore` next to `data/.admin-credential`.

## Tests

- `syncWorkflow.test.ts` pattern: (a) open 3 concurrent `/sync/events` connections → the 3rd receives 429; (b) after closing one, a new connection succeeds (cap releases); (c) after `PUT /sync/config`, the config file's mode is `0o600` and no `.tmp` file remains.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] 3rd concurrent SSE connection gets 429 (asserted); cap releases on close (asserted).
- [ ] `data/sync-config.json` exists with mode 0600 after a config write (asserted) and is gitignored (`git check-ignore`).
- [ ] `npm run admin:test` green.

## Maintenance

If the UI ever legitimately needs >1 stream (multi-tab), raise the cap explicitly with a test. The 0600+atomic config write is the same convention as the credential file — any future config-write site must follow it.

## Rollback

`git revert <sha>`.

## STOP conditions

- If a test or e2e opens multiple SSE streams concurrently (e.g. status polling + events), stop and report — the cap number must accommodate the real UI.
