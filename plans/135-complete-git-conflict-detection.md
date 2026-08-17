# 135 — Complete git conflict detection and ahead/behind parsing

- **Source**: Auditoría 10, CORR-08 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/adapters/gitAdapter.ts admin/content-manager/src/server/services/publicationService.ts`

## Problem

`admin/content-manager/src/server/adapters/gitAdapter.ts:139-149` detects only two of the six unmerged states and never parses ahead/behind:

```ts
return {
  branch,
  dirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
  staged,
  unstaged,
  untracked,
  ahead: 0,
  behind: 0,
  hasConflicts:
    (statusResult.output ?? '').includes('UU') || (statusResult.output ?? '').includes('DD'),
};
```

`git status --porcelain --branch` emits `AA`, `AU`, `UA`, `DU`, `UD` for the other unmerged paths (each two-letter code from {A,D,U}), so `hasConflicts` misses them. The `## branch...origin [ahead 1, behind 2]` header carries the real counts but they are hardcoded to 0.

Impact: `runPreflight` (`publicationService.ts:44-49`) can pass a repo with AA/AU-style merge conflicts; the publication job then fails mid-stage after the recovery journal was written (see plan 130). The UI's Git status also hides real ahead/behind numbers.

## Scope

**In**: `admin/content-manager/src/server/adapters/gitAdapter.ts`, the tests that exercise `getStatus` (find them via `grep -rn "hasConflicts\|ahead" admin/content-manager/test` — expected in `test/integration/gitPull.test.ts` or `test/contract/`).

**Out**: Any behavior of `getChanges`/porcelain parsing beyond these fields.

## Steps

1. Parse the branch header line (`## branch...origin/master [ahead 1, behind 2]`) with a regex (`/\[ahead (\d+)(?:, behind (\d+))?\]/`) and fill `ahead`/`behind`; default to 0 when the section is absent.
2. Replace the `UU`/`DD` string check with a per-line classification: a line whose two status chars are both in {`A`,`D`,`U`} and are not the normal staged/unstaged markers means the path is unmerged → `hasConflicts = true`. (Simplest correct form: any line matching `/^[ADU][ADU] /` in the porcelain output is unmerged; `M`/`R`/`?` handling is unchanged.)
3. Keep the existing staged/unstaged/untracked classification untouched.

## Tests

- In the suite that covers `getStatus`, add cases using a real temp repo (pattern: `test/integration/gitPull.test.ts` builds temp repos): (a) merge conflict creating `AA`/`AU` states (e.g. both branches add the same path, or modify-add on the same path) → `hasConflicts: true`; (b) repo ahead of origin → `ahead` reflects the real count; (c) no conflicts → `hasConflicts: false` and the existing assertions still hold.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] `hasConflicts` true for at least one non-UU/DD unmerged state (asserted).
- [ ] `ahead`/`behind` reflect the `## ` header when present (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

`git status --porcelain` format is stable across git versions; if the repo ever switches to `--porcelain=v2`, this parsing must be rewritten. A reviewer should confirm the publication preflight tests still pass (they consume `hasConflicts`).

## Rollback

`git revert <sha>`.

## STOP conditions

- If the porcelain output in the test repos differs from the expected format (locale/version quirks), stop and report rather than weakening the assertion.
