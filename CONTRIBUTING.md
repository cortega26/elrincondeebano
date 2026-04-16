# Contributing to El Rincón de Ébano

## Prerequisites

| Tool    | Version                     | Required for          |
| ------- | --------------------------- | --------------------- |
| Node.js | 22.x                        | All storefront work   |
| npm     | 10.x (bundled with Node 22) | All JS tasks          |
| Python  | 3.12                        | `admin/` tooling only |
| Git     | Any recent                  | Version control       |

Use `nvm use 22` or rely on the [Volta](https://volta.sh/) pin in `package.json` to get the right Node version automatically.

## First-time setup

```bash
npm run bootstrap        # installs root deps + astro-poc deps
npm run build            # verify the baseline build passes
npm test                 # verify the baseline tests pass
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

`validate:release` is the canonical ship gate. It runs:

`lint → typecheck → test → build → guardrails:assets → test:e2e → monitor:share-preview`

Use the lighter baseline during iteration:

```bash
npm run validate
```

For individual steps:

```bash
npm run lint             # ESLint across all JS
npm run typecheck        # tsc --noEmit (root + astro-poc)
npm test                 # node:test (legacy) + Vitest (modern)
npm run build            # preflight pipeline + Astro build
npm run guardrails:assets  # orphan-asset check
```

Full CI equivalents are documented in [AGENTS.md](AGENTS.md#matriz-de-comandos-por-agente).

## Branching and commits

- **Branch format:** `type/slug` — e.g., `feat/cart-persistence`, `docs/adr-service-worker`
- **Commit format:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`, `test:`
- **Change budget:** ≤ 400 net lines per PR (lockfile excluded)

## PR checklist

Before requesting review, verify:

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes (required when touching `src/js/**`)
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] `npm run guardrails:assets` passes (required when touching images or data files)
- [ ] `npm run test:e2e` passes or is explicitly justified as not applicable
- [ ] `npm run monitor:share-preview` passes when SEO/OG/share-preview behavior changes
- [ ] `npm audit --omit=dev` shows no high/critical vulnerabilities
- [ ] Rollback documented (`git revert <sha>` + verification steps)
- [ ] Operational docs updated if behavior changed

See [AGENTS.md](AGENTS.md#checklist-pr-mínimo) for the full machine-readable checklist.

## Key directories

| Path         | Purpose                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| `astro-poc/` | Production Astro storefront — the canonical runtime                         |
| `data/`      | Shared source data (product catalog, categories) — read-only input to build |
| `assets/`    | Shared source images and fonts — read-only input to build                   |
| `src/js/`    | Typed JS modules (cart, logger, analytics) — typecheck-scoped               |
| `test/`      | All unit, contract, guardrail, and integration tests                        |
| `tools/`     | Preflight pipeline scripts run before Astro build                           |
| `scripts/`   | Developer utility scripts (smoke, dev server, image conversion)             |
| `admin/`     | Python GUI for product data management (separate Python runtime)            |
| `docs/`      | All architectural, operational, and decision documentation                  |

For the full data-flow and module-boundary map see [docs/architecture/CODEBASE_MAP.md](docs/architecture/CODEBASE_MAP.md).

## Admin Python tooling (optional)

Only needed if you work on product data management:

```bash
cd admin/product_manager
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python gui.py
```

## Adding a test

- **Complex logic / DOM / async:** Create `test/<name>.spec.js` using **Vitest** (`describe`, `it`, `expect`, `vi`).
- **Simple scripts / legacy coverage:** Create `test/<name>.test.js` using `node:test`.
- **TypeScript:** `.mts` files in `src/` are supported by both runners.

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
4. For SARIF schema issues, apply the `jq` sanitizer documented in [AGENTS.md](AGENTS.md#guardrails-citests).
