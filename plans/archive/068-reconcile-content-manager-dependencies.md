# Plan 068: Reconcile the Content Manager dependency and lockfile contract

> **Executor instructions**: Make a narrow dependency-only change from a clean install
> model. Do not upgrade unrelated packages or accept broad lockfile churn. Preserve Node
> 24 and TypeScript 7 requirements.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/package.json package.json package-lock.json package-lock-worktree.json`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 056
- **Category**: dependencies / dx
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F20

## Why this matters

The workspace lock entry still declares `fastify-tsconfig` although the package manifest
does not, and both `@playwright/test` and direct `playwright` are declared without an
identified direct runtime import. Deterministic installs should reflect one reviewed
manifest and lock graph before the manager becomes canonical.

## Current state

- `admin/content-manager/package.json` declares Fastify, React, Zod, TS7/Vite/Vitest,
  `@playwright/test`, and direct `playwright`, but not `fastify-tsconfig`.
- `package-lock.json:69` still records `fastify-tsconfig` in the workspace package.
- Audit found no direct source imports requiring a separately declared `playwright`;
  `@playwright/test` already brings the matching runtime.
- `npm audit --omit=dev` reports zero production vulnerabilities; no security-driven
  framework upgrade belongs in this plan.
- `package-lock.json` and manifests are already locally modified; preserve unrelated
  user changes and review only the workspace-specific delta.

## Commands you will need

| Purpose               | Command                                                                | Expected on success              |
| --------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| Inventory             | `npm ls -w admin/content-manager --depth=0`                            | no extraneous/missing deps       |
| Deterministic install | `npm ci`                                                               | exit 0                           |
| Audit                 | `npm audit --omit=dev`                                                 | no high/critical vulnerabilities |
| Manager               | `npm run admin:typecheck && npm run admin:test && npm run admin:build` | exit 0                           |
| Regression            | `npm run validate`                                                     | exit 0                           |

## Scope

**In scope**:

- `admin/content-manager/package.json`
- root `package-lock.json`
- root manifest only if workspace scripts/constraints require alignment
- dependency validation documentation/tests if already present

**Out of scope**:

- Broad upgrades, package-manager migration, root TypeScript convergence, or formatter
  churn.
- Editing `package-lock-worktree.json` unless repository policy identifies it as active.
- Suppressing audit findings instead of resolving them.

## Git workflow

- Branch: `chore/068-admin-dependency-contract`
- Commit: `chore(admin): reconcile workspace dependencies`.

## Steps

### Step 1: Prove direct dependency use

Use import inventory and package scripts to decide whether `fastify-tsconfig` and direct
`playwright` are required. Record the reason in the manifest/plan result; do not retain
packages merely because they appear in the old lockfile.

**Verify**: `rg` import checks and `npm ls` agree with the chosen direct dependency set.

### Step 2: Align manifest and lock narrowly

Update the workspace manifest, regenerate the root lock with the repository's npm/Node
versions, and inspect the diff. The workspace entry must exactly match the manifest and
no unrelated major/minor versions should change.

**Verify**: `npm ci` succeeds from the resulting lock; `npm ls -w admin/content-manager
--depth=0` reports neither extraneous nor missing dependencies.

### Step 3: Run complete validation

Run manager gates, production audit, and root validation. Confirm Playwright browsers/
tests still resolve through the accepted package declaration.

**Verify**: all commands in the table exit 0; lockfile diff is limited to the intentional
dependency decisions.

## Test plan

- No new application tests are required unless removing a package exposes an implicit
  import. The deterministic install and complete build/test suite are the regression gate.
- Run E2E once if direct `playwright` is removed.

## Done criteria

- [ ] Workspace manifest and lock entry match exactly.
- [ ] No extraneous/missing direct dependencies.
- [ ] Redundant packages are removed or explicitly justified.
- [ ] Lockfile contains no unrelated resolution churn.
- [ ] `npm ci`, audit, admin gates, E2E, and root validation pass.

## STOP conditions

- Clean lock regeneration changes unrelated workspace versions materially.
- A package appears unused by imports but is required by undocumented tool loading.
- The dirty lockfile contains overlapping user changes that cannot be separated safely.
- Audit discovers a high/critical issue requiring a broader migration plan.

## Maintenance notes

Review workspace manifest/lock consistency in CI. Keep direct dependencies limited to
packages imported or intentionally invoked by that workspace.
