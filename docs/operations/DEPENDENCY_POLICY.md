# Dependency Update Policy

## Scope

This policy covers:

1. Node.js dependencies (`package.json` and `package-lock.json`)
2. Python admin tooling dependencies (`admin/product_manager/requirements.txt`)
3. GitHub Actions dependencies (`.github/workflows/*.yml`)

## Update cadence

1. Weekly automated checks via Dependabot.
2. Monthly manual review for transitive vulnerabilities and stale majors.
3. Immediate hotfix cycle for high/critical vulnerabilities with reachable exploit paths.

## Safe rollout model (waves)

1. Wave 1: patch updates only.
2. Wave 2: minor updates with isolated scope.
3. Wave 3: major updates only with RFC + migration plan + rollback steps.

Do not mix major upgrades with unrelated feature work.

## Verification gates per wave

For Node changes:

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. `npm run test:e2e` (smoke subset is acceptable when full run is expensive)

For Python admin changes:

1. `python -m pytest` in `admin/product_manager`
2. `pip-audit` result attached when dependency graph changes

For workflow changes:

1. Validate YAML and workflow triggers
2. Re-run CI-required checks on PR branch

## Security triage rules

1. Prioritize vulnerabilities in production dependencies (`npm audit --omit=dev`).
2. Dev-only vulnerabilities are still tracked, but can be scheduled if exploitability is low.
3. No blanket suppression without written justification in the PR.

## Pinning and reproducibility

1. Keep `package-lock.json` in sync for every Node dependency change.
2. Use `npm ci` in CI and local reproducibility checks.
3. Keep Dependabot PRs small and grouped by severity/risk level.

## PR structure

1. `PR-A`: patch/minor dependency batch (Node or Python, not both when avoidable)
2. `PR-B`: security remediations if not covered by `PR-A`
3. `PR-C`: majors (one ecosystem at a time, RFC-backed)

Target size: <= 400 net lines excluding lockfile churn.

## Rollback

1. Revert dependency commit (`git revert <sha>`) if regression appears.
2. Re-run baseline gates (`lint`, `test`, `build`, `e2e smoke`) after revert.
3. Document incident and add regression test before re-attempting upgrade.
