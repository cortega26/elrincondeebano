# Plan 222: Fix the images workflow — revive the dead step, scope the trigger and the auto-commit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- .github/workflows/images.yml test/images-workflow.contract.test.js docs/operations/RUNBOOK.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug/security
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`.github/workflows/images.yml` has been broken since 2026-09-14 (plan 186
removed the `images:generate` script it runs): the next push touching
`assets/images/originals/**` — or a manual dispatch — fails with
`npm error Missing script: "images:generate"`, so variants stop being
regenerated and the auto-commit path is dead. Nobody has hit it yet only
because no `originals/` push happened since.

The workflow is also the only write-token job in the repo with **no branch
filter**, and it auto-commits with `git add -A` — any branch push touching
that path gets a `chore: update optimized images` commit (plus whatever
else the scripts produce) pushed to that branch with repo write scope. The
sibling auto-commit in `product-data-guard.yml:119-134` already uses an
explicit path allowlist; this workflow should match.

## Current state

`.github/workflows/images.yml` (full file is short — read it):

```yaml
on:
  push:
    paths:
      - 'assets/images/originals/**'
    tags-ignore:
      - '*'
  workflow_dispatch:
...
- run: npm run images:generate # line 45 — script removed in plan 186
- run: npm run images:rewrite
- run: npm run lint:images
- name: Commit changes
  run: |
    git add -A
    ...
    git commit -m 'chore: update optimized images'
    git push origin HEAD:"refs/heads/${GITHUB_REF_NAME}"
```

`package.json:30` — preflight runs `images:avif` + `images:gap-fill` (the
surviving generators); `images:generate` does not exist in the script block
(lines 44-50).

`docs/operations/RUNBOOK.md:211` documents the workflow as using
`images:generate` — update that line too.

`product-data-guard.yml:119-134` — the scoped-add pattern to copy:

```yaml
git add data/product_data.json robots.txt astro-poc/public/robots.txt || true
...
if git diff --cached --quiet; then ... exit 0; fi
```

Repo conventions for workflow contract tests: `test/post-deploy-workflow.test.js`,
`test/static-deploy-workflow.test.js`, `test/live-contract-workflow.test.js`
(text assertions over the YAML).

## Commands you will need

| Purpose      | Command                                                                | Provenance | Expected on success                                   |
| ------------ | ---------------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| Install      | `npm ci`                                                               | declared   | exit 0                                                |
| New test     | `npx vitest run test/images-workflow.contract.test.js`                 | declared   | all pass                                              |
| Full tests   | `npm test`                                                             | declared   | all pass                                              |
| Script check | `npm run images:avif` and `npm run images:gap-fill` on a warm checkout | declared   | exit 0 (no crash; outputs unchanged if already fresh) |
| Lint         | `npm run lint`                                                         | declared   | exit 0                                                |

## Scope

**In scope**:

- `.github/workflows/images.yml`
- `docs/operations/RUNBOOK.md` (line 211 only)
- `test/images-workflow.contract.test.js` (create)

**Out of scope** (do NOT touch):

- The image scripts themselves (`tools/sync-avif-assets.js`,
  `tools/gap-fill-image-variants.js`, `tools/rewrite-images.mjs`) — this is
  a wiring fix. If a chosen script misbehaves, STOP.
- Variant width sets / pruning (plan 235 owns that).
- `ci.yml` / other workflows.

## Git workflow

- Branch: `advisor/222-images-workflow`
- Commits: `fix(ci): repair and scope the images workflow (plan 222)`.

## Steps

### Step 0: Establish a green baseline

Run Install and `npx vitest run test/post-deploy-workflow.test.js` (sanity
that the workflow-test pattern works) on the unmodified checkout. If it
fails, STOP.

**Verify**: exit 0.

### Step 1: Repoint the dead step

In `images.yml`, replace

```yaml
- run: npm run images:generate
```

with the surviving pipeline used by preflight for the same outputs:

```yaml
- run: npm run images:avif
- run: npm run images:gap-fill
```

