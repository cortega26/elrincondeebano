# ELRINCONDEEBANO Workspace Migration Plan

## 1. Executive Framing

This document turns the repository-structure recommendation into an execution-ready roadmap. The target outcome is to formalize the current repo as an npm workspace while preserving the existing production storefront contract, directory layout, and deployment path.

The repo already behaves like an informal monorepo:

- the root package owns shared tooling, CI-facing scripts, and repo-wide validation;
- `astro-poc/` owns the Astro storefront build and framework-specific dependencies;
- the storefront consumes shared root data, assets, and utilities;
- CI and dependency automation already need to reason about both package contexts.

The current model is operationally valid but fragile. It duplicates dependency contexts, relies on package-boundary conventions that are easy to misuse, and creates preventable CI/install drift. The goal of this plan is to remove that fragility without mixing structural cleanup with public runtime changes.

## 2. Decision Summary

### Recommended target architecture

Adopt npm workspaces with the repository root as the workspace owner and `astro-poc/` as the first workspace package.

### Explicit decisions

- Keep `astro-poc/` as the active storefront directory during this roadmap.
- Keep npm as the package manager.
- Keep the production deploy artifact rooted at `astro-poc/dist/`.
- Keep the current build, route, storage, and release contracts unchanged during the migration.
- Defer directory renaming, package collapse, and broader monorepo tooling adoption to later decisions.

### Explicit non-goals

- No migration to pnpm, Turborepo, Nx, or a package-manager change.
- No flattening of the repo into a single package during this roadmap.
- No public storefront behavior changes.
- No runtime-contract, URL, storage-key, or deployment-target changes as part of workspace formalization.

## 3. Why This Path Is Correct

### Why not keep the current split-project model indefinitely

- It leaves dependency drift too easy to introduce.
- It makes install semantics more error-prone in CI and local onboarding.
- It forces scripts and workflows to remember package boundaries manually.
- It increases maintenance overhead for audit, dependency review, and troubleshooting.

### Why not collapse to a single package now

- The current repo still has a meaningful app boundary in `astro-poc/`.
- Existing tests, workflows, docs, and build outputs already assume that boundary.
- Collapsing everything at once would expand risk and reduce rollback clarity.

### Why npm workspaces is the right midpoint

- It formalizes the repo shape that already exists.
- It preserves the current directory structure and release surface.
- It reduces install ambiguity without forcing a large refactor.
- It gives a standard path for future dependency ownership cleanup.

## 4. Target End-State

The desired end-state after this roadmap is complete:

- the root `package.json` is the workspace root and declares `workspaces: ["astro-poc"]`;
- local and CI installation flow is workspace-aware from the repo root;
- root scripts use workspace-native commands instead of `npm --prefix astro-poc ...`;
- dependency automation and audit flows operate against the workspace model cleanly;
- dependency ownership between root tooling and `astro-poc` is explicit and documented;
- the canonical install path is one root-driven workflow, with lockfile strategy converged only after validation proves it safe.

The default target for lockfile strategy is a single root lockfile, but this must not be executed until the workspace install path has been validated across build, test, audit, and browser gates.

## 5. Sequencing Principles

- Preserve shipped behavior while changing package-management internals.
- Formalize workspace metadata before changing install and automation behavior.
- Keep Phase 1 small enough to be reviewed and rolled back easily.
- Treat lockfile convergence as a follow-up, not part of initial workspace adoption.
- Resolve dependency ownership only after the workspace boundary is stable.
- Separate architectural cleanup from package-boundary formalization.

## 6. Workstreams

### WS1. Workspace Foundation

Scope:

- formalize the root as an npm workspace owner;
- make `astro-poc` discoverable as a workspace package;
- establish the smallest safe structural baseline.

Primary outcome:

- the repo has an explicit, standard package topology.

### WS2. Script and Workflow Convergence

Scope:

