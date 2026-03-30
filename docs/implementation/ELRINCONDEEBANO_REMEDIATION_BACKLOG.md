# ELRINCONDEEBANO Remediation Backlog

## 1. Backlog Usage Notes

This backlog converts the remediation plan into assignable work items. It is designed for engineering execution, not audit storytelling. Items are intentionally normalized by implementation stream, dependency order, and regression risk.

Backlog conventions:

- IDs are stable and should be reused in PRs, issue titles, and execution logs.
- `Priority` expresses execution order, not business value in isolation.
- `Effort` is relative sizing for planning and splitting, not a time estimate.
- `Status` starts as `Proposed` and should be updated as work advances.
- Acceptance criteria are outcome-oriented and should be met before closure.

## 2. Priority Model

| Priority | Meaning |
| --- | --- |
| P0 | Immediate containment or production recovery |
| P1 | Required stabilization work that should follow directly after containment |
| P2 | Hardening or structural work that should begin once containment is complete |
| P3 | Important cleanup that should wait until runtime and gates are trustworthy |
| P4 | Deferred modernization or improvement work |

## 3. Backlog Table

| ID | Epic / Workstream | Task Title | Problem Type | Severity | Priority | Effort | Status | Depends On | Can Run In Parallel With | Acceptance Criteria | Validation | Suggested Owner | Notes / Risks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EB-001 | WS1. Production Boot Recovery | Bundle storefront runtime correctly | Production defect | Critical | P0 | M | Completed | None | EB-006, EB-011 | Browser boot succeeds, no unresolved module import remains, `__APP_READY__` becomes `true` | Build, canonical Playwright run, live browser smoke | Frontend | Implemented in Phase 0 by switching the layout boot path to Astro's bundled module pipeline. Verified with `npm ci`, `npm ci --prefix astro-poc`, `npm run build`, and `npm run test:e2e`; built output no longer ships a bare `bootstrap` import and the homepage reaches `__APP_READY__ === true`. |
| EB-002 | WS3. Dependency and Supply-Chain Hardening | Patch Astro to `5.18.1` | Dependency risk | High | P0 | S | Completed | EB-001 for clean verification | EB-003, EB-006 | Active Astro app uses `5.18.1`; direct Astro advisory is cleared | `npm audit --omit=dev --prefix astro-poc` plus build/browser verification | Frontend | Implemented in Phase 0 by pinning `astro-poc` to `astro@5.18.1` and refreshing the lockfile. Build and browser verification passed; `npm audit --omit=dev --prefix astro-poc` still reports a transitive `picomatch` vulnerability, which remains follow-up work outside this P0 patch. |
| EB-003 | WS2. Active Astro Validation Coverage | Add Astro-native type validation | Validation gap | High | P1 | S | Completed | None | EB-006, EB-008 | Active Astro TS/Astro source is part of canonical local/CI type validation | New Astro check command in CI | Frontend | Completed in Phase 1 by adding `astro-poc` `typecheck` (`astro check`) plus a root `npm run typecheck` chain (`tsc` + Astro). Verified with `npm ci`, `npm ci --prefix astro-poc`, and `npm run typecheck`; `astro check` now reports 0 errors, 0 warnings, and 0 hints after explicitly marking the inline JSON payload script and removing the stale service-worker parameter warning. |
| EB-004 | WS2. Active Astro Validation Coverage | Normalize canonical Playwright coverage | Test gap | High | P1 | S | Completed | EB-001 | EB-003, EB-006 | Canonical Playwright command runs the intended Astro browser suite | `npm run test:e2e` coverage review | QA / Frontend | Completed in Phase 1 by making `npm run test:e2e` explicitly use `playwright.astro.config.ts` and by re-exporting that config from `playwright.config.ts` to remove split-truth. Verified with `npm run test:e2e` (`6 passed`), including the Astro product-page OG compatibility spec; `test/e2e/` remains supplemental/manual coverage. |
| EB-005 | WS4. Deploy Gating and CI Reliability | Add browser-executed deploy canary | Deploy safety gap | High | P1 | M | Completed | EB-001, EB-004 | EB-006, EB-010 | Deploy path fails when browser boot fails on the shipped artifact | Staged/manual workflow rehearsal | DevEx | Completed post-Phase 4 by promoting the artifact browser canary into the authoritative `Deploy static content to Pages` workflow: both the manual verification path and the main deploy path now build `astro-poc/dist`, install Playwright Chromium, and require `test/e2e-astro/deploy-canary.spec.ts` to pass before Pages publication. `post-deploy-canary.yml` remains for post-deploy evidence and optional live/self-hosted probing. |
| EB-006 | WS3. Dependency and Supply-Chain Hardening | Add `astro-poc` to Dependabot, dependency review, and scheduled audit | Supply-chain blind spot | High | P1 | S | Completed | None | EB-003, EB-004 | All dependency automation covers `astro-poc` manifests and lockfile | Workflow trigger verification | DevEx | Completed in Phase 2 by adding a dedicated `/astro-poc` npm block to `.github/dependabot.yml`, extending `dependency-review.yml` path triggers to `astro-poc/package.json` and `astro-poc/package-lock.json`, and expanding `security-audit.yml` to run scheduled/manual `npm audit --package-lock-only --omit=dev --audit-level=high` for both the repo root and `astro-poc`. |
| EB-007 | WS2. Active Astro Validation Coverage | Fix product-page OG image compatibility | Runtime/SEO correctness | High | P1 | M | Completed | EB-001 | EB-008 | Product pages emit JPG/PNG-compatible `og:image` assets and validation covers that path | Build output inspection and canary verification | Frontend | Completed in Phase 1 by routing product-page OG selection through the existing category JPG pipeline whenever catalog media is WebP-only, preserving compatible social previews without touching the Phase 0 boot fix. Verified by `npm run build`, `node test/product-og.build-metadata.test.js`, and `npm run test:e2e`, where the canonical browser suite also confirmed the OG asset returns `image/jpeg`. |
| EB-008 | WS6. Docs and Operational Truthfulness | Repair README and operational docs | Documentation drift | Medium | P1 | S | Completed | EB-001, EB-004 | EB-006 | Docs reflect actual runtime ownership, Node baseline, and validation truth | Manual review plus command spot-check | Docs steward | Completed in Phase 1 by repairing `README.md` and updating `docs/operations/DEBUGGING.md`, `docs/operations/QUALITY_GUARDRAILS.md`, and `docs/archive/LEGACY_STOREFRONT.md` so they reflect the active Astro runtime, Node 22 baseline, root `npm run typecheck`, and canonical Astro Playwright path. Spot-checked against the green verification commands from this phase. |
| EB-009 | WS4. Deploy Gating and CI Reliability | Align CSP contract and Cloudflare Insights behavior | Security/ops mismatch | Medium | P2 | M | In Progress | EB-001 | EB-010, EB-011 | Telemetry behavior is either CSP-compliant or intentionally removed; monitor catches mismatch class | Browser-console and monitor verification | DevEx / Frontend | Advanced in Phase 2 by teaching `tools/security-header-policy.mjs` to flag inline Cloudflare Insights bootstrap snippets while continuing to allow the external beacon script, and by updating `EDGE_SECURITY_HEADERS.md` / `RUNBOOK.md` so CSP, monitoring, and operational guidance all describe the same allowed-vs-disallowed edge behavior. Continued on 2026-03-30 by adding repo-side sanitization for disallowed Cloudflare-injected HTML in `infra/cloudflare/edge-security-headers/worker.mjs` and a self-hosted browser-executed live probe (`tools/live-browser-contract.mjs`, wired into `post-deploy-canary.yml`). The updated worker was then deployed successfully to Cloudflare (`elrincondeebano-edge-security-headers`, version `7958a854-d6cd-415d-b728-70fc5e1e3382`), but live verification still fails in the current production zone: both `/` and `/pages/bebidas.html` continue to inject `/cdn-cgi/challenge-platform/` plus inline bootstrap and still surface a `bootstrap` module page error. The remaining completion step is Cloudflare-side remediation outside the worker path, followed by a fresh green live monitor + browser run. |
| EB-010 | WS4. Deploy Gating and CI Reliability | Rework CI to reduce redundant rebuilds and reuse artifacts | CI reliability | Medium | P2 | M | Completed | EB-004, EB-005 | EB-009, EB-011 | CI performs fewer redundant builds without losing validation confidence | Successful CI runs and parity comparison | DevEx | Completed in Phase 2 by removing the monolithic `certify:migration` rerun from `ci.yml` and `product-data-guard.yml`, running lint/typecheck/unit tests explicitly, and reusing the already-built `astro-poc/dist` artifact for Playwright via `PLAYWRIGHT_SKIP_BUILD=1`. The canonical browser suite still runs, but it no longer rebuilds the storefront inside the same job path. |
| EB-011 | WS4. Deploy Gating and CI Reliability | Narrow workflow write permissions | Security hardening | Medium | P2 | S | Completed | None | EB-006, EB-010 | Jobs only request write scopes where required | Workflow review and successful runs | DevEx | Completed in Phase 2 by removing unnecessary top-level `actions: read` grants from CI/canary workflows and moving Pages write scopes out of workflow-wide permissions and down to the deploy jobs that actually publish (`static.yml`, `rollback.yml`, existing rollback job in `post-deploy-canary.yml` already remained job-scoped). |
| EB-012 | WS3. Dependency and Supply-Chain Hardening | Formalize dependency ownership for the active Astro app | Dependency hygiene | Medium | P2 | M | Proposed | EB-001, EB-002 | EB-010 | Active Astro app has explicit runtime dependency ownership, directly or via formal workspace model | Clean install + build | Frontend / DevEx | Choose one ownership model and document it |
| EB-013 | WS5. Runtime Contract Convergence | Converge runtime and storage contracts | Architecture debt | High | P2 | L | Completed | EB-001, EB-003, EB-004 | EB-014, EB-015 | Canonical runtime/storage contract is documented and implemented; persistence behavior is stable | Browser persistence and repeat-order validation | Frontend lead | Completed in Phase 3 by formalizing the shipped Astro runtime around `astro-poc/src/scripts/storefront.js` plus `astro-poc/src/scripts/storefront/{storage-contract,storefront-state,personalization}.js`, documenting the canonical `astro-poc-*` localStorage keys, and keeping legacy `cart` reads compatible through the storage contract. Validated with `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`, plus focused coverage in `test/storefront.storage-contract.spec.js` and `test/e2e-astro/storage-contract.spec.ts` for refresh and repeat-order persistence. |
| EB-014 | WS7. Architecture Cleanup and Test Rationalization | Refactor duplicated category-route implementation | Maintainability debt | Medium | P3 | M | Completed | EB-004 | EB-015 | Shared implementation serves route variants without losing behavior parity | Route parity tests and build review | Frontend | Completed in Phase 3 by extracting `astro-poc/src/components/CategoryCatalogPage.astro` and reusing it from `astro-poc/src/pages/[category].astro`, `astro-poc/src/pages/c/[category].astro`, and `astro-poc/src/pages/pages/[slug].html.astro`. Verified by `npm run build` route generation and canonical Playwright parity coverage in `test/e2e-astro/parity-smoke.spec.ts`. |
| EB-015 | WS7. Architecture Cleanup and Test Rationalization | Modularize the active storefront runtime | Maintainability debt | Medium | P3 | L | Completed | EB-013 | EB-016 | Active runtime split into smaller tested modules with preserved behavior | Unit tests plus browser regression suite | Frontend | Completed in Phase 3 by reducing the active storefront monolith into focused runtime modules (`catalog-view.js`, `personalization.js`, `storage-contract.js`, `storefront-state.js`) while keeping `storefront.js` as the Astro boot orchestrator. Verified with `test/storefront.catalog-view.spec.js`, `test/storefront.storage-contract.spec.js`, `npm test`, and the full canonical browser suite. |
| EB-016 | WS7. Architecture Cleanup and Test Rationalization | Rationalize Cypress and non-canonical browser tests | Test hygiene | Medium | P3 | M | Completed | EB-004, EB-015 | None | Each retained browser test is canonical or explicitly documented as manual-only | Test inventory verification | QA / Frontend | Completed in Phase 3 by making runtime/browser ownership explicit in `README.md`, `docs/operations/QUALITY_GUARDRAILS.md`, and `docs/repo/STRUCTURE.md`: `test/e2e-astro/` remains canonical, while `test/e2e/` and `cypress/` are retained as supplemental/manual coverage only. Canonical verification stayed green via `npm run test:e2e`. |
| EB-017 | WS8. Deferred Platform Modernization | Execute Astro 6 migration | Platform modernization | Medium | P4 | M | Completed | EB-001 through EB-012 | None | Astro 6 build, test, canary, and audit paths all pass | Full validation matrix | Frontend lead | Completed in Phase 4 by pinning `astro-poc` to `astro@6.1.1`, adding the Phase 4 compatibility checklist, and closing the remaining transitive audit gap with a temporary vendored `anymatch@3.1.3` tarball plus root override so Astro's `unstorage` chain resolves `picomatch@4.0.4`. Verified with `npm ci`, `npm ci --prefix astro-poc`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`, and `npm audit --omit=dev --prefix astro-poc`; the canonical browser canary, runtime/storage contract, repeat-order persistence, and category-route parity checks stayed green, including `/bebidas/`, `/c/bebidas/`, and `/pages/bebidas.html`. |

