# Security Scan Reports

This folder documents artifacts produced by the `Semgrep Security Scan` workflow.

## What the workflow produces

- `reports/semgrep/results.sarif` contains the scan results uploaded to GitHub Code Scanning.
- `reports/semgrep/REPORT.md` is generated from the SARIF file for quick review in artifacts.

## Where to find the artifact

- GitHub Actions uploads `reports/semgrep/` as the `semgrep-report` artifact on pushes, PRs, scheduled runs, and manual executions.

## How to use REPORT.md

- Treat it as a prioritized review queue, not as a release note.
- Each entry includes severity, rule ID, location, and message for triage.

## Signal policy

- GitHub Code Scanning receives security findings, not general lint or style output.
- Low-confidence audit heuristics that repeatedly flag trusted build paths, tests, or
  local-only tooling are excluded from SARIF upload. ESLint and the quality-gate
  workflows remain responsible for those code-quality checks.
- Vendored agent skills under `.agents/` are outside the deployed application and
  are excluded from the repository security scan.
- High-confidence Semgrep findings remain visible for review, even when they may
  ultimately require contextual dismissal.