Keep `images:rewrite` and `lint:images` as they are. Before committing,
run both commands once locally (see the command table): they must exit 0
and be idempotent (second run reports no changes). If either fails or
reports unexpected churn, STOP and report with the exact output — choosing
different surviving scripts is a judgment call for the owner.

**Verify**: `npm run images:avif && npm run images:gap-fill` → exit 0;
`git status --short` shows no unexpected modified files after a second run
(byte-stable outputs).

### Step 2: Scope the trigger

Add to the `push:` block:

```yaml
branches: ['main']
```

(keep `paths` and `tags-ignore`). `workflow_dispatch` stays available for
manual runs on main.

**Verify**: read the file top-to-bottom; the job still has
`if: ${{ github.ref_type == 'branch' }}`.

### Step 3: Scope the auto-commit

Replace `git add -A` with an explicit allowlist + a guard that fails the
job if anything outside it got staged:

```bash
git add assets/images/ data/product_data.json astro-poc/src/data/ astro-poc/public/ || true
if git diff --cached --quiet; then
  echo "No image changes detected. Skipping commit."
  exit 0
fi
OUTSIDE=$(git diff --cached --name-only | grep -Ev '^(assets/images/|data/product_data\.json|astro-poc/src/data/|astro-poc/public/)' || true)
if [ -n "$OUTSIDE" ]; then
  echo "::error::Staged files outside the image pipeline allowlist:"
  echo "$OUTSIDE"
  exit 1
fi
```

Keep the existing commit message and rebase/push lines. (Prefix set copied
from what preflight actually rewrites: image assets + catalog mirrors; adjust
only if Step 1's local run shows outputs elsewhere — report if so.)

**Verify**: `git diff .github/workflows/images.yml` review — no `git add -A`
remains.

### Step 4: Update RUNBOOK line 211

Change `images:generate` to the actual step list
(`images:avif`, `images:gap-fill`, `images:rewrite`, `lint:images`) and add
"only on `main`" to the trigger description.

**Verify**: `grep -n "images:generate" docs/ .github/` → no matches.

### Step 5: Contract test — every workflow script exists

Create `test/images-workflow.contract.test.js` (name it
`test/workflows-scripts.contract.test.js` if you prefer — it covers all
workflows): read every `.github/workflows/*.yml`, extract
`npm run <name>` occurrences (regex `npm run ([a-zA-Z0-9:_-]+)`), and assert
each name exists in root `package.json` `scripts` (allow the documented
`--` argument suffix by matching only the script token). Fail with the
workflow filename + script name. This test is what would have caught the
2026-09-14 removal.

**Verify**: `npx vitest run test/images-workflow.contract.test.js` → pass;
temporarily reintroduce `images:generate` in a scratch copy to confirm the
test fails (do not commit the scratch change).

### Step 6: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

- New workflow-script contract test (covers all 16 workflows).
- No behavioral tests for the YAML itself beyond text assertions
  (pattern: `test/static-deploy-workflow.test.js`).
- The local Step-1 run doubles as the empirical check that the chosen
  scripts are the right ones.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "images:generate" .github/ docs/` returns nothing
- [ ] `grep -n "git add -A" .github/workflows/images.yml` returns nothing
- [ ] `grep -n "branches:" .github/workflows/images.yml` matches (`main`)
- [ ] `npx vitest run test/images-workflow.contract.test.js` exits 0
- [ ] `npm test` exits 0, `npm run lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `images:avif` or `images:gap-fill` fails or produces churn on an
  otherwise-clean checkout (the replacement choice would be wrong).
- The scripts write outputs outside `assets/images/`, `data/`,
  `astro-poc/src/data/`, `astro-poc/public/` (report the actual set).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- This workflow now runs only on `main`; re-introducing branch runs must be
  a deliberate decision with the allowlist guard kept.
- The contract test lives in the standard root suite — new workflows with
  `npm run` calls are covered automatically.
- **Deferred:** pruning dead variant widths (plan 235) changes what this
  workflow should commit; if 235 lands first, this workflow's output will
  shrink accordingly — no conflict.
