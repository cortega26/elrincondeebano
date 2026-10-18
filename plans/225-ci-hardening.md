# Plan 225: CI hardening — SHA-pin the auto-merge action, env-pass dispatch inputs, provenance-gate the Dependabot auto-commit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- .github/workflows/dependabot-auto-merge.yml .github/workflows/post-deploy-canary.yml .github/workflows/rollback.yml .github/workflows/product-data-guard.yml test/post-deploy-workflow.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Three CI supply-chain/provenance gaps:

1. `dependabot/fetch-metadata@v3` is the **only** floating action reference
   in the repo — every other action is commit-SHA pinned with a `# vX.Y.Z`
   comment. It runs in the only job with `contents: write` +
   `pull-requests: write` and calls `gh pr merge --auto`.
2. `workflow_dispatch` inputs are interpolated **inline into bash**
   (`post-deploy-canary.yml:87-91`, `rollback.yml:52`). Inputs are
   text-substituted before bash parses the script, so a quote in an input
   can break out of the assignment on runners holding an OIDC token and
   Pages deploy rights. Only maintainers can dispatch — this is
   defense-in-depth, not an open hole.
3. `product-data-guard.yml:99` gates its write job on
   `github.actor == 'dependabot[bot]'` — the actor identifies the trigger,
   not the diff's provenance. The gate should mean what it says.

## Current state

`.github/workflows/dependabot-auto-merge.yml:27-31`:

```yaml
- name: Fetch Dependabot metadata
  id: meta
  uses: dependabot/fetch-metadata@v3
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

`.github/workflows/post-deploy-canary.yml:84-95`:

```yaml
run: |
  if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
    BASE_URL="${{ inputs.base_url }}"
    CATEGORY_PATH="${{ inputs.category_path }}"
    TIMEOUT_MS="${{ inputs.timeout_ms }}"
    DEPLOY_SHA="${{ inputs.deploy_sha }}"
  ...
```

`.github/workflows/rollback.yml:49-53`:

```yaml
- name: Resolve rollback metadata
  shell: bash
  run: |
    echo "ROLLBACK_REF=${{ inputs.rollback_ref }}" >> "$GITHUB_ENV"
```

`.github/workflows/product-data-guard.yml:96-103`:

```yaml
  auto-commit-synced-files-for-dependabot:
    ...
    if: ${{ always() && needs.ensure-build-in-sync.outputs.dirty_tree == 'true' && github.actor == 'dependabot[bot]' }}
```

Workflow text tests live in `test/post-deploy-workflow.test.js`,
`test/live-contract-workflow.test.js`, `test/static-deploy-workflow.test.js`.

## Commands you will need

| Purpose    | Command                                                                                 | Provenance | Expected on success |
| ---------- | --------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `npm ci`                                                                                | declared   | exit 0              |
| Tests      | `npx vitest run test/post-deploy-workflow.test.js` (and any new/updated workflow tests) | declared   | all pass            |
| Full tests | `npm test`                                                                              | declared   | all pass            |
| Lint       | `npm run lint`                                                                          | declared   | exit 0              |

## Scope

**In scope**:

- `.github/workflows/dependabot-auto-merge.yml`
- `.github/workflows/post-deploy-canary.yml`
- `.github/workflows/rollback.yml`
- `.github/workflows/product-data-guard.yml`
- `test/post-deploy-workflow.test.js` and, if you add assertions for other
  workflows, extend the matching existing workflow test file (do not create
  a new suite unless none fits).

**Out of scope**:

- Other workflows' pins/inputs (plan 238 covers setup-node unification and
  the remaining hygiene set).
- The canary's behavior itself (timeouts, probes).

## Git workflow

- Branch: `advisor/225-ci-hardening`
- Commits: `security(ci): pin fetch-metadata and env-pass dispatch inputs (plan 225)`.

## Steps

### Step 0: Establish a green baseline

Install + `npx vitest run test/post-deploy-workflow.test.js` on the
unmodified checkout. Fails → STOP.

### Step 1: SHA-pin `dependabot/fetch-metadata`

Resolve the current v3 release commit:

```bash
gh api repos/dependabot/fetch-metadata/releases/latest --jq '.tag_name'   # expect v3.x.y
gh api repos/dependabot/fetch-metadata/git/ref/tags/<v3.x.y> --jq '.object.sha'
# if the tag is annotated, dereference once more:
gh api repos/dependabot/fetch-metadata/git/tags/<sha> --jq '.object.sha'
```

Replace `@v3` with the 40-char SHA plus a `# v3.x.y` comment, matching the
existing pin style. If `gh` is unavailable/offline, STOP and report (do not
guess a SHA).

