# ELRINCONDEEBANO Remediation Plan

## 1. Executive Framing

This document materializes the post-audit remediation plan for `elrincondeebano.com` into an execution artifact that can be tracked over multiple iterations. The source of truth is the previously completed technical audit plus the normalized planning output derived from it.

The sequencing principle is strict:

1. Restore the shipped production runtime.
2. Make validation reflect the shipped production runtime.
3. Harden dependency, CI/CD, and supply-chain controls.
4. Only then tackle architectural convergence and larger cleanup.

This plan intentionally avoids bundling urgent hotfixes with strategic refactors. The repository currently has a production-affecting browser-runtime defect, false-green validation signals, and automation blind spots around the active Astro storefront. Those are treated as the first-order execution concerns.

## 2. Planning Principles

- Production safety takes precedence over design cleanup.
- The smallest change that restores correctness should ship first.
- Validation must be upgraded before major structural cleanup begins.
- Dependency/security visibility fixes should be early because they reduce ongoing risk without large regression surface.
- Runtime convergence and modularization are important, but they are not containment work.
- Major-version platform migration is deferred until the system is operationally trustworthy again.

## 3. Normalized Workstreams

### WS1. Production Boot Recovery

Scope:

- Restore a working bundled browser runtime for the active Astro storefront.
- Re-enable cart, quick-order, filters, service worker registration, checkout handoff, and readiness signals.

Why this grouping is correct:

- Multiple symptoms share one root cause: the shipped JS entry does not boot correctly in the browser.
- The defect affects core user behavior and production trust simultaneously.

Main findings absorbed:

- Raw `storefront.js` delivery path.
- Browser failure to resolve `bootstrap`.
- `window.__APP_READY__` never reaching `true`.
- E2E timeouts for homepage readiness and service worker readiness.
- Cart and checkout behavior being visually present but functionally dead.

### WS2. Active Astro Validation Coverage

Scope:

- Ensure the active Astro storefront is the target of type checks, browser tests, and release validation.

Why this grouping is correct:

- The audit showed that current validation is not fully aligned with the code that is actually shipped.
- This is the stream that converts false confidence into trustworthy signals.

Main findings absorbed:

- Missing Astro-native type validation.
- Orphaned or misaligned Playwright coverage.
- Missing browser-executed smoke for the shipped runtime.
- Coverage/docs claiming green status that does not reflect current reality.

### WS3. Dependency and Supply-Chain Hardening

Scope:

- Close dependency-visibility gaps around `astro-poc`.
- Apply safe patch upgrades.
- Clean up package ownership boundaries for the active app.

Why this grouping is correct:

- Dependency freshness and vulnerability posture are not blocked by architectural cleanup.
- The active storefront has a separate lockfile and dependency graph that current automation does not fully cover.

Main findings absorbed:

- Astro patch-level advisory.
- Transitive `picomatch` advisory in `astro-poc`.
- Missing Dependabot coverage for `astro-poc`.
- Missing dependency-review triggers for `astro-poc`.
- Missing scheduled npm audit for `astro-poc`.
- Hidden dependency ownership between root and `astro-poc`.

### WS4. Deploy Gating and CI Reliability

Scope:

- Ensure CI and release gates can catch the real shipped failure mode.
- Reduce redundant build work.
- Tighten workflow permission scoping.

Why this grouping is correct:

- Current deploy safety is weaker than it should be because deploy validation is not browser-executed.
- CI reliability and permission hardening are related operational concerns and should be changed together only after runtime correctness is restored.

Main findings absorbed:

- Fetch-only canary logic missing the JS boot failure.
- Post-deploy validation happening after deploy rather than gating it sufficiently.
- Repeated builds inside CI.
- Over-broad workflow write permissions in selected jobs.

### WS5. Runtime Contract Convergence

Scope:

- Decide the canonical runtime contract.
- Converge storage behavior and remove split-truth between legacy runtime modules and the active Astro runtime.

Why this grouping is correct:

- This is the main architectural debt pattern identified in the audit.
- It is high leverage but high risk, so it needs its own stream after stabilization.

