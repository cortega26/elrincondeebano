# Plan 055: Build and cut over to a parallel TypeScript Content Manager

> **Executor instructions**: This is the authoritative umbrella plan for the
> TypeScript Content Manager migration. It authorizes a new parallel application,
> not a big-bang replacement. No phase may remove or disable the Python/Tkinter
> manager until the cutover gates in this plan pass and the maintainer explicitly
> approves retirement.
>
> **Drift check**: before every phase, run:
>
> ```bash
> git diff --stat 30dbab7..HEAD -- \
>   admin/product_manager admin/web server data astro-poc/src/lib \
>   tools package.json package-lock.json .github/workflows docs plans
> git status --short
> ```
>
> Reconcile live code and preserve unrelated local work. The repository was dirty
> when this plan was written.

## Status

- **Priority**: P1
- **Effort**: XL, delivered as independently reversible slices
- **Risk**: HIGH
- **Category**: migration / product architecture
- **Planned at**: commit `30dbab7`, 2026-07-15
- **Depends on**:
  - the catalog-authority decision and round-trip evidence from plan 036;
  - the characterization baseline from plan 039, already marked DONE;
  - explicit maintainer approval before production cutover and Python retirement.
- **Absorbs or supersedes for new implementation**:
  - plan 050's Python/Tk presenter extraction;
  - plan 051's Python staged-change implementation;
  - plan 052's Tk workspace redesign;
  - plan 054's Tk conflict-center implementation.
- **Carries forward as TypeScript acceptance requirements**:
  - plans 040–047 and 053: full-state bulk edits, transactional media,
    identity-safe reorder, durable conflicts, one discount rule, safe publication,
    non-blocking operations, typed configuration, and stable content identity.

## Executive decision

Build a separate local-first application using:

- TypeScript 7 in strict ESM mode;
- Fastify as the localhost HTTP/API and job-orchestration boundary;
- React with React Router Data Mode and Vite for the browser workspace;
- Zod as the canonical runtime schema and type-inference boundary;
- Vitest for domain, repository, API, and component tests;
- Playwright for critical browser workflows;
- the repository's canonical JSON and asset inputs, not SQLite, as the content
  authority unless plan 036's accepted ADR decides otherwise.

The first supported deployment is a single-user process bound to loopback. Fastify
serves the built SPA and API from one origin. Electron, Tauri, remote hosting,
multi-user collaboration, and a database are separate decisions and are not needed
to retire Tkinter.

TypeScript 7.0 is a released native compiler. The new workspace may adopt it before
the repository root only if the lockfile proves that root TypeScript 6 and workspace
TypeScript 7 resolve deterministically. Keep a documented TS6 compatibility command
until ESLint, Astro, Vite, Vitest, and editor behavior pass the TS7 compatibility
gate; then upgrade the root in a separate, reversible PR.

## Why this matters

The active manager is no longer a small desktop form. It owns product/category CRUD,
bulk operations, media handling, storefront bundles and favorites, import/export,
history, optional sync/conflicts, Git status, validation, generated artifacts, and
publication. Its UI concentrates these workflows in a large Tk controller, mixins,
and modal applications. Continuing a visual redesign in Tk would preserve the
platform and testing constraints the migration is intended to remove.

The repository also contains a Streamlit/SQLite prototype with an incompatible
SKU-based model and two export destinations. It must not become an intermediate
authority. A parallel TypeScript app provides a clean boundary while keeping the
working Python application available for comparison and rollback.

## Success definition

The migration succeeds when an operator can use the TypeScript application for the
complete browse -> edit -> review -> validate -> publish workflow and:

1. canonical content round-trips without dropped or reinterpreted fields;
2. every mutation is validated, revision-checked, atomic, backed up, and auditable;
3. media and content mutations commit or roll back as one staged operation;
4. unrelated Git changes can never enter a Content Manager publication;
5. failures and conflicts remain visible and retryable after restart;
6. keyboard-only and screen-reader workflows cover all critical tasks;
7. the TypeScript and Python managers produce equivalent canonical output for the
   agreed compatibility corpus;
8. cutover can be reversed without data migration or repository repair;
9. Python/Tk and Streamlit are retired only after an explicit acceptance window.

## Scope

### In scope

- a new npm workspace under `admin/content-manager/`;
- shared TypeScript domain schemas and commands;
- a Fastify server bound to loopback;
- a React task-oriented workspace;
- canonical JSON/category/storefront repositories;
- staged drafts, media intents, validation evidence, and publication manifests;
- optional remote sync and a durable conflict center, if the current sync contract
  remains supported;
- Git/build/generation jobs through allowlisted subprocess adapters;
- import/export compatible with canonical repository formats;
- typed settings, structured local logs, health diagnostics, and recovery;
- Vitest projects, Playwright E2E, contract fixtures, CI, docs, and cutover tooling;
- final retirement of `admin/product_manager/` and `admin/web/` only after approval.

### Out of scope

- changing storefront presentation or shopper behavior;
- moving canonical content to SQLite, PostgreSQL, or a hosted CMS;
- editing real catalog data or real assets as a test fixture;
- exposing the admin service beyond loopback;
- multi-user permissions, collaborative locks, or cloud identity;
- automatic production deployment from tests or CI;
- Electron/Tauri packaging before localhost-browser operation is accepted;
- rewriting root build scripts when a typed adapter can invoke the canonical command;
- preserving Tkinter-specific layout, theme implementation, or widget behavior.

## Non-negotiable invariants

1. **One authority**: `data/` and documented manager-owned Astro configuration are
   authoritative inputs; generated/public copies are outputs.
2. **One schema owner**: Zod schemas define runtime validation and inferred TS types.
   Do not hand-maintain matching interfaces.
3. **No shadow store**: no SQLite cache or second mutable catalog during migration.
4. **No direct UI I/O**: React components never access files, Git, subprocesses, or
   secrets; all effects cross typed application commands.
