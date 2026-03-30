# ELRINCONDEEBANO Workspace Migration Backlog

## 1. Backlog Usage Notes

This backlog converts the workspace migration recommendation into assignable implementation work. It is intentionally sequenced so that package-topology formalization happens before install convergence, dependency reshaping, or cosmetic cleanup.

Backlog conventions:

- IDs are stable and should be reused in PR titles, issue tracking, and execution logs.
- `Priority` expresses execution order, not business value in isolation.
- `Effort` is relative sizing for planning and review.
- `Status` starts as `Proposed` unless the task has already shipped.
- Acceptance criteria are outcome-oriented and must be satisfied before closure.
- `Future Conversation Candidate` identifies the default slice to take in the next implementation thread.

## 2. Priority Model

| Priority | Meaning                                                           |
| -------- | ----------------------------------------------------------------- |
| P0       | Planning artifact or prerequisite required before repo mutation   |
| P1       | First implementation bundle for safe workspace formalization      |
| P2       | Follow-on convergence work after workspace adoption is stable     |
| P3       | Optional cleanup that should wait until the migration is complete |

## 3. Backlog Table

| ID     | Epic / Workstream                          | Task Title                                                                      | Problem Type               | Severity | Priority | Effort | Status   | Depends On             | Can Run In Parallel With           | Acceptance Criteria                                                                                                                                      | Validation                                                                          | Suggested Owner       | Future Conversation Candidate | Notes / Risks                                                                                       |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------- | -------- | -------- | ------ | -------- | ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| WM-001 | WS1. Workspace Foundation                  | Create workspace migration plan and backlog docs                                | Planning gap               | High     | P0       | S      | Proposed | None                   | None                               | Plan and backlog docs exist in `docs/implementation/`, are linked from documentation indexes, and leave no architecture decisions unresolved for Phase 1 | Manual review of plan/backlog completeness                                          | Docs / DevEx          | Yes, until shipped            | Must land before structural repo changes so follow-up conversations can execute without re-planning |
| WM-002 | WS1. Workspace Foundation                  | Formalize root npm workspace metadata                                           | Package topology ambiguity | High     | P1       | S      | Proposed | WM-001                 | Documentation-only follow-up       | Root `package.json` declares the repo private and adds `workspaces: ["astro-poc"]`; `astro-poc` is recognized from the repo root as a workspace package  | Root workspace recognition command plus clean install smoke                         | DevEx                 | Yes                           | Keep directory layout unchanged; rollback must be a single revert                                   |
| WM-003 | WS2. Script and Workflow Convergence       | Convert root scripts from `--prefix` to workspace-native commands               | Command drift              | High     | P1       | S      | Proposed | WM-002                 | WM-004, WM-005 documentation prep  | Root build and typecheck scripts use workspace-native commands and remain green from the repo root                                                       | `npm run typecheck`, `npm run build`                                                | Frontend / DevEx      | No                            | Do not change runtime behavior or output locations                                                  |
| WM-004 | WS2. Script and Workflow Convergence       | Update CI workflows to use workspace-native install and run semantics           | CI fragility               | High     | P1       | M      | Proposed | WM-002                 | WM-003, WM-005 in review-only form | GitHub Actions no longer rely on two unrelated npm-project assumptions and still preserve current build/deploy behavior                                  | Workflow diff review plus green CI runs                                             | DevEx                 | No                            | Avoid bundling lockfile convergence into this item                                                  |
| WM-005 | WS4. Dependency Ownership and Governance   | Update dependency automation and audit flows for the workspace model            | Automation drift           | High     | P1       | M      | Proposed | WM-002                 | WM-003, WM-004                     | Dependabot, dependency review, and scheduled audit still cover both root tooling and `astro-poc` cleanly under the workspace model                       | Automation config review plus green scheduled/manual audit paths                    | Security / DevEx      | No                            | Keep coverage explicit even if the install model changes                                            |
| WM-006 | WS3. Install and Lockfile Convergence      | Converge install flow and lockfile strategy                                     | Install complexity         | Medium   | P2       | M      | Proposed | WM-003, WM-004, WM-005 | WM-009 prep                        | Root `npm ci` becomes canonical after cutover, docs/workflows no longer require separate subproject installs, and lockfile ownership is explicit         | Root `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` | DevEx                 | No                            | Default target is one root lockfile only after validation proves it safe                            |
| WM-007 | WS4. Dependency Ownership and Governance   | Normalize dependency ownership across root and `astro-poc`                      | Dependency ambiguity       | Medium   | P2       | M      | Proposed | WM-006                 | WM-008 analysis                    | Dependencies are classified by ownership and moved or retained intentionally, with minimal duplication                                                   | Clean install plus build/test matrix                                                | Frontend / DevEx      | No                            | Avoid mixing ownership cleanup with unrelated feature work                                          |
| WM-008 | WS4. Dependency Ownership and Governance   | Resolve TypeScript and Astro-check version governance under the workspace model | Toolchain drift            | Medium   | P2       | M      | Proposed | WM-007                 | WM-009 docs prep                   | TypeScript and Astro-check compatibility is governed intentionally rather than by incidental install isolation                                           | Clean install, typecheck, build, workflow verification                              | Frontend              | No                            | This task should explicitly remove the conditions that led to the prior peer-resolution mismatch    |
| WM-009 | WS3. Install and Lockfile Convergence      | Update operational docs and onboarding after workspace cutover                  | Documentation drift        | Medium   | P2       | S      | Proposed | WM-006                 | WM-008 finalization                | Onboarding, debugging, and implementation docs match the new workspace-native install and execution model                                                | Manual docs review against shipped commands                                         | Docs steward          | No                            | Do not update docs ahead of the actual cutover state                                                |
| WM-010 | WS5. Optional Naming and Structure Cleanup | Reassess optional directory/package naming cleanup                              | Cosmetic debt              | Low      | P3       | S      | Proposed | WM-008, WM-009         | None                               | A later decision is recorded on whether `astro-poc` should be renamed, deferred, or preserved                                                            | ADR or follow-up planning doc                                                       | Frontend lead / DevEx | No                            | Keep out of the workspace migration unless explicitly approved later                                |

