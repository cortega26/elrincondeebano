# Plan 033: Lint active Astro files pre-commit and make tests hermetic

> **Executor instructions**: Keep hook latency reasonable, never commit a deliberately broken fixture, and update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- package.json .husky/pre-commit astro-poc/eslint.config.mjs test/tools.staticServer.security.test.js test/tmp-static/index.html`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

The pre-commit hook excludes all `astro-poc/**` JS/TS and has no `.astro` glob, so it misses the shipped surface. The full test suite also overwrites tracked `test/tmp-static/index.html`, leaving the worktree dirty because it removes the final newline. Both issues undermine the local safety net while having small, mechanical fixes.

## Current state

- `.husky/pre-commit` runs only `npx lint-staged`.
- `package.json:126-137` excludes `astro-poc/**` from JS/TS lint and omits `*.astro`.
- `astro-poc/eslint.config.mjs` already supports Astro source.
- `test/tools.staticServer.security.test.js:14-16` writes into tracked `test/tmp-static/index.html` instead of an OS temp directory.

## Commands you will need

| Purpose | Command                                                               | Expected                                                 |
| ------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Focused | `node test/tools.staticServer.security.test.js && git status --short` | test passes; no tracked change                           |
| Hook    | `npx lint-staged --debug`                                             | staged Astro fixture is processed by Astro lint/Prettier |
| Gate    | `npm run lint && npm run typecheck && npm test`                       | exit 0 and clean tree                                    |

## Scope

**In scope**: `package.json`, `test/tools.staticServer.security.test.js`; delete tracked `test/tmp-static/index.html` and directory if no other consumer; modify hook/config only if required.

**Out of scope**: migrating test runners (plan 024), reformatting whole repo, changing lint rules, production code.

## Git workflow

- Branch: `advisor/033-local-safety-net`
- Commit: `chore: cover active Astro files in local checks`

## Steps

### Step 1: Add an Astro-aware lint-staged pattern

Add a non-overlapping pattern for `astro-poc/**/*.{astro,js,mjs,ts,mts}`. Invoke the workspace lint configuration in a way that accepts lint-staged file arguments, plus Prettier. Root JS/TS patterns must continue excluding Astro paths.

**Verify**: stage one intentionally malformed temporary `.astro` file and prove the hook rejects it; restore/delete it, stage a valid file and prove the hook passes. Leave no test file staged.

### Step 2: Use an isolated temporary directory

Change the static-server test to `fs.mkdtempSync(path.join(os.tmpdir(), ...))`, write its fixture there and remove it in `finally`. Also close the HTTP server in `finally` so assertion failures do not leak a handle. Remove the tracked temp fixture if unused.

**Verify**: run the focused command twice; `git status --short` shows only intentional plan changes.

### Step 3: Baseline

**Verify**: full gate → exit 0; immediately run `git status --short` and confirm tests created no additional tracked changes.

## Test plan

Manual hook probe plus the existing static-server assertions. No new test framework is needed.

## Done criteria

- [ ] Staged active Astro/JS/TS files are linted and formatted.
- [ ] Static-server test writes only to OS temp and cleans up server/files.
- [ ] Full suite leaves worktree unchanged.
- [ ] Hook/runtime stays acceptably fast and gates pass.

## STOP conditions

- lint-staged cannot pass filenames safely to the Astro workspace config.
- Astro hook adds more than roughly 10 seconds for a single file on the local baseline.
- Another test consumes `test/tmp-static/index.html` as a committed fixture.

## Maintenance notes

Whenever the canonical app path changes, update lint-staged ownership. Tests must never use tracked directories as scratch space.