## 4. Quick Wins

Quick wins are the highest-value low/medium-effort items that materially reduce risk without expanding the change surface too early.

| ID | Task | Why it is a quick win | Expected Impact |
| --- | --- | --- | --- |
| EB-001 | Bundle storefront runtime correctly | One root-cause fix restores multiple broken user flows | Immediate production recovery |
| EB-002 | Patch Astro to `5.18.1` | Safe patch upgrade with clear security value | Advisory reduction with minimal risk |
| EB-003 | Add Astro-native type validation | Small tooling change closes a major blind spot | Better confidence in active Astro changes |
| EB-006 | Add `astro-poc` to dependency automation | Config-only hardening with strong value | Ongoing supply-chain visibility |
| EB-008 | Repair README and operational docs | Small-scope but high coordination value | Removes misleading guidance quickly |
| EB-011 | Narrow workflow write permissions | Low-risk security hardening | Better default workflow posture |

## 5. Strategic Work

Strategic work matters, but should not be mixed with containment and stabilization.

| ID | Task | Why it is strategic | Prerequisites | Main Risk |
| --- | --- | --- | --- | --- |
| EB-005 | Add browser-executed deploy canary | Changes the release-assurance model, not just code | EB-001, EB-004 | Noisy or immature gate blocking releases |
| EB-010 | Rework CI artifact flow and rebuild strategy | Alters job structure and confidence model | EB-004, EB-005 | Reduced clarity if over-engineered |
| EB-012 | Formalize dependency ownership | Changes install/package boundaries | EB-001, EB-002 | Packaging confusion if half-implemented |
| EB-013 | Converge runtime and storage contracts | Resolves the repo’s main split-truth debt pattern | EB-001, EB-003, EB-004 | User-state and behavior regressions |
| EB-015 | Modularize active storefront runtime | Improves long-term change safety | EB-013 | Refactor churn hiding behavior changes |
| EB-017 | Execute Astro 6 migration | Aligns platform with current stable line | Stabilization streams complete | Major upgrade masking unresolved debt |

## 6. Execution Notes

- Use the remediation plan as the sequencing artifact and this backlog as the assignment/tracking artifact.
- Prefer one backlog item per PR where possible for P0-P2 work.
- Do not mark items done based only on code changes; acceptance criteria and validation must also be satisfied.
- For any item touching runtime boot, storage behavior, or deploy gating, attach smoke evidence and rollback notes to the execution record.

## 7. Related Artifacts

- Plan: [ELRINCONDEEBANO_REMEDIATION_PLAN.md](./ELRINCONDEEBANO_REMEDIATION_PLAN.md)
- Index: [README.md](./README.md)
- Documentation root: [../README.md](../README.md)
