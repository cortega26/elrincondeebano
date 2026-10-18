# Plan 246: Incremental asset mirror in `sync-data.mjs` (stop delete+copy of 116 MB per build)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/scripts/sync-data.mjs test/sync-data.script.test.js`
> If either changed, re-read before editing; unexplained divergence is a
> STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (a wrong incremental mirror silently leaves stale files)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`astro-poc/scripts/sync-data.mjs:99-107` mirrors `assets/` into
`astro-poc/public/assets/` with `fs.rmSync(targetDir, {recursive:true})`
followed by a full `fs.cpSync(sourceDir, targetDir)`. The asset tree is
**116 MB / ~4,537 files** and this runs inside every `astro-poc build`
(`${:272}`, including `build:fast`), before Astro copies `public/` into
`dist` again. Two costs per build: the full delete+copy, and a crash window
where `public/assets` is empty mid-build. An incremental mirror (copy only
changed files, delete only extras) removes both.

## Current state

```js
function syncDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing source directory: ${sourceDir}`);
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (sourcePath) => shouldCopyPublicAsset(sourcePath, sourceDir),
  });
}
```

Plus `src/data` syncs through the same helper (read `main()` before
editing). Test: `test/sync-data.script.test.js` (read it; it is
source-text-level today — you may extend it or add a runtime test with
temp dirs, whichever matches the existing style).

## Commands you will need

| Purpose    | Command                                                               | Provenance | Expected on success |
| ---------- | --------------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `npm ci`                                                              | declared   | exit 0              |
| Benchmark  | `time node astro-poc/scripts/sync-data.mjs` (twice: cold-ish, second) | declared   | second run ≪ first  |
| Sync test  | `npx vitest run test/sync-data.script.test.js`                        | declared   | all pass            |
| Build      | `npm run build:fast`                                                  | declared   | exit 0              |
| Full tests | `npm test`                                                            | declared   | all pass            |

## Scope

**In scope**:

- `astro-poc/scripts/sync-data.mjs`
- `test/sync-data.script.test.js`

**Out of scope**:

- The exclude rules (`shouldCopyPublicAsset`), the source tree layout, and
  the `src/data` handling semantics (same helper, same result).
- Astro's own `public/` → `dist/` copy (out of this script's control).

## Git workflow

- Branch: `advisor/246-asset-sync`
- Commit: `perf(build): incremental asset mirror in sync-data (plan 246)`.

## Steps

### Step 0: Baseline + measurement

`npm ci` then run the sync script twice; record wall time for each (first
run includes the delete+copy; for a fair before/after also record
`du -sh astro-poc/public/assets` and file count). Cold-cache caveat: use
`git status --short` clean and note whether the OS page cache was warm.

### Step 1: Implement the incremental mirror

Replace `syncDirectory` with a mirror that:

1. Recursively walks the source (applying the existing filter) and, for
   each file, copies only when the destination is missing or
   `srcStat.mtimeMs !== destStat.mtimeMs || srcStat.size !== destStat.size`;
   ensures parent dirs (`mkdirSync recursive`).
2. Recursively walks the target and deletes files/directories that are not
   in the kept set (extras from renamed/removed sources, respecting the
   filter so excluded paths never linger).
3. Keeps the existing error behavior for a missing source.

Use `fs.promises` or sync — match the file's current style. Keep it small
and boring; no watchers.

**Verify**: run twice; second run copies 0 files (add a
`--verbose`-style counter log line the first time? keep the existing log
format; you may add a `copied/removed` summary line). Then mutate a source
file's content (touch it), run again → exactly that file copied. Add a
stale file to the target manually, run → removed. Record these three
empirical checks in the PR.

### Step 2: Test

Extend `test/sync-data.script.test.js` (or add a runtime test with
`mkdtempSync` temp source/target trees) to cover: copy-new, skip-unchanged
(assert no copy via stat comparison or a spy), remove-extra, respect the
filter on both directions. Follow the existing test file's style; if it is
source-text-only, adding a runtime test is in scope.

**Verify**: focused test → pass.

### Step 3: Build + gates

`npm run build:fast` → exit 0 (dist unchanged: run the determinism-adjacent
check `node tools/check-determinism-paths.mjs` for good measure, and diff
`git status` — no stray files). `npm test` → all pass.

Re-measure the sync script; expect the warm run to drop to near-zero copy
time. Record before/after in the PR (numbers, not vibes).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "rmSync(targetDir" astro-poc/scripts/sync-data.mjs` returns nothing
- [ ] Second-run sync copies 0 files (log line or test asserts it)
- [ ] `npx vitest run test/sync-data.script.test.js` exits 0 with new cases
- [ ] `npm run build:fast` exits 0; `npm test` exits 0
- [ ] PR records before/after timings
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The sync has consumers relying on the "always fresh copy" (e.g. a test
  asserting mtimes change) — report them.
- The filter's semantics are path-dependent in a way that makes the
  delete-extra walk unsafe (report the case).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- mtime+size is the change signal: if sources are regenerated with
  identical bytes but new mtimes, files recopy — acceptable (correctness
  first). If a future generator rewrites files with identical
  mtime+size but different content (near-impossible), switch to content
  hashes.
- Reviewer: the delete-extra walk must never remove files the filter
  excluded-but-already-present? (It should: excluded paths are not part of
  the mirror.) Confirm with the test.
- **Deferred:** measuring `dist` copy (Astro) — separate concern.
