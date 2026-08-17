# 151 — Finish plan 115: route all web fetches through ContentManagerClient

- **Source**: Auditoría 10, DEBT-05 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/web/`

## Problem

The plan-115 client unification is incomplete: 11 raw `fetch('/api/v1/...')` call sites across 9 web files coexist with `ContentManagerClient` (633 lines, imported 17× across 10 files). The raw sites duplicate error handling and bypass the client's credential-header logic (`credentialStore.ts:28`), so a future auth change silently misses them.

Verified sites (grep `fetch('/api`):

- `web/app/components/ProductForm.tsx:48` — `fetch('/api/v1/media')` (note: this file uses BOTH `client.getCategories()` at `:34` and raw fetch at `:48`)
- `web/app/components/RecoveryBanner.tsx:20` — `fetch('/api/v1/diagnostics')`
- `web/app/components/FilterBar.tsx:156` — `fetch('/api/v1/products')`
- `web/app/routes/MediaPage.tsx:104,108` — categories + products; `:222` — media
- `web/app/routes/HistoryPage.tsx:68-70` — history + change-sets + backup
- `web/app/routes/DiagnosticsPage.tsx:35` — diagnostics
- `web/app/routes/ProductsPage.tsx:87` — `fetch('/api/v1/sync/status')`
- `web/app/routes/ConflictsPage.tsx:88` — (sync endpoints)

## Scope

**In**: The 9 web files listed above, `admin/content-manager/src/web/api/client.ts` (add missing methods only), the web tests that mock them (`test/web/harness.tsx` + suites).

**Out**: The API surface (URLs, envelopes), the server.

## Steps

1. Inventory `client.ts`'s existing methods (products/categories/media/history/diagnostics/sync per its method list). For each raw site, map it to an existing method or add a thin typed method to the client (following the client's existing method shape — `request()` helper, typed payloads, `ApiRequestError` on non-ok).
2. Replace all 11 sites with client calls. `ProductForm.tsx` becomes client-only. MediaPage's three fetches, HistoryPage's Promise.all of three, ProductsPage's sync/status (add `getSyncStatus()` if absent), ConflictsPage's calls likewise.
3. Delete the raw fetches. Grep `fetch('/api` in `src/web` → zero matches.

## Tests

- The existing web suites must stay green — they already exercise these pages with the harness mocks; where a suite mocked raw `fetch` directly (global mock), migrate the mock to the client method (the harness exposes `mockApi`).
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] `grep -rn "fetch('/api" admin/content-manager/src/web` → no matches.
- [ ] Every page's data path goes through the client (asserted by the suites still passing).
- [ ] `npm run admin:test` green.

## Maintenance

The client is the single auth/error surface; a future credential change now touches only `credentialStore.ts` + `client.ts`. A reviewer should confirm the 409 handling in `withFreshRev` (plan 141's scope) still sees `ApiRequestError` — the client's error type must flow through unchanged.

## Rollback

`git revert <sha>`.

## STOP conditions

- If a raw fetch uses query params or response shapes the client can't express without changing the server, stop and report that site — do not bypass the client for it.