Main findings absorbed:

- Split runtime ownership between legacy `src/js` modules and active Astro runtime.
- Divergent storage keys and persistence contracts.
- Green tests concentrated around legacy modules instead of the active monolith.

### WS6. Docs and Operational Truthfulness

Scope:

- Correct docs and operational artifacts so they match the current repo and validation truth.

Why this grouping is correct:

- Stale green claims and broken documentation increase coordination and release risk even when code is unchanged.
- This work should move in step with stabilization, not in advance of it.

Main findings absorbed:

- Corrupted `README.md`.
- Stale migration coverage claims.
- Observability docs pointing at inactive runtime entry points.
- Validation guidance not matching current reality.

### WS7. Architecture Cleanup and Test Rationalization

Scope:

- Reduce duplication, improve maintainability, and remove misleading or unowned test surface.

Why this grouping is correct:

- These are worthwhile cleanup tasks, but they should not be mixed with containment or gating work.

Main findings absorbed:

- Triplicated category page implementation.
- Monolithic active runtime.
- Cypress/Playwright overlap and non-canonical tests.

### WS8. Deferred Platform Modernization

Scope:

- Perform platform modernization after the repo is stable and the validation system is trustworthy.

Why this grouping is correct:

- Astro 6 migration is reasonable, but it should not complicate the hotfix and stabilization path.

Main findings absorbed:

- Active Astro major version lag versus current stable line.
- Broader toolchain modernization that is not needed for containment.

## 4. Dependency Map

| Workstream                                         | Depends On                                              | Unlocks                                         | Safe Parallelism                | Should Not Run In Parallel With                         | Main Regression Concern                                             |
| -------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| WS1. Production Boot Recovery                      | None                                                    | WS2, WS4, WS6                                   | Limited documentation prep only | WS5, WS7, WS8                                           | A hotfix changing behavior beyond the runtime boot path             |
| WS2. Active Astro Validation Coverage              | WS1                                                     | Safe releases, trustworthy CI, later refactors  | WS3, parts of WS6               | WS7 major cleanup                                       | Reworking tests while the runtime is still unstable                 |
| WS3. Dependency and Supply-Chain Hardening         | None for visibility tasks; WS1 for runtime verification | Safer update posture, auditable dependency flow | WS2, WS6                        | WS8 major migration                                     | Patch upgrades becoming mixed with unrelated behavior changes       |
| WS4. Deploy Gating and CI Reliability              | WS1 and enough of WS2 to define canonical browser gates | Safer promotion path, faster failure detection  | WS3                             | WS7 large refactors                                     | A new gate that is noisy or misses the real failure mode            |
| WS5. Runtime Contract Convergence                  | WS1 and WS2                                             | Lower drift, smaller long-term risk             | Parts of WS6                    | WS7 route and modularization refactors at the same time | Breaking persisted state or legacy-compatible behavior unexpectedly |
| WS6. Docs and Operational Truthfulness             | WS1 for truthfulness; some prep can start earlier       | Better decision-making and review quality       | WS2, WS3                        | None                                                    | Publishing docs that are still aspirational rather than true        |
| WS7. Architecture Cleanup and Test Rationalization | WS1, WS2, and preferably part of WS5                    | Lower maintenance cost, clearer ownership       | Later WS6 cleanup               | WS1, WS4                                                | Broad cleanup hiding regressions inside large diffs                 |
| WS8. Deferred Platform Modernization               | WS1 through WS4 complete                                | Platform alignment, lower version drift         | None                            | Any containment or stabilization work                   | Major migration masking unresolved current-state issues             |

## 5. Phased Implementation Plan

### Phase 0 — Containment and Production Recovery

Objective:

- Restore a working production runtime and stop shipping known-bad browser behavior.

Why this belongs here:

- The active storefront is production-affected.
- Every later change depends on first restoring the browser entry and validating that it boots.

Tasks in execution order:

1. Replace the raw `storefront.js` delivery path with a proper Astro/Vite-bundled browser entry.
2. Apply the safe Astro patch upgrade to `5.18.1` and refresh the `astro-poc` lockfile.
3. Run the canonical build and browser validation path against the built output.
4. Deploy as a narrowly scoped hotfix with rollback prepared before release.

