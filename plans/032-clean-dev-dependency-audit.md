# Plan 032: Remove dead LHCI tooling and clear actionable dev audit findings

> **Executor instructions**: Do not run `npm audit fix --force`. Make intentional manifest changes, inspect lock diffs and update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- package.json package-lock.json .lighthouserc.json tools/lighthouse-audit.mjs`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

Production dependencies audit clean, but the full tree reports 28 dev vulnerabilities including two high. `@lhci/cli` has no consumer and brings vulnerable `tmp`/`uuid` paths; direct Lighthouse resolves a vulnerable `ws@7.5.10`. Removing dead tooling and updating compatible transitives reduces local/CI supply-chain exposure and audit noise.

## Current state

- `package.json` declares `@lhci/cli@^0.15.1`, while `tools/lighthouse-audit.mjs` imports `lighthouse` directly.
- `.lighthouserc.json` is unused by package scripts/workflows.
- At planning time `npm audit` reports 28 total (2 high), while `npm audit --omit=dev` reports zero.
- `npm ls` attributes vulnerable `tmp`/`uuid` to LHCI and `ws@7.5.10` to direct `lighthouse@13.4.0`.

## Commands you will need

| Purpose       | Command                                         | Expected                                                       |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Tree          | `npm ls @lhci/cli lighthouse ws tmp --all`      | no invalid tree                                                |
| Audit         | `npm audit --audit-level=high`                  | no high vulnerabilities, or documented upstream-only exception |
| Runtime audit | `npm audit --omit=dev --audit-level=high`       | 0 vulnerabilities                                              |
| Gate          | `npm run lint && npm run typecheck && npm test` | exit 0                                                         |

## Scope

**In scope**: root manifest/lock, delete `.lighthouserc.json`, update `tools/lighthouse-audit.mjs` only if required by a compatible Lighthouse upgrade.

**Out of scope**: `npm audit fix --force`, unrelated dependency upgrades, changing Lighthouse thresholds, production dependencies.

## Git workflow

- Branch: `advisor/032-clean-dev-audit`
- Commit: `chore(deps): remove unused lhci tooling`

## Steps

### Step 1: Prove and remove LHCI

Run `rg -n '@lhci|lhci|lighthouserc' --glob '!package-lock.json' .`. If no active consumer appears, remove `@lhci/cli` and `.lighthouserc.json` using npm so lockfiles update deterministically.

**Verify**: `npm ls @lhci/cli` reports empty/not installed and the standard tests pass.

### Step 2: Resolve the direct Lighthouse `ws` advisory

Prefer a compatible Lighthouse patch/minor that resolves corrected `ws`; otherwise use a narrowly documented root override only if `npm ls` proves a single compatible resolution and Lighthouse smoke passes. Do not downgrade Lighthouse or force an unrelated major.

**Verify**: `npm ls lighthouse ws --all`; run `npm run lighthouse:audit` only with the supported local prerequisites described by the tool, and confirm it produces valid reports.

### Step 3: Audit and baseline

Run both audit commands and the baseline. Record remaining moderate/low advisories with owner/upstream package; do not broaden this plan to every dev advisory.

## Test plan

Dependency removal is verified through manifest search, `npm ls`, audits, existing tests and one Lighthouse execution.

## Done criteria

- [ ] No active LHCI config/dependency remains.
- [ ] No high-severity npm advisory remains, or a precise unfixable upstream exception is documented.
- [ ] Production audit stays at zero.
- [ ] Lighthouse and baseline gates pass.

## STOP conditions

- Search finds an active LHCI workflow not identified in this plan.
- Clearing `ws` requires a breaking Lighthouse downgrade/major without migration guidance.
- Lockfile changes include unrelated major upgrades.

## Maintenance notes

Keep `tools/lighthouse-audit.mjs` as the single Lighthouse entrypoint. Revisit remaining dev advisories during normal dependency maintenance.