- migrate root script calls from `--prefix` to workspace-native commands;
- update CI commands that still assume two unrelated npm projects;
- preserve current build outputs and release contract.

Primary outcome:

- local and CI execution paths speak the same package-boundary language.

### WS3. Install and Lockfile Convergence

Scope:

- define the canonical root install path after workspace adoption;
- remove the need for separate subproject install commands from docs and workflows;
- validate and then execute the chosen lockfile strategy.

Primary outcome:

- deterministic install behavior is simpler and less fragile.

### WS4. Dependency Ownership and Governance

Scope:

- clarify which dependencies belong at the root versus `astro-poc`;
- resolve TypeScript and Astro-check governance under the workspace model;
- align dependency automation, audits, and docs with the new ownership boundaries.

Primary outcome:

- dependency management becomes easier to reason about and safer to evolve.

### WS5. Optional Naming and Structure Cleanup

Scope:

- reassess whether `astro-poc` should be renamed after the workspace migration is stable;
- evaluate only low-risk follow-on cleanup that does not re-open package-boundary ambiguity.

Primary outcome:

- future cleanup can be planned from a stable baseline rather than from a fragile one.

## 7. Dependency Map

| Workstream                                 | Depends On                                      | Unlocks                                                 | Safe Parallelism                       | Should Not Run In Parallel With         | Main Regression Concern                                    |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| WS1. Workspace Foundation                  | None                                            | WS2, WS3, WS4                                           | Documentation prep only                | WS3 execution, WS4 dependency reshuffle | Invalid or partial workspace declaration breaking installs |
| WS2. Script and Workflow Convergence       | WS1                                             | Safer local/CI commands, smaller operator error surface | Parts of WS4 documentation             | WS3 lockfile convergence                | Mixing command migration with install-topology changes     |
| WS3. Install and Lockfile Convergence      | WS1, enough of WS2 to define canonical commands | Simpler onboarding and deterministic CI installs        | Docs updates after decisions are fixed | WS4 large dependency moves              | Broken install reproducibility or unclear rollback         |
| WS4. Dependency Ownership and Governance   | WS1 and preferably WS3                          | Lower dependency drift, clearer audits, easier upgrades | Docs cleanup                           | WS5 cosmetic cleanup                    | Moving dependencies before the workspace model stabilizes  |
| WS5. Optional Naming and Structure Cleanup | WS1 through WS4 complete                        | Cleaner repo ergonomics                                 | None                                   | Any active stabilization stream         | Cosmetic changes obscuring structural regressions          |

## 8. Phased Rollout

### Phase 0. Documentation and Guardrails

Objective:

- create the workspace migration execution artifacts before mutating repo structure.

Tasks in order:

1. Create this plan document.
2. Create the companion backlog with stable `WM-*` IDs.
3. Link both artifacts from the implementation and documentation indexes.
4. Declare the first future implementation target as Phase 1 only.

Exit criteria:

- the migration has a stable planning artifact and assignable backlog;
- future conversations can execute against the plan without re-deciding architecture.

### Phase 1. Safe Workspace Formalization

Objective:

- formalize the workspace boundary with the smallest safe implementation bundle.

Tasks in order:

1. Add root workspace metadata and keep the repo root private.
2. Validate that `astro-poc` is recognized as a workspace package from the root.
3. Convert root script usage from `npm --prefix astro-poc ...` to workspace-native commands.
4. Update CI and automation commands that still rely on the old mental model.
5. Preserve existing output, deploy, and runtime behavior exactly.

Exit criteria:

- workspace metadata is live;
- root-driven commands remain green;
- no production-contract changes were introduced.

### Phase 2. Install and Lockfile Convergence

Objective:

- make the root install path canonical and converge install strategy safely.

Tasks in order:

1. Define the final root install flow for local and CI use.
2. Remove documentation that instructs separate subproject installs after cutover.
3. Validate build, typecheck, test, browser, and audit flows under the workspace install path.
4. Decide whether to remove the nested lockfile based on green validation evidence.
5. Execute lockfile convergence only when rollback remains simple.