Expected outputs:

- No bare module import error in browser console.
- `window.__APP_READY__` reaches `true` on the home page.
- Cart, filters, quick-order, checkout, and service worker readiness become operable again.
- Production hotfix evidence can be attached to a release/PR trail.

Validation gates:

- `npm run build`
- `npm run test:e2e`
- Live browser smoke against `/`
- Manual confirmation that service worker readiness resolves

Deploy and release considerations:

- Do not include route refactors, storage migration, or modularization in this release.
- Keep the rollback path explicit: revert commit set + redeploy Pages.

### Phase 1 — Validation and Correctness Restoration

Objective:

- Make validation and documentation accurately describe the active Astro storefront.

Why this belongs here:

- Once the runtime is restored, the next biggest risk is false confidence.
- The team should not continue shipping changes while active Astro coverage remains partial.

Tasks in execution order:

1. Add Astro-native type validation and wire it into local/CI execution.
2. Normalize the canonical Playwright suite so the intended Astro browser tests actually run.
3. Add/repair product-page OG compatibility coverage and fix product-page `og:image` behavior.
4. Refresh docs and runbooks that currently misstate runtime health or command truth.

Expected outputs:

- The active Astro app is typechecked and browser-tested through canonical commands.
- Product pages meet the intended social-preview contract.
- Documentation reflects the actual current state of the repo.

Validation gates:

- New Astro check passes
- Canonical Playwright suite passes and includes the intended spec set
- Build artifact inspection confirms compatible OG images for product pages

Deploy and release considerations:

- This phase can ship in one stabilization release if the hotfix is already green.
- Documentation changes should ship alongside, not ahead of, the corrected validation truth.

### Phase 2 — CI/CD, Dependency, and Supply-Chain Hardening

Objective:

- Prevent the same class of breakage and dependency drift from re-entering unnoticed.

Why this belongs here:

- Gating and automation hardening are most effective once the runtime and validation surface are stable.

Tasks in execution order:

1. Add `astro-poc` to Dependabot, dependency review, and scheduled npm audit workflows.
2. Introduce a browser-executed deploy canary or promotion gate for the real shipped JS path.
3. Refactor CI to reduce redundant rebuilds and reuse artifacts where practical.
4. Tighten workflow permission scopes to the minimum needed.
5. Align CSP enforcement, Cloudflare Insights behavior, and monitoring rules.

Expected outputs:

- `astro-poc` is fully represented in update/review/audit automation.
- Deploy validation exercises a real browser runtime path.
- CI is faster and less redundant without losing signal quality.
- Security/monitoring rules describe actual browser behavior.

Validation gates:

- Workflow trigger tests for dependency-review and audit coverage
- Manual or staged rehearsal for the new browser canary
- Successful CI runs after artifact reuse changes
- Browser-console and live-monitor verification for CSP/Insights changes

Deploy and release considerations:

- Roll out new gates in non-blocking or observed mode before making them fully blocking.
- Keep workflow permission changes isolated from functional storefront changes.

### Phase 3 — Runtime Convergence and Maintainability Cleanup

Objective:

- Remove the structural causes of future drift without destabilizing the restored app.

Why this belongs here:

- Runtime convergence and cleanup have meaningful long-term value, but higher regression risk.

Tasks in execution order:

1. Decide the canonical runtime and storage contract.
2. Implement storage compatibility or migration as needed.
3. Refactor duplicated category page implementations into a shared template.
4. Break the active storefront monolith into testable modules or intentionally recompose it from proven legacy modules.
5. Rationalize Cypress and non-canonical Playwright/browser-test coverage.

Expected outputs:

- A single canonical runtime direction.
- Stable persistence behavior across refresh/repeat-order flows.
- Reduced duplication and smaller change surfaces.
- Test inventory that matches actual ownership.

Validation gates:

- Persistence and reload tests
- Route parity tests
- Browser regression suite across key paths
- Spot-check docs and ownership references after convergence decisions

