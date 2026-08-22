# 143 — Complete RecoveryBanner coverage + storefront cart-recovery tests

- **Source**: Auditoría 10, TEST-05 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/web/app/components/RecoveryBanner.tsx admin/content-manager/test/web/recoveryBanner.test.tsx astro-poc/src/scripts/storefront/recovery-banner.js test/`

## Problem

The plan-127 headline crash-recovery banner is only half-tested, and the storefront cart-recovery module has none.

`admin/content-manager/test/web/recoveryBanner.test.tsx:21-54` exercises only the two happy branches (`recoveryNeeded: true` / `false`). Untested in `RecoveryBanner.tsx:16-33`: the `catch {}` that keeps the previous state when the fetch fails (`:23-25`) and the 30s `setInterval` + `clearInterval` lifecycle (`:28-31`) — the test uses no fake timers, so a stale `setState` after unmount or a permanent banner on diagnostics error can regress silently.

`astro-poc/src/scripts/storefront/recovery-banner.js` (plan-116 module: dismiss-TTL logic at `:8-40`, `isRecoveryBannerDismissed`, banner show/hide) is imported by no test; the `Date.now() - dismissedAt < 3600000` TTL math is completely unverified.

## Scope

**In**: `admin/content-manager/test/web/recoveryBanner.test.tsx` (extend), a new `test/recovery-banner.spec.js` (root vitest, pattern `test/storefront-state.spec.js`).

**Out**: The two modules' production behavior.

## Steps

1. `recoveryBanner.test.tsx` — add with fake timers (`vi.useFakeTimers`):
   - fetch rejects → previous state retained (no crash, no banner flip);
   - 30s tick → refetch happens; banner unmount → `clearInterval` called (no timers left, no setState-after-unmount warning).
   - assert via `vi.advanceTimersByTime(30_000)`.
2. `test/recovery-banner.spec.js` — build the controller with injected deps (the factory's pattern from the module): (a) not dismissed → banner shown; (b) dismissed under 1h ago → hidden; (c) dismissed over 1h ago → shown again (TTL expiry); (d) dismiss action persists the timestamp.

## Tests

Listed above. Verify: `npx vitest run test/recovery-banner.spec.js` and the admin web suite (`npm run admin:test` → includes `test/web/recoveryBanner.test.tsx`). Both green.

## Done criteria

- [ ] RecoveryBanner error path + interval/cleanup covered with fake timers.
- [ ] Storefront cart-recovery TTL (3 cases) covered.
- [ ] Root vitest + `npm run admin:test` green.

## Maintenance

The 1h dismiss TTL and the 30s poll interval are the load-bearing constants; if either changes, these tests change with it. A reviewer should check the fake-timer test doesn't leave the clock mocked for later tests (restore in `afterEach`).

## Rollback

`git revert <sha>`.

## STOP conditions

- If `RecoveryBanner` uses the real `fetch` global with no injectable seam, stop and report — the test needs a way to reject the fetch (e.g. global mock is fine if the file uses `fetch` directly).
