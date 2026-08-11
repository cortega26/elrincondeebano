# Plan 075: Make build-contract tests fail closed when `astro-poc/dist` is missing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- test package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

`npm test` is the cheap local gate, but five build-contract test files call
`t.skip(...)` when `astro-poc/dist` is absent — which is the default state of
a fresh checkout. A developer (or agent) running `npm test` gets a green
result while the CSP policy, OG metadata, and share-preview artifact
contracts — the exact surfaces those tests exist to protect — are silently
not checked. CI masks the gap because it builds first and runs e2e separately.

After this plan: `npm test` fails loudly when the built site is missing
(instead of skipping), and the skip becomes an explicit opt-in that only CI's
artifact-reuse path uses.

## Current state

Verified code (read directly):

- `package.json:44` — `"test": "node test/run-all.js && vitest run"` (no build step).
- `test/csp.policy.hardening.test.js:39-44` — the skip pattern:
  ```js
  function readDistFile(...) {
    ...
    t.skip(...)   // when astro-poc/dist is absent
  }
  ```
- Same pattern at: `test/share-preview.build-contract.test.js:76,97`,
  `test/category-og.build-metadata.test.js:11`,
  `test/product-og.build-metadata.test.js:12`,
  `test/home-og.build-metadata.test.js:11`.
- CI runs `npm test` in `ci.yml` after `build-and-check` produced
  `astro-poc/dist` — so CI today is unaffected by the skip; only local runs
  are silently weaker.

## Commands you will need

| Purpose   | Command                                              | Expected on success                    |
| --------- | ---------------------------------------------------- | -------------------------------------- |
| Tests     | `npm test`                                           | exit 0                                 |
| Reproduce | `npm test` with `astro-poc/dist` temporarily renamed | fails with "dist missing" (see Step 1) |
| Restore   | `mv astro-poc/dist{,.bak}` back                      | exit 0 again                           |

## Scope

**In scope**:

- The five test files listed above (or the shared helper if the pattern is
  centralized — check `test/helpers/` first).
- `package.json` — ONLY if a `test:contract` script is needed (see Step 2).

**Out of scope**:

- Building the site as part of `npm test` (too slow — CI already builds).
- The CI workflows (ci.yml already builds before testing).
- Fixing any contract the tests would now start catching — report failures
  instead.

## Git workflow

- Branch: `advisor/075-fail-closed-build-contract-tests`.
- Single commit: `test: fail closed when build contract inputs are missing` + `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Flip the skip default to fail

For each of the five files, change the missing-dist path from `t.skip(...)`
to `t.fail(...)` with a message naming the missing input, e.g.:

```js
t.fail(`astro-poc/dist is missing — run npm run build first (file: ${filePath})`);
```

If the pattern is a shared helper in `test/helpers/`, change it there once.

**Verify**: `mv astro-poc/dist astro-poc/dist.bak && npm test` → the five
tests FAIL with the "dist missing" message; `mv astro-poc/dist.bak astro-poc/dist && npm test` → exit 0.

### Step 2: Add the explicit CI opt-in

Check whether CI's `npm test` step relies on the skip: `ci.yml` runs
`npm test` after the build job, so `dist` exists — no opt-in needed there.
But if any workflow or script runs `npm test` without a build (grep
`run:.*npm test` in `.github/workflows/`), add an env-gated opt-out:

```js
if (process.env.CI_SKIP_BUILD_CONTRACT === "1") return t.skip(...);  // explicit, documented
```

Only add this if a workflow needs it; otherwise leave the files unconditional.

**Verify**: grep `.github/workflows/` for `npm test` — every occurrence runs
after a build step (or documents the opt-in).

## Test plan

- The verification commands in Steps 1-2 ARE the test plan (no new test
  files; the change is to existing tests).
- Additionally run `npm test` once with the real `dist` present → exit 0.

## Done criteria

- [ ] All five contract tests fail (not skip) when `astro-poc/dist` is missing
- [ ] `npm test` with `dist` present exits 0
- [ ] `npm test` with `dist` renamed exits non-zero, showing the five failures
- [ ] Any workflow that runs `npm test` without a prior build either builds
      first or uses the documented `CI_SKIP_BUILD_CONTRACT=1` opt-in
- [ ] `plans/README.md` status row 075 updated

## STOP conditions

Stop and report back (do not improvise) if:

- A workflow runs `npm test` with no build and no clean place for the opt-in
  env var.
- Flipping to fail reveals that `dist` artifacts are missing in the working
  tree in a way that blocks the local verification (rebuild with
  `npm run build:fast` if the preflight chain is too slow — that is an
  acceptable verification shortcut; note it in the commit).

## Maintenance notes

- Any future build-contract test must copy the fail-closed pattern; the
  failing message doubles as onboarding docs for "why is this red".
- If the repo ever moves to building in `npm test` (unlikely — CI builds
  separately), this plan's distinction disappears; revisit then.