Deploy and release considerations:

- Ship these as small, isolated PRs and releases rather than a single large branch.
- Avoid bundling storage migration with modularization in the same release.

### Phase 4 — Deferred Modernization

Objective:

- Move to the current Astro major line once the repo is stable and the validation system is trustworthy.

Why this belongs here:

- This is important platform maintenance, but not emergency remediation.

Tasks in execution order:

1. Prepare Astro 6 migration scope and compatibility checklist.
2. Execute the migration in a dedicated modernization branch.
3. Re-run the full validation matrix and deploy/browser canary before release.

Expected outputs:

- Active Astro storefront aligned to the current stable major line.
- Reduced future drift and cleaner upgrade path.

Validation gates:

- Full build
- Full browser suite
- Dependency audit
- Deploy/browser canary

Deploy and release considerations:

- Treat this as a standalone release train, not a background cleanup item.

## 6. Detailed Task Breakdown

### T1. Bundle Storefront Runtime Correctly

Purpose:

- Restore the browser runtime boot path.

Exact issue being solved:

- The shipped Astro storefront loads a JS asset in a way that preserves a bare `bootstrap` import and breaks in browser.

Expected implementation area:

- Astro layout, browser entry wiring, build output validation, browser readiness tests.

Prerequisites:

- None.

Acceptance criteria:

- The built browser asset no longer emits an unresolved bare module import.
- `window.__APP_READY__` becomes `true` in canonical E2E scenarios.
- Cart and service worker readiness no longer hang on the home page.

Validation method:

- `npm run build`
- `npm run test:e2e`
- Manual browser-console verification

Regression risk:

- Medium.

Recommended size:

- M

### T2. Patch Astro to 5.18.1

Purpose:

- Apply the safe, immediate patch-level upgrade.

Exact issue being solved:

- Direct Astro advisory in the active `astro-poc` app.

Expected implementation area:

- `astro-poc/package.json`, `astro-poc/package-lock.json`, dependency verification flow.

Prerequisites:

- T1 should be ready for verification so runtime changes are not conflated.

Acceptance criteria:

- `astro` is on `5.18.1`.
- The direct Astro advisory is no longer present in `astro-poc` production audit output.

Validation method:

- `npm audit --omit=dev --prefix astro-poc`
- Build and browser regression check

Regression risk:

- Low.

Recommended size:

- S

### T3. Add Astro-Native Type Validation

Purpose:

- Make the active Astro storefront part of the type-validation contract.

Exact issue being solved:

- Current `npm run typecheck` covers only legacy JS modules and misses Astro TS/Astro files.

Expected implementation area:

- Package scripts, CI workflow, Astro type-check tooling.

Prerequisites:

- None.

Acceptance criteria:

- A canonical Astro type-validation command exists.
- CI fails when the active Astro app has type-level issues.

Validation method:

- Run the new command locally and in CI.

Regression risk:

- Low.

Recommended size:

- S

### T4. Normalize Active Playwright Coverage

Purpose:

- Ensure the canonical browser-test command covers the intended active Astro surface.

Exact issue being solved:

- The repo has misaligned browser tests and non-canonical spec locations.

Expected implementation area:

- Playwright configs, test directory ownership, release/test guidance.

Prerequisites:

- T1.

Acceptance criteria:

- `npm run test:e2e` executes the intended Astro browser suite.
- No critical Astro browser tests remain outside the canonical runner without explicit documentation.

Validation method:

- Canonical Playwright run
- Config review

Regression risk:

- Medium.

Recommended size:

- S

### T5. Add Blocking Browser Deploy Canary

Purpose:

- Catch the shipped failure mode before or immediately at deploy time.

Exact issue being solved:

- Fetch-only canary logic missed a real production JS boot defect.

Expected implementation area:

- Deploy workflows, canary tooling, browser-based smoke path, release/runbook guidance.

Prerequisites:

- T1 and T4.

Acceptance criteria:

- The deploy validation path fails when browser boot fails on the live or staged artifact URL.
- The canary can be exercised in rehearsal mode before becoming blocking.