5. **Optimistic concurrency**: every write names its base revision and stable entity
   identity. Stale writes return `409`, never last-write-wins silently.
6. **Atomic persistence**: lock -> validate -> stage temp files -> fsync -> atomic
   replace -> verify. On failure, canonical inputs remain unchanged.
7. **Scoped publication**: preview, validation, staging, commit, and result use one
   exact manifest of manager-owned paths.
8. **Idempotent mutation**: every mutating command includes a client-generated
   operation/change-set ID; retries cannot apply twice.
9. **Recoverable work**: drafts, failed jobs, and unresolved conflicts survive restart.
10. **Local security boundary**: loopback only, per-launch secret, same-origin checks,
    path sandboxing, safe subprocess argument arrays, and redacted logs.
11. **No premature deletion**: Python remains runnable until the retirement phase.
12. **Small reversals**: each implementation PR has one feature slice and a documented
    `git revert <sha>` rollback.

## Target repository structure

```text
admin/content-manager/
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── shared/
│   │   ├── schemas/          # Zod schemas; inferred domain/API types
│   │   ├── commands/         # Versioned command/result envelopes
│   │   ├── errors/           # Stable machine codes + safe messages
│   │   └── test-fixtures/    # Synthetic compatibility corpus only
│   ├── domain/
│   │   ├── products/
│   │   ├── categories/
│   │   ├── storefront/
│   │   ├── media/
│   │   ├── changes/
│   │   ├── conflicts/
│   │   └── publication/
│   ├── server/
│   │   ├── app.ts            # Fastify factory; no listen side effect
│   │   ├── start.ts          # loopback listener and browser launch
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── jobs/
│   │   ├── adapters/         # fs, Git, npm tools, remote sync
│   │   ├── security/
│   │   └── observability/
│   └── web/
│       ├── app/
│       ├── routes/
│       ├── features/
│       ├── components/
│       ├── api/
│       ├── state/
│       ├── styles/
│       └── accessibility/
├── test/
│   ├── contract/
│   ├── integration/
│   ├── browser/
│   └── e2e/
└── scripts/
    ├── parity-report.ts
    ├── shadow-verify.ts
    └── doctor.ts
```

Use feature modules with explicit public exports. Do not recreate a generic
`controllers/services/repositories` directory that hides ownership; HTTP routes
adapt feature commands, domain services own rules, and repositories own persistence.

## Dependency direction

```text
React route/component
        |
        v
typed API client ---- shared schemas/command envelopes
        |                         ^
        v                         |
Fastify route -> application service -> domain policy
                                      |
                                      v
                      repository / media / Git / sync adapters
```

- Domain modules may import `shared`, never Fastify, React, Node filesystem, or Git.
- Repositories may import domain schemas and narrow filesystem abstractions.
- Fastify routes parse/authorize/translate only; no business rule belongs in a route.
- React routes own loading/error/pending composition; reusable components stay unaware
  of URLs and persistence.
- Jobs call the same application services as request handlers; no duplicate rules.

## Runtime and toolchain decisions

| Concern         | Decision                                                               | Gate                                                            |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| Runtime         | Node 24.x, matching repository policy                                  | `node -v` is `24.x`                                             |
| Compiler        | TypeScript 7 strict mode, ESM                                          | TS7 typecheck and emitted declarations agree with tests         |
| TS6 fallback    | Retain only during compatibility phase                                 | removed after root/tooling compatibility PR                     |
| HTTP            | Fastify, one local process                                             | factory tested with `inject`; listener binds `127.0.0.1`        |
| UI              | React + React Router Data Mode, CSR                                    | no SSR/RSC requirement; route errors/pending states tested      |
| Build           | Vite                                                                   | deterministic production build                                  |
| Schemas         | Zod                                                                    | types inferred; fixtures rejected on deliberate contract damage |
| State           | server state via route loaders/fetchers; local ephemeral UI state only | no duplicate global cache unless proven necessary               |
| Tests           | Vitest projects + Playwright                                           | unit/integration/browser/E2E gates below                        |
| Styling         | local design tokens and CSS modules or scoped CSS                      | no storefront CSS dependency                                    |
| Package manager | existing npm workspaces/lockfile                                       | `npm ci` from repository root                                   |
| Persistence     | canonical JSON plus atomic staged files                                | lossless parity and failure-injection tests                     |
| Distribution    | localhost browser launched by npm command                              | packaging deferred                                              |

Avoid adding Redux, a DI container, an ORM, GraphQL, WebSockets, or a component
library in the scaffold. Add one only when a documented use case cannot be expressed
cleanly with React Router, plain constructors/factories, HTTP polling/SSE for jobs, and
the existing design tokens.

## Canonical data ownership

Plan 036 must turn this table into an accepted ADR before write endpoints are enabled.
The default decision is:

| Data                                 | Authority                                                       | TypeScript behavior                                      |
| ------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| Products                             | `data/product_data.json`                                        | read/write with revision and complete-field preservation |
| Categories                           | `data/category_registry.json` and documented legacy adapter     | mutate one authority; generate compatibility form        |
| Storefront bundles                   | documented file currently consumed by Astro                     | preserve exact key casing and ordering contract          |
| Featured staples/experience          | `astro-poc/src/data/storefront-experience.json` if ADR confirms | patch owned subsection without rewriting unrelated keys  |
| Product media                        | canonical paths under `assets/images/`                          | stage intents, validate paths, then atomically apply     |
| Generated AVIF/OG/category artifacts | generated outputs                                               | invoke canonical tools; never hand-edit output           |
| Change history                       | versioned local manager state or existing canonical change log  | append-only, schema-versioned, restart-safe              |
| User settings                        | one manager-specific local settings file                        | typed, atomic, forward-compatible, never committed       |
| `astro-poc/public/data/`             | generated build output                                          | never an independent export destination                  |
| `data/storefront.db`                 | non-authoritative prototype artifact                            | never read/write in the new app                          |

