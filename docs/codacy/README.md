# Codacy Reports

This folder stores artifacts produced by the "Codacy Security Scan" workflow.

## What the workflow produces
- `docs/codacy/REPORT.md` is generated from `results.sarif`.
- The report groups findings by severity and rule, with file:line locations.

## Where to find the artifact
- GitHub Actions uploads the report as the `codacy-report` artifact on PRs and pushes,
  when `CODACY_PROJECT_TOKEN` is available.

## How to use REPORT.md
- Treat it as a backlog for refactors or cleanup.
- Each entry includes severity, rule ID, location, and message for prioritization.