Validation method:

- Manual/staged workflow rehearsal
- Forced failure simulation where feasible

Regression risk:

- Medium.

Recommended size:

- M

### T6. Add `astro-poc` to Dependency Automation

Purpose:

- Close the supply-chain visibility gap for the active storefront package.

Exact issue being solved:

- `astro-poc` is outside current Dependabot, dependency review, and scheduled audit coverage.

Expected implementation area:

- GitHub workflow/configuration files.

Prerequisites:

- None.

Acceptance criteria:

- Changes to `astro-poc/package.json` and `astro-poc/package-lock.json` trigger dependency review.
- Scheduled or manual audit includes `astro-poc`.
- Dependabot can open npm updates for `astro-poc`.

Validation method:

- Workflow trigger checks
- Config review

Regression risk:

- Low.

Recommended size:

- S

### T7. Fix Product-Page OG Image Compatibility

Purpose:

- Restore a compatible social-preview contract for product detail pages.

Exact issue being solved:

- Product detail pages currently emit mostly `webp` OG images, while the broader contract expects compatible image types for preview surfaces.

Expected implementation area:

- Product-page SEO helpers, OG asset generation/selection, validation rules.

Prerequisites:

- T1.

Acceptance criteria:

- Product pages emit JPG/PNG-compatible `og:image` assets.
- Validation covers at least one product-page path and the asset content type contract.

Validation method:

- Build artifact inspection
- Browser/canary validation

Regression risk:

- Low.

Recommended size:

- M

### T8. Align CSP and Cloudflare Insights Behavior

Purpose:

- Make the enforced security policy and actual telemetry behavior consistent.

Exact issue being solved:

- Browser console shows a CSP conflict with Cloudflare Insights bootstrap behavior, and current monitoring does not detect it adequately.

Expected implementation area:

- Edge security header policy, monitoring rules, Cloudflare setup, browser verification.

Prerequisites:

- T1.

Acceptance criteria:

- Intended telemetry is CSP-compliant, or it is deliberately removed.
- Monitoring rules catch the mismatch class going forward.

Validation method:

- Browser-console verification
- Live-contract or canary verification

Regression risk:

- Medium.

Recommended size:

- M

### T9. Repair Operational Docs

Purpose:

- Restore truthful engineering and operational guidance.

Exact issue being solved:

- README and selected operational docs currently misstate the Node/runtime/validation reality.

Expected implementation area:

- `README.md`, migration coverage docs, observability docs, documentation index.

Prerequisites:

- T1 and T4 so the documented truth is current.

Acceptance criteria:

- Docs reflect real runtime ownership, real commands, and real validation posture.
- Corrupted/duplicated README content is removed.

Validation method:

- Manual review and spot-check of referenced commands/paths

Regression risk:

- Low.

Recommended size:

- S

### T10. Reduce CI Rebuild Duplication

Purpose:

- Improve CI signal quality and feedback speed without reducing confidence.

Exact issue being solved:

- Current CI rebuilds the same storefront multiple times in a single job path.

Expected implementation area:

- CI workflow structure, artifact reuse, build/test split.

Prerequisites:

- T4 and preferably T5 so the canonical validation model is settled.

Acceptance criteria:

- CI performs fewer redundant builds or reuses a single validated artifact where appropriate.
- Signal quality remains equivalent or improves.

Validation method:

- Successful CI runs
- Runtime comparison against prior behavior

Regression risk:

- Low.

Recommended size:

- M

### T11. Narrow Workflow Write Permissions

Purpose:

- Reduce workflow blast radius.

Exact issue being solved:

- Some jobs request broader write permissions than their normal validation path needs.

Expected implementation area:

- GitHub Actions permission scopes and job decomposition.

Prerequisites:

- None.

Acceptance criteria:

- Write scopes exist only on jobs/steps that truly need them.

Validation method:

- Workflow review
- Successful runs after permission changes

Regression risk:

- Low.

Recommended size:

- S

### T12. Formalize Dependency Ownership

Purpose:

- Remove hidden package ownership ambiguity for the active Astro app.