No write-capable phase starts until representative fixtures containing every optional
field can round-trip through Python, TypeScript, and Astro validation without loss.

## Domain contracts

### Product identity

Implement plan 053 as a compatibility-first domain migration:

- add an opaque immutable ID; do not reuse name, description, slug, SKU, or array index;
- preserve legacy name/description lookup as a temporary read adapter;
- generate deterministic dry-run mappings and collision reports before real rewrites;
- never silently manufacture different IDs on separate machines;
- update bundles, favorites, history, sync, selection, and reorder references together;
- keep an alias/deprecation window until all compatibility fixtures and live dry runs pass.

### Revision and command envelope

Every mutation carries:

```text
command_id     UUID/opaque idempotency key
entity_id      stable content identity
base_revision  revision observed by the editor
issued_at      ISO timestamp for audit, not conflict authority by itself
payload        schema-versioned requested change
```

Every result returns:

```text
command_id, status, resulting_revision, changed_fields,
validation_issues, conflicts, warnings, audit_reference
```

Malformed HTTP payloads return `400`; authentication/session failure `401`; forbidden
origin/path/operation `403`; missing entity `404`; stale revision or duplicate identity
`409`; valid shape that violates domain policy `422`; unexpected failure `500` with a
correlation ID and no internal path/stack in the response.

### Change-set lifecycle

Use one tested state machine:

```text
draft -> validating -> validated -> publishing -> published
   |         |             |             |
   v         v             v             v
discarded   draft         draft         failed -> publishing
```

- Illegal transitions fail without mutation.
- A draft includes field operations, category/storefront operations, media intents,
  generated artifacts, base revisions, validation evidence, and publication status.
- Draft persistence is versioned and atomic.
- Validation evidence is invalidated whenever an owned input changes.
- `published` is terminal; retry creates/uses an explicit failed publication attempt.
- Discard never deletes original or already-published media.

## Initial API surface

The exact schemas belong beside routes and are generated into the typed client. The
route inventory below is the maximum initial surface; omit endpoints until their phase.

### System and session

| Method | Route                   | Purpose                                                 |
| ------ | ----------------------- | ------------------------------------------------------- |
| GET    | `/api/v1/health`        | process, schema, repo-root, lock and dependency health  |
| GET    | `/api/v1/bootstrap`     | session-safe capabilities, revisions, navigation counts |
| GET    | `/api/v1/diagnostics`   | redacted operator diagnostics                           |
| POST   | `/api/v1/session/close` | graceful local shutdown when launched by manager        |

### Products and taxonomy

| Method     | Route                           | Purpose                                      |
| ---------- | ------------------------------- | -------------------------------------------- |
| GET        | `/api/v1/products`              | paginated/filterable list with revision      |
| GET        | `/api/v1/products/:id`          | complete editor record                       |
| POST       | `/api/v1/products`              | create with stable ID and command ID         |
| PATCH      | `/api/v1/products/:id`          | partial domain update with base revision     |
| POST       | `/api/v1/products/:id/archive`  | reversible archive command                   |
| POST       | `/api/v1/products/reorder`      | identity-based order command                 |
| POST       | `/api/v1/products/bulk/preview` | validate and display exact bulk result       |
| POST       | `/api/v1/products/bulk/apply`   | apply approved preview/change set            |
| GET        | `/api/v1/categories`            | groups, categories, subcategories, metadata  |
| POST/PATCH | `/api/v1/categories...`         | explicit group/category/subcategory commands |
| POST       | `/api/v1/categories/reorder`    | identity-based taxonomy order                |

### Storefront, media, changes, and conflicts

| Method    | Route                              | Purpose                                              |
| --------- | ---------------------------------- | ---------------------------------------------------- |
| GET/PUT   | `/api/v1/storefront/bundles`       | validated bundle editing                             |
| GET/PUT   | `/api/v1/storefront/featured`      | validated featured-item editing                      |
| GET       | `/api/v1/media`                    | inventory, missing/orphaned/generated/pending status |
| POST      | `/api/v1/media/intents`            | stage upload/move/remove/generate intent             |
| DELETE    | `/api/v1/media/intents/:id`        | discard pending intent                               |
| GET/POST  | `/api/v1/change-sets`              | list/create recoverable drafts                       |
| GET/PATCH | `/api/v1/change-sets/:id`          | inspect/update a draft                               |
| POST      | `/api/v1/change-sets/:id/validate` | run full validation and capture evidence             |
| POST      | `/api/v1/change-sets/:id/discard`  | safely discard draft                                 |
| GET       | `/api/v1/conflicts`                | unresolved/failed/resolved conflict history          |
| POST      | `/api/v1/conflicts/:id/resolve`    | choose local/server/manual field values              |
| POST      | `/api/v1/conflicts/:id/retry`      | idempotent resolution retry                          |

### Publication and jobs

| Method | Route                          | Purpose                                        |
| ------ | ------------------------------ | ---------------------------------------------- |
| POST   | `/api/v1/publications/preview` | branch, remote, exact paths, diff, validations |
| POST   | `/api/v1/publications`         | start approved publication job                 |
| GET    | `/api/v1/jobs/:id`             | progress/result/correlation ID                 |
| POST   | `/api/v1/jobs/:id/cancel`      | cooperative cancellation where safe            |
| GET    | `/api/v1/history`              | redacted audit events and change references    |

Long-running jobs use polling first. Adopt server-sent events only if polling creates a
measured UX problem. Do not add WebSockets for status alone.

## Feature parity matrix

Each row needs a synthetic fixture, an automated behavior test, and operator acceptance.
Tk layout parity is irrelevant; outcome and recovery parity are required.

