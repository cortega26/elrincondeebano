# Phase 6 - Security & Supply-Chain Audit

Role: Application Security Engineer / DevSecOps Reviewer
Scope: supply-chain, CI permissions, service worker security, data integrity, secrets hygiene, and admin tooling boundaries.

## P0 Constraints (from Phase 0/2/4/5)
- None. Phase 2, Phase 4, and Phase 5 report no unresolved P0 items for the current repo state.

## 1. Threat Model (assets, actors, trust boundaries)
Assets
- Source code and workflows (`.github/workflows/*`).
- Build artifacts and public data (`build/`, `data/product_data.json`).
- Service worker caches and update channels (`service-worker.js`).
- Admin tooling source and dependencies (`admin/product_manager`).
- GitHub tokens and CI secrets (`GITHUB_TOKEN`, `CODACY_PROJECT_TOKEN`).

Actors
- Anonymous site visitors (read-only).
- Malicious contributor with repo write access.
- Compromised npm/pip dependency or GitHub Action.
- Admin operator running local tooling.

Trust boundaries
- GitHub Actions runners vs repo (token scope, credentials, cached state).
- Browser vs Service Worker vs network (caching decisions, offline persistence).
- Static site vs admin panel and optional local API.
- Third-party CDNs and registries (npm, PyPI, GitHub Actions Marketplace).

## 2. Findings (ranked by severity/likelihood)
1) High - Workflow tokens default to read/write without explicit permissions in `ci.yml`, `admin.yml`, `product-data-guard.yml`.
- Risk: a compromised dependency or build script can push changes or open attack surface.
- Evidence: workflows lack explicit `permissions` blocks and checkout defaults to persisted credentials.

2) Medium - GitHub Actions are pinned by tag rather than commit SHA.
- Risk: tag retargeting or action compromise can execute attacker code in CI.
- Evidence: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5` are tag-based.

3) Medium - Dependency vulnerability gating is not enforced in CI.
- Risk: known vulnerable npm/pip packages ship without a block.
- Evidence: `npm audit --production` is not run in CI; admin pipeline installs pip deps without hashes.

4) Medium - Images workflow auto-commits to `main`.
- Risk: supply-chain compromise in image tooling or npm deps can introduce unreviewed changes.
- Evidence: `.github/workflows/images.yml` commits and pushes directly using `contents: write`.

5) Medium - Service worker caches same-origin GET responses without honoring `Cache-Control: no-store` or auth headers.
- Risk: future sensitive endpoints or admin assets could be cached and exposed offline/shared-device.
- Evidence: `service-worker.js` caches any successful GET by path category.

6) Low - Admin panel is deployed publicly without authentication.
- Risk: unintended exposure if admin panel ever adds privileged features.
- Evidence: `admin-panel/` is copied into `build/` and served publicly by design.

## 3. Exploit Scenarios (concrete, minimal)
- A compromised npm dependency runs a postinstall in CI, exfiltrates `GITHUB_TOKEN`, and pushes a backdoored JS bundle because the workflow token is read/write.
- A malicious action release for `actions/setup-node@v4` executes arbitrary code during CI and exfiltrates repository data.
- An attacker with brief access to a shared device opens the admin panel; the SW caches assets and they remain available offline for later users.

## 4. Mitigations & Secure Defaults
- Add explicit `permissions: contents: read` to read-only workflows and set `actions/checkout` to `persist-credentials: false` where no push is required.
- Pin GitHub Actions to commit SHAs and use Dependabot to keep pins updated.
- Add CI security checks: `dependency-review-action` for PRs and scheduled `npm audit --production`/`pip-audit` for dependency baselines.
- Require PR-based automation (or protected branch rules) for `images.yml` output to avoid unreviewed pushes.
- Harden the SW cache policy: bypass caching for `/admin-panel/`, for requests with `Authorization` headers, and for responses with `Cache-Control: no-store`.
- Document admin panel exposure, or remove it from production builds if privileged actions ever appear.

## 5. CI Security Hardening
- Permissions: add explicit read-only permissions to CI, admin, and product-data-guard workflows; keep write permissions only in deploy or image workflows that need them.
- Credentials: set `persist-credentials: false` on checkout for non-push workflows.
- Dependency review: add `actions/dependency-review-action` on PRs affecting `package.json`/`package-lock.json`.
- Vulnerability scanning: schedule `npm audit --production` and `pip-audit` for admin tooling; fail on high/critical.
- Action pinning: pin actions to commit SHAs and manage updates via Dependabot.

## 6. PR-ready Security Fix Plan (with tests/verification steps)
PR 1 - CI token scope hardening
- Files: `.github/workflows/ci.yml`, `.github/workflows/admin.yml`, `.github/workflows/product-data-guard.yml`.
- Changes: add explicit `permissions: contents: read`; set `actions/checkout` `persist-credentials: false` where no push is needed.
- Acceptance criteria:
  - Workflows run with read-only token scopes.
  - No steps require write access except deploy/images.
- Verification:
  - Run CI on a PR and confirm no permission errors.

PR 2 - Action pinning + Dependabot for actions
- Files: `.github/workflows/*.yml`, `.github/dependabot.yml`.
- Changes: pin third-party actions by commit SHA; enable Dependabot updates for GitHub Actions and npm.
- Acceptance criteria:
  - Actions are SHA-pinned.
  - Dependabot opens PRs for action updates.
- Verification:
  - Dependabot configuration validates and triggers update PRs.

PR 3 - Dependency security gates
- Files: new `.github/workflows/security-audit.yml`, `.github/workflows/ci.yml`.
- Changes: add `actions/dependency-review-action` for PRs, scheduled `npm audit --production`, and `pip-audit` for admin dependencies.
- Acceptance criteria:
  - High/critical vulnerabilities fail the security job.
  - Dependency review runs on PRs touching lockfiles.
- Verification:
  - Simulate a vulnerable dependency in a test branch and confirm the job fails.

PR 4 - Service worker cache policy hardening
- Files: `service-worker.js`, `test/swCachePolicy.test.js` (new).
- Changes: skip caching for `/admin-panel/`, requests with `Authorization` headers, and responses marked `Cache-Control: no-store`.
- Acceptance criteria:
  - Sensitive responses are never cached.
  - Existing offline behavior for public assets remains unchanged.
- Verification:
  - Unit tests validate bypass rules and caching behavior.

PR 5 - Admin panel exposure guard
- Files: `tools/copy-static.js`, `README.md`.
- Changes: add a build flag to exclude `admin-panel/` from production builds (default on), with explicit opt-in.
- Acceptance criteria:
  - Production builds exclude admin panel unless explicitly enabled.
  - Local/dev builds can include admin panel when requested.
- Verification:
  - `npm run build` produces no `build/admin-panel/**` by default; opt-in flag restores it.
