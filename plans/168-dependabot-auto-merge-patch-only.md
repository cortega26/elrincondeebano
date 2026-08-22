# Plan 168: Auto-merge Dependabot patch PRs only when CI is green

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4b227e12..HEAD -- .github/dependabot.yml .github/workflows/ci.yml .github/workflows/dependency-review.yml .github/workflows/dependabot-auto-merge.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `4b227e12`, 2026-08-22

## Why this matters

Dependabot opens 1–2 grouped PRs/week (`npm-patch-minor`, `actions-patch-minor`, majors separate) but every PR today requires a manual merge even when the full CI (`verify` → lint+typecheck+unit+build+e2e+lighthouse) is green. Auto-merging only `patch` updates (lowest blast radius) removes toil while keeping `minor`/`major` manual for human review; the existing `dependency-review.yml` (`fail-on: high`) and `npm audit` gates still block vulnerable patches.

## Current state

- **`.github/dependabot.yml`** — three ecosystems (`npm` `/`, `npm` `/astro-poc`, `github-actions` `/`), each grouped as `*-patch-minor` (patch+minor together) + `*-major`. Excerpt `3-26`:

  ```yaml
  groups:
    npm-patch-minor:
      patterns: ['*']
      update-types: ['patch', 'minor']
    npm-major:
      patterns: ['*']
      update-types: ['major']
  ignore:
    - dependency-name: 'typescript'
      update-types: ['version-update:semver-major']
  ```

  Same shape for `astro-npm-*` and `actions-*`. No `dependabot-auto-merge.yml` exists.

- **`.github/workflows/ci.yml`** — aggregation job `verify` (line 212) waits for `lint-and-typecheck`, `unit-tests`, `static-checks`, `build-and-check`, `e2e-tests`, `lighthouse` and exits 1 if any fails. `pull_request` on `main` is a trigger (line 7). Required checks for protection should be `CI Verification Summary`, `TypeScript Content Manager` (`admin.yml`), `Dependency review`.

- **`.github/workflows/dependency-review.yml`** — runs on `pull_request` paths `package*.json`, `fail-on-severity: high` (line 32).

- **Branch protection** — `gh api repos/cortega26/elrincondeebano/branches/main/protection` → `404 Branch not protected`. `Settings → General → Allow auto-merge` is not verified — must be ON for `gh pr merge --auto` to work.

- **Repo conventions** — workflows pin actions by SHA (`actions/checkout@3d3c42e...`), use `permissions: contents: read`, use `concurrency` `cancel-in-progress`. Commit style is Conventional Commits: e.g. `chore(ci): bump changesets/action from 1.9.0 to 2.0.0` (see `git log --oneline -5`). Match it.

- **Risk note from audit** — `data/sync-config.json` hardening (plan 139) and SSE cap already land; auto-merge must not bypass `verify`.

## Commands you will need

| Purpose       | Command                                                                                                                                                            | Provenance | Expected on success                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------- |
| Lint workflow | `npx --yes actionlint .github/workflows/dependabot-auto-merge.yml` or `yamllint` if available; fallback `node --check` not applicable — instead `cat` + `git diff` | declared   | exit 0 or file passes `actionlint` |
| Typecheck     | `npm run typecheck`                                                                                                                                                | declared   | exit 0, 0 errors                   |
| Tests         | `npm run admin:test`                                                                                                                                               | declared   | all pass (75 files)                |
| Lint          | `npm run lint`                                                                                                                                                     | declared   | exit 0 (0 errors)                  |
| Guard         | `node tools/check-plan-archive.mjs`                                                                                                                                | declared   | OK                                 |
| Drift         | `git diff --stat 4b227e12..HEAD -- .github/dependabot.yml .github/workflows/dependabot-auto-merge.yml`                                                             | executed   | empty or only planned changes      |

**Provenance**: `declared` rows were read from `package.json`/`ci.yml`/`.github/workflows/*` but not executed in this tree (advisor forbidden to install). `executed` would require local run — none done.

## Scope

**In scope** (the only files you should modify):

- `.github/workflows/dependabot-auto-merge.yml` (create)
- `.github/dependabot.yml` (split groups — see Step 1)

**Out of scope** (do NOT touch):