Exact issue being solved:

- `astro-poc` relies on runtime dependencies owned only at the root.

Expected implementation area:

- Package manifests and possibly npm workspace structure.

Prerequisites:

- T1 and T2.

Acceptance criteria:

- The active Astro app has explicit runtime dependency ownership, either directly or via a formalized workspace model.

Validation method:

- Clean install + build in CI/local

Regression risk:

- Medium.

Recommended size:

- M

### T13. Converge Runtime and Storage Contracts

Purpose:

- Eliminate split-truth between legacy and active runtime behavior.

Exact issue being solved:

- Different runtime/storage contracts make tests, docs, and actual browser behavior diverge.

Expected implementation area:

- Runtime ownership, storage migration/compatibility, repeat-order/cart persistence flows, documentation.

Prerequisites:

- T1, T3, and T4.

Acceptance criteria:

- A canonical runtime/storage contract is documented and implemented.
- Persistence/repeat-order behavior survives reload and upgrade paths.

Validation method:

- Browser persistence tests
- Manual reload/repeat-order verification

Regression risk:

- High.

Recommended size:

- L

### T14. Refactor Duplicated Category Routes

Purpose:

- Reduce route drift risk.

Exact issue being solved:

- Multiple Astro category route files duplicate nearly identical rendering logic.

Expected implementation area:

- Category route/page implementation.

Prerequisites:

- T4.

Acceptance criteria:

- Shared implementation serves all required route variants without losing route-specific behavior.

Validation method:

- Route parity tests
- Build output review

Regression risk:

- Medium.

Recommended size:

- M

### T15. Modularize the Active Storefront Runtime

Purpose:

- Improve testability and reduce change risk in the active app.

Exact issue being solved:

- The active runtime is concentrated in a large monolithic browser file.

Expected implementation area:

- Active storefront JS structure and unit-test ownership.

Prerequisites:

- T13 preferably complete or directionally resolved.

Acceptance criteria:

- Active runtime logic is split into smaller modules with preserved behavior and attached test ownership.

Validation method:

- Unit tests + browser regression suite

Regression risk:

- Medium.

Recommended size:

- L

### T16. Rationalize Cypress and Non-Canonical Browser Tests

Purpose:

- Make the browser-test inventory honest and maintainable.

Exact issue being solved:

- Some tests are overlapping, manual-only, or outside the canonical execution path.

Expected implementation area:

- Test directory structure, browser-test ownership, docs.

Prerequisites:

- T4 and ideally T15.

Acceptance criteria:

- Every retained browser test is either part of a canonical command or explicitly documented as manual-only.

Validation method:

- Test inventory review
- CI verification

Regression risk:

- Low.

Recommended size:

- M

### T17. Execute Astro 6 Migration

Purpose:

- Modernize the platform after stabilization.

Exact issue being solved:

- The active storefront is one Astro major behind the current stable baseline.

Expected implementation area:

- `astro-poc` platform upgrade, compatibility review, validation matrix.

Prerequisites:

- T1 through T12 complete or confidently stable.

Acceptance criteria:

- Astro 6 builds, tests, and deploy validation all pass.

Validation method:

- Full validation matrix

Regression risk:

- Medium.

Recommended size:

- M

## 7. Validation Strategy

### Validation Principles

- Browser-runtime validation is blocking for runtime-affecting work.
- Dependency-visibility changes must be verified by workflow-trigger behavior, not only by config review.
- Architecture cleanup is not complete until route, persistence, and browser behavior parity are re-verified.

### Blocking Validation by Stream

| Stream | Required Blocking Validation                                                                    |
| ------ | ----------------------------------------------------------------------------------------------- |
| WS1    | Build, canonical Playwright run, live browser smoke, console check                              |
| WS2    | Astro-native type validation, canonical browser suite coverage review, OG contract verification |
| WS3    | Successful workflow triggers for Dependabot/review/audit, production dependency audit path      |
| WS4    | Rehearsed browser canary, successful CI after artifact reuse changes, permission-scope sanity   |
| WS5    | Persistence/reload validation, repeat-order/browser behavior parity                             |
| WS6    | Manual verification that docs match real commands and ownership                                 |
| WS7    | Route parity/browser regression suite after refactors                                           |
| WS8    | Full validation matrix before release                                                           |

