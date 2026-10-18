# Plan 233: Run the build-contract suites in CI (after the build artifact exists)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- .github/workflows/ci.yml`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live workflow before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (independent CI wiring)
- **Category**: tests
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

The **only** CI job that runs the root vitest suite sets
`CI_SKIP_BUILD_CONTRACT: '1'` (`ci.yml:60-65`) — and no other workflow runs
vitest after `build-and-check`. The five build-contract test files
(`csp.policy.hardening`, `share-preview.build-contract`,
`product-og.build-metadata`, `category-og.build-metadata`,
`home-og.build-metadata`) therefore **never execute in PR CI**: they
self-skip when `astro-poc/dist` is absent (see
`test/product-og.build-metadata.test.js:10-18`). Their subject — the
executable-surface contract of the built HTML (no inline executable
scripts, no jsDelivr, no `csp.js`, canonical/robots integrity) — is only
observed post-deploy via live monitors, i.e. after production. The build
job already uploads `astro-dist` (retention 1 day) for e2e/lighthouse; this
plan adds the missing consumer.

## Current state

`.github/workflows/ci.yml`:

- `unit-tests-root` (lines 48-65): `npx vitest run` with
  `CI_SKIP_BUILD_CONTRACT: '1'`.
- `build-and-check` (lines 114-171): builds, determinism-checks, uploads
  artifact `astro-dist` (`path: astro-poc/dist`).
- `e2e-tests` (175-209) and `lighthouse` (211-241): download the artifact
  with `PLAYWRIGHT_SKIP_BUILD=1` / `LH_SKIP_BUILD=1`.
- `verify` (245-326): aggregates job results explicitly (`check_job` list).

The skip logic is opt-in per job: with `astro-poc/dist` present and the env
var unset, all five files execute their real assertions
(`test/product-og.build-metadata.test.js:10-18`).

## Commands you will need

| Purpose         | Command                                                                                                                                                                                                         | Provenance | Expected on success        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------- |
| Install         | `npm ci`                                                                                                                                                                                                        | declared   | exit 0                     |
| Build once      | `npm run build` (or `build:fast` if dist is fresh/in scope)                                                                                                                                                     | declared   | exit 0                     |
| The five suites | `npx vitest run test/csp.policy.hardening.test.js test/share-preview.build-contract.test.js test/product-og.build-metadata.test.js test/category-og.build-metadata.test.js test/home-og.build-metadata.test.js` | declared   | all pass with dist present |
| Workflow lint   | `npx actionlint .github/workflows/ci.yml` (or rely on quality-gates)                                                                                                                                            | declared   | clean                      |

## Scope

**In scope**:

- `.github/workflows/ci.yml`

**Out of scope**:

- The design of the five suites (they run as-is).
- Caching changes to `build-and-check` (plan 238 owns CI hygiene).

## Git workflow

- Branch: `advisor/233-build-contract-ci`
- Commit: `ci: run build-contract suites against the build artifact (plan 233)`.

## Steps

### Step 0: Establish a green baseline

Run `npm ci` + `npm run build` (or verify an existing fresh
`astro-poc/dist`), then the five-suite command from the table. All five
must pass locally against a real build — if any fails, STOP (that is a
pre-existing red suite the operator must see before gating CI on it).

### Step 1: Add the post-build job

Insert after `lighthouse` (or any post-build job):

```yaml
build-contract-tests:
  name: Build Contract Tests (post-build)
  runs-on: ubuntu-24.04
  timeout-minutes: 10
  needs: [build-and-check]
  steps:
    - name: Checkout repository
      uses: actions/checkout@<same pin as siblings>
      with:
        persist-credentials: false

    - uses: ./.github/actions/setup-node-and-deps

    - name: Download build artifact
      uses: actions/download-artifact@<same pin>
      with:
        name: astro-dist
        path: astro-poc/dist

    - name: Run build-contract suites
      run: |
        npx vitest run \
          test/csp.policy.hardening.test.js \
          test/share-preview.build-contract.test.js \
          test/product-og.build-metadata.test.js \
          test/category-og.build-metadata.test.js \
          test/home-og.build-metadata.test.js
```

Copy the action pins from the sibling jobs (do not resolve new SHAs).

### Step 2: Wire it into `verify`

Add `build-contract-tests` to `verify.needs` and to the `check_job` list in
the same style as the other jobs.

**Verify**: read the final `verify` job — the new name appears in both
lists.

### Step 3: Prove it fails without the artifact (local reasoning)

The job always downloads the artifact (fails if missing — the upload step
uses `if-no-files-found: error`), so the skip path is unreachable in this
job. No extra env var is needed or wanted; do **not** set
`CI_SKIP_BUILD_CONTRACT`.

**Verify**: `grep -n "CI_SKIP_BUILD_CONTRACT" .github/workflows/ci.yml`
shows the variable only in `unit-tests-root`.

### Step 4: Full gates

**Verify**: the five-suite command passes locally; `npx actionlint` (if
available) or the quality-gates workflow's actionlint job would pass —
`flags: '-shellcheck='` per `.github/workflows/quality-gates.yml:126-128`.

## Test plan

- No new test code; this is CI wiring for existing suites.
- Manual empirical check: run the five suites with dist present (they
  execute) and with dist absent + env var set (they skip) to confirm both
  branches, as done in Step 0/3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "build-contract-tests" .github/workflows/ci.yml` shows the job and the two `verify` references
- [ ] `grep -n "CI_SKIP_BUILD_CONTRACT" .github/workflows/ci.yml` matches only the unit-tests-root env
- [ ] the five-suite command passes against a fresh build
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any of the five suites fails against a clean `npm run build` (pre-existing
  red — report the failing assertion).
- The artifact path/name in CI differs from `astro-dist` →
  `astro-poc/dist` (report).
- The workflow file structure differs from the excerpts (drift).

## Maintenance notes

- New build-metadata suites should be added to this job's command list, or
  they will silently revert to the "never runs in CI" state.
- Reviewer: confirm the job does not duplicate the full root suite
  (deliberately scoped to the five files; the rest runs in
  `unit-tests-root` and does not need dist).
- **Deferred:** none.
