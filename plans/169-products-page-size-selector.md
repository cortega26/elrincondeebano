# Plan 169: Add page-size selector (50 / 100 / Todos) to Products listing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fa260fb6..HEAD -- admin/content-manager/src/web/app/components/useProductsQuery.ts admin/content-manager/src/web/app/routes/ProductsPage.tsx admin/content-manager/src/web/api/client.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `fa260fb6`, 2026-08-29
- **Issue**: -

## Why this matters

The Products listing is the operator's primary work surface. It is always paginated at a hard-coded `50` (`useProductsQuery.ts:8` `PAGE_LIMIT = 50`) while the bulk scope selector `Ámbito: Página (50) / Todos los que coinciden (184)` (`BulkOpsBar.tsx:106-114`) controls only the bulk mutation target, not the table view. Operators who filter to 184 matches expect “Todos” to show all rows, but the table still shows 50 and requires 4× `Siguiente →` clicks. A page-size control (50 / 100 / Todos) eliminates that friction with zero backend change — the API already accepts `limit`.

## Current state

The facts the executor needs, inlined:

- Relevant files, each with one line on its role:
  - `admin/content-manager/src/web/app/components/useProductsQuery.ts` — owns filters, pagination, `PAGE_LIMIT = 50`, `client.getProducts({ ...filters, page, limit: PAGE_LIMIT })` (`useProductsQuery.ts:8,85`)
  - `admin/content-manager/src/web/app/routes/ProductsPage.tsx` — renders `Mostrando {pageStart}–{pageEnd} de {total}` (`ProductsPage.tsx:662`), `Siguiente →` / `← Anterior` (`ProductsPage.tsx:782`), and `BulkOpsBar` with bulk scope
  - `admin/content-manager/src/web/api/client.ts` — `getProducts(filters: ProductFilters & { page?: number; limit?: number })` already forwards `limit` to query string; no change needed
  - `admin/content-manager/src/web/app/components/FilterBar.tsx` / `BulkOpsBar.tsx` — filter/bulk UI, not pagination

- Excerpts of the code as it exists today (short, with `file:line` markers):

```ts
// admin/content-manager/src/web/app/components/useProductsQuery.ts:8
export const PAGE_LIMIT = 50;

// admin/content-manager/src/web/app/components/useProductsQuery.ts:52,84-85
const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
const result = await client.getProducts({ ...filters, page, limit: PAGE_LIMIT });

// admin/content-manager/src/web/app/routes/ProductsPage.tsx:224-226
const pageStart = data ? (data.page - 1) * data.limit + 1 : 0;
const pageEnd = data ? Math.min(data.page * data.limit, data.total) : 0;

// admin/content-manager/src/web/app/routes/ProductsPage.tsx:781-801
{data && data.total > data.items.length && (
  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
    <button onClick={() => setFilterParam('page', String(page - 1))} disabled={page <= 1}>← Anterior</button>
    <span>Página {page} de {Math.ceil(data.total / data.limit)}</span>
    <button onClick={() => setFilterParam('page', String(page + 1))} disabled={pageEnd >= data.total}>Siguiente →</button>
  </div>
)}

// admin/content-manager/src/web/app/components/BulkOpsBar.tsx:106-114
<label>Ámbito:
  <select value={bulkScope} onChange={e => setBulkScope(e.target.value as 'page'|'all')}>
    <option value="page">Página ({data.items.length})</option>
    <option value="all">Todos los que coinciden ({data.total})</option>
    <option value="selection">Selección ({selectionCount})</option>
  </select>
</label>
// Note: bulkScope 'all' affects bulkPreview/bulkApply scope, not the table view.
```

- The repo conventions that apply here, with a pointer to one exemplar file:
  - Pagination is URL-driven via `useSearchParams` — see `useProductsQuery.ts:33,112` `setFilterParam` pattern (mutates `URLSearchParams`, deletes `page` on filter change). Match it for the new `limit` param.
  - Product listing uses `PaginatedResponse` with `data.limit` from server truth, not client constant, for `pageStart`/`pageEnd` — keep this (server echoes `limit`).
  - i18n is Spanish-first for this surface (`Ámbito`, `Mostrando`). Match it: label `Mostrar:` and options `50`, `100`, `Todos (N)`.
  - Keep the change small and inside `useProductsQuery.ts` + `ProductsPage.tsx` — do not touch `BulkOpsBar` bulk semantics.

