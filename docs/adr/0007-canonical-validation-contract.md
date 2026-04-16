# ADR 0007: Canonical release-validation contract

- Date: 2026-04-16
- Status: Accepted

## Context

The repository already had strong validation coverage, but the authoritative
"done" command was split across `README.md`, `AGENTS.md`, `CONTRIBUTING.md`,
and the operations docs. That made agents and contributors compare several
manual command lists before deciding what the real release gate was.

At the same time, the existing `npm run validate` command intentionally stopped
short of the full ship gate because it did not include browser E2E validation or
share-preview monitoring.

## Decision

`npm run validate:release` is the canonical release-validation contract for this
repository.

It must execute these stages in order:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run guardrails:assets`
6. `npm run test:e2e`
7. `npm run monitor:share-preview`

`npm run validate` remains the lighter local baseline for iterative work, but
release-facing docs should point to `npm run validate:release` as the ship gate.

## Consequences

### Positive

- Agents have one release command to trust instead of reconstructing a checklist.
- Human docs and executable validation now share the same contract.
- CI and release guidance can evolve from one script entry point.

### Costs

- Any release-gate change now requires coordinated updates to `package.json`,
  the validation script, and supporting docs.
- Running the full release gate is slower, so contributors should still use
  `npm run validate` during iteration.

## Related documents

- `docs/operations/VALIDATION_MATRIX.md`
- `docs/operations/QUALITY_GUARDRAILS.md`
- `docs/START_HERE.md`
