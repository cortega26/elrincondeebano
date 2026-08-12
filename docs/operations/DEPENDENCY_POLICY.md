# Dependency Update Policy

## Scope

This policy covers:

1. Node.js dependencies (`package.json` and `package-lock.json`)
2. GitHub Actions dependencies (`.github/workflows/*.yml`)

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

1. `node tools/guardrails/dependency-manifest-compat.mjs`
2. Review peer dependency ranges before merging major upgrades. TypeScript major bumps must stay compatible with Astro validation tooling (for example `@astrojs/check`).
3. `npm run lint`
4. `npm test`
5. `npm run build`
6. `npm run test:e2e` (smoke subset is acceptable when full run is expensive)
7. `npm run lighthouse:audit` when the dependency affects rendering, bundling,
   image processing, routing, or critical fetch behavior

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
3. Route CI installs through `tools/ci/npm-ci-with-retry.sh` so manifest compatibility is checked before the resolver runs.
4. Keep Dependabot PRs small and grouped by severity/risk level.
5. Keep `requirements.lock.txt` in sync with `requirements.txt` for admin Python tooling changes.
6. Avoid adding dependencies that duplicate capabilities already covered by the
   platform, Astro, Vitest, Playwright, or existing repo utilities unless the
   tradeoff is documented.

## Maintainability review for upgrades

1. Document why the dependency is still needed after the upgrade.
2. Note any change to build time, browser bundle shape, or operational surface.
3. Remove obsolete adapters, polyfills, or compatibility layers in the same PR
   when safe.
4. Update docs if the upgrade changes the canonical command path, runtime
   assumptions, or rollout/rollback expectations.

## PR structure

1. `PR-A`: patch/minor dependency batch (Node or Python, not both when avoidable)
2. `PR-B`: security remediations if not covered by `PR-A`
3. `PR-C`: majors (one ecosystem at a time, RFC-backed)

Target size: <= 400 net lines excluding lockfile churn.

## Rollback

1. Revert dependency commit (`git revert <sha>`) if regression appears.
2. Re-run baseline gates (`lint`, `test`, `build`, `e2e smoke`) after revert.
3. Document incident and add regression test before re-attempting upgrade.

## Decisión TypeScript (plan 113, 2026-08-12)

El repo convive con dos majors de TypeScript: root/astro-poc en `^6.0.3` y
`admin/content-manager` en `^7.0.2`. La toolchain (typescript-eslint peer
`<6.1.0`, @astrojs/check peer `^5||^6`) no soporta TS 7 todavía, así que la
alineación total está bloqueada upstream. Decisión deliberada: mantener el
skew hasta que typescript-eslint/@astrojs/check soporten TS 7; el lint de
admin parsea con la API de TS 6 (dedupe) mientras `admin:typecheck` usa su
propio `tsc` 7 — re-evaluar en cada major de la toolchain.
