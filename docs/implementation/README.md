# Implementation Docs

This directory contains execution-ready remediation artifacts derived from the latest storefront audit and its normalized planning output.

## Files

- [ELRINCONDEEBANO_REMEDIATION_PLAN.md](./ELRINCONDEEBANO_REMEDIATION_PLAN.md): ordered remediation plan, workstreams, dependency map, phases, task breakdown, validation strategy, and rollout guidance.
- [ELRINCONDEEBANO_REMEDIATION_BACKLOG.md](./ELRINCONDEEBANO_REMEDIATION_BACKLOG.md): professional execution backlog with stable IDs, dependencies, acceptance criteria, and validation expectations.
- [ELRINCONDEEBANO_ASTRO6_COMPATIBILITY_CHECKLIST.md](./ELRINCONDEEBANO_ASTRO6_COMPATIBILITY_CHECKLIST.md): Phase 4 compatibility scope, upgrade target, and blocking validation checklist for the Astro 6 modernization release.
- [ELRINCONDEEBANO_WORKSPACE_MIGRATION_PLAN.md](./ELRINCONDEEBANO_WORKSPACE_MIGRATION_PLAN.md): ordered roadmap for formalizing the repo as an npm workspace while preserving the current storefront contract and deployment model.
- [ELRINCONDEEBANO_WORKSPACE_MIGRATION_BACKLOG.md](./ELRINCONDEEBANO_WORKSPACE_MIGRATION_BACKLOG.md): assignable workspace-migration backlog with stable `WM-*` IDs, dependencies, validation gates, and future-conversation targeting.

## Intended Usage

- Use the remediation plan to decide sequence, bundling, and release safety.
- Use the backlog to create issues, PR scopes, and execution logs.
- Use the workspace migration plan and backlog when the work is about package topology, install semantics, or CI/dependency-management convergence rather than storefront behavior.
- Keep both files updated together when priorities, dependencies, or release strategy change.

## Relationship to Existing Docs

- Audit evidence and historical prompt notes remain in `docs/audit/`.
- Operational runbooks remain in `docs/operations/`.
- These implementation docs are the current execution layer that sits between audit findings and actual tracked remediation work.
