# Plan 200: Dependency manifest hygiene (types-node, floors, pins, range guard, node/port story)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- package.json admin/content-manager/package.json astro-poc/package.json tools/guardrails/dependency-manifest-compat.mjs .nvmrc .node-version .tool-versions docs/onboarding/BOOTSTRAP.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: migration
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Five manifest-level defects, all one-line with lockfile regeneration, all
verified against manifests + lock: (1) admin `@types/node ^26.1.2` runs on
the Node-24-only runtime (`engines >=24 <25`, CI `24.x`) — green typecheck
against Node 26 APIs that throw at runtime. (2) Direct `chrome-launcher
^1.1.2` sits below lighthouse's own `^1.2.1` floor (lock happens to resolve
1.2.1 today — latent). (3) `astro` is exact-pinned `7.1.6` while every
sibling floats — patches never flow via `npm ci` (intent unverified: may be
deliberate). (4) Eight ranges are duplicated across workspaces with only the
TS pair guarded — the next one-sided bump silently forks the tree (notably
`sharp`'s native binaries). (5) Volta says `24.0.0` while engines/CI float
`24.x` (`.nvmrc`/`.node-version` say bare `24`) — "green in CI, stale
locally" skew. Explicitly NOT findings (vetted): Fastify/Vite/React/Zod/
Vitest are all on current supported majors — no major-lag work here.

## Current state

Verified by advisor read (manifests + lockfile `packages` entries):

```json
// admin/content-manager/package.json:44 vs :56-58 + CI node 24.x
"@types/node": "^26.1.2"   // engines: node >=24 <25
// root node_modules/@types/node 24.13.2 vs admin 26.1.2 (lock-confirmed split)
```

```json
// package.json:108 vs lock node_modules/lighthouse floor
"chrome-launcher": "^1.1.2"   // lighthouse declares ^1.2.1; lock resolves single 1.2.1
```

```json
// astro-poc/package.json:23 vs siblings in the same file
"astro": "7.1.6"   // exact; @astrojs/sitemap ^3.7.3, @astrojs/check ^0.9.10 float
```

```
// Duplicated ranges (identical today except the settled TS split):
sharp ^0.35.3, zod ^4.4.3, vitest ^4.0.16, @vitest/coverage-v8 ^4.1.11,
jsdom ^30.0.1, @playwright/test ^1.62.1 (×2), eslint-plugin-sonarjs ^4.2.0 (root+astro),
typescript ^6.0.3 (root+astro) vs ^7.0.2 (admin, documented plan-113 split)
// tools/guardrails/dependency-manifest-compat.mjs:60-83 — checks ONLY the typescript+@astrojs/check pair
```

```
Volta 24.0.0 (package.json:128-130) vs engines >=24 <25, CI 24.x, .nvmrc 24, .node-version 24, .tool-versions "nodejs 24"
```

Conventions: `DEPENDENCY_POLICY.md` governs bumps (check it before
regenerating the lock — patch/minor vs major-RFC rules); deterministic
install via `npm ci` (never `npm install` with a lockfile present...
note CONTRIBUTING says `npm install <pkg>@latest` for bumps — follow the
policy doc, and use `npm install --package-lock-only` where possible to
avoid full `node_modules` churn). Dependabot manages ranges — add `ignore`
entries where a major must not float (`@types/node`).

## Commands you will need

| Purpose    | Command                                                       | Provenance | Expected on success                               |
| ---------- | ------------------------------------------------------------- | ---------- | ------------------------------------------------- |
| Lock check | `npm ls @types/node chrome-launcher astro 2>&1 \| head -n 20` | declared   | tree resolves, single copies                      |
| Typecheck  | `npm run typecheck`                                           | declared   | exit 0 (surfaces Node-26-only API uses as errors) |
| Tests      | `npm test`                                                    | declared   | all pass                                          |
| Build spot | `npm run build:fast`                                          | declared   | exit 0 (astro caret change)                       |
| Guard      | `node tools/guardrails/dependency-manifest-compat.mjs`        | declared   | exit 0                                            |

## Scope

**In scope**: the five manifest edits + lockfile + compat-guard extension +
Volta/nvm alignment + Dependabot ignores.

**Out of scope**: any major-version migration (none needed — verified);
`tsx`/sass/anymatch/undici/playwright (plans 201–203); astro 7.x→8 (does
not exist in scope; the caret only floats 7.x).

## Git workflow

- Branch: `advisor/200-manifest-hygiene`
- One commit per item (5 commits); e.g.
  `chore(deps): pin admin @types/node to v24 to match runtime (plan 200)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

`npm ls` resolutions recorded; typecheck + tests green unmodified.
`git blame` the exact `astro` pin (Step 3 needs intent).

**Verify**: green; blame recorded; otherwise STOP.

### Step 1: @types/node → ^24.x (+ Dependabot ignore)

Pin admin `@types/node` to `^24.x`, regenerate lock, add a Dependabot
`ignore` for `@types/node` semver-major. Typecheck MUST surface any
Node-26-only API use as a compile error — fix those call sites (they are
latent runtime `TypeError`s on Node 24) in the same commit.

**Verify**: `npm run typecheck` green; `npm ls @types/node` shows 24-line in admin.

### Step 2: chrome-launcher floor → ^1.2.1

Bump direct range to match lighthouse's floor; regenerate lock.

**Verify**: `npm ls chrome-launcher` single 1.2.x; `npm run lighthouse:audit`
still resolves (or at least `node --check tools/lighthouse-audit.mjs`).

### Step 3: Astro pin — intent first

If blame shows the exact pin is deliberate (with rationale nearby or in a
commit message), do NOT change it — instead add the rationale as a comment
next to the line and record "deliberate, documented" verdict. If accidental,
relax to `^7.1.6`, regenerate lock, prove with `build:fast` + E2E smoke.

**Verify**: either documented-deliberate or caret + green build/smoke.

### Step 4: Same-range guard for the 7 non-TS duplicates

Extend `dependency-manifest-compat.mjs` with a same-range assertion loop for
sharp/zod/vitest/coverage-v8/jsdom/@playwright/test/eslint-plugin-sonarjs
(keep the TS split exempt with its plan-113 comment). Wire nothing new —
it already runs in the existing `check:determinism`/CI path (verify where
it runs; if orphaned, wire it and say so).

**Verify**: guard passes; a trial one-sided bump (scratch, reverted)
provably fails it.

### Step 5: One Node 24 story

Align `.nvmrc`/`.node-version`/Volta/CI/BOOTSTRAP on a single story:
float Volta to latest patched `24.x` (or drop Volta for the existing
`24.x` + `engines` contract — check if any contributor/CI path uses Volta
first), add missing `engines` to `astro-poc/package.json` for uniformity,
and fix BOOTSTRAP's `nvm use 24` line if it contradicts the choice.

**Verify**: all version files agree; docs match.

## Test plan

- Typecheck is the primary prover (Step 1); build/smoke for Step 3; guard
  trial-failure for Step 4.
- Full `npm test` green at the end (no product change expected).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm ls @types/node` shows the 24 line under admin; typecheck green.
- [ ] `npm ls chrome-launcher` satisfies `^1.2.1` from the direct range.
- [ ] Astro pin deliberate-documented OR caret with green build/smoke.
- [ ] Compat guard asserts the 7 duplicate ranges (trial bump fails it).
- [ ] Version files agree (single story documented in BOOTSTRAP).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Typecheck after the types-node downgrade reveals MANY Node-26-only uses
  (report the list; the migration is bigger than S — narrow to the pin and
  file the call-site fixes separately).
- Lockfile regeneration churns unrelated entries massively (use
  `--package-lock-only` scoped updates; if still noisy, report).
- Volta turns out to be load-bearing in some CI path (then float carefully
  with a CI proof run, or record BLOCKED pending CI).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- The compat guard is the durable artifact here — future duplicate-range
  additions must extend its name list (header comment rule).
- Reviewer: confirm no major floats snuck in via caret additions (lockfile
  diff should show only the intended lines + integrity churn).
- **Deferred:** none. (Major migrations: none needed — say so in the commit
  so the next audit doesn't re-ask.)
