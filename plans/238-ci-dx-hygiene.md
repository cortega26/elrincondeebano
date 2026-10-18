# Plan 238: CI/DX hygiene — playwright-install docs, pinned markdownlint, setup-node unify, rollback timeout, changesets retry, admin vitest once, pinned lizard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- .github/workflows/ .github/actions/setup-node-and-deps/action.yml package.json docs/onboarding/BOOTSTRAP.md CONTRIBUTING.md docs/START_HERE.md tools/requirements-lizard.txt`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 222, 225, 233 (this plan touches every workflow — run it
  last in the CI group so the other fixes are already in)
- **Category**: dx
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Seven small, verified hygiene defects; each has a one-line rationale:

1. **Playwright browsers undocumented.** `npx playwright install --with-deps chromium` exists only in `.github/actions/setup-playwright/action.yml:17`; a new contributor's first `npm run test:e2e`/`validate:release` fails with "Executable doesn't exist" and no doc says the one-line fix (`BOOTSTRAP.md` steps 13-17, `LOCAL_DEV.md`, `CONTRIBUTING.md:148` all silent).
2. **markdownlint unpinned.** `.github/workflows/quality-gates.yml:146` and `docs/START_HERE.md:38` run `npx markdownlint-cli2` with no devDependency — CI fetches latest on every run; a markdownlint release can redden CI with no repo change.
3. **Two setup-node majors.** `.github/actions/setup-node-and-deps/action.yml:18` pins v6.4.0 (used by all of `ci.yml`); eight other workflows pin v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`).
4. **rollback.yml has no timeout** (grep across all 16 workflows: it is the only one) while it builds and deploys Pages under the non-cancelling `pages` concurrency group — a hung run blocks main deploys for GitHub's 6 h default.
5. **changesets.yml installs bare** `npm ci` (`:34`), bypassing `tools/ci/npm-ci-with-retry.sh` (retry + `dependency-manifest-compat`) used everywhere else.
6. **admin vitest runs twice** in CI (`admin.yml:50-54`: `npx vitest run` then `npx vitest run --coverage`); the coverage thresholds already gate the suite.
7. **lizard unpinned.** `quality-gates.yml:37` `pip install lizard` with fixed CCN thresholds — a new release can change counting with no repo change; semgrep is pinned via `tools/requirements-semgrep.txt` (`semgrep==1.152.0`).

## Commands you will need

| Purpose       | Command                        | Provenance | Expected on success |
| ------------- | ------------------------------ | ---------- | ------------------- |
| Install       | `npm ci`                       | declared   | exit 0              |
| Markdown lint | `npm run lint:md` (new script) | declared   | clean               |
| Full tests    | `npm test`                     | declared   | all pass            |
| Lint          | `npm run lint`                 | declared   | exit 0              |

## Scope

**In scope**:

- `package.json` (markdownlint devDependency + `lint:md` script)
- `.github/workflows/quality-gates.yml`, `changesets.yml`, `rollback.yml`, `admin.yml`
- `.github/actions/setup-node-and-deps/action.yml`
- `tools/requirements-lizard.txt` (create)
- `docs/onboarding/BOOTSTRAP.md`, `CONTRIBUTING.md`, `docs/START_HERE.md` (playwright + lint:md pointer)

**Out of scope**:

- `images.yml` / `post-deploy-canary.yml` / `product-data-guard.yml`
  (plans 222/225).
- The composite action's cache strategy (`cache: npm` vs multi-line —
  accepted divergence per audit; do not redesign).

## Git workflow

- Branch: `advisor/238-ci-dx-hygiene`
- Commits per theme: `ci: …` / `docs: …`.

## Steps

### Step 1: Playwright install docs (DX-04)

- `docs/onboarding/BOOTSTRAP.md`: add a step after the npm-ci step:
  "`npx playwright install chromium` antes del primer `npm run test:e2e`"
  (with-deps variant for Linux CI-like environments).
- `CONTRIBUTING.md` (E2E bullet, ~:148): one sentence pointing at it.
- `docs/START_HERE.md:36` row: append "(requiere `npx playwright install chromium` la primera vez)".

**Verify**: `grep -rn "playwright install" docs/onboarding/BOOTSTRAP.md CONTRIBUTING.md docs/START_HERE.md` → 3 matches.

### Step 2: Pin markdownlint-cli2 (DX-07)

- Resolve the current version: `npm view markdownlint-cli2 version` (and its
  `markdownlint` engine dependency); add `markdownlint-cli2` to
  devDependencies with `^<major>.<minor>.<patch>` (match repo caret style).
- Add root script: `"lint:md": "markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules' '#astro-poc/node_modules' '#admin/content-manager/node_modules'"`.
- `quality-gates.yml:145-146`: replace `npx markdownlint-cli2 …` with
  `npm run lint:md` after the deps install step (the job currently sets up
  node without `npm ci` — keep its `setup-npm` shape and run
  `npm run lint:md`; verify the job has node_modules by the time it runs, if
  not add the repo's standard install or use `npx --no-install`).
- `docs/START_HERE.md:38`: point at `npm run lint:md`.
- `npm ci` required to refresh the lockfile entry — run it and commit
  `package-lock.json` (in-scope exception: the lockfile change is mechanical).

**Verify**: `npm run lint:md` → clean.

### Step 3: Unify setup-node (DX-09)

In `.github/actions/setup-node-and-deps/action.yml:18`, replace the v6.4.0
SHA with `949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` (the SHA eight
workflows already use). Read the composite inputs/steps after the bump:
`cache: npm` inputs are unchanged in v7; if the composite passes an input
that v7 dropped, STOP and report. Dependabot keeps it fresh afterwards.

**Verify**: `grep -n "actions/setup-node@" .github/actions/setup-node-and-deps/action.yml` → the v7.1.0 SHA; `grep -rn "actions/setup-node@48b55a" .github/` → no matches.

### Step 4: rollback timeout + changesets retry (DX-11)

- `rollback.yml`: add `timeout-minutes: 20` to `reject-unconfirmed` (5 is
  fine) and `deploy-rollback` (20).
- `changesets.yml:34`: `run: bash tools/ci/npm-ci-with-retry.sh`.

**Verify**: `grep -n "timeout-minutes" .github/workflows/rollback.yml` → both
jobs; `grep -n "npm-ci-with-retry" .github/workflows/changesets.yml` → match.

### Step 5: admin vitest once (DX-12)

`admin.yml:50-54`: delete the plain `npx vitest run` step; keep
`npx vitest run --coverage` (thresholds in
`admin/content-manager/vitest.config.ts` fail the job on either axis and
test failures print before the coverage summary). Update the step names so
the intent is clear ("Unit and integration tests (with coverage threshold)").

**Verify**: `grep -n "vitest run" .github/workflows/admin.yml` → one match
(the coverage run).

### Step 6: Pin lizard (DEP-04)

- Determine the version CI currently gets: `pip index versions lizard | head -3`
  (or `python -m pip install lizard== 2>&1 | grep -o 'from versions: …'`),
  pick the latest stable, create `tools/requirements-lizard.txt` with
  `lizard==<version>` plus a header comment mirroring
  `tools/requirements-semgrep.txt`.
- `quality-gates.yml:37`: `pip install -r tools/requirements-lizard.txt`.

**Verify**: `grep -n "requirements-lizard" .github/workflows/quality-gates.yml`;
run `python -m pip install -r tools/requirements-lizard.txt` locally if pip
is available (report if not).

### Step 7: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0;
`npm run lint:md` → clean.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "playwright install" docs/onboarding/BOOTSTRAP.md CONTRIBUTING.md docs/START_HERE.md` → 3 matches
- [ ] `grep -n "markdownlint-cli2" package.json` → devDependency + lint:md script
- [ ] `grep -rn "actions/setup-node@" .github/actions/setup-node-and-deps/action.yml` → v7.1.0 SHA
- [ ] `grep -n "timeout-minutes" .github/workflows/rollback.yml` → 2 matches
- [ ] `grep -n "vitest run" .github/workflows/admin.yml` → 1 match
- [ ] `grep -n "lizard==" tools/requirements-lizard.txt` → pinned
- [ ] `npm test` exits 0; `npm run lint` exits 0; `npm run lint:md` clean
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- setup-node v7 changes an input the composite passes (report the input).
- The pinned markdownlint version flags pre-existing content that the
  unpinned run did not (report the diff; the pin may need a config update,
  not silence).
- `quality-gates.yml`'s markdownlint job has no node_modules available at
  that step and adding the install reorders the job (report; a minimal
  `npm ci` step is acceptable but say so).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- The composite action is now the single setup-node pin; keep inline
  usages on the same SHA until they migrate.
- Dependabot bumps both pins in separate PRs — expect a transient
  mismatch; that is fine.
- **Deferred:** migrating the remaining inline setup-node usages onto the
  composite (bigger diff, no behavior win today).
