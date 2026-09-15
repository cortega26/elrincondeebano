# Contributing to El Rincón de Ébano

## Prerequisites

| Tool    | Version              | Required for        |
| ------- | -------------------- | ------------------- |
| Node.js | 24.x                 | All storefront work |
| npm     | bundled with Node 24 | All JS tasks        |
| Git     | Any recent           | Version control     |

Use `nvm use 24` (`.nvmrc`, engines `>=24 <25`) to get the right Node version.

## First-time setup

Start with [docs/onboarding/BOOTSTRAP.md](docs/onboarding/BOOTSTRAP.md).

```bash
npm run bootstrap
npm run validate
```

`bootstrap` is the only supported setup path. Do not run `npm install` or `npm --prefix astro-poc install` manually when a lockfile is present.

## Environment variables

Copy `.env.example` and fill in values before running admin tools or Cloudflare scripts:

```bash
cp .env.example .env
```

See [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md) for the variables required per workflow.

## Canonical validation

Run this before opening a PR:

```bash
npm run validate:release
```

`validate:release` is the canonical ship gate. It runs (plan 191):

`lint → typecheck → check:e2e-selectors → build → test → check:plans → guardrails:assets → test:e2e → monitor:share-preview`

The local `validate` command also runs the E2E selector guard before the test
suite. See the exact executable stages in
[docs/operations/VALIDATION_MATRIX.md](docs/operations/VALIDATION_MATRIX.md).

Use the lighter baseline during iteration:

```bash
npm run validate
```

For individual steps:

```bash
npm run lint             # root JS + dedicated astro-poc lint
npm run typecheck        # Astro check + admin tsc (legacy tree retired, plan 155)
npm test                 # root Vitest + admin Vitest
npm run build            # preflight pipeline + Astro build
npm run guardrails:assets  # orphan-asset check
```

Full CI equivalents are documented in
[docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md#matriz-de-comandos-por-agente).

## Non-functional expectations

- **Performance:** prefer build-time and Astro-native solutions before adding
  more browser runtime work; run `npm run lighthouse:audit` when a change can
  affect rendering, assets, navigation, or critical data fetches.
- **Scalability:** avoid tooling or runtime logic that rescans the full catalog,
  image tree, or route set unnecessarily; prefer indexed, cached, or batched
  approaches.
- **Maintainability:** extend existing commands/modules before creating new
  entry points, apply DRY only to stable shared concepts, and favor simple,
  narrow contracts under the SOLID and KISS guidance.
- **Documentation:** update command, topology, and runbook docs in the same PR
  whenever behavior or ownership changes; follow the
  [documentation policy](docs/operations/DOCUMENTATION.md).
- **AI/API efficiency:** retrieve focused context, preserve cacheable prompt
  prefixes, and measure cost alongside first-pass quality; see
  [AI and API efficiency](docs/operations/AI_EFFICIENCY.md).

See [docs/architecture/ENGINEERING_PRIORITIES.md](docs/architecture/ENGINEERING_PRIORITIES.md)
for the full non-functional guide.

## Branching and commits

- **Branch format:** `type/slug` — e.g., `feat/cart-persistence`, `docs/adr-service-worker`
- **Commit format:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`, `test:`
- **Change budget:** ≤ 400 net lines per PR (lockfile excluded)

## PR checklist

Before requesting review, verify:

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `npm run guardrails:assets` passes (required when touching images or data files)
- [ ] `npm run test:e2e` passes or is explicitly justified as not applicable
- [ ] `npm run monitor:share-preview` passes when SEO/OG/share-preview behavior changes
- [ ] `npm audit --omit=dev` shows no high/critical vulnerabilities
- [ ] Rollback documented (`git revert <sha>` + verification steps)
- [ ] Operational docs updated if behavior changed
- [ ] Performance evidence attached when UX/rendering-critical behavior changed
- [ ] Architecture/ADR docs updated when constraints or ownership changed

See [AGENTS.md](AGENTS.md#checklist-pr-mínimo) for the full machine-readable checklist.

## Key directories

| Path                                | Purpose                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `astro-poc/`                        | Production Astro storefront — the canonical runtime                                            |
| `data/`                             | Shared source data (product catalog, categories) — read-only input to build                    |
| `assets/`                           | Shared source images and fonts — read-only input to build                                      |
| `astro-poc/src/scripts/storefront/` | Typed storefront JS modules (cart, state, observability)                                       |
| `test/`                             | All unit, contract, guardrail, and integration tests                                           |
| `tools/`                            | Preflight pipeline scripts run before Astro build                                              |
| `scripts/`                          | Developer utility scripts (smoke, dev server, image conversion)                                |
| `admin/content-manager/`            | TypeScript Content Manager: Fastify API + React SPA (plan 127; Python admin retired, plan 069) |
| `docs/`                             | All architectural, operational, and decision documentation                                     |

For the full data-flow and module-boundary map see [docs/architecture/CODEBASE_MAP.md](docs/architecture/CODEBASE_MAP.md).

## Content Manager (TypeScript admin)

Product data is managed through the Content Manager (`admin/content-manager/` —
Fastify API + React SPA). The Python/Tkinter admin was retired (plan 069).

```bash
npm run admin:dev      # API dev server (:3000, tsx --watch)
npm run admin:dev:web  # SPA dev server (Vite :5173, HMR)
```

See [admin/content-manager/README.md](admin/content-manager/README.md) for the
full admin workflows (certify, parity, rollback drills).

## Adding a test

- **Storefront unit/contract:** `test/<name>.spec.js` using **Vitest** (`describe`, `it`, `expect`, `vi`) — patterns in `vitest.config.mts`.
- **Admin unit/contract:** `admin/content-manager/test/` using Vitest (see that workspace's README).
- **E2E:** storefront specs in `test/e2e-astro/`, admin specs in `admin/content-manager/test/e2e/` (Playwright; every suite ships its runnable config + script).

Run `npm test` after adding a test to confirm it integrates with the full suite.

## Updating a dependency

1. Check the current version: `npm pkg get dependencies["<package>"]`
2. **Patch / minor:** `npm install <package>@latest --save` and commit the updated lockfile.
3. Run `npm audit --omit=dev`, `npm test`, and `npm run build` — document results in the PR.
4. **Major:** prepare an RFC (scope, breaking changes, validation plan) before opening a PR; do not mix with other changes.

## Debugging CI failures

1. Identify the failed workflow in the GitHub Actions UI.
2. Reproduce locally with `npm ci`, then the specific failing script.
3. See [docs/operations/DEBUGGING.md](docs/operations/DEBUGGING.md) for step-by-step procedures.
4. For SARIF schema issues, apply the `jq` sanitizer in the CI workflows section of [RUNBOOK.md](docs/operations/RUNBOOK.md#flujos-de-trabajo-ci).
