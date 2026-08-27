# 145 — Dev-tool reconciliation: stryker keep/drop decision + changesets 3.0

- **Source**: Auditoría 10, TEST-04 + DEP-03 · **Status**: DONE · **Priority**: P2 · **Effort**: S-M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- package.json stryker.conf.mjs .github/workflows/ .changeset/`

## Problem

Two dev-tool loose ends:

1. **Stryker is configured but dead.** `stryker.conf.mjs:8-10` mutates `astro-poc/src/scripts/storefront/**` — including `cart-view.js`, `order-submit.js`, `observability.js`, `recovery-banner.js` — which have zero tests (plan 140 fixes the money-path ones). `package.json:100-101` carries `@stryker-mutator/core` + `vitest-runner` as devDeps, but no script and no CI job invokes `stryker` (only `.stryker-tmp` exclusion paths in `quality-gates.yml:48,81`). The dependency adds supply-chain surface for a tool nobody runs.
2. **`@changesets/cli` is one major behind.** Pinned `^2.31.1`; current major is `3.0.0` (engines `^22.11 || ^24 || >=26` — compatible with the repo's Node 24). `changesets.yml` runs on every push to main. The repo's own `DEPENDENCY_POLICY.md:12-20` mandates a monthly major review; plan 113 named stryker/changesets as re-evaluation points at each toolchain major.

## Scope

**In**: `package.json` (scripts + devDeps), `stryker.conf.mjs`, `.github/workflows/quality-gates.yml` (only if the `.stryker-tmp` exclusions need adjusting), AGENTS.md (one line on the decision — the repo keeps AGENTS.md current by practice).

**Out**: `@changesets/cli` version flow behavior beyond a green bump, the changeset workflow YAML.

## Steps

1. **Stryker — decide explicitly.** After plan 140 lands (it must land first — this plan depends on it), wire mutation testing as an opt-in local script, not CI: add `"test:mutation": "stryker run"` and scope `stryker.conf.mjs` to the now-tested storefront money modules (`cart-view.js`, `order-submit.js`, `storefront-state.ts`) plus whatever plan 140 covers — a narrowed mutation scope gives a signal instead of a wall of survivors. Run it once: `npm run test:mutation` — record the killed-mutant % in the PR description as evidence. If the run shows the config needs the vitest-runner setup adjusted (the repo runs two vitest configs), fix the config, not the scope.
   - Alternative explicitly allowed: if the mutation run turns out to be noisy even narrowed, DROP the two `@stryker-mutator/*` devDeps and `stryker.conf.mjs` instead, and record that decision in AGENTS.md. Choose the option whose evidence is stronger; do not keep both "configured and dead".
2. **changesets:** file the wave-3 RFC note per `DEPENDENCY_POLICY.md` (a short comment/commit message suffices for a single-operator repo), bump `@changesets/cli` to `^3.0.0` in `package.json`, `npm ci` to refresh the lock, and verify the version-PR flow still works: `npx changeset status` (dry, read-only) or `npx changeset version --help` exit 0. Do not create a real changeset.
3. Update AGENTS.md (one line: stryker wired-or-dropped; changesets on 3.x).

## Tests

- `npm run admin:test` + root `npx vitest run` green (nothing behavioral changed).
- `npm run lint` and `npm run typecheck` green (lockfile/manifest consistent).
- Evidence: mutation run output (if kept), `npx changeset status` exit 0.

## Done criteria

- [ ] Stryker is EITHER wired (`test:mutation` script exists, one run executed with evidence) OR dropped (no `@stryker-mutator/*` in devDeps, `stryker.conf.mjs` deleted).
- [ ] `@changesets/cli` resolves to 3.x in the lockfile (`npm ls @changesets/cli`).
- [ ] AGENTS.md records the decision.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` green.

## Maintenance

The dependency policy (monthly major review) is the standing mechanism; this plan only settles the two open items. If CI gains a mutation gate later, the evidence from this plan's run is the baseline.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `@changesets/cli@3` changes the CLI surface in a way that breaks `changesets.yml`, stop and report (revert the bump; record the blocker in AGENTS.md).
- If plan 140 has not landed yet, do NOT start this plan (dependency).