- Any documented vocabulary or design constraints the plan must honor:
  - The `Ámbito` bulk selector stays as-is (operation scope). The new control is **view page size**, distinct. Do not conflate them.
  - “Todos” for view should not be unbounded for performance: cap at `min(total, 500)` or use the server’s `limit = total` as sent by the client. The executor should set `limit = total` when “Todos” is chosen (or `500` if total > 500 and total is needed for the count, but `getProducts` with `limit=500` still returns `total`).

## Commands you will need

| Purpose    | Command                                                                    | Provenance | Expected on success                              |
| ---------- | -------------------------------------------------------------------------- | ---------- | ------------------------------------------------ |
| Typecheck  | `npm run typecheck`                                                        | declared   | exit 0, 0 errors                                 |
| Lint       | `npm run lint`                                                             | declared   | exit 0, 0 errors (60 warnings pre-existing)      |
| Tests      | `npm test` (or `npx vitest run` + `npm -w admin/content-manager run test`) | declared   | all pass (335 root + 635 admin before, plus new) |
| Build fast | `npm run build:fast`                                                       | declared   | exit 0, 233 pages                                |

**Provenance**: `declared` from `package.json:65` `typecheck: "npm run typecheck:astro && npm run typecheck:astro && npm run admin:typecheck"` etc., `lint`, `test`. Advisor is forbidden from installing, so not `executed` in this session; treat a `declared` failure on unmodified checkout as baseline report, not executor error (see Step 0).

## Suggested executor toolkit

- None required. If `vercel-react-best-practices` is available, use it to keep the `useProductsQuery` hook simple (no extra memoization beyond existing `useCallback`).

## Scope

**In scope** (the only files you should modify):

- `admin/content-manager/src/web/app/components/useProductsQuery.ts` — add `PAGE_SIZE_OPTIONS`, read `limit` from `searchParams`, expose `limit` + `setLimit` or make `setFilterParam` handle `limit`
- `admin/content-manager/src/web/app/routes/ProductsPage.tsx` — add `Mostrar: [50 ▼] [100] [Todos]` dropdown next to pagination info, wiring to `setFilterParam('limit', ...)` / `limit` from hook

**Out of scope** (do NOT touch, even though they look related):

- `admin/content-manager/src/web/app/components/BulkOpsBar.tsx` — bulk `Ámbito` stays as operation scope; changing it would confuse bulk semantics and was considered and rejected
- `admin/content-manager/src/web/api/client.ts` — already supports `limit`, no change needed; verify via grep but do not edit
- `admin/content-manager/src/server/*` — pagination already handles arbitrary `limit`; no server change (server already echoes `limit` and `total`)
- `test/e2e-astro/` — no new e2e needed for this S-effort; unit coverage via vitest is sufficient
- Any change to bulk `scope: 'all'` behavior — out of scope

## Git workflow

- Branch: `advisor/169-products-page-size-selector` (or repo convention `feat/` if you prefer, but `advisor/` matches recent `advisor/128-*` precedent)
- Commit: one commit; message style: `feat(admin): page-size selector 50/100/All (plan 169)` — matches `git log --oneline -5` conventional `feat(admin):` / `chore(legacy):`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Before changing anything, get the toolchain working and confirm the repo is already healthy on unmodified checkout.

- Run every command in the table as it exists on unmodified checkout: `npm run typecheck`, `npm run lint`, `npx vitest run` (root) or `npm -w admin/content-manager run test` if you prefer the admin gate.
- If all pass: record that, proceed to Step 1.
- If a `declared` command does not exist or fails on unmodified checkout: **STOP and report** — include command and exact output. Do not "fix" the build to get moving.
- If an `executed` command fails: drift STOP.

**Verify**: every command in the table runs and matches expected result on unmodified checkout.

### Step 1: Make page size URL-driven in `useProductsQuery.ts`

What to do, precisely. Reference exact files/symbols.

In `admin/content-manager/src/web/app/components/useProductsQuery.ts`:

