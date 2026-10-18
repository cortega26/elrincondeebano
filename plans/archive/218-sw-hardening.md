# Plan 218: Restore the documented service-worker kill-switch, keep the static shell through invalidation, and stop buffering cached bodies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- service-worker.js astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/sw-registration.js test/service-worker.runtime.test.js test/e2e-astro/deploy-canary.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Three service-worker defects that compound during incidents:

1. The repo documents an operational kill-switch (`ebano-sw-disabled`), a
   localhost registration gate (`ebano-sw-enable-local` / `?sw=on`) and
   relies on them in the incident runbook — but `registerServiceWorker()`
   in the current storefront does not read any of them. The legacy bundle
   (`.tmp/perf-analyze/main.js`, a local build artifact — do not depend on
   it) still contains the old predicate: the logic was lost in the storefront
   bundle migration, not removed on purpose. During a bad deploy the operator
   follows `docs/operations/INCIDENT_TRIAGE.md` step 1 and nothing happens.
2. `INVALIDATE_ALL_CACHES` deletes **every** namespaced cache, including the
   `static` cache whose shell (`/index.html`, `/pages/offline.html`,
   placeholder, icons) is only seeded in the `install` event. A
   `cacheVersion` bump that does not also change `service-worker.js` bytes
   (the documented lever for fresh cart bundles) therefore deletes the
   offline shell with no re-seed — offline navigation degrades to a plain
   `503 "Offline"` until the next SW byte change.
3. `addTimestamp()` buffers every cached response through `await
response.blob()`, doubling memory on every image/HTML fetch and delaying
   first byte. Plans 146/190 settled the caching _policy_; this buffering
   detail was never addressed.

## Current state

`astro-poc/src/scripts/storefront.js:1103-1121` — registration has no gate:

```js
async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });
    await syncStorefrontServiceWorkerVersion({ ... });
  } catch (error) { ... }
}
```

`docs/adr/0006-service-worker-caching-strategy.md:67-85` documents the
intended predicate:

- `localStorage['ebano-sw-disabled'] === 'true'` → skip registration.
- On loopback hostnames (`localhost`, `127.0.0.1`, `::1`, `[::1]`) →
  register only with `localStorage['ebano-sw-enable-local'] === 'true'` or
  a `?sw=on` query parameter; otherwise skip.
- Any other hostname → register.

`docs/operations/RUNBOOK.md:151-152` and
`docs/operations/INCIDENT_TRIAGE.md:22` repeat the same affordances.

`service-worker.js:465-481` — invalidation ignores cache identity:

```js
async function invalidateAllCaches() {
  const cacheNames = await caches.keys();
  const validPrefixes = Object.values(CACHE_CONFIG.prefixes);
  await Promise.all(
    cacheNames
      .filter((name) => validPrefixes.some((prefix) => name.startsWith(prefix)))
      .map((name) => caches.delete(name))
  );
  ...
}
```

`service-worker.js:150-176` — the shell is seeded only here (install event,
`CACHE_CONFIG.prefixes.static` + `CACHE_CONFIG.staticAssets`,
`service-worker.js:19-29`).

`service-worker.js:104-113` — buffering:

```js
const addTimestamp = async (response, type = 'static') => {
  const headers = new Headers(response.headers);
  headers.append('sw-timestamp', Date.now().toString());
  headers.append('cache-type', type);
  return new Response(await response.blob(), { ... });
};
```

`test/e2e-astro/deploy-canary.spec.ts:21-25` — this spec (which runs against
`127.0.0.1` in the local/CI e2e suite) currently awaits
`navigator.serviceWorker.ready`; with the restored loopback gate no
registration is created there and `ready` never resolves.

Repo conventions to follow:

- Extracted storefront modules are small factory/pure-function modules under
  `astro-poc/src/scripts/storefront/` with jsdom unit tests in `test/`
  (pattern: `test/storefront.catalog-view.spec.js` stubs `window`/`document`
  via JSDOM; `test/storefront-state.spec.js` tests pure functions directly).
