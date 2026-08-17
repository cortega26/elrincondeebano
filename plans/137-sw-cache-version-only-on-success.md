# 137 — Record SW cache-version only when invalidation succeeded

- **Source**: Auditoría 10, CORR-10 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/src/scripts/storefront/service-worker-sync.ts test/`

## Problem

`astro-poc/src/scripts/storefront/service-worker-sync.ts:138-163` persists the target cache version even when the `INVALIDATE_ALL_CACHES` message failed:

```ts
let invalidated = true;
let invalidationFailureReason: string | undefined;

try {
  await sendServiceWorkerMessage(
    messageTarget,
    { type: 'INVALIDATE_ALL_CACHES' },
    { channelFactory, timeoutMs }
  );
} catch (error) {
  invalidated = false;
  ...
}

if (registration?.waiting && typeof registration.waiting.postMessage === 'function') {
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

storage.setItem(storageKey, targetVersion);   // ← unconditional
```

On the next visit, `currentVersion === targetVersion` (`:109`) short-circuits and the invalidation is never retried. Result: after one transient failure (controller swap, message timeout), stale product/HTML caches (TTL up to 24h per `service-worker.js:14-17`) keep serving stale content until the version constant is manually bumped.

## Scope

**In**: `astro-poc/src/scripts/storefront/service-worker-sync.ts` (the `syncServiceWorkerCacheVersion` flow), its unit test (find the existing test via `grep -rn "service-worker-sync\|syncServiceWorkerCacheVersion" test/` — coverage exists per the audit; likely `test/` root vitest), and the e2e `test/e2e-astro/storage-contract.spec.ts` if it asserts version persistence.

**Out**: `service-worker.js` cache logic, the version constant.

## Steps

1. Move `storage.setItem(storageKey, targetVersion)` inside the success branch (`invalidated === true`). On failure, leave the old version stored so the next visit retries the invalidation.
2. Keep the `first-seen-version` fast path (`:113-121`) unchanged — no SW exists to invalidate yet, so recording the version is correct.
3. Keep the log lines (`:165-169`) — the `invalidated: false` info log remains a diagnostic.

## Tests

- Unit test (mock `sendServiceWorkerMessage`): (a) invalidation message rejects → stored version unchanged (retry next visit); (b) resolves → stored version becomes `targetVersion`; (c) first-seen path unchanged.
- Run: `npx vitest run` (root) green; `npm run typecheck:astro` green; `npm run lint` green.

## Done criteria

- [ ] On message failure the stored version is NOT updated (asserted).
- [ ] On success the version IS updated (asserted).
- [ ] Root vitest suite green.

## Maintenance

The cache-version mechanism is the deploy-correctness lever for the SW (cache-first strategies in plan 146 make this more important, not less). If `INVALIDATE_ALL_CACHES` is ever replaced by granular invalidation, the version-record-on-success invariant still applies.

## Rollback

`git revert <sha>`.

## STOP conditions

- If the storage contract or the e2e suite asserts the current unconditional-write behavior, stop and report before changing it.