1. Replace the hard-coded `export const PAGE_LIMIT = 50;` (`useProductsQuery.ts:8`) with a constant for options and a derived `limit`:

   ```ts
   export const PAGE_SIZE_OPTIONS = [50, 100, 250] as const; // 250 covers “large” without unbounded; “Todos” is separate
   // Or: [50, 100] plus a dynamic “Todos” that uses total — simplest is to keep PAGE_LIMIT fallback but read searchParams limit
   ```

   Minimal viable shape (keep diff small):

   ```ts
   export const PAGE_SIZE_OPTIONS = [50, 100] as const;
   export const PAGE_LIMIT = 50; // keep for fallback/test compat
   // inside hook:
   const rawLimit = Number(searchParams.get('limit') ?? '50') || 50;
   const limit = [50, 100].includes(rawLimit) ? rawLimit : rawLimit === 9999 ? 9999 : 50;
   // But for “Todos” we will set limit to total (or 500) dynamically in the page — so allow any positive int up to 500:
   const limit = Math.min(
     Math.max(1, Number(searchParams.get('limit') ?? String(PAGE_LIMIT)) || PAGE_LIMIT),
     500
   );
   // Simplest that satisfies the spec and reviewer: clamp 1..500, default 50
   ```

   The reviewer-preferred shape (from discussion): dropdown `50 | 100 | Todos` where `Todos` sets `limit` to `String(data?.total ?? 500)` or a sentinel `500`. Keep the hook generic: `const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? '50') || 50));` — this naturally supports `50`, `100`, and `Todos` as `limit=500` or `limit=total` (total ≤500 in this catalog; 184 today, so `Todos` = 184).

2. Expose `limit` in the hook return type and value:

   ```ts
   export function useProductsQuery(): { data: ...; limit: number; page: number; ... }
   // return { ..., limit, page, ... }
   ```

3. Ensure `setFilterParam` handles `limit` and resets `page`:

   ```ts
   function setFilterParam(key: string, value: string): void {
     const next = new URLSearchParams(searchParams);
     if (value) next.set(key, value);
     else next.delete(key);
     if (key !== 'page') next.delete('page'); // existing: changing filter resets to page 1
     // Changing limit also resets to page 1 (same as filters)
     setSearchParams(next);
   }
   // Works as-is because limit !== 'page', so it already deletes page. Keep it.
   ```

4. Update the `load` call to use the dynamic `limit`:

   ```ts
   const result = await client.getProducts({ ...filters, page, limit });
   // was: limit: PAGE_LIMIT
   ```

5. Add `limit` to the `useCallback` deps (`[q, ..., page, limit]`).

6. Keep `PAGE_LIMIT` exported for test compat (some guardrail tests may import it), but the hook no longer hard-codes it.

**Verify**: `npm run typecheck` → exit 0

### Step 2: Add the “Mostrar:” dropdown in `ProductsPage.tsx`

In `admin/content-manager/src/web/app/routes/ProductsPage.tsx`:

1. Destructure `limit` from `useProductsQuery()` (`ProductsPage.tsx:46-66`):

   ```ts
   const { data, loading, ..., page, limit, filters, ... } = useProductsQuery();
   ```

2. Next to the existing `Mostrando {pageStart}–{pageEnd} de {total}` paragraph (`ProductsPage.tsx:659-672`), add a `Mostrar:` control. Minimal markup matching existing inline style:

   ```tsx
   <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#495057' }}>
     Mostrando {pageStart}–{pageEnd} de {data.total}{' '}
     <label style={{ marginLeft: '0.75rem' }}>
       Mostrar:{' '}
       <select
         value={String(limit)}
         onChange={(e) => {
           const v = e.target.value;
           // “Todos” is total (capped at 500 for safety); otherwise 50/100
           const nextLimit = v === 'all' ? String(Math.min(data.total, 500)) : v;
           setFilterParam('limit', nextLimit);
         }}
         aria-label="Tamaño de página"
         style={{ padding: '0.1rem 0.25rem' }}
       >
         <option value="50">50</option>
         <option value="100">100</option>
         <option value="all">Todos ({data.total})</option>
       </select>
     </label>
     {data.total > data.items.length && (
       <button onClick={() => setFilterParam('page', '1')} ...>Primera página</button>
     )}
   </p>
   ```

   Notes:
   - `value` must align with hook’s `limit`: when `Todos` is selected, `limit` is `total` (e.g. 184), so `value={String(limit)}` would be `184`, not `all`. To keep select controlled, use: `value={String(limit) === String(data.total) ? 'all' : String(limit)}` and `limit` from hook will be `184` after navigation, but the URL will be `?limit=184` (or `500` cap). Simpler: make “Todos” set `limit` to `String(data.total)` and display `Todos (184)`; the select’s `value` check handles it. This is explicit and not silent.

3. Keep the existing pagination buttons (`ProductsPage.tsx:781-801`) unchanged — they already use `data.limit` for `Math.ceil(data.total / data.limit)` and `pageEnd`.