- `.github/workflows/ci.yml`, `dependency-review.yml`, `admin.yml`, `security-audit.yml` — CI gates are consumed, not changed.
- Branch protection itself — it is a GitHub Settings change (manual or `gh api` with admin token), not a repo file; document it as a manual step, do not try to `git commit` it.
- Any `package.json`/`package-lock.json` — Dependabot owns them.
- `plans/README.md` status row — unless dispatched with “reviewer maintains index” override, update it only for this plan’s row.

## Git workflow

- Branch: `advisor/168-dependabot-auto-merge-patch-only`
- Commit style: Conventional Commits matching `git log --oneline`: `chore(ci): ...` for workflow/dependabot changes. Example: `chore(ci): auto-merge Dependabot patch PRs when CI is green`
- Commits: one for workflow + dependabot split (can be one commit), one for docs if needed. Do NOT push or open PR unless operator instructed.

## Steps

### Step 0: Establish a green baseline

On an unmodified checkout, confirm the toolchain is reachable:

```bash
git diff --stat 4b227e12..HEAD -- .github/dependabot.yml .github/workflows/dependabot-auto-merge.yml
# expected: empty (no drift)
cat .github/dependabot.yml | head -30
cat .github/workflows/ci.yml | grep -A2 "^  verify:"
node tools/check-plan-archive.mjs
```

**Verify**: drift empty, `check-plan-archive` → `OK`.

### Step 1: Split dependabot groups into patch vs minor

Goal: allow auto-merge to target _patch only_ without also auto-merging `minor` that is bundled in the current `*-patch-minor` groups.

In `.github/dependabot.yml`, for each of the three ecosystems (`npm` `/`, `npm` `/astro-poc`, `github-actions` `/`), replace the single `*-patch-minor` group with two groups:

```yaml
groups:
  npm-patch:
    patterns: ['*']
    update-types: ['patch']
  npm-minor:
    patterns: ['*']
    update-types: ['minor']
  npm-major:
    patterns: ['*']
    update-types: ['major']
```

Apply same split for `astro-npm-patch` / `astro-npm-minor` and `actions-patch` / `actions-minor`. Keep `ignore` for `typescript` major, keep `labels`, `commit-message.prefix`, `schedule`, `cooldown`, `open-pull-requests-limit` unchanged. Preserve YAML indentation (2 spaces).

**Verify**: `cat .github/dependabot.yml` shows six patch groups + three major groups total (3 ecosystems × 3 groups), `grep -c "update-types.*patch" .github/dependabot.yml` → 3, `grep -c "update-types.*minor" .github/dependabot.yml` → 3.

### Step 2: Add `.github/workflows/dependabot-auto-merge.yml`

Create the workflow below verbatim (pins match repo convention — `dependabot/fetch-metadata@v2` uses SHA, checkout uses pinned SHA from `ci.yml`):

```yaml
name: Dependabot auto-merge (patch only)

on:
  pull_request:
    branches: ['main']

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  auto-merge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
          fetch-depth: 0

      - name: Fetch Dependabot metadata
        id: meta
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      # Only patch — minor/major stay manual per plan 168 recommendation
      - name: Enable auto-merge for patch PRs
        if: steps.meta.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notes for executor:

- The `if: github.actor == 'dependabot[bot]'` gate ensures humans are not auto-merged.
- `gh pr merge --auto` waits for required checks (`verify`, `Dependency review`, `TypeScript Content Manager`) — it does not merge “on arrival” before CI is green. This is intentional.
- For grouped patch PRs, `fetch-metadata` sets `update-type` to `version-update:semver-patch` only when the group is patch-only (after Step 1 split). A grouped PR with mixed types will not match and stays manual — correct.
- Do not add `auto-approve` — `GITHUB_TOKEN` can approve and merge without extra step for Dependabot when branch protection allows it; if your org requires approval, add `hmarr/auto-approve-action@v4` before the merge step and note it in commit message.

**Verify**: `ls .github/workflows/dependabot-auto-merge.yml` exists, `cat` matches above, `npx --yes actionlint .github/workflows/dependabot-auto-merge.yml` → no errors (or `yamllint` passes), `git diff --name-only HEAD` lists only the two in-scope files.

### Step 3: Document the manual branch-protection step

This cannot be committed — it is a Settings change. In the commit message body or as a `//` comment at the top of the workflow (already not needed), add a short note, and ensure the plan’s `Maintenance notes` below are satisfied. For the PR description (if you open one), include:

