# Plan 240: Split CommsPage into panels + a workspace hook (behavior-preserving)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/web/app/routes/CommsPage.tsx admin/content-manager/src/web/app/comms/`
> If CommsPage.tsx changed since this plan was written (plan 230 will change
> it), re-read the file and adapt the extraction inventory — but treat
> unexplained divergence as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 230 (freeze behavior first), 231 (comms tests net)
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`CommsPage.tsx` is 1 391 lines: one route component of ~773 lines with 27
hooks (`:127-900` — template editing, product picking, destinations, share,
activity log, backup) followed by 8 sub-components (`:908-1391`). It is
twice the next-largest page and is the newest large surface — the next
feature lands there. ADR 0011 fixed the _layering_; the size makes state
graphs invisible to reviewers (a stale-closure bug at `:745` or `:1309` is
not reviewable). No behavior change is wanted: the 8 e2e comms tests plus
the contract/integration suites are the net.

## Current state

- `CommsPage.tsx` — single file; panels already exist as functions at
  `:908-1391` (read them and name them before moving).
- `admin/content-manager/src/web/app/comms/` — directory exists
  (`handoff.ts` lives there); new panel files go here.
- Pattern for route files composed of local components: check
  `PublicationPage.tsx`/`CategoriesPage.tsx` imports — keep the house style
  (relative imports with `.tsx` extensions are the convention in this tree).
- The route is registered in `App.tsx:22` (static import — plan 241 will
  make it lazy; do that there, not here).

## Commands you will need

| Purpose     | Command                                                                          | Provenance | Expected on success |
| ----------- | -------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install     | `npm ci`                                                                         | declared   | exit 0              |
| Typecheck   | `npm run admin:typecheck`                                                        | declared   | exit 0              |
| Admin tests | `npm run admin:test`                                                             | declared   | all pass            |
| Comms e2e   | `npx playwright test -c playwright.config.ts test/e2e/comms.spec.ts` (cwd admin) | declared   | 8/8 pass            |
| Build       | `npm run admin:build`                                                            | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/routes/CommsPage.tsx` (becomes wiring)
- `admin/content-manager/src/web/app/comms/*.tsx` (new panel/hook files)

**Out of scope**:

- Any behavioral change, copy change, or accessibility overhaul — pure
  move/extract.
- `App.tsx` lazy loading (plan 241).
- The zod-free constants move (plan 241) — if you need to import constants
  from schema modules, keep doing exactly what the file does today.

## Git workflow

- Branch: `advisor/240-comms-split`
- Commits: one per extraction, `refactor(admin): … (plan 240)`.

## Steps

### Step 0: Baseline

`npm ci`; `npm run admin:test`; `npm run admin:typecheck`; the comms
comms e2e spec. All green → proceed.

### Step 1: Inventory

Read the file and map: which hooks/state belong to which panel; which are
shared (draft, doc, persist, busy, notify, destination, template). Write the
map as a comment in the PR description (not in code). If a clean boundary
does not exist for some state (e.g. draft mutations used by several
panels), the shared owner is the future `useCommsWorkspace()` hook.

### Step 2: Move the 8 sub-components

For each existing sub-component function (`:908-1391`), move it to
`src/web/app/comms/<Name>.tsx` exporting the same component with the same
props; update imports. No signature changes.

**Verify**: `npm run admin:typecheck` → exit 0; `npm run admin:test` → all
pass.

### Step 3: Extract `useCommsWorkspace()`

Move the shared state + `persist`/`reload`/`logActivity`/draft handling into
`src/web/app/comms/useCommsWorkspace.ts` returning a typed object the route
consumes. Keep every `useState`/`useEffect` hook exactly one-for-one —
if a hook's dependency array must change to compile after the move, stop
and re-read: moving hooks between components is how stale-closure bugs are
introduced; prefer passing values down over recreating hooks.

**Verify**: `npm run admin:typecheck` → exit 0; `npm run admin:test` → all
pass; **comms e2e 8/8** (`npx playwright test -c playwright.config.ts
test/e2e/comms.spec.ts`).

### Step 4: Panels

Split the remaining JSX into `TemplatesPanel`, `DestinationsPanel`,
`ActivityLogPanel`, `BackupPanel` (or the actual names from Step 1)
consuming `useCommsWorkspace()` values/actions. The route keeps the layout

- keyboard shortcuts (`g w` at `App.tsx:106` is unrelated; the `/` and
  Enter shortcuts live inside the page — keep them working).

**Verify**: comms e2e 8/8 again; `npm run admin:build` → exit 0.

### Step 5: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0.

## Test plan

- No new tests (pure refactor); the nets are the existing admin suites and
  the 8 comms e2e tests. Run the e2e at every step (it is fast against a
  warm build).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `wc -l admin/content-manager/src/web/app/routes/CommsPage.tsx` ≤ 250
- [ ] `ls admin/content-manager/src/web/app/comms/*.tsx | wc -l` ≥ 4
- [ ] `npm run admin:test` exits 0
- [ ] comms e2e 8/8 green
- [ ] `git diff --stat` shows the route file shrinking by ≥ 60% of its lines
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A hook's dependency array must change in a way you cannot prove is
  behavior-preserving (report the hook).
- The e2e suite drops below 8 passing tests at any step.
- The extraction requires touching files outside the scope list.

## Maintenance notes

- New comms features go into the panel that owns the concern; the route
  stays wiring.
- Reviewer: verify hook counts per component did not silently merge or
  reorder effects; the e2e flow coverage is the behavioral contract.
- **Deferred:** component-level test harness for the workspace hook (return
  to it if a bug ever escapes the e2e net).