| Capability           | Python source behavior                             | TypeScript acceptance                                                |
| -------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Browse/search/filter | product list, category/price/stock/archive filters | equivalent results, URL-restorable filters, accessible table/gallery |
| Create/edit/archive  | product form and inline edits                      | complete fields preserved, shared validation, stale edit blocked     |
| Gallery/list         | two Tk views                                       | responsive collection plus inspector; selection preserved            |
| Reorder              | drag/drop and commands                             | stable-ID ordering under filters/sorts                               |
| Bulk operations      | preview, apply, undo/redo                          | no metadata loss; persisted staged inverse or explicit draft discard |
| Categories           | groups/categories/subcategories CRUD/reorder       | canonical registry validation and product reassignment safety        |
| Bundles              | storefront bundle dialogs                          | stable references, duplicate/invalid reference detection             |
| Featured items       | experience-file dialog                             | owned-subtree patch preserving unrelated JSON                        |
| Media                | choose/copy/convert/fallback/gallery               | staged operations, safe paths, cancel/recovery, no orphan on failure |
| Import               | preview/merge/apply                                | dry-run report, complete-field preservation, explicit conflicts      |
| Export               | canonical formats                                  | one authority only; no direct export to generated public data        |
| History              | snapshots/change history                           | append-only audit references, before/after safe display              |
| Undo/redo            | bulk in-memory stacks                              | change-set-aware reversible drafts; restart behavior documented      |
| Sync                 | optional queue/push/pull                           | secure transport, idempotency, revision-aware retry                  |
| Conflicts            | field evidence                                     | durable actionable center; viewing never clears evidence             |
| Git status           | branch/ahead/behind/dirty/conflicts                | non-blocking job, exact owned-path status                            |
| Validate/build       | category/image/OG/build tools                      | allowlisted commands, captured structured results                    |
| Publish              | commit/push workflow                               | exact manifest, preflight before Git mutation, truthful outcome      |
| Preferences          | several local config writers                       | one typed atomic store and precedence model                          |
| Help/diagnostics     | embedded help/status                               | task-oriented help, recovery steps, redacted doctor report           |

## UX information architecture

Persistent destinations:

1. **Products** — saved filters, table/gallery, inspector, create/edit/archive.
2. **Categories** — groups, categories, subcategories, ordering, usage warnings.
3. **Storefront** — bundles, featured content, reference health.
4. **Media** — selected product media, pending intents, missing/orphaned/generated assets.
5. **Changes** — draft operations, exact diff, validation issues, conflicts, discard/retry.
6. **Publish** — repository state, owned manifest, generated artifacts, preflight, commit/push.

Global header: current repo/environment, global search/command entry, draft count,
validation state, Git/sync health. Use an inspector rather than modal chains for routine
editing. Modal dialogs are reserved for destructive confirmation and short focused
creation tasks.

Accessibility target is WCAG 2.2 AA for the supported browser: semantic landmarks,
real labels, logical headings, keyboard-visible focus, no keyboard traps, error summary
plus field association, live regions for job state, reduced motion, non-color status,
scalable text, and tested table/inspector focus restoration.

## Security model

This application can mutate files and execute Git/build commands, so localhost is not
an authentication strategy by itself.

### Required controls

- bind explicitly to `127.0.0.1`; fail startup if configuration requests a public host;
- choose an ephemeral port by default and print/open the exact URL;
- generate a high-entropy per-launch secret, place it in an HttpOnly `SameSite=Strict`
  session cookie through a one-time bootstrap URL, then remove it from the address;
- reject missing/invalid `Origin` and `Sec-Fetch-Site` on mutations;
- restrict CORS to the one generated same-origin address; never `origin: true` or `*`;
- install strict security headers and a CSP compatible with the built SPA;
- enforce JSON/body/upload limits and reject unexpected content types;
- resolve every filesystem path against configured repo roots, reject traversal,
  symlink escapes, device files, and unsupported extensions;
- store uploads in a private staging directory and validate type from content, not name;
- invoke only enumerated binaries/subcommands with argument arrays and `shell: false`;
- never accept arbitrary command, cwd, ref, remote, or path strings from the client;
- redact tokens, cookies, authorization, paths containing usernames, and content payloads
  from info logs; keep stack traces local and restricted;
- serialize content mutation and publication jobs; expose conflicts rather than racing;
- use timeouts and cooperative cancellation; never kill during an atomic replace;
- refuse publication with unrelated staged files, merge conflicts, unexpected branch,
  invalid data, or dirty generated outputs outside the manifest;
- run dependency audit, secret scan, and targeted security tests in CI.

### Remote-hosting STOP rule

If the manager must become remotely reachable, stop this plan before deployment. A
separate threat model must choose identity, authorization roles, TLS termination,
session revocation, CSRF protection, secrets management, audit retention, concurrency,
and deployment isolation. Do not bolt JWTs onto the localhost design.

## Persistence and recovery design

### Read path

1. Acquire a shared/read-compatible lock where supported.
2. Read bytes and parse JSON.
3. Validate full document schema and cross-file references.
4. Compute a content revision/hash from canonical bytes.
5. Return immutable domain values plus revision.

### Write path

1. Validate session, command ID, base revision, and payload.
2. Acquire the single mutation lock.
3. Re-read and compare the canonical revision.
4. Apply the domain command in memory without dropping unknown compatible fields.
5. Validate the complete resulting document and cross-file invariants.
6. Prepare content, media, and audit records in a private transaction directory.
7. Create a timestamped backup/reference manifest.
8. fsync staged files and directories where supported.
9. Atomically replace canonical files in a deterministic order with recovery journal.
10. Verify hashes and append/close the change-set record.
11. On any failure, restore or leave originals, mark recovery required, and block new
    writes until `doctor` proves a consistent state.

Test failure injection at every numbered boundary. Do not claim multi-file atomicity
without a recovery journal and restart tests.