### Required Exit Criteria by Phase

| Phase   | Exit Criteria                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------ |
| Phase 0 | Production browser runtime restored and hotfix validated                                         |
| Phase 1 | Active Astro app has trustworthy type/browser coverage and docs are truthful                     |
| Phase 2 | Dependency automation, canary behavior, CI structure, and permission scopes are hardened         |
| Phase 3 | Runtime/storage ownership is clearer, duplication is reduced, and test inventory is rationalized |
| Phase 4 | Astro major upgrade passes the full matrix and canary path                                       |

## 8. Rollout and Release Strategy

### Release Bundling Rules

- Release 1 should contain only production boot recovery plus the safe Astro patch.
- Release 2 should contain validation truth work: Astro check, normalized browser coverage, OG contract repair, and doc corrections.
- Release 3 should contain CI/CD, supply-chain, and deploy-gating hardening.
- Release 4 should contain runtime/storage convergence and maintainability cleanup as small isolated PRs.
- Release 5 should contain the Astro 6 migration alone.

### What Must Not Be Bundled Together

- Production boot hotfix with runtime convergence.
- Deploy-gate redesign with Astro 6 migration.
- Storage migration with storefront modularization.
- Large route refactors with CI workflow redesign.

### Mandatory Browser Validation Points

Browser validation is mandatory:

1. Before the Phase 0 hotfix release.
2. Immediately after the Phase 0 hotfix release.
3. Before enabling any blocking browser deploy gate.
4. Before and after any storage-contract change.
5. Before any Astro major-version release.

### Rollback Expectations

- Any release that touches runtime boot, deploy gating, or storage behavior must have an explicit rollback path documented before deploy.
- Hotfix and deploy-gate releases should be revertable as small commit sets.

## 9. Risks, Trade-offs, and Deferrals

### Key Risks

- Fixing the browser entry could unintentionally alter load order or bootstrap behavior beyond the immediate bug.
- Adding deploy/browser gates too aggressively could create noisy failures if the gate is not rehearsed first.
- Runtime/storage convergence can create user-state regressions if migration behavior is underspecified.

### Main Trade-offs

- The plan prioritizes truthful validation over immediate architectural elegance.
- Some duplication and legacy surface are tolerated temporarily because they are safer than doing broad refactors during containment.
- Documentation updates are delayed until the corresponding runtime or validation truth is re-established.

### Explicit Deferrals

The following should not be tackled immediately:

- Large-scale modularization of the active runtime.
- Elimination of all legacy runtime traces.
- Cypress removal.
- Astro 6 migration.

Those are valuable but should wait until the system is stable and the validation pipeline is trustworthy.

## 10. Final Recommended Execution Order

1. Fix the active Astro browser entry so the storefront boots correctly.
2. Patch Astro to `5.18.1` and verify the active lockfile/audit path.
3. Ship the hotfix with real browser validation and rollback prepared.
4. Add Astro-native type validation.
5. Normalize the canonical Playwright suite for the active Astro surface.
6. Fix product-page OG image compatibility.
7. Repair docs and operational truthfulness.
8. Add `astro-poc` to dependency-review, audit, and Dependabot coverage.
9. Introduce and rehearse a browser-based deploy canary, then make it blocking.
10. Reduce CI rebuild duplication and tighten workflow permissions.
11. Formalize dependency ownership for the active Astro app.
12. Converge runtime/storage contracts carefully.
13. Refactor duplicated category routes.
14. Modularize the active runtime and rationalize browser-test inventory.
15. Execute Astro 6 migration as a dedicated modernization release.

## 11. Related Artifacts

- Backlog: [ELRINCONDEEBANO_REMEDIATION_BACKLOG.md](./ELRINCONDEEBANO_REMEDIATION_BACKLOG.md)
- Index: [README.md](./README.md)
- Documentation root: [../README.md](../README.md)