**Verify**: `grep -n "dependabot/fetch-metadata@" .github/workflows/dependabot-auto-merge.yml`
shows a 40-hex SHA with a version comment.

### Step 2: Move dispatch inputs into `env:` (canary + rollback)

`post-deploy-canary.yml` (Resolve canary metadata step): add an `env:` block
(`BASE_URL: ${{ inputs.base_url }}`, `CATEGORY_PATH`, `TIMEOUT_MS`,
`DEPLOY_SHA`) and change the script body to assign from the environment
variables (`BASE_URL="$BASE_URL"` becomes unnecessary — reference
`"$BASE_URL"` directly or copy to locals with no interpolation). Keep the
`workflow_run` branch (`github.event_name` comparison stays as it is; it
does not interpolate untrusted text).

`rollback.yml` (Resolve rollback metadata + the rollback checkout): add
`env: ROLLBACK_REF: ${{ inputs.rollback_ref }}`, and in the script validate
before use:

```bash
if ! [[ "$ROLLBACK_REF" =~ ^[A-Za-z0-9._/-]{1,128}$ ]]; then
  echo "::error::rollback_ref has an unexpected format"; exit 1
fi
echo "ROLLBACK_REF=$ROLLBACK_REF" >> "$GITHUB_ENV"
```

(The same validation applies to `deploy_sha` in the canary if it is used in
a shell context; add it with the same regex.)

**Verify**: `grep -n '\${{ inputs\.' .github/workflows/post-deploy-canary.yml .github/workflows/rollback.yml`
— remaining matches must be only inside `env:` blocks.

### Step 3: Provenance-gate the Dependabot auto-commit

Read `product-data-guard.yml`'s triggers first. If the job can only run for
pull-request events, replace the condition with:

```yaml
if: ${{ always() && needs.ensure-build-in-sync.outputs.dirty_tree == 'true' && github.event.pull_request.user.login == 'dependabot[bot]' && startsWith(github.head_ref, 'dependabot/') }}
```

If it can also run on `push`, use the composite:
`(github.event_name == 'pull_request' && github.event.pull_request.user.login == 'dependabot[bot]' && startsWith(github.head_ref, 'dependabot/'))`
and keep the actor check only where no PR context exists — report what you
found and which variant you applied. Add a comment stating why (gate on diff
provenance, not trigger actor).

**Verify**: `grep -n "github.actor == 'dependabot\[bot\]'" .github/workflows/product-data-guard.yml`
→ no matches (or the documented push-only fallback, with the comment).

### Step 4: Workflow text assertions

Extend the matching workflow tests:

- `test/post-deploy-workflow.test.js`: assert no `${{ inputs.` substring
  appears inside `run:` bodies (a simple regex over the file is fine:
  the file must contain `env:` with the input mapping) and that no
  interpolation of `inputs.` remains on a line starting with spaces + a
  shell assignment.
- `test/post-deploy-workflow.test.js` or a fitting sibling: assert
  `dependabot/fetch-metadata@` is followed by a 40-hex SHA (regex).
- For `product-data-guard.yml`: assert the new provenance condition string
  is present (and the old actor-only condition is absent).

**Verify**: `npx vitest run test/post-deploy-workflow.test.js` → all pass.

### Step 5: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "fetch-metadata@v3" .github/workflows/` returns nothing
- [ ] `grep -nE "\\$\\{\\{ inputs\\.[^}]+\\}\\}\"" .github/workflows/post-deploy-canary.yml .github/workflows/rollback.yml` shows inputs only inside `env:` blocks (review)
- [ ] `grep -n "github.actor == 'dependabot\\[bot\\]'" .github/workflows/product-data-guard.yml` returns nothing (or documented push-only fallback)
- [ ] `npx vitest run test/post-deploy-workflow.test.js` exits 0 with new assertions
- [ ] `npm test` exits 0, `npm run lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `gh` cannot resolve the fetch-metadata tag SHA (offline) — do not guess.
- `product-data-guard.yml` triggers make the provenance condition
  impossible to express (report the trigger set).
- An existing workflow test asserts the current inline-interpolation text —
  update it to assert the safer form and say so in the commit.
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Dependabot keeps the SHA fresh (github-actions ecosystem) — the version
  comment is for humans.
- Reviewer: exercise the canary workflow_dispatch path mentally with a value
  containing a `"` to confirm no interpolation remains.
- **Deferred:** none.
