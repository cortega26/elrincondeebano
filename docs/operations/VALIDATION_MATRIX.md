# Validation Matrix

This document defines the two supported validation tiers for local work and
release readiness.

## Validation tiers

| Tier                   | Command                    | Purpose                                                                                   |
| ---------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Fast local baseline    | `npm run validate`         | Quick confidence for docs, focused code changes, and iterative work before opening a PR.  |
| Canonical release gate | `npm run validate:release` | Full ship gate for changes that affect shipped behavior, release readiness, or CI gating. |

## Release gate contents

`npm run validate:release` runs the following stages in order:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm run guardrails:assets`
6. `npm run test:e2e`
7. `npm run monitor:share-preview`

## When to use each command

| Command                         | Required when                                                                |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `npm run lint`                  | Every change.                                                                |
| `npm run typecheck`             | Runtime, shared JS, or Astro source changes.                                 |
| `npm test`                      | Every behavior change.                                                       |
| `npm run build`                 | Any change that affects shipped output or generated assets.                  |
| `npm run guardrails:assets`     | Images, catalog data, taxonomy, or build-tooling changes.                    |
| `npm run test:e2e`              | Routes, navigation, cart, rendering, service worker, or checkout UX changes. |
| `npm run monitor:share-preview` | SEO, metadata, OG-image, or share-preview changes.                           |

## Notes

- `npm run build` remains the only supported build path.
- `npm run validate` is intentionally lighter than the release gate.
- If the release gate needs to change, update this file, `package.json`, and the
  ADR index together.
