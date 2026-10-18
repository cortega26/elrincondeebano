# Plan 242: Admin page boilerplate — `useResource`, `useFeedback`, shared status labels

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/web/app/components/useProductsQuery.ts admin/content-manager/src/web/app/hooks/ admin/content-manager/src/web/app/routes/MediaPage.tsx admin/content-manager/src/web/app/routes/HistoryPage.tsx admin/content-manager/src/web/app/routes/PublicationPage.tsx admin/content-manager/src/web/app/routes/DiagnosticsPage.tsx`
> If any in-scope page changed (plans 229/240 touch some), re-read before
> editing; unexplained divergence is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (user-visible loading/error behavior)
- **Depends on**: 229 (HistoryPage/ConflictsPage will have just been
  touched — migrate after that lands), 240 (CommsPage out of scope here)
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Only Products has an extracted data hook (`useProductsQuery.ts:14-33`,
plan 094 — filters, debounce, race guard, loading/error). Every other page
re-implements the same plumbing inline: `CategoriesPage` (21 `useState`,
12 `setFeedback` sites), `MediaPage` (17 `useState`, 12 error sites),
`PublicationPage` (16 error sites), `HistoryPage` (11 `useState`, 10
`setFeedback`); only Products has the monotonic request guard, so the race
bug class exists in the others. Status→label maps are duplicated
(`MEDIA_STATUS_LABEL` + `STATUS_LABEL` in MediaPage `:39-60`, a third map
in DiagnosticsPage `:23`). Every cross-cutting UI change (feedback
convention, retry, abort-on-unmount) is a page-by-page sweep; new pages
copy ~150 lines of state plumbing.

## Commands you will need

| Purpose     | Command                                                   | Provenance | Expected on success |
| ----------- | --------------------------------------------------------- | ---------- | ------------------- |
| Install     | `npm ci`                                                  | declared   | exit 0              |
| Typecheck   | `npm run admin:typecheck`                                 | declared   | exit 0              |
| Web tests   | `npx vitest run test/web` (cwd admin)                     | declared   | all pass            |
| Admin tests | `npm run admin:test`                                      | declared   | all pass            |
| Admin e2e   | `npm run admin:test:e2e` + `npm run admin:test:e2e:media` | declared   | pass                |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/hooks/useResource.ts` (create) and
  `useFeedback.ts` (create)
- `admin/content-manager/src/web/app/components/statusLabels.ts` (create)
- `MediaPage.tsx`, `HistoryPage.tsx`, `PublicationPage.tsx` (migrate);
  `DiagnosticsPage.tsx` (labels only)

**Out of scope**:

- `ProductsPage`/`useProductsQuery` (richer hook; leave it),
  `CategoriesPage` (migrate only if trivial — it is the biggest churn; a
  later follow-up is acceptable and should be noted), `CommsPage`
  (plan 240 owns its shape).
- Visual redesign of feedback; same strings/markup.

## Git workflow

- Branch: `advisor/242-admin-page-hooks`
- Commits: hook + one page per commit, `refactor(admin): … (plan 242)`.

## Steps

### Step 1: `useResource`

```ts
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T>;
```

Semantics copied from `useProductsQuery` (read it): monotonic request guard
(ignore stale responses), `loading` true during fetch, `error` from thrown
`Error.message`/`ApiRequestError`, `reload` re-runs, unmount-safe (no
setState after unmount — the guard covers it). Unit test with a
controllable promise (resolve out of order → newest wins).

### Step 2: `useFeedback`

```ts
export type FeedbackKind = 'success' | 'error' | 'info';
export function useFeedback(initial?: { kind: FeedbackKind; message: string } | null):
  { feedback: … ; notify(kind, message): void; clear(): void }
```

No auto-dismiss (existing pages differ; do not change timing per page;
pages that had timed dismissal pass their own timers). Keep the exact
markup by rendering through the existing `<Feedback>` component.

### Step 3: Migrate Media, History, Publication

One page per commit. Replace the inline loading/error/reload state with
`useResource`; replace `setFeedback` pairs with `useFeedback`. Preserve:

- exact request order (no extra fetches),
- error copy for the 409/404 special cases (HistoryPage has custom
  messages — keep them; `notify` takes the final string),
- URL-sync behaviors (filters in query params — HistoryPage/MediaPage
  behaviors stay).

Run the page's web tests (if any) + admin e2e per page:

**Verify** (per page): `npx vitest run test/web` (cwd admin) → pass;
`npm run admin:test:e2e:media` after Media; `npm run admin:test:e2e`
(operator) after all.

### Step 4: Shared status labels

`components/statusLabels.ts` exporting one map per domain (media status,
change-set status) merged from the duplicates; update MediaPage,
DiagnosticsPage to import; no string changes (the maps are identical — verify
diff before merging; if they differ, keep both and note).

**Verify**: `grep -rn "STATUS_LABEL" admin/content-manager/src/web/app` →
only imports from the shared module.

### Step 5: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:typecheck` →
exit 0; `npm run admin:lint` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls admin/content-manager/src/web/app/hooks/` shows useResource + useFeedback
- [ ] `grep -c "useState" admin/content-manager/src/web/app/routes/MediaPage.tsx` dropped by ≥ 40% vs HEAD (record numbers)
- [ ] `grep -rn "MEDIA_STATUS_LABEL =" admin/content-manager/src/web/app/routes/MediaPage.tsx` returns nothing
- [ ] `npm run admin:test` exits 0; media + operator e2e pass
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A page's behavior depends on a state update ordering the hook cannot
  reproduce (report the page + effect).
- Web tests fail after migration for a reason that is not a test-local
  assumption (report).
- The duplicate label maps are not identical (report the diff; keep both).

## Maintenance notes

- New pages start from `useResource`/`useFeedback` — copy the hooks, not
  the old inline pattern.
- Reviewer: compare loading/error UX per page in the e2e recordings;
  the refactor must be invisible.
- **Deferred:** `CategoriesPage` migration (largest churn; do it right
  after this plan or fold into its next feature).