4. Ensure changing `Mostrar` resets to page 1 — `setFilterParam('limit', ...)` already deletes `page` because `key !== 'page'`, so it navigates to `?limit=100&page=1` → `page` param deleted → `page=1`.

**Verify**: `npm run lint` → 0 errors (60 warnings pre-existing), `npm run typecheck` → 0 errors

### Step 3: Manual smoke + tests

- Run the admin tests and root tests to ensure pagination still works:

  ```bash
  npm -w admin/content-manager run test 2>&1 | tail -20
  npx vitest run 2>&1 | tail -20
  ```

  Both should stay green (previous: `79 files 635 passed`, `63 files 335 passed`).

- Optional manual smoke (not required for gate, but recommended): `npm run build:fast` → `233 pages`, open `ProductsPage` with `?limit=100`, verify URL updates, `Mostrando 1–100 de 184`, `Siguiente →` disabled on last page, `Todos` shows `1–184`.

**Verify**: admin + root vitest green

## Test plan

- New tests to write: none strictly required for this S-effort — the hook change is covered by existing `useProductsQuery` consumers and the `ProductsPage` pagination tests if any. If you add a test, model after `admin/content-manager/test/contract/productService.test.ts` or a simple hook test: verify `?limit=100` → `client.getProducts` called with `limit: 100`, and `?limit=500` caps at `500`.
- Which existing test to use as structural pattern: `admin/content-manager/test/integration/api.test.ts` is too heavy; a light unit for `useProductsQuery` could be added under `admin/content-manager/test/web/` harness pattern (see `test/web/publicationPage.test.tsx` for harness), but not required for this plan’s gate.
- Verification: `npm -w admin/content-manager run test` → `79 files` pass (no new file required), `npx vitest run` → `63 files` pass

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "PAGE_LIMIT = 50" admin/content-manager/src/web/app/components/useProductsQuery.ts` returns no matches (hard-coded limit removed) OR returns only the fallback export with `limit` derived from `searchParams`
- [ ] `grep -n "Mostrar" admin/content-manager/src/web/app/routes/ProductsPage.tsx` → hit (dropdown exists)
- [ ] `grep -n "limit" admin/content-manager/src/web/app/components/useProductsQuery.ts` → hit inside `useCallback` deps and `client.getProducts` call
- [ ] Selecting `100` in the UI updates URL to `?limit=100` and data shows `Mostrando 1–100 de N` (verified via manual smoke or unit test)
- [ ] Selecting `Todos` sets `limit` to `total` (or `500` cap) and shows `Mostrando 1–N de N` with pagination hidden (since `data.total <= data.items.length`)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0 (warnings pre-existing ≤60)
- [ ] `npm run admin:test` and `npx vitest run` green (or `npm test` green)
- [ ] `git diff --name-only fa260fb6...HEAD` lists only in-scope files (`useProductsQuery.ts`, `ProductsPage.tsx`) — three dots

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written) — e.g. `PAGE_LIMIT` is no longer `50` or `ProductsPage.tsx:781` pagination block is gone.
- A step's verification fails twice after a reasonable fix attempt (e.g. `typecheck` fails due to `limit` not being in `PaginatedResponse` — but it is, `data.limit` already exists).
- The fix appears to require touching an out-of-scope file (`BulkOpsBar.tsx`, `client.ts` server route, `useProductsQuery` callers beyond `ProductsPage.tsx`).
- `searchParams.get('limit')` is ignored by the server (pagination still returns `50` regardless of `limit` param) — would indicate server caps `limit` or ignores it; report the server behavior.
- A command marked `declared` in the table does not exist or fails on unmodified checkout (Step 0) — baseline broken.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- What future changes will interact with this: `useProductsQuery` is the single pagination owner. If a new `limit` default is desired (e.g. 25 default for mobile), change `PAGE_LIMIT` fallback or the `searchParams` default, not the page component.
- What a reviewer should scrutinize: the `Todos` cap (`500`) — if the catalog grows beyond 500, should it be `1000` or truly `total`? For 184 today, `total` is correct; the cap is a safety valve for future growth. Also verify that `Todos` resets `page` to `1` (it does via `setFilterParam`).
- Any follow-up explicitly deferred: no bulk-scope change — `BulkOpsBar` `Ámbito: Todos los que coinciden` stays as bulk operation scope. If operators confuse view vs bulk scope, a follow-up could add a small help text “Ámbito afecta a Aplicar, no a la vista”.
