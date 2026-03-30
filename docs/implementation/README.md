# Implementation Docs

This directory contains execution-ready remediation artifacts derived from the latest storefront audit and its normalized planning output.

## Files

- [ELRINCONDEEBANO_REMEDIATION_PLAN.md](./ELRINCONDEEBANO_REMEDIATION_PLAN.md): ordered remediation plan, workstreams, dependency map, phases, task breakdown, validation strategy, and rollout guidance.
- [ELRINCONDEEBANO_REMEDIATION_BACKLOG.md](./ELRINCONDEEBANO_REMEDIATION_BACKLOG.md): professional execution backlog with stable IDs, dependencies, acceptance criteria, and validation expectations.
- [ELRINCONDEEBANO_ASTRO6_COMPATIBILITY_CHECKLIST.md](./ELRINCONDEEBANO_ASTRO6_COMPATIBILITY_CHECKLIST.md): Phase 4 compatibility scope, upgrade target, and blocking validation checklist for the Astro 6 modernization release.

## Intended Usage

- Use the remediation plan to decide sequence, bundling, and release safety.
- Use the backlog to create issues, PR scopes, and execution logs.
- Keep both files updated together when priorities, dependencies, or release strategy change.

## Relationship to Existing Docs

- Audit evidence and historical prompt notes remain in `docs/audit/`.
- Operational runbooks remain in `docs/operations/`.
- These implementation docs are the current execution layer that sits between audit findings and actual tracked remediation work.