## Test strategy

### Vitest projects

| Project      | Environment                           | Responsibility                                                           |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------ |
| `domain`     | Node                                  | schemas, invariants, IDs, reducers/state machines, pure commands         |
| `repository` | Node + temp dirs                      | locks, atomic writes, backups, revision conflicts, recovery              |
| `server`     | Node                                  | Fastify `inject`, auth/origin, routes, errors, jobs, shutdown            |
| `web`        | browser mode with Playwright provider | real browser component interactions and accessibility states             |
| `contract`   | Node                                  | Python/TS/Astro fixture parity and generated client/schema compatibility |

Use Vitest Browser Mode with the Playwright provider for interactive components rather
than relying only on jsdom event simulation. Keep full workflow automation in the
existing Playwright runner so browser tests do not duplicate E2E responsibilities.

### Required suites

- schema acceptance/rejection and type-level assertions;
- property tests for normalization, ordering, identity, price/discount boundaries;
- golden round trips for every product/category/storefront optional field;
- differential tests that feed the same synthetic input to Python and TypeScript;
- repository failure injection: lock timeout, ENOSPC/write error, malformed JSON,
  interrupted journal, backup failure, replace failure, restart recovery;
- API contract tests for every status/error envelope and idempotent retry;
- security tests for missing token, cross-origin mutation, traversal, symlink escape,
  oversized body, unexpected MIME, arbitrary command injection, log redaction;
- component tests for loading/empty/error/dirty/stale/conflict/job states;
- keyboard and accessible-name tests for every critical route;
- E2E: browse/edit/reload, bulk preview/apply, taxonomy change, media cancel/failure,
  draft restart, stale conflict, validation failure, publication preview/cancel,
  commit-only success, push failure, and recovery;
- mutation testing on discount, identity, revision, publication result, and change-set
  state-machine policies.

### Coverage policy

Use coverage as a floor, not proof:

- domain policies and state transitions: 95% lines, 90% branches;
- repositories/publication/security adapters: 90% lines, 85% branches;
- route handlers and API client: 85% lines, 80% branches;
- UI feature logic: 80% lines, 75% branches;
- no threshold exemption for a critical untested error branch;
- generated code, type-only declarations, and trivial composition may be excluded only
  through reviewed config, never inline coverage-ignore comments added to pass a gate.

## Proposed commands

Add these root commands with local reproduction parity:

```json
{
  "admin:dev": "npm -w admin/content-manager run dev",
  "admin:build": "npm -w admin/content-manager run build",
  "admin:start": "npm -w admin/content-manager run start",
  "admin:typecheck": "npm -w admin/content-manager run typecheck",
  "admin:test": "npm -w admin/content-manager run test",
  "admin:test:coverage": "npm -w admin/content-manager run test:coverage",
  "admin:test:e2e": "npm -w admin/content-manager run test:e2e",
  "admin:parity": "npm -w admin/content-manager run parity",
  "admin:doctor": "npm -w admin/content-manager run doctor",
  "admin:validate": "npm run admin:typecheck && npm run admin:test && npm run admin:build && npm run admin:parity"
}
```

Names may change to avoid collisions, but one canonical root entry point must exist for
development, validation, parity, and diagnostics. Integrate `admin:validate` into the
root fast/release matrix only after runtime is reasonable and documented.

## CI design

Create a dedicated Content Manager workflow or replace the current admin-web job only
after the new workspace exists.

### Pull-request gate

1. checkout with pinned action SHA and no persisted credentials;
2. install Node 24 and run root `npm ci`;
3. lint only changed/owned TS/TSX plus shared root policy;
4. run TS7 typecheck; temporarily run TS6 compatibility check during bootstrap;
5. run Vitest domain/repository/server/contract projects with coverage;
6. build the SPA/server deterministically;
7. run Playwright component/E2E smoke on synthetic temp repo;
8. run parity report against frozen Python fixtures;
9. run `npm audit --omit=dev`, secret scan, and relevant SAST;
10. upload coverage/parity/E2E artifacts with no catalog contents or credentials.

### Scheduled/release gate

- full Playwright matrix on supported Chromium and one secondary engine;
- mutation suites for critical domain policies;
- clean-repo publication rehearsal against a temporary bare remote;
- deterministic build comparison;
- dependency and license review;
- recovery corpus including simulated interrupted writes.

CI must never use real `data/`, real user settings, the developer Git index, or a real
remote. Every test gets an explicit temporary repo root and deny-by-default adapters.

## Delivery phases

Each phase is one or more small PRs. A later phase may be designed while the previous
one is reviewed, but mutation-capable phases merge in order.

### Phase 0 — Authority, inventory, and frozen compatibility corpus

**Deliverables**

- complete plan 036 ADR and field/write-path matrix;
- inventory every Python feature, canonical file, generated file, command, setting,
  identity consumer, sync field, and error/recovery behavior;
- create synthetic fixtures containing all optional fields, Unicode, archive/out-of-
  stock/free-discount cases, nested taxonomy, bundles, featured items, revisions,
  conflicts, and media paths;
- capture Python outputs and Astro validation as golden compatibility evidence;
- decide stable ID format, migration aliases, collision handling, and rollback.

**Exit gate**

- authority ADR accepted;
- deliberate field loss fails a contract test;
- no fixture reads or writes production catalog/assets;
- parity matrix has an owner and test for every row.

**Rollback**: docs/tests only; revert the phase commit.

### Phase 1 — Workspace and TypeScript 7 compatibility

**Deliverables**

- create the npm workspace, strict ESM tsconfig, Vite/Vitest/Playwright configs;
- add Fastify app factory with health route and graceful shutdown;
- add React shell with router-level error and loading states;
- prove TS7, ESLint, Vite, Vitest, React JSX, source maps, coverage, and npm workspaces;
- generate a compatibility report versus root TS6; do not upgrade root incidentally;
- add root commands and minimal CI without replacing Python CI.

