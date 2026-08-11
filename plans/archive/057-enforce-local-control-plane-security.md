# Plan 057: Enforce one authenticated local write boundary

> **Executor instructions**: Implement the boundary before enabling canonical writes.
> Run each verification gate. Do not expose the server beyond loopback and do not
> persist or print generated secrets.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/server admin/content-manager/src/web admin/content-manager/test`
> Stop if startup, hooks, or route registration changed materially.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 056
- **Category**: security / architecture / migration
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F01, F02, F05
- **Reconciled (Auditoría 7, 2026-08-03)**: el núcleo (Steps 1–3) lo ejecuta el plan 071 — ejecutar 071 primero y marcar aquí lo cubierto; este plan conserva Step 4 (sync secrets fuera del repo) y el test de proceso-spawned.

## Why this matters

The documented operator command disables core CRUD and publication, while several
other routes still write. Origin checks are not authentication and headerless local
clients are accepted. Sync credentials are stored in repository data and echoed to
the browser. A single explicit control-plane policy is required before write mode
can safely become canonical.

## Current state

- `src/server/start.ts:15`: `createApp({ repoRoot, logger: true })` omits write mode.
- `src/server/app.ts:48-58`: `enableWrites` defaults false and enables only
  `ProductService`.
- `src/server/app.ts:129-155`: mutation requests without both browser-origin headers
  pass the hook; no launch secret/session is checked.
- `src/server/routes/storefront.ts`, `media.ts`, `changes.ts`, `backup.ts`, and
  `conflicts.ts` contain persistent mutations outside the service-local flag.
- `src/server/app.ts:81-83` stores sync config at `data/sync-config.json`;
  `routes/conflicts.ts:131-177` accepts, persists, and returns `api_token`.
- `start.ts:4-10` already refuses non-loopback hosts; preserve this invariant.

Use Fastify hooks/plugins for cross-cutting policy and shared Zod schemas for API
contracts. Keep preview/validation POSTs explicitly classified as non-mutating.

## Commands you will need

| Purpose       | Command                                                                | Expected on success |
| ------------- | ---------------------------------------------------------------------- | ------------------- |
| Focused tests | `npm -w admin/content-manager run test -- securityHeaders mutationApi` | all pass            |
| Typecheck     | `npm run admin:typecheck`                                              | exit 0              |
| Full manager  | `npm run admin:test && npm run admin:build`                            | exit 0              |
| Regression    | `npm run validate`                                                     | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/app.ts`, `start.ts`
- route registration and all persistent mutation routes under `src/server/routes/`
- new server security/config modules under `src/server/`
- bootstrap/client handling needed to send the launch credential
- focused contract/integration tests
- `.gitignore` only if needed to quarantine legacy sync config

**Out of scope**:

- Internet-facing deployment, multi-user accounts, OAuth, or remote administration.
- Implementing remote sync transport (Plan 064).
- Enabling a real push or mutating production data in tests.

## Git workflow

- Branch: `security/057-admin-control-plane`
- Conventional commit: `fix(admin): enforce authenticated write policy`.
- Do not push unless instructed.

## Steps

### Step 1: Inventory and classify every route

Create one machine-readable route policy distinguishing read, preview, and persistent
mutation. Apply a Fastify pre-handler to all persistent mutations. Eliminate route-
local interpretations of `enableWrites`; services may retain defense-in-depth checks.

**Verify**: a parameterized test enumerates every registered POST/PATCH/PUT/DELETE
and proves write-disabled mode rejects persistence while preview endpoints remain usable.

### Step 2: Add a per-launch credential

Generate a high-entropy secret in memory at startup, expose it to the local browser
through a one-time bootstrap mechanism that does not put it in logs, URLs, repository
files, or durable browser storage, and require it for all mutation requests. Continue
to enforce loopback binding and same-origin browser protections.

**Verify**: mutation tests cover absent, wrong, correct, rotated-after-restart, cross-
origin, and headerless-client cases. Reads remain accessible locally.

### Step 3: Make canonical write mode deliberate

Define explicit startup modes such as `operator` and `read-only`; reject ambiguous or
invalid values. Make `npm run admin:start` use the documented operator mode only after
the guard and credential exist. Surface current mode safely in bootstrap/health and UI.

**Verify**: a spawned-process test proves the real canonical command can persist an
authorized mutation in a temporary repo and rejects the same request in read-only mode.

### Step 4: Remove repository-stored sync secrets

Split non-secret sync settings from credentials. Read the bearer token from an
environment variable or OS credential provider, return only `token_configured`, and
never echo the token. Ignore/quarantine the legacy file and document rotation if a real
token was ever stored or shared; do not copy any token value into tests or docs.

**Verify**: tests prove API responses and repository JSON contain no token; secret-scan
passes and runtime configuration still reports configured/unconfigured state.

## Test plan

- Model after `test/integration/mutationApi.test.ts` and `securityHeaders.test.ts`.
- Cover every mutation route in both modes, including backup restore, media upload,
  import apply, storefront, conflict changes, sync config, and publication.
- Add process-level startup tests with a disposable `REPO_ROOT`.
- Add response/log/file assertions that the credential and sync token never appear.

## Done criteria

- [ ] One central policy protects every durable mutation.
- [ ] Canonical operator mode writes; read-only mode cannot alter any repository file.
- [ ] Every mutation requires a valid per-launch credential.
- [ ] Loopback refusal remains enforced.
- [ ] Sync tokens are neither repository-persisted nor returned.
- [ ] Focused tests, `admin:typecheck`, `admin:test`, `admin:build`, and root `validate` pass.

## STOP conditions

- The credential design requires a token in query strings or committed/static assets.
- A route's mutating status cannot be determined without a product decision.
- Enabling writes would precede complete route-policy coverage.
- Existing repository data contains an apparent real token: report location and require
  rotation; never reproduce it.

## Maintenance notes

Any future mutation route must declare its policy and appear in the enumeration test.
Origin checks remain defense in depth, not a substitute for the launch credential.