## 4. First Implementation Bundle

The default first implementation bundle should be:

- `WM-002` Formalize root npm workspace metadata
- `WM-003` Convert root scripts to workspace-native commands
- `WM-004` Update CI workflows to use workspace-native semantics
- `WM-005` Update dependency automation and audit flows for the workspace model

If a smaller first PR is preferred, start with:

- `WM-001` if the documentation artifact is not present yet
- `WM-002` only, then validate workspace recognition before taking on script and workflow convergence

## 5. Validation Gates

These validation gates apply to the relevant implementation PRs:

- workspace recognition succeeds from the repo root;
- `npm ci` from the root is the canonical install path after cutover;
- `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` remain green from the root;
- GitHub Actions workflows that currently reference root plus `astro-poc` installs continue to pass under workspace-native commands;
- dependency review, scheduled audit, and Dependabot behavior still cover both root tooling and the Astro app;
- `astro-poc/dist`, shipped routes, and localStorage/runtime behavior remain unchanged.

## 6. Execution Notes

- Keep workspace migration PRs small and rollback-friendly.
- Do not combine package-topology changes with storefront feature work.
- Treat lockfile convergence as follow-up work, not part of the first workspace PR.
- Attach rollback notes and validation evidence to every item that changes install or CI behavior.

## 7. Related Artifacts

- Plan: [ELRINCONDEEBANO_WORKSPACE_MIGRATION_PLAN.md](./ELRINCONDEEBANO_WORKSPACE_MIGRATION_PLAN.md)
- Existing remediation plan: [ELRINCONDEEBANO_REMEDIATION_PLAN.md](./ELRINCONDEEBANO_REMEDIATION_PLAN.md)
- Existing remediation backlog: [ELRINCONDEEBANO_REMEDIATION_BACKLOG.md](./ELRINCONDEEBANO_REMEDIATION_BACKLOG.md)
- Documentation root: [../README.md](../README.md)