**Exit gate**

- root `npm ci` is deterministic;
- `admin:typecheck`, unit smoke, build, and health `inject` test pass;
- server refuses non-loopback binding;
- Python/Tk remains untouched and runnable.

**Rollback**: remove workspace/root command/workflow additions only.

### Phase 2 — Shared schemas and read-only repositories

**Deliverables**

- Zod schemas for product, category, storefront, revisions, settings, API envelopes;
- inferred types and schema-versioning policy;
- read-only repository adapters for canonical files;
- complete validation issue model with file/entity/field/action metadata;
- read-only products/categories/storefront APIs and generated typed client;
- Products and Categories read-only React routes.

**Exit gate**

- every compatibility fixture loads or fails identically to the accepted contract;
- read-only requests cannot mutate mtimes, files, Git index, or local settings;
- API pagination/filter results match Python behavior;
- loading/empty/malformed/unavailable states pass browser tests.

**Rollback**: disable/remove the read-only workspace; no data change exists.

### Phase 3 — Stable identities and mutation kernel

**Deliverables**

- implement plan 053 dry-run identity design and collision report;
- command envelopes, idempotency store, mutation lock, revision/hash checks;
- atomic single-file repository writer with backups and recovery journal foundation;
- create/edit/archive product commands behind a disabled-by-default feature flag;
- mutation audit records with redaction.

**Exit gate**

- mixed legacy/new fixture catalogs round-trip losslessly;
- rename preserves identity;
- stale revision returns `409` without writes;
- repeated command ID returns the original result without a second mutation;
- injected failures leave the source unchanged and recoverable;
- maintainer approves enabling writes on a disposable repo only.

**Rollback**: turn off mutation flag; restore compatibility fixtures; no live rewrite.

### Phase 4 — Product workspace and bulk/reorder parity

**Deliverables**

- collection/table/gallery, filters, saved URL state, inspector, create/edit/archive;
- shared product validation including one discount invariant;
- identity-based reorder under filters/sorts;
- bulk preview/apply preserving every product field;
- draft-aware inverse/discard behavior replacing fragile in-memory undo assumptions;
- accessibility and keyboard workflow for all product tasks.

**Exit gate**

- plans 040, 042, and 044 behaviors pass in TypeScript;
- differential Python/TS output is semantically identical on fixtures;
- no action writes until the operator reviews an exact change preview;
- reload/restart preserves or clearly discards work according to the contract.

**Rollback**: feature flag product mutations off; read-only route remains useful.

### Phase 5 — Categories and storefront content

**Deliverables**

- nav-group/category/subcategory CRUD and reorder;
- product-use checks, reassignment preview, slug/key uniqueness, disabled states;
- bundle and featured-content editors using stable product references;
- cross-file validation and exact owned-subtree writes;
- compatibility generation only through canonical repository tools.

**Exit gate**

- category and storefront golden fixtures round-trip without key/order loss;
- deleting in-use taxonomy requires explicit safe reassignment;
- unknown/archived references are actionable validation issues;
- generated/public data is never treated as input authority.

**Rollback**: disable taxonomy/storefront writes; product path remains independent.

### Phase 6 — Transactional media workspace

**Deliverables**

- sandboxed upload/staging directory and media inventory;
- typed intents for add/copy/move/convert/generate/remove;
- previews for original, AVIF/fallback, variants, and final paths;
- multi-file recovery journal connecting media intents to change sets;
- orphan/missing/path/format validation and canonical generator adapters;
- Media route with pending, failed, missing, orphaned, and generated views.

**Exit gate**

- plan 041 cancel/failure guarantees pass;
- traversal, symlink, MIME spoof, oversized input, encoder failure, and ENOSPC tests pass;
- no original media is deleted on draft discard or failed publication;
- restart recovers or blocks safely at every injected boundary.

**Rollback**: disable media intents; staged private files can be discarded by doctor.

### Phase 7 — Durable change sets, import, and history

**Deliverables**

- complete draft state machine and versioned persistence;
- exact diff grouped by products/categories/storefront/media/generated artifacts;
- import parse -> normalize -> preview -> conflict -> apply workflow;
- append-only audit/history views and recovery actions;
- validation evidence invalidation and restart behavior;
- safe draft discard and published-change immutability.

**Exit gate**

- plan 051 requirements pass in TypeScript;
- all state transitions and restarts are tested;
- import cannot silently drop unknown/optional fields;
- malformed/stale imports remain reviewable without canonical mutation.

**Rollback**: disable change-set mutation; preserve journals for read-only diagnosis.

### Phase 8 — Sync and actionable conflicts

**Deliverables**

- decide whether optional remote sync is retained; remove it from parity only through
  an explicit product decision and documentation update;
- secure transport/config schema and idempotent sync adapter;
- durable conflict lifecycle with immutable base/local/server snapshots;
- per-field local/server/manual resolution, validation, retry, and audit;
- Changes/Conflict Center filters for unresolved, failed, and resolved work.

**Exit gate**

- viewing a conflict never clears or mutates it;
- failed retry preserves evidence and selections;
- duplicate retries are idempotent;
- unsupported remote resolution stops safely and documents the required API contract;
- plans 043 and 054 requirements pass in the TypeScript app.

**Rollback**: disable remote adapter; retain conflicts locally and keep editing local.

### Phase 9 — Safe validation, Git, and publication jobs

**Deliverables**

- single manager-owned publication manifest;
- background job runner with serialization, progress, timeouts, cancellation, shutdown;
- adapters for canonical category/image/OG/build validation commands;
- exact diff/branch/remote/staged-path preview;
- preflight before stage/commit/push;
- commit-only and commit+push with truthful structured result;
- recovery for commit-success/push-failure and browser close/restart.

**Exit gate**