Exit criteria:

- `npm ci` from the repo root is canonical;
- install instructions are simpler and consistent;
- lockfile ownership is explicit and validated.

### Phase 3. Dependency Ownership Normalization

Objective:

- reduce dependency ambiguity after the workspace model is stable.

Tasks in order:

1. Classify root-only tooling versus app-owned dependencies.
2. Move or retain dependencies based on ownership, not convenience.
3. Resolve the TypeScript and Astro-check version governance split.
4. Update audits, automation, and docs to match the new ownership model.

Exit criteria:

- dependency ownership is explicit;
- TypeScript/Astro-check governance is intentional rather than incidental;
- dependency automation reflects the chosen model cleanly.

### Phase 4. Optional Follow-on Cleanup

Objective:

- reassess cosmetic or structural cleanup only after the migration is stable.

Tasks in order:

1. Evaluate whether `astro-poc` should be renamed.
2. Evaluate whether any additional monorepo tooling is warranted.
3. Keep any approved cleanup in separate RFC-style work, not bundled with the migration.

Exit criteria:

- any further cleanup is a conscious, separate decision.

## 9. Internal Interface Changes to Plan For

These are implementation-facing changes that future PRs should expect:

- the root `package.json` becomes the workspace root and should include `private: true` and `workspaces: ["astro-poc"]`;
- root scripts that currently invoke `npm --prefix astro-poc ...` should move to workspace-native equivalents such as `npm run -w astro-poc build` and `npm run -w astro-poc typecheck`;
- local and CI install flows should converge toward a workspace-aware root install;
- lockfile strategy should converge only after end-to-end validation proves the workspace install path safe.

These are not public API changes and must not affect:

- route shape;
- generated build artifact location;
- localStorage/runtime contract;
- production deployment target;
- browser-visible storefront behavior.

## 10. Validation Strategy

The following checks define success for eventual implementation PRs:

- workspace recognition succeeds from the repo root;
- `npm ci` from the root becomes the canonical install path after cutover;
- `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` remain green from the root;
- GitHub Actions workflows that currently reference root plus `astro-poc` installs continue to pass under workspace-native commands;
- dependency review, scheduled audit, and Dependabot behavior still cover both root tooling and the Astro app;
- no change is introduced in generated `astro-poc/dist`, shipped routes, or storage/runtime behavior.

## 11. Rollback Strategy

Rollback must remain simple through each phase:

- Phase 1 rollback: revert the workspace metadata and script/workflow command changes in one PR.
- Phase 2 rollback: revert install-flow and lockfile convergence independently of runtime code.
- Phase 3 rollback: revert dependency ownership moves separately from workspace topology.
- Do not mix runtime feature work with workspace migration changes; this keeps `git revert <sha>` viable and review scope small.

## 12. Next Conversation Target

The default next future implementation conversation should target Phase 1 only:

- `WM-001` for the documentation artifact if it is not already present;
- `WM-002` as the smallest safe implementation slice if the docs are already in place.

If a smaller first implementation PR is preferred, stop after workspace metadata and recognition validation before converting additional scripts or workflows.

## 13. Related Artifacts

- Backlog: [ELRINCONDEEBANO_WORKSPACE_MIGRATION_BACKLOG.md](./ELRINCONDEEBANO_WORKSPACE_MIGRATION_BACKLOG.md)
- Existing remediation plan: [ELRINCONDEEBANO_REMEDIATION_PLAN.md](./ELRINCONDEEBANO_REMEDIATION_PLAN.md)
- Existing remediation backlog: [ELRINCONDEEBANO_REMEDIATION_BACKLOG.md](./ELRINCONDEEBANO_REMEDIATION_BACKLOG.md)
- Documentation root: [../README.md](../README.md)