```
Manual step after merge (admin):
- Settings → General → Allow auto-merge → ON
- Settings → Branches → Add rule `main` → Require status checks:
  CI Verification Summary, TypeScript Content Manager, Dependency review
  → Require branches be up to date → Save
- Verify: open a test Dependabot patch PR → `auto-merge` job enables auto-merge → PR merges after checks pass.
```

No file edit required for this step — the workflow itself is the artifact. The branch-protection rule is out of scope for `git diff`.

**Verify**: `git diff --name-only HEAD` still only shows the two in-scope files; no other workflow was edited.

## Test plan

- No new unit tests — this is a CI/workflow change.
- Manual verification (local, no GitHub required):
  - `node tools/check-plan-archive.mjs` → OK
  - `npx --yes actionlint .github/workflows/dependabot-auto-merge.yml` → no errors (or `yamllint` passes)
  - `git diff --name-only HEAD` → only `.github/dependabot.yml` and `.github/workflows/dependabot-auto-merge.yml`
  - Dry-run logic: `grep -q "version-update:semver-patch" .github/workflows/dependabot-auto-merge.yml && echo ok`
  - If `gh` is available: `gh workflow view "Dependabot auto-merge (patch only)" --yaml` shows the file (optional).
- CI verification after merge (on the PR): `lint-and-typecheck`, `unit-tests`, `build-and-check`→`e2e-tests`+`lighthouse`, `verify` must be green; a Dependabot `patch` PR should show `auto-merge enabled` in the PR timeline.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git diff --name-only 4b227e12..HEAD` (or `HEAD` vs merge-base) lists only `.github/dependabot.yml` and `.github/workflows/dependabot-auto-merge.yml` (plus `plans/README.md` if you updated it)
- [ ] `.github/workflows/dependabot-auto-merge.yml` exists, contains `dependabot/fetch-metadata@v2` and `gh pr merge --auto --squash` and `if: github.actor == 'dependabot[bot]'` and `if: steps.meta.outputs.update-type == 'version-update:semver-patch'`
- [ ] `.github/dependabot.yml` contains split groups: `npm-patch`/`npm-minor`/`npm-major` and `astro-npm-patch`/`astro-npm-minor` and `actions-patch`/`actions-minor` (6 patch/minor groups total), no remaining `*-patch-minor`
- [ ] `node tools/check-plan-archive.mjs` → OK
- [ ] `npx --yes actionlint .github/workflows/dependabot-auto-merge.yml` → no errors (or workflow is valid YAML per `yamllint`)
- [ ] `grep -rn "dependabot.*auto-merge\|auto-merge.*dependabot" .github/` returns the new workflow

## STOP conditions

Stop and report back (do not improvise) if:

- The live `.github/dependabot.yml` does not match the excerpt in “Current state” (drift — groups already split or renamed).
- `actionlint`/`yamllint` is unavailable and the workflow YAML cannot be validated — report rather than pushing an unparsable workflow.
- Branch protection is already enabled and lists different required checks than `CI Verification Summary` / `TypeScript Content Manager` / `Dependency review` — the required-checks list must accommodate the real CI names from `ci.yml`/`admin.yml`/`dependency-review.yml`.
- The `dependabot/fetch-metadata` action’s `update-type` for grouped patch PRs is not `version-update:semver-patch` in practice — the `patch-only` gate would then never fire for grouped PRs; report and propose switching to `contains(steps.meta.outputs.dependency-names, ',')` or per-group allow-list instead.
- Any `declared` command in the table fails on an unmodified checkout (Step 0) — baseline broken; report.

## Maintenance notes

- If the UI ever needs auto-merge for `minor` as well (e.g. `github-actions` only), change the `if` to `steps.meta.outputs.update-type == 'version-update:semver-patch' || steps.meta.outputs.update-type == 'version-update:semver-minor'` or add a second job gated on `actions-patch`/`actions-minor` labels. Keep `npm-major` manual.
- The split in `dependabot.yml` increases PR count slightly (patch vs minor separate) but matches the recommendation’s risk profile; revert to `*-patch-minor` if you later decide to auto-merge `minor` too.
- Any future workflow that adds a required check (e.g. `security-audit.yml` `npm audit`) must be added to the branch-protection rule and will automatically be waited on by `gh pr merge --auto` — no workflow change needed.
- `data/sync-config.json` hardening (plan 139) and SSE cap already land; auto-merge must not bypass `verify` — that is enforced by `gh pr merge --auto` waiting on required checks, not by this workflow.
