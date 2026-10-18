# Plan 241: Admin SPA splitting — lazy routes and zod out of the browser bundle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/web/app/App.tsx admin/content-manager/vite.config.ts admin/content-manager/src/shared/comms-meta.ts admin/content-manager/src/shared/schemas/comms.ts admin/content-manager/src/web/app/routes/CommsPage.tsx`
> If any in-scope file changed since this plan was written (plans 230/231/
> 240 touch CommsPage), re-read the changed files and adapt import paths —
> unexplained divergence is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW–MED
- **Depends on**: 240 (split first, then make the parts lazy)
- **Category**: perf
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

The admin SPA builds to a **single 531 KB JS chunk** (146 KB gzip,
`admin/content-manager/dist/web/assets/index-ippyVC7P.js` — measured). Every
route — including the 1.4 k-line CommsPage, the media/import/publication
editors — is a static import in `App.tsx:9-22`, so the first page parse
pays for all of them on every cold session (and over the new remote-mode
tunnel, that is network cost too). Separately, `CommsPage.tsx` imports
runtime constants (`COMMS_CATEGORIES`, labels) from
`shared/schemas/comms.ts:5`, whose module top imports `zod` — so a
validation library ships to the browser for plain constant arrays
(`ZodError` appears at byte 300,271 of the bundle).

## Current state

- `App.tsx:9-25` — static imports of 13 route components; no `lazy(`/
  `Suspense` anywhere (`grep` verified).
- `admin/content-manager/vite.config.ts:17-30` — `rollupOptions.input`
  without `manualChunks`.
- `shared/schemas/comms.ts:5` (`import { z } from 'zod'`) consumed by
  `CommsPage.tsx:10-16` for constants only; 12 files under `src/web` import
  `shared/schemas/**` (audit listed) — check each for runtime-zod needs
  before concluding.

## Commands you will need

