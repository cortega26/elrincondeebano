# Plan 244: Finish the tools logger migration for the guardrails + preflight chain

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- tools/guardrails/ tools/preflight.js tools/run-parallel.mjs tools/preflight-hash.mjs eslint.config.cjs`
> If files changed (plans 239/222 touch `tools/guardrails/`), re-read;
> unexplained divergence is a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 239 (critical-css retirement may shrink the guardrails
  suite — migrate whatever remains)
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`tools/utils/logger.mjs:6-7` states the rule "NEW/edited tools MUST use this
logger (no new bare `console.*` in tools/). Mass migration of existing sites
is a follow-up." Measured today: ~155 `console.*` sites across ~50 of 64
tool files; only two import the logger. Plan 206 shipped the logger and
deferred the migration with no successor — the rule is unenforced where
most of the code lives, so the next tool picks whichever style it sees
nearby, and CI log triage stays regex-per-tool instead of one JSON line per
call (with credential redaction, level filtering via `LOG_LEVEL`).

## Current state

`tools/utils/logger.mjs` — API:
`logger.{debug,info,warn,error}(message, meta)`, one JSON line per call,
redaction on sensitive keys, `LOG_LEVEL` gate. Migration targets (counts
verified): `tools/guardrails/run.mjs` (1), `orphan-assets.js` (7),
`secret-scan.mjs` (3), `_utils.mjs`, `image-size-check.mjs`,
`legacy-storefront-surface.mjs`, `tools/preflight.js` (3),
`tools/run-parallel.mjs` (4), `tools/preflight-hash.mjs` (4).

## Commands you will need

| Purpose    | Command                                                                           | Provenance | Expected on success          |
| ---------- | --------------------------------------------------------------------------------- | ---------- | ---------------------------- |
| Install    | `npm ci`                                                                          | declared   | exit 0                       |
| Guardrails | `npm run guardrails && npm run guardrails:assets && npm run security:secret-scan` | declared   | exit 0                       |
| Preflight  | `node tools/preflight-hash.mjs --help` or a dry step                              | declared   | exit 0 (or documented usage) |
| Lint       | `npm run lint`                                                                    | declared   | exit 0                       |

## Scope

**In scope**:

- The nine files listed above (whichever survive plan 239)
- `eslint.config.cjs` (scoped `no-console` override)
- `tools/utils/logger.mjs` (update the maintenance-rule comment)

**Out of scope**:

- The other ~40 tool files (batch 2 later; the eslint override stays scoped
  to what is migrated).
- Log line wording changes beyond `console.x(...)` → `logger.x(...)`
  mapping (`console.log` → `info`; `console.warn` → `warn`;
  `console.error` → `error`; `console.debug` → `debug`).

## Git workflow

- Branch: `advisor/244-tools-logger`
- Commits: one per area, `chore(tools): … (plan 244)`.

## Steps

### Step 1: Migrate guardrails

Replace each `console.*` with the logger, preserving message text and
passing structured `meta` where the call site already prints objects
(`logger.info('orphan-assets: done', { removed, freed })`-style — keep the
existing keys). For scripts that print machine-readable JSON to stdout,
DO NOT route the payload through the logger (the logger adds its own JSON
envelope to stdout for info); if a script's consumer parses its stdout,
keep that payload on `process.stdout.write` and move only diagnostics to
the logger — if you find such a consumer, say so in the PR.

**Verify**: `npm run guardrails && npm run guardrails:assets && npm run
security:secret-scan` → exit 0.

### Step 2: Migrate the preflight chain

`tools/preflight.js`, `tools/run-parallel.mjs`, `tools/preflight-hash.mjs`:
same mapping. These print step progress read by humans in CI — the JSON
lines are the accepted format (plan 206 design); keep messages
self-explanatory (`[hash-gate] skipping …` text moves into `message`).

**Verify**: run one real preflight step, e.g. `npm run categories:sync`
(cheap) and `node tools/preflight-hash.mjs --step images-logo …` only if a
second run is a no-op skip; otherwise use the script's `--help`/dry path —
report what you ran.

### Step 3: Enforce with a scoped lint rule

In `eslint.config.cjs`, add an override:

```js
{ files: ['tools/guardrails/**/*.{js,mjs}', 'tools/preflight.js', 'tools/run-parallel.mjs', 'tools/preflight-hash.mjs'],
  rules: { 'no-console': 'error' } }
```

(adjust to the existing config's structure — the root config has tool
exemptions; nested override wins). Update `tools/utils/logger.mjs:6-7`
comment to name the enforced directories and note the remaining backlog is
deferred.

**Verify**: `npx eslint tools/guardrails tools/preflight.js tools/run-parallel.mjs tools/preflight-hash.mjs` → exit 0.

### Step 4: Full gates

**Verify**: `npm run lint` → exit 0; `npm run guardrails` → exit 0;
`npm test` → all pass (tools-logger.test.js stays green).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "console\." tools/guardrails/ tools/preflight.js tools/run-parallel.mjs tools/preflight-hash.mjs` returns no `console.log/warn/error` (console.error inside logger.mjs is fine — out of scope)
- [ ] `npx eslint tools/guardrails tools/preflight.js tools/run-parallel.mjs tools/preflight-hash.mjs` exits 0
- [ ] `npm run guardrails` exits 0; `npm test` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A migrated script's stdout is parsed by a consumer expecting the old
  format (report the consumer; keep the payload and migrate diagnostics
  only).
- A guardrail test asserts console output text (report; the assertion
  should move to the logger message).
- Plan 239 moved files you were told to migrate (migrate what remains;
  note the difference).

## Maintenance notes

- The eslint override is the ratchet: extend `files` as more tools migrate.
- Reviewer: confirm no credential-bearing `meta` bypasses redaction
  (logger handles it — meta objects only).
- **Deferred:** batch-2 migration of the remaining ~40 tool files.