- SW runtime tests use the `caches` mock in
  `test/service-worker.runtime.test.js` (require the real
  `service-worker.js` with `globalThis.__SW_RUNTIME_TEST__ = true`).
- Conventional commits, e.g. `fix(sw): restore kill-switch gate (plan 218)`.

## Commands you will need

| Purpose         | Command                                                                                      | Provenance | Expected on success |
| --------------- | -------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install         | `npm ci`                                                                                     | declared   | exit 0              |
| Focused tests   | `npx vitest run test/service-worker.runtime.test.js test/storefront.sw-registration.spec.js` | declared   | all pass            |
| Full root tests | `npm test`                                                                                   | declared   | all pass            |
| Lint            | `npm run lint`                                                                               | declared   | exit 0              |
| E2E (root)      | `npm run test:e2e -- deploy-canary.spec.ts` (or `PLAYWRIGHT_SKIP_BUILD=1` on a warm dist)    | declared   | passes              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront/sw-registration.js` (create — predicate)
- `astro-poc/src/scripts/storefront.js` (wire the predicate)
- `service-worker.js`
- `test/storefront.sw-registration.spec.js` (create)
- `test/service-worker.runtime.test.js` (add assertions)
- `test/e2e-astro/deploy-canary.spec.ts` (bounded wait)

**Out of scope** (do NOT touch):

- `astro-poc/public/service-worker.js` — build-synced copy (plan claims it is
  byte-synced by `sync-data.mjs`; verify nothing, just do not edit it —
  the build copies the root file).
- Cache TTLs, version strings, `shouldSkipCache`, the SWR revalidation
  policy (settled in plans 146/190).
- `docs/adr/0006`, `RUNBOOK.md`, `INCIDENT_TRIAGE.md` — their text already
  describes the target behavior; no doc change is needed. If you conclude
  one of them is wrong after implementing, STOP (the finding assumption is
  false) rather than editing them here.

## Git workflow

- Branch: `advisor/218-sw-hardening`
- Commit per step; message style: conventional commits with `(plan 218)`.

## Steps

### Step 0: Establish a green baseline

Run Install, then the focused tests and `npm test` on the unmodified
checkout. If a `declared` command does not exist or fails, STOP and report.

**Verify**: `npx vitest run test/service-worker.runtime.test.js` → all pass.

### Step 1: Extract the registration predicate (with tests)

Create `astro-poc/src/scripts/storefront/sw-registration.js`:

```js
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function shouldRegisterServiceWorker({ storage, location } = {}) {
  // storage: localStorage-like ({ getItem }) — may be null
  // location: window.location-like ({ hostname, search }) — may be null
  // Return false for the kill-switch; on loopback require opt-in.
}
```

Semantics (port of the documented ADR-0006 affordances; keep the same key
names and the same `(?:^|[?&])sw=on(?:&|$)` query match):

- `storage.getItem('ebano-sw-disabled') === 'true'` → `false`.
- hostname in `LOOPBACK_HOSTS` → `true` only if
  `storage.getItem('ebano-sw-enable-local') === 'true'` or the search string
  contains `sw=on`; otherwise `false`.
- otherwise → `true`.
- Wrap storage/location access in try/catch; unreadable storage must not
  throw (kill-switch unknown → register, as today).

Write `test/storefront.sw-registration.spec.js` covering: kill-switch on/off,
loopback with and without each opt-in, `?sw=on` embedded among other params
(`?a=1&sw=on`), non-loopback host, throwing storage, missing location.

**Verify**: `npx vitest run test/storefront.sw-registration.spec.js` → all pass.

### Step 2: Wire the predicate into registration

In `storefront.js` import the predicate and guard `registerServiceWorker`:

```js
if (
  !shouldRegisterServiceWorker({ storage: globalThis.localStorage, location: globalThis.location })
) {
  return;
}
```

Keep the existing catch/log behavior for genuine registration failures.

**Verify**: `npx vitest run test/storefront.sw-registration.spec.js` still
passes; `npm run typecheck:astro` → exit 0.

### Step 3: Make `deploy-canary.spec.ts` tolerate the loopback gate

Replace the unconditional `await navigator.serviceWorker.ready` with a
bounded wait that only blocks when a registration exists:

```ts
await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return; // loopback gate: SW intentionally not registered
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
});
```

**Verify**: `npm run test:e2e -- deploy-canary.spec.ts` → passes locally
(run with `PLAYWRIGHT_SKIP_BUILD=1` if `astro-poc/dist` is fresh; otherwise
pay the build once).

### Step 4: Preserve the `static` cache on full invalidation

In `service-worker.js`, change `invalidateAllCaches()` to skip the
`static` prefix (`CACHE_CONFIG.prefixes.static`), deleting only the other
namespaced caches. Update the function's comment to state why (shell is
seeded only at install; `staticAssets` are version-pinned by the SW version
itself, and `/_astro/*` already bypasses the cache).

Extend `test/service-worker.runtime.test.js` with a case that seeds one
cache per prefix and asserts: `static` survives, `html`/`dynamic`/`products`
are deleted.

**Verify**: `npx vitest run test/service-worker.runtime.test.js` → all pass,
including the new case.

### Step 5: Stream cached responses instead of buffering

Change `addTimestamp` to forward the body stream:

```js
const addTimestamp = async (response, type = 'static') => {
  const headers = new Headers(response.headers);
  headers.append('sw-timestamp', Date.now().toString());
  headers.append('cache-type', type);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
```

Before returning, audit each call site (nv. 274, 375, 399, and the
install/static paths): every site must pass a `response.clone()` — never
the response that is also returned to the page — because the new Response
consumes the body stream. Current call sites already pass `.clone()` at
`:274`, `:375`, `:399`; confirm the remaining uses (install seeding and the
dynamic path) do the same, and clone where they don't.

**Verify**: `npx vitest run test/service-worker.runtime.test.js` → all pass.
If the mock cannot express streaming, at minimum assert the returned
Response's `body` is non-null and headers are preserved; note the limitation
in the PR.

### Step 6: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0;
`npm run guardrails` → exit 0 (if `tools/guardrails/sw-cache-bump.mjs`
demands a `CACHE_CONFIG` bump — it only does when cart runtime bundles
changed — bump `version` and every `prefixes.*` value following the
existing pattern in `service-worker.js:5-12`; this plan alone should not
require it); `npm run test:e2e` (root) → green.

## Test plan

- New: `test/storefront.sw-registration.spec.js` (predicate matrix, at
  least 8 cases as listed in Step 1).
- Extended: `test/service-worker.runtime.test.js` (static-cache survival;
  streaming/headers sanity).
- Adjusted: `test/e2e-astro/deploy-canary.spec.ts` (bounded wait).
- Model the jsdom spec after `test/storefront.catalog-view.spec.js` and the
  SW mock after the existing `createCachesMock` in
  `test/service-worker.runtime.test.js`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/storefront.sw-registration.spec.js test/service-worker.runtime.test.js` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "ebano-sw-disabled" astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/sw-registration.js` shows the key in the shipped source
- [ ] `grep -n "response.blob()" service-worker.js` returns nothing
- [ ] `npm run test:e2e` passes (at least `deploy-canary.spec.ts`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (drift since this plan was written).
- Restoring the loopback gate breaks e2e specs beyond `deploy-canary` (run
  the full e2e suite in Step 6; report which spec and why).
- Streaming breaks the `sw-timestamp` freshness contract in a way the
  runtime tests cannot express (report and propose reverting Step 5 only).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- If a future incident requires "delete everything including the shell",
  that is now intentionally not exposed through `INVALIDATE_ALL_CACHES`;
  use the DevTools hard-clear documented in ADR 0006.
- Any new SW message type that mutates caches must state which namespaces it
  owns; `static` ownership is now explicitly install-only.
- **Deferred:** none.
