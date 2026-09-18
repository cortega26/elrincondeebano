# Plan 190: Investigate service-worker fetch policy and request-path sharp/admin builds

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- service-worker.js astro-poc/public/service-worker.js admin/content-manager/src/server/services/previewBuild.ts admin/content-manager/src/server/routes/media.ts tools/utils/category-og.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: perf
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Two LOW-confidence perf suspects that must be measured before anyone changes
them (both touch offline/build semantics where a wrong "optimization" is a
regression): (1) the SW does `fetch(req, { cache: 'no-store' })` for
navigations before consulting its 24h-fresh HTML cache and fires a background
revalidation per fresh cache hit — repeat views may always pay network RTTs
and image-heavy scrolls may multiply origin load. (2) Preview builds spawn
`npm run build:fast` as a child process and category-OG/media-inventory work
may run inline on admin requests instead of through `jobRunner`/`mediaJobs`
— single clicks could block workers for a full build. This plan profiles and
traces; fixes (if any) are follow-up plans with evidence.

## Current state

Locations (verified by advisor read):

```js
// service-worker.js ~263-276 — network first with no-store for navigations
const networkResponse = await fetch(req, { cache: 'no-store' });
// ... cache put on ok ... catch → htmlCache.match(req) fallback
```

```js
// service-worker.js ~367-387 — background revalidation on EVERY fresh hit
const revalidate = fetch(req).then(async (resp) => { ...cache.put... });
if (event.waitUntil) { try { event.waitUntil(revalidate); } ... }
```

```ts
// previewBuild.ts:33-38 — spawns a full build as a child process
const child = spawn(NPM_CMD, ['run', 'build:fast'], {
  cwd: repoRoot,
  shell: false,
  timeout: timeoutMs,
});
// results carry stdout/stderr slices (2000 chars) — see plan 184 item 5 for the path-scrub angle
```

```ts
// media.ts:93-97 — inventory + intent enrichment inline on GET /media
// tools/utils/category-og.mjs:1-11 — sharp used directly at the call site (no visible queue import)
```

Constraints: ADR 0006 (SW cache namespaces + bump rules) governs any fetch
change; plan 137 (cache version only on success) and 146 (SWR for static
assets) already shaped this code — stay consistent. `service-worker.js`
(root) and `astro-poc/public/service-worker.js` are byte-synced build copies
— never edit only one (docs plan 208 covers the doc side).

## Commands you will need

| Purpose | Command                                                                                              | Provenance | Expected on success            |
| ------- | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------ |
| Tests   | `npx vitest run test/swCache.test.js test/swCachePolicy.test.js test/service-worker.runtime.test.js` | declared   | all pass (pins current policy) |
| Build   | `npm run build:fast`                                                                                 | declared   | exit 0                         |

## Scope

**In scope**: measurement + tracing + a verdict report. Code changes ONLY if
a profile proves the harm AND the fix is a ≤20-line policy tweak covered by
existing SW tests; otherwise write the follow-up plan and stop.

**Out of scope**: SW cache version bumps (ADR 0006 procedure); moving
preview/OG to the job system (follow-up plan's call); `no-store` removal.

## Git workflow

- Branch: `advisor/190-sw-fetch-investigate`
- Commit the verdict report (and any trivial proven tweak) e.g.
  `chore(perf): profile SW fetch policy; verdict + numbers (plan 190)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

SW/cache test files green unmodified. Record current SW cache version
prefixes from `service-worker.js:7-11` (date-based `ebano-*-2026-05-01-b`

- `html` namespace).

**Verify**: green; otherwise STOP.

### Step 1: Profile SW fetch behavior

Using the SW runtime tests (or a Playwright request-count profile over a
catalog scroll + repeat navigation if feasible locally):

1. Count network requests for: first visit → repeat navigation (same URL) →
   catalog scroll (N images). Record hits vs `no-store` fetches vs
   background revalidations.
2. Verdict per behavior (navigation no-store, per-hit revalidation,
   product-data network-first): keep (offline semantics require it) or
   follow-up (serve-fresh-cache-first + throttled revalidation, `no-store`
   reserved for explicit invalidations).

**Verify**: numbers recorded; no code changed yet.

### Step 2: Trace preview/OG/media execution paths

Statically trace: does `runPreviewBuild`/`schedulePreviewBuild` run on the
request path or via `jobRunner`? Does category-OG render enqueue via
`mediaJobs` or execute inline? Does `GET /media` enrichment block on sharp?
For each inline finding, record wall-time cost with a representative fixture
(a real `build:fast` timing from plan 185's baseline may already answer the
preview question — reuse it, don't re-measure).

**Verify**: per-route verdicts recorded (inline + cost, or enqueued).

### Step 3: Report + trivial tweaks only

Write the verdicts into the commit message AND the plans/README row note.
If (and only if) a ≤20-line tweak is proven safe by the existing SW tests
(e.g. throttling revalidation frequency), implement it with a new test
asserting the throttle; otherwise file precisely-scoped follow-up plan
descriptions in the report (do not implement them here).

**Verify**: suites green; report complete.

## Test plan

- Existing SW/cache/metadata suites are the pins (must stay green).
- New tests only for implemented tweaks (throttle behavior).
- Verification: targeted suites green + verdict report.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Targeted SW suites exit 0.
- [ ] Request-count profile numbers recorded (navigation + scroll).
- [ ] Every traced route (preview/OG/media) has an inline-or-queued verdict
      with cost evidence.
- [ ] No unproven behavior change in the diff.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files
      (ideally none except tests + index).
- [ ] `plans/README.md` status row updated with verdicts.

## STOP conditions

Stop and report back (do not improvise) if:

- The SW under test differs between root and `astro-poc/public` copies
  (sync them first per the build copy step; do not profile a split brain).
- Profiling needs production traffic data you don't have (record the method
  for the operator instead of guessing).
- A "fix" would alter offline semantics (that needs an ADR 0006 amendment
  discussion, not a perf tweak).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- These two areas must not be re-audited without new measurements — this
  plan's numbers are the record.
- Reviewer: confirm no SW behavior changed unless a test pins the new
  behavior.
- **Deferred:** follow-up implementation plans ONLY if Steps 1–2 prove harm
  (file with numbers, not adjectives).
