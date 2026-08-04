# Plan 070: Commit the canonical Content Manager and the migration record to git

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- package.json package-lock.json .github/workflows/admin.yml admin/content-manager plans docs/adr docs/operations`
> If any in-scope path changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: migration / tech-debt
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The TypeScript Content Manager (`admin/content-manager/`) is declared the
canonical admin application in `AGENTS.md`, `docs/operations/CUTOVER.md`, and
the plan 055 directive — but **every file of it is untracked in git** (0 tracked
files). The same is true of plans 026–069, `docs/operations/CUTOVER.md`, and
`docs/adr/0008-catalog-data-authority.md`. Meanwhile the tracked
`package.json` declares `"workspaces": ["astro-poc", "admin/content-manager"]`
and the tracked-but-modified `.github/workflows/admin.yml` adds a `test-ts` CI
job with `working-directory: admin/content-manager`. Consequences today:

- A clean clone cannot run `npm ci` (missing workspace dir) — every install
  path in CI (`ci.yml`, `static.yml`, `rollback.yml`, `product-data-guard.yml`,
  `post-deploy-canary.yml`, `admin.yml`) is broken on merge.
- The `test-ts` job cannot start (directory absent from checkout).
- The entire app is one `rm -rf` or machine loss away from disappearing, with
  no history to recover from.

This plan lands the working tree's uncommitted work as a single well-formed
commit, so every subsequent plan (071–084) operates on committed code and CI
starts testing the manager it declares canonical. It deliberately does NOT fix
any bug or add any feature — it only makes the current state survive.

## Current state

Verified facts (all reproduced via `git status`, `git ls-files`, and reads):

- `git ls-files admin/content-manager | wc -l` → `0` (nothing tracked).
- `git status --porcelain --untracked-files=all admin/content-manager | wc -l`
  → `119` files that a plain `git add admin/content-manager` would add.
- `.gitignore` already excludes the artifacts inside the workspace:
  `admin/content-manager/node_modules` (line 89), `coverage/` (line 67),
  `playwright-report/` (line 95), `test-results/` (line 96), `dist/` (line 101)
  — so `git add admin/content-manager` adds source, configs, and tests only.
  Verify with `git add -n` before committing (see Step 3).
- `package.json` (tracked, modified) declares the workspace:
  ```json
  "workspaces": ["astro-poc", "admin/content-manager"]
  ```
- `package-lock.json` (tracked, modified, +1518 lines vs 30dbab7) already
  contains the `admin/content-manager` workspace entries — the lockfile was
  regenerated when the workspace was added.
- `package-lock-worktree.json` at repo root is untracked, 643 KB, and its
  `packages[""].workspaces` lists only `["astro-poc"]` — a leftover snapshot
  from before the workspace was added (mtime 2026-07-15 16:39, matching commit
  98b19f1). `npm ci` never reads it, but it must not be committed.
- Untracked migration record to include in the same commit:
  `plans/026-…069-*.md` + `plans/055-progress.md` + `plans/fixtures/`,
  `docs/operations/CUTOVER.md`, `docs/adr/0008-catalog-data-authority.md`,
  `docs/archive/streamlit-retirement-notice.md`, `data/archive/` (review
  contents first — if `data/archive/` holds catalog snapshots, keep it).
- Other untracked/modified files at the root of this commit decision:
  `admin/product_manager/` (4 modified files — in scope ONLY if you keep them
  out of this commit; see Scope), `astro-poc/public/data/product_data.json`,
  `astro-poc/src/data/products.json` (catalog data — decide per Step 2).
- Repo conventions: conventional commits (`feat:`, `fix:`, `chore(scope):`
  — see `git log --oneline -5`); pre-commit hook runs `npx lint-staged` on
  staged files (never use `--no-verify`).

## Commands you will need

| Purpose             | Command                                                                      | Expected on success                                |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Show what would add | `git add -n admin/content-manager`                                           | 119 file paths, none in node_modules/coverage/dist |
| Show all untracked  | `git status --porcelain`                                                     | listed files                                       |
| Secret scan         | `npm run security:secret-scan`                                               | exit 0, no findings                                |
| Clean-clone install | `git stash` + `git clone <url> /tmp/cm-check` + `cd /tmp/cm-check && npm ci` | exit 0                                             |

## Suggested executor toolkit

- The secret-scan script: `tools/guardrails/secret-scan.mjs` (run via the npm
  script above) — do not rely on grep for secrets.

## Scope

**In scope** (the only things this commit may touch):

- `admin/content-manager/` (whole directory — source, configs, tests)
- `plans/026-*.md` … `plans/069-*.md`, `plans/055-progress.md`, `plans/fixtures/`
- `docs/operations/CUTOVER.md`, `docs/adr/0008-catalog-data-authority.md`,
  `docs/archive/streamlit-retirement-notice.md`, `docs/adr/README.md`
  (the one-line ADR 0008 index entry is already modified — include it)
- `data/archive/` — only after inspecting: if it is catalog snapshots, keep
  and include; if it is junk/temp, leave untracked and note it in the commit
  message.
- `package.json`, `package-lock.json` (already-modified workspace wiring —
  they MUST go in this commit so `npm ci` works)
- `.github/workflows/admin.yml` (already-modified `test-ts` job — include so
  the job and its directory land atomically; the job may be red at first,
  see Step 6 for the explicit note this plan requires)

**Out of scope** (do NOT stage, even though they look related):

- `package-lock-worktree.json` — stray artifact; delete it from disk with
  `rm package-lock-worktree.json` (do not commit it).
- `admin/product_manager/*` modified files — the Python fallback's in-flight
  work belongs to its own commit; leave unstaged.
- `astro-poc/public/data/product_data.json`, `astro-poc/src/data/products.json`
  — catalog data updates have their own commit cadence ("catálogo: actualización
  del catálogo" style); leave unstaged unless Step 2 says otherwise.
- Fixing any bug found while scanning — note it in the commit message or a
  comment, do not fix in this commit.

## Git workflow

- Branch: `advisor/070-commit-canonical-content-manager` from `main`.
- ONE commit with message:
  `feat(admin): commit TypeScript content manager, migration plans, and cutover docs` (+ `Co-Authored-By: Claude <noreply@anthropic.com>`)
- Do NOT push or open a PR unless the operator instructed it.
- Pre-commit hook will run lint-staged on the staged files — if it fails on
  a content-manager file, STOP and report (the `.tsx` files are known to be
  outside the lint config; a failure means lint-staged matched something else).

## Steps

### Step 1: Survey what would be added

```bash
git add -n admin/content-manager
git status --porcelain --untracked-files=all | wc -l
```

**Verify**: the `-n` output lists 119 paths; none contains `node_modules/`,
`coverage/`, `dist/`, `playwright-report/`, or `test-results/`. If any of
those appears, STOP — the `.gitignore` changed; do not add them.

### Step 2: Inspect `data/archive/` and decide on the data files

```bash
find data/archive -type f | head -20
```

- If it holds catalog snapshots/JSON: keep and include.
- If it holds temp/junk: leave untracked, and mention it in the commit body.

Then decide `astro-poc/src/data/products.json` + `astro-poc/public/data/product_data.json`
(modified): if `git diff --stat` shows the expected catalog-content change
(product count/fields, not structure), leave them out — catalog data updates
ship separately. **Verify**: `git status` still shows them as ` M` after your
commit.

### Step 3: Secret scan before staging

```bash
npm run security:secret-scan
```

**Verify**: exit 0, no findings. If the scanner flags anything in
`admin/content-manager/`, STOP and report the `file:line` + credential type —
never commit, never reproduce the value.

### Step 4: Delete the stray lockfile

```bash
rm package-lock-worktree.json
```

**Verify**: `ls package-lock-worktree.json` → "No such file".

### Step 5: Stage and commit

```bash
git checkout -b advisor/070-commit-canonical-content-manager
git add admin/content-manager plans docs/operations/CUTOVER.md docs/adr/0008-catalog-data-authority.md docs/archive/streamlit-retirement-notice.md docs/adr/README.md package.json package-lock.json .github/workflows/admin.yml
git status --short
git commit -m "feat(admin): commit TypeScript content manager, migration plans, and cutover docs

The TypeScript Content Manager (admin/content-manager/) was declared canonical
in AGENTS.md and the cutover plan but never committed; its workspace entry in
package.json made npm ci fail from a clean clone, and the admin.yml test-ts
job pointed at a directory absent from the checkout.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Verify**: `git status --short` after the commit shows ONLY the out-of-scope
files still modified (Python fallback, catalog data). If any unexpected file
was swept in, `git reset` it out before committing.

### Step 6: Clean-clone install check

```bash
git clone /home/carlos/VS_Code_Projects/products/el-rincon-de-ebano /tmp/cm-clean-check
cd /tmp/cm-clean-check && npm ci && npm run admin:typecheck && npm run admin:test
```

**Verify**: `npm ci` exit 0 (this is the step that was broken before);
`admin:typecheck` exit 0; `admin:test` exit 0. If `npm ci` fails, STOP and
report the error. (Running the full `admin:validate` is optional; coverage
and e2e are known-flaky — see plan 076 and 082.)

Note: the `test-ts` CI job may be red on first push because of the flaky
coverage step and the e2e build; that is expected and tracked by plans
076/082 — do not weaken the job in this plan.

### Step 7: Update the plan index

Append your status to `plans/README.md`: add a row `070 | ... | P0 | M | — |
DONE` under the Auditoría 7 table (create the section if missing), and
record the commit SHA.

**Verify**: `grep -n "070" plans/README.md` shows the row.

## Test plan

No code changes are made by this plan; the test plan is the clean-clone
verification in Step 6 plus:

- `npm run admin:test` from the clean clone (289 tests, 40 files) — all pass.
- `git ls-files admin/content-manager | wc -l` → greater than 0 (119 files).

## Done criteria

- [ ] `git ls-files admin/content-manager | wc -l` > 0
- [ ] `git ls-files plans | grep -c "056-"` > 0 (plans 056–069 tracked)
- [ ] `package-lock-worktree.json` deleted and absent from `git status`
- [ ] Clean clone at `/tmp/cm-clean-check` passes `npm ci`, `npm run admin:typecheck`, `npm run admin:test`
- [ ] `npm run security:secret-scan` exit 0
- [ ] No out-of-scope files in the commit (`git show --stat HEAD` reviewed)
- [ ] `plans/README.md` row 070 updated
- [ ] Commit message follows conventional commits and includes the
      `Co-Authored-By` trailer

## STOP conditions

Stop and report back (do not improvise) if:

- The secret scan flags anything — report, never commit.
- `git add -n admin/content-manager` lists any ignored artifact
  (node_modules/coverage/dist/test-results/playwright-report).
- `npm ci` fails on the clean clone for any reason other than a missing
  network.
- The pre-commit lint-staged hook fails on a content-manager file.
- `data/archive/` content is ambiguous (neither obvious snapshots nor junk).

## Maintenance notes

- After this lands, the working tree still holds uncommitted Python fallback
  changes and catalog data updates — the next person must commit those on
  their own cadence; do not let them linger (they predate this commit).
- The `test-ts` job becoming green is owned by plans 076 (backup ID flake)
  and 082 (coverage step, audit, Streamlit job).
- Future audits should no longer need to re-flag "uncommitted canonical app" —
  if the directory is ever untracked again, that is itself a regression worth
  a guard: consider a CI job `git ls-files admin/content-manager | grep -q .`.