- plans 045 and 046 safety requirements pass;
- unrelated staged content, wrong branch, conflicts, failed generator, failed build, push
  false/exception, cancellation, and shutdown are tested in temporary repos;
- no event-loop blocking route and no overlapping publication;
- success is impossible unless every requested required step succeeds.

**Rollback**: disable publication endpoints; operators use reviewed manual Git workflow.

### Phase 10 — Full parity, hardening, and operator acceptance

**Deliverables**

- close every feature-parity row or record an approved removal;
- full accessibility, browser, security, recovery, mutation, and performance passes;
- operator help, doctor output, backup/restore rehearsal, and support runbook;
- deterministic distribution/start command for supported operating systems;
- migration/cutover checklist with screenshots or evidence, not production mutations;
- replace Streamlit CI with TypeScript CI; keep Python CI until retirement.

**Exit gate**

- full `admin:validate`, release suite, Python tests, and Astro data validation pass;
- no open P0/P1 parity, data-loss, security, accessibility, or recovery issue;
- operator completes core workflows without Python assistance on a disposable clone;
- support/rollback drill completes from a failed mid-publication scenario.

**Rollback**: continue shadow operation; Python remains the official manager.

### Phase 11 — Shadow operation and write certification

Use three increasingly strict windows. Duration is based on representative operations,
not calendar time alone.

1. **Read shadow**: TypeScript reads real repository inputs but cannot write. Compare
   counts, identities, validation, filters, diffs, and generated publication manifest.
2. **Fixture write shadow**: replay representative approved operations into disposable
   clones using both managers; compare canonical JSON, assets, validation, and build.
3. **Primary-with-fallback**: TypeScript performs reviewed real operations; Python is
   read-only/fallback. Back up canonical inputs before each operation and review diffs.

**Certification minimum**

- at least one successful representative operation for every parity row;
- create/edit/rename/archive/reorder/bulk/category/storefront/media/import/conflict and
  publication failure/retry all exercised;
- zero unexplained semantic diff;
- zero recovery requiring manual JSON editing;
- no Python-only fallback during the final representative workflow set;
- maintainer signs the certification report.

Any unexplained difference returns the app to the preceding shadow stage.

### Phase 12 — Cutover and Python retirement

**Deliverables**

- make `npm run admin:start` the canonical documented entry point;
- archive a tagged final Python compatibility fixture/report;
- remove or archive Streamlit and its SQLite store first;
- after an agreed fallback window, remove Tkinter runtime code, Python-only dependencies,
  CI jobs, docs, and launchers in a dedicated deletion PR;
- update AGENTS, bootstrap, runbook, structure, dependency policy, validation matrix,
  incident/rollback docs, and active-surface manifests;
- retain data backups and migration aliases for the documented deprecation window.

**Final gate**

- explicit maintainer approval recorded in the PR;
- clean clone bootstrap, admin start, full validation, Astro build, and publication
  rehearsal pass without Python installed;
- rollback tag/branch and restoration instructions verified;
- no documentation or CI path names the retired manager as active.

**Rollback**

- before deletion: switch canonical command/docs back to Python;
- after deletion but within fallback window: revert the deletion/cutover commits and use
  unchanged canonical JSON/assets; no reverse data migration should be necessary;
- if TypeScript introduced a schema that Python cannot read, retirement is forbidden
  until a tested compatibility adapter and downgrade path exist.

## PR decomposition

Default PR sequence; split further if a diff exceeds reviewability:

1. ADR + field/write-path inventory + compatibility corpus.
2. Workspace/toolchain/health shell.
3. Shared schemas and error/command envelopes.
4. Read-only repositories and parity reporter.
5. Read-only Fastify routes and generated client.
6. React application shell and read-only Products/Categories.
7. Stable-ID dry run and mutation kernel.
8. Product edit/archive.
9. Reorder and bulk preview/apply.
10. Categories and product reassignment.
11. Storefront bundles and featured content.
12. Media inventory and staged intents.
13. Recovery journal and multi-file apply.
14. Durable change sets, history, and import.
15. Sync adapter and conflict center, or explicit sync retirement ADR.
16. Job runner and validation adapters.
17. Publication preview/commit/push.
18. Accessibility/security/recovery hardening.
19. Shadow certification and canonical-command cutover.
20. Streamlit retirement.
21. Python/Tk retirement after fallback window.

No PR combines initial write enablement with UI feature work, publication with root
toolchain upgrade, or cutover with Python deletion.

## Performance budgets

Performance is an operator-experience constraint, not a framework benchmark:

- initial local shell usable within 2 seconds on the supported development machine;
- product list interaction remains responsive at 10x the current fixture catalog;
- filter/search target under 100 ms after data availability;
- API list/detail target p95 under 200 ms for local fixture corpus;
- no synchronous filesystem, image, Git, build, or network work blocks the server event
  loop or browser interaction;
- job progress visible within 500 ms and at least every 2 seconds while active;
- memory growth stabilizes across 100 repeated edit/validate cycles.

Measure before optimizing. A failure blocks the responsible phase only when it affects
usability or indicates unbounded behavior; do not replace Fastify based on synthetic
requests-per-second comparisons.

## Observability and diagnostics

- structured Pino logs with event name, severity, correlation/command/job IDs, duration,
  outcome, and safe error code;
- redact content bodies, secrets, cookies, authorization, and sensitive filesystem data;
- in-memory/recent local job history with bounded retention;
- `admin:doctor` validates Node/TS versions, repo root, authority files, JSON schemas,
  locks/journals, staging leftovers, Git availability/state, required tools, writable
  directories, and safe loopback configuration;
- diagnostics are copyable as redacted JSON and never alter state;
- unexpected shutdown leaves enough journal metadata for deterministic recovery.

## Documentation changes by phase

- Workspace creation: root README, `docs/START_HERE.md`, structure/codebase map,
  bootstrap, dependency policy, validation matrix.
