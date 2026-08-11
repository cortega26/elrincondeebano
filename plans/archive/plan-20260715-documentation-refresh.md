# Documentation Refresh Plan

Status: completed

## Objective

Make the repository documentation easier to navigate, cheaper for API-assisted
work, explicit about DRY/SOLID/KISS tradeoffs, and less prone to stale current
guidance.

## Scope

- Human entry points: `README.md`, `CONTRIBUTING.md`, and `docs/START_HERE.md`.
- Canonical engineering, onboarding, validation, structure, and runbook docs.
- A focused AI/API-efficiency guide and documentation freshness policy.
- Verified active-doc drift only; historical audits and migration evidence are
  intentionally preserved.

## Completed work

- [x] Inventory canonical commands, runtime pins, active paths, and workflows.
- [x] Separate current guidance from historical records.
- [x] Rewrite the README around quick start, validation, architecture, and docs navigation.
- [x] Add measurable token-efficiency and prompt-caching guidance.
- [x] Codify pragmatic DRY, SOLID, and KISS rules.
- [x] Define source-of-truth order, document classes, freshness triggers, and human-writing rules.
- [x] Repair confirmed workspace, validation, Cypress, workflow, and audit-command drift.
- [x] Run Markdown formatting/lint and focused documentation checks.

## Decisions

- Keep provider-specific AI details in one dated guide and link to primary
  documentation so entry points do not age with pricing or model names.
- Do not rewrite dated audit and migration records: their old commands and
  versions are evidence of the recorded event.
- Prefer trigger-based freshness reviews over adding volatile timestamps to
  every document.

## Rollback

Revert the documentation-refresh commit. No runtime or deployment behavior is
changed by this plan.
