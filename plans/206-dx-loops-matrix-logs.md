# Plan 206: Fast loops, honest E2E fan-out, and observable logs (DX batch)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- package.json admin/content-manager/package.json .github/workflows/admin.yml astro-poc/src/lib/logger.ts astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/observability.js docs/operations/RUNBOOK.md admin/content-manager/src/server/app.ts admin/content-manager/src/server/start.ts admin/content-manager/scripts/doctor.ts tools/utils/stage-runner.mjs docs/START_HERE.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches shipped storefront log schema + CI; rest LOW)
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: dx
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Six DX gaps that slow every contributor day: (1) no fast TDD loop for
storefront JS (root has no `test:watch`; every E2E pays a full build unless
the undocumented `PLAYWRIGHT_SKIP_BUILD=1` is known; `build:fast` safety is
judgment-only). (2) The admin E2E matrix backgrounds five suites with bare
`wait` off one shared `PORT` — false-green and port-collision risk.
(3) Structured logs ship without a join key while RUNBOOK triages a phantom
`fetch_products_failure` event, and perf signals need code edits to enable.
(4) ~100 raw console sites across `tools/` with no level/timestamp/machine
contract. (5) Admin startup/recovery bypasses the exemplary pino request
logging; `doctor` always exits 0 even when reporting errors. Each slice is
independent — land them as separate commits; drop any slice that doesn't
reproduce with owner confirmation where noted.

## Current state

Verified by advisor read:

- Root `package.json:61` — only `vitest run && admin:test` (no watch);
  admin has `dev` (`tsx --watch`) + `test:watch`. `playwright.astro.config
:5-8` builds on every E2E unless `PLAYWRIGHT_SKIP_BUILD=1`;
  `START_HERE:42-43` forbids raw `astro-poc` build while README blesses
  `build:fast` code-only (no machine check). Skip knobs in code only:
  `SKIP_IMAGE_OPT`, `PREFLIGHT_SKIP_OG`, `PRODUCTS_JSON`/`FULL_REGEN`.
- `admin.yml:70-77` — five configs backgrounded with `&` + bare `wait`;
  ports derived from shared `PORT` (3101/3102/start 3000). Comment asserts
  isolation.
- `logger.ts:1-3` `createCorrelationId()` exists; `log()` (lines 67-73)
  emits JSON with redaction/truncation but no ID; call sites
  (`storefront.js:1104,1242,1407`, `observability.js:64,214,254`) pass none.
  `RUNBOOK:69` triages `fetch_products_failure` + `correlationId` — zero
  matches under `astro-poc/src`. OBSERVABILITY: `recordEndpointMetric`
  explicit-call only, kill switch at init, collection disabled by default
  (ADR 0010 no-go, plan 167).
- `tools/` ~100 raw console sites (gap-fill, preflight, home-og,
  check-e2e-class-selectors, dev-server); `stage-runner.mjs:30-70` labels
  stages but passes through unstructured output; only monitors emit JSON.
- Request path exemplary: pino `info` (`app.ts:97`), `x-request-id`
  (`:439-441`), envelope `req_id` (`:446-466`). Startup path raw console:
  `start.ts:11,18,53,56,66-88`; `doctor.ts:19-33` human `✅/⚠️/❌` + summary,
  never non-zero exit (grep: no `exitCode`/`process.exit`); admin.yml runs
  certify/drills but not doctor as a gate.

## Commands you will need