| Purpose     | Command                                                         | Provenance | Expected on success                  |
| ----------- | --------------------------------------------------------------- | ---------- | ------------------------------------ |
| Install     | `npm ci`                                                        | declared   | exit 0                               |
| Build       | `npm run admin:build`                                           | declared   | exit 0                               |
| Chunk sizes | `ls -la admin/content-manager/dist/web/assets/*.js`             | declared   | multiple chunks                      |
| zod absence | `grep -l "ZodError" admin/content-manager/dist/web/assets/*.js` | declared   | no matches (or documented exception) |
| Admin tests | `npm run admin:test`                                            | declared   | all pass                             |
| Admin e2e   | `npm run admin:test:e2e` (operator suite; + comms spec)         | declared   | pass                                 |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/App.tsx`
- `admin/content-manager/vite.config.ts` (manualChunks only)
- `admin/content-manager/src/shared/comms-meta.ts` (create)
- `admin/content-manager/src/shared/schemas/comms.ts` (re-export from meta)
- Client imports of `shared/schemas/comms.ts` runtime constants
  (`CommsPage.tsx` and any sibling found by grep)

**Out of scope**:

- Any UI behavior change; route paths/structure stay identical.
- Server-side schema imports (schemas keep their shape and exports).
- Removing zod from the dependency list (server uses it heavily).

## Git workflow

- Branch: `advisor/241-admin-bundle`
- Commits: `perf(admin): lazy routes + zod-free client constants (plan 241)`.

## Steps

### Step 0: Baseline

`npm ci`; `npm run admin:build`; record
`ls -la admin/content-manager/dist/web/assets/*.js` (the single chunk size +
name) in the PR description.

### Step 1: zod-free constants module

Create `shared/comms-meta.ts` containing the plain-data exports the client
needs (re-read `shared/schemas/comms.ts` and move/duplicate by **re-export**
to keep one source of truth):

```ts
// Plan 241: zod-free constants — importable by the browser bundle.
export const COMMS_CATEGORIES = [...] as const;
export const COMMS_CATEGORY_LABELS = { ... };
export const COMMS_STATUSES = [...] as const;
export const COMMS_STATUS_LABELS = { ... };
export const MAX_ACTIVITY = 500;
export const REPEAT_WINDOW_DAYS = 7;   // if exported there today
```

Then in `schemas/comms.ts`: import those from `comms-meta.ts` and
re-export them (`export { COMMS_CATEGORIES, ... } from './comms-meta.ts'`)
so every existing server import keeps working. Update client imports
(`CommsPage.tsx` and siblings) to `shared/comms-meta.ts`.

Check the other `src/web` importers of `shared/schemas/**`
(`grep -rn "shared/schemas" admin/content-manager/src/web`): if any imports
runtime values from a zod-importing module, move those constants the same
way; if one genuinely uses zod at runtime in the browser, STOP and report
(the `grep ZodError` gate below then documents the exception).

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Lazy routes

In `App.tsx`:

```tsx
import { lazy, Suspense } from 'react';
const CommsPage = lazy(() =>
  import('./routes/CommsPage.tsx').then((m) => ({ default: m.CommsPage }))
);
// … for every route except the default (ProductsPage stays static)
```

Keep `ProductsPage` eager (index + `/products`). Wrap the router provider
(or each lazy element) in `<Suspense fallback={<div className="route-loading" role="status">Cargando…</div>}>`;
keep the fallback minimal and accessible. `react-router-dom` v7 supports
`lazy` route elements natively — either approach is fine; prefer plain
`React.lazy` for uniformity. Deep links must resolve on first load (the
Suspense fallback covers the fetch).

**Verify**: `npm run admin:build` → exit 0; chunk list shows multiple JS
chunks; a manual dev-server check (`npm run admin:dev`) navigates to
`/comms`, `/media`, `/history` with the lazy loads (report if you cannot
run it).

### Step 3: Vendor chunk (optional, only if trivial)

In `vite.config.ts`, add:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom', 'react-router-dom'];
      }
    }
  }
}
```

(merge with the existing `rollupOptions.input`; do not restructure the
config).

**Verify**: `npm run admin:build`; vendor chunk separate.

### Step 4: Assertions + suites

- `grep -l "ZodError" admin/content-manager/dist/web/assets/*.js` → no
  matches for the entry/comms chunks (any remaining match must be the
  documented exception from Step 1).
- `npm run admin:test` → all pass.
- Admin e2e: operator suite + comms spec (`npm run admin:test:e2e`;
  `npx playwright test -c playwright.config.ts test/e2e/comms.spec.ts`).

**Verify**: commands above green.

### Step 5: Full gates

**Verify**: `npm run admin:build` → exit 0; `npm run admin:lint` → exit 0.

## Test plan

- No new unit tests; the e2e suites exercise the lazy boundary (first-load
  navigation to each route).
- The chunk-size + zod-absence greps are the plan's quantitative checks —
  record before/after numbers in the PR.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls admin/content-manager/dist/web/assets/*.js | wc -l` > 1
- [ ] `grep -l "ZodError" admin/content-manager/dist/web/assets/*.js` → no matches (or the documented exception)
- [ ] `npm run admin:test` exits 0; comms e2e passes; operator e2e passes
- [ ] `grep -n "lazy(" admin/content-manager/src/web/app/App.tsx` matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A client-side runtime zod usage exists that requires carrying zod (report
  file:line and skip Step 1's removal for that path).
- Lazy routes break a test (report which; consider keeping that one route
  eager rather than changing test expectations).
- The build emits a chunk smaller than expected because tree-shaking
  already removed zod (report the evidence; the finding premise changes).

## Maintenance notes

- New routes default to lazy; the default page stays eager.
- Reviewer: confirm the Suspense fallback does not regress the operator
  suite's first-interaction timing (fallback is a status line, no spinner
  dependency).
- **Deferred:** deeper vendor splitting/prefetch heuristics — measure again
  if the bundle grows.
