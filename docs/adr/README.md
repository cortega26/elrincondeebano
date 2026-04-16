# ADR Index

Architecture Decision Records capture long-lived decisions that affect runtime
topology, build paths, validation contracts, deploy behavior, or shared data
contracts.

## When to write an ADR

Create or update an ADR when a change:

- alters the canonical runtime, deploy target, or package topology;
- changes the supported build or validation path;
- introduces or retires a long-lived contract in `data/`, `assets/`, or CI;
- adds an operational constraint that future agents must not rediscover.

## ADR list

| ADR    | Status   | Summary                                                                      |
| ------ | -------- | ---------------------------------------------------------------------------- |
| `0001` | Accepted | Shared utilities for Cloudflare image URLs and structured logging.           |
| `0002` | Accepted | Operational guardrails and data-contract discipline from the audit baseline. |
| `0003` | Accepted | Astro storefront replaces the legacy EJS/Node runtime.                       |
| `0004` | Accepted | GitHub Pages remains the content origin behind Cloudflare edge controls.     |
| `0005` | Accepted | `data/` and `assets/` stay at repo root as shared build inputs.              |
| `0006` | Accepted | Service worker caching uses independently versioned cache namespaces.        |
| `0007` | Accepted | `npm run validate:release` is the canonical release-validation contract.     |

## Maintenance notes

- Keep this index in sync with new ADR files.
- Prefer one decision per ADR.
- Link related runbooks or implementation docs when the decision adds operator
  constraints.