| Purpose   | Command                           | Provenance | Expected on success |
| --------- | --------------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                          | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck`         | declared   | exit 0              |
| Tests     | `npm test` + `npm run admin:test` | declared   | all pass            |

## Scope

**In scope**: `test:watch` + fast-loop docs + preflight skip-summary line;
E2E matrix ports/logs/fail-fast; correlation propagation on fetch/catalog
flows + RUNBOOK event-name fix; shared tools logger adoption path;
startup pino + doctor exit contract.

**Out of scope**: pipeline redesign; new log events (propagate IDs through
EXISTING events only); doctor as a CI gate (propose, don't enable);
`LOG_LEVEL` semantics beyond documenting current handling.

## Git workflow

- Branch: `advisor/206-dx-loops-matrix-logs`
- One commit per slice (6). Drop slices that don't reproduce (note why).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline + timings

Green suites. Time cold vs warm `lint`/`typecheck`/`test`/`build`/`test:e2e`
(record — plan 189 may reuse these numbers; coordinate, don't duplicate
measurement).

**Verify**: green; numbers recorded; otherwise STOP.

### Step 1: Fast loop (docs + watch + skip-summary)

- Add root `test:watch`; document the fast loop
  (`lint && typecheck && test` per VALIDATION_MATRIX:56-60) + fast/slow
  decision rule with examples in START_HERE (advertise
  `PLAYWRIGHT_SKIP_BUILD=1` alongside `test:e2e`).
- Preflight prints which stages it skipped and why (one summary line per
  stage via the existing stage-runner labels — no new framework).
- List the skip env vars in `.env.example` (coordinate with plan 204 —
  whoever lands first wins; do not duplicate entries).

**Verify**: docs lint green; `test:watch` boots (smoke-run then exit).

### Step 2: E2E matrix fail-fast (prove first)

Force one matrix suite to fail (scratch assertion) and observe whether the
step still goes green — if false-green is PROVEN, fix with explicit
per-suite ports, split logs, and matrix or `wait -n` fail-fast. If not
reproducible, record "not proven" with the experiment log and skip the
fix (do not restructure CI on structural suspicion alone).

**Verify**: experiment recorded; fix only on proof (mark BLOCKED pending CI
if the proof needs a CI run).

### Step 3: Correlation IDs + RUNBOOK fix

Thread an opt-in correlation ID through the catalog-fetch path (use the
existing `createCorrelationId`; do not invent a second generator), update
RUNBOOK's `fetch_products_failure` reference to a real event name (or
remove it), and document the enable/debug procedure for endpoint metrics
(code-edit requirement stays, but documented). Collection stays OFF by
default (ADR 0010 no-go — do not relitigate).

**Verify**: typechecks + suites green; log schema consumers/tests updated
if the envelope changed (prefer additive `correlationId` field).

### Step 4: Tools log contract (incremental)

Introduce the tiny shared logger (level via env/flag, timestamped,
redaction-aware mirroring `logger.ts`); route NEW/edited tools through it
in this commit only (do not mass-migrate ~100 sites — that is a follow-up);
emit a short machine-readable summary per preflight stage.

**Verify**: suites green; golden-output tests updated only where the
contract intentionally changed.

### Step 5: Startup pino + doctor exit contract

Route startup/recovery lines through pino with the same envelope (reuse the
Fastify instance or a shared pino root — check `app.ts:93-95` test logger
injection still works); document level handling. Give `doctor` a machine
contract: non-zero exit on errors (`--fail-on error|warn`, default keeps
human format + failing exit on error). Propose (don't enable) doctor as a CI
gate in the commit notes.

**Verify**: typecheck + tests green; `doctor` exit code proven both ways
(healthy repo → 0; injected failure → non-zero).

## Test plan

- Slice proofs: watch boot, matrix experiment log, correlation field test,
  logger unit test, doctor exit-code test (inject failure via temp repo).
- Existing suites green throughout.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test:watch` exists and boots; fast-loop docs + skip-summary shipped.
- [ ] Matrix slice has an experiment verdict (fixed with proof, or
      not-proven recorded).
- [ ] Correlation flows on fetch/catalog paths (test-proven) + RUNBOOK
      event name real.
- [ ] Shared tools logger exists and is used by touched tools.
- [ ] Startup logs via pino; doctor exit contract test-proven.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated (per-slice verdicts).

## STOP conditions

Stop and report back (do not improvise) if:

- The matrix experiment cannot be run anywhere (record; do not fix on
  suspicion).
- Correlation propagation requires changing the log schema in ways tests
  reject (narrow to additive field or drop with note).
- Doctor-as-gate or pino-at-startup breaks the test logger injection
  (report the shape; do not restructure app boot here).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New tools MUST use the shared logger (header-comment rule where the logger
  lives); new tests MUST NOT use wall-clock sleeps (plan 193's rule).
- Reviewer: the matrix experiment log and doctor exit-code proof are the two
  must-read evidences.
- **Deferred:** mass migration of the ~100 console sites (follow-up with
  this plan's logger as the standard); doctor as CI gate (owner call).