- Write enablement: authority ADR, contracts, recovery/backup runbook.
- Media/publication: asset guardrails, release runbook, rollback and incident triage.
- Shadow stage: operator migration guide and parity/certification report.
- Cutover: AGENTS, active surfaces, all launch commands, CI/workflows, archive notice.

Docs must describe which app is canonical at every phase. Never call both managers
authoritative.

## Risk register

| Risk                             | Likelihood / impact | Mitigation                                              | Trigger to stop                                |
| -------------------------------- | ------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Field loss between models        | High / Critical     | complete corpus, Zod schemas, differential round trips  | any unexplained semantic diff                  |
| Competing content authorities    | High / Critical     | plan 036 ADR; no SQLite; one write flag                 | two enabled write paths with different formats |
| Multi-file partial write         | Medium / Critical   | staging, journal, fsync, restart recovery tests         | no deterministic recovery proof                |
| Mutable product identity         | High / High         | stable IDs with aliases and collision dry run           | unresolved collision in real catalog           |
| Unsafe local HTTP control plane  | Medium / Critical   | loopback, launch secret, same-origin, allowlists        | requirement for remote binding                 |
| Git commits unrelated work       | Medium / Critical   | exact manifest and index blocker                        | manifest cannot enumerate outputs              |
| TS7 ecosystem incompatibility    | Medium / Medium     | isolated workspace, TS6 fallback, compatibility CI      | required tool cannot typecheck/build reliably  |
| Rewrite parity drift             | High / High         | feature matrix, Python goldens, shadow stages           | Python-only critical workflow not represented  |
| Media data loss                  | Medium / Critical   | immutable originals, intents, recovery journal          | cancel/failure can delete original             |
| UI becomes another monolith      | Medium / High       | feature boundaries, route/application/domain separation | business logic enters React/Fastify handlers   |
| Long jobs freeze process         | Medium / High       | async job runner, child-process timeouts, serial queues | event-loop lag violates budget                 |
| Root validation becomes too slow | Medium / Medium     | focused fast gate and release gate                      | no reasonable local reproduction path          |
| Python retired too early         | Medium / Critical   | explicit certification and fallback window              | requested deletion before final gate           |

## Acceptance checklist

### Architecture

- [ ] One accepted data-authority ADR exists.
- [ ] TypeScript 7 workspace is deterministic under root `npm ci`.
- [ ] Domain is independent of React, Fastify, filesystem, and Git.
- [ ] One schema source infers domain/API types.
- [ ] No SQLite or generated public directory is a write authority.

### Correctness and durability

- [ ] Every parity row is automated and operator-accepted or explicitly removed.
- [ ] Stable identity survives rename/reorder/import/sync.
- [ ] Stale and duplicate commands cannot corrupt or double-apply.
- [ ] Atomic/recovery tests cover every write boundary.
- [ ] Media/content/change history remain consistent after failure and restart.

### Security and operations

- [ ] Server cannot bind beyond loopback.
- [ ] Launch secret, Origin checks, path sandbox, upload validation, and subprocess
      allowlists have negative tests.
- [ ] Publication cannot include unrelated staged work or report false success.
- [ ] Doctor, backup, recovery, and rollback rehearsals pass.
- [ ] Logs and artifacts contain no secrets or real catalog payloads.

### UX and quality

- [ ] Core workflow is keyboard-complete and meets WCAG 2.2 AA expectations.
- [ ] Loading, empty, error, dirty, stale, conflict, and recovery states are explicit.
- [ ] Vitest coverage, browser tests, Playwright, mutation tests, and parity gates pass.
- [ ] Performance budgets pass at 10x synthetic catalog volume.

### Cutover

- [ ] Read shadow, fixture write shadow, and primary-with-fallback stages pass.
- [ ] Maintainer signs the certification report and cutover PR.
- [ ] Clean clone works without Python before Python deletion merges.
- [ ] Revert-based rollback and schema downgrade are tested.
- [ ] Active docs/CI contain no stale Python or Streamlit path after retirement.

## STOP conditions

Stop the current phase and report evidence if:

- plan 036 cannot name one content authority;
- a real catalog identity collision requires a business choice;
- Python and TypeScript outputs differ semantically and the contract cannot decide;
- a write cannot be made atomic or deterministically recoverable;
- completing a test requires real content, assets, credentials, Git index, or remote;
- the server must bind beyond loopback;
- a requested subprocess/path cannot be safely enumerated;
- generated files cannot be distinguished from authoritative inputs;
- remote sync lacks a safe idempotent conflict-resolution contract;
- TS7 breaks a required tool with no isolated TS6 compatibility path;
- cutover is requested with unresolved critical parity/security/recovery issues;
- Python deletion is requested before explicit approval and certification.

## Git and rollback policy

- Branch family: `migration/typescript-content-manager-<phase>`.
- Commits: conventional, one reversible capability each.
- Never push, publish, or modify real catalog/assets while verifying a phase.
- Every PR description includes owned files, flags, schema impact, commands, evidence,
  rollback (`git revert <sha>`), and forward recovery if durable state was introduced.
- Schema additions remain backward-compatible until after Python retirement; removals
  require a separate deprecation and downgrade plan.
- Keep feature flags server-side and default-deny mutation/publication until their gate.

## Maintenance notes

- Prefer explicit commands and small domain policies over framework abstractions.
- Fastify and React are adapters, not the architecture.
- Do not copy Python implementation quirks unless characterization proves they are user
  or data contracts; preserve outcomes, safety, and recoverability.
- Update the parity matrix whenever either manager changes during the migration.
- New manager-owned files must join the authority table, publication manifest, backup,
  recovery, parity, and documentation contracts in the same PR.
- Re-evaluate desktop packaging only after the browser-local version is accepted. If
  added, package the same server/domain/web artifacts rather than creating a third app.
