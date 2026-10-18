# Plan 227: Close the admin lint/typecheck gaps and purge the retired-toolchain editor configs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/package.json admin/content-manager/eslint.config.mjs .github/workflows/admin.yml tsconfig.json admin/content-manager/tsconfig.test.json admin/content-manager/tsconfig.server.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW–MED
- **Depends on**: none (runs before the rest of the admin batch)
- **Category**: dx
- **Planned at**: commit `97b21096`, 2026-10-18
- **Reviewer amendment (2026-10-18, round 1)**: Step 1 measured **116** tsc
  errors (115× TS6059 — `rootDir: "src"` inherited by `tsconfig.test.json`
  which includes `test/**`; 1× TS2883 in `test/web/harness.tsx:13`).
  Authorized: fix both (precedent: `tsconfig.server.json` already overrides
  `rootDir: null`) and proceed. **Step 5 withdrawn**: `.vscode/` is
  gitignored (`.gitignore:22`, untracked since `b1eaf0a0`) — unreachable
  from a branch; local cleanup is the owner's call.
- **Reviewer amendment (2026-10-18, round 2)**: the authorized C1 fix was
  applied (one line) and **unmasked 143 real errors** across 36 test files
  (TS2339×60, TS2322×20, TS2741×14, TS2739×14, TS2307×13, TS2345×10,
  singletons incl. TS2883/TS1294/TS1117, plus 1 structural TS6059 for the
  `comms.test.ts` → `astro-poc/src/lib/product-identity.ts` cross-workspace
  import). Decision: **C1 reverted; the test-typecheck wiring is withdrawn
  from this plan** and registered as its own debt item (deferrals register,
  plan 250). Proceed with the remaining workstreams: ESLint widening
  (Step 2), root tsconfig (Step 4), and the `tsconfig.server.json` orphan
  check.

## Why this matters

- The admin lint scope is `eslint src scripts test …`
  (`admin/content-manager/package.json:9`, mirrored by
  `.github/workflows/admin.yml:45`), and the workspace ESLint config's
  `files:` globs cover only `src|scripts` (and their root-relative
  aliases). Consequently `playwright.base.ts` — the shared base of all six
  admin e2e suites — plus `playwright.{import,changes,scope,media,storefront}.config.ts`,
  `vite.config.ts`, `vitest.config.ts` and `vite-env.d.ts` are **never
  linted by any script or CI job**. The admin.yml comment at `:43-44` claims
  "the FULL tree (src + scripts + test) must be error-free" — true for those
  three dirs only.
- Test files are never typechecked: `typecheck` uses `tsconfig.json`
  (includes `src/**` only); `tsconfig.test.json` (which includes
  `src + test`) is referenced by nothing, as is `tsconfig.server.json`.
- Root `tsconfig.json` sets `"types": ["cypress"]` and includes
  `cypress/**/*.ts` — cypress is not installed (retired, plan 157) — and it
  silently governs the editor experience for root-level `*.ts`
  (`playwright.config.ts`, `playwright.astro.config.ts`) and
  `test/e2e-astro/*.spec.ts`, producing phantom TS2688 errors.
- `.vscode/launch.json` and `.vscode/settings.json` still ship debug
  configurations and interpreter settings for the retired Python admin
  (`.venv/bin/python`, `admin.product_manager.content_manager` — retired
  plan 069).

## Current state

- `admin/content-manager/package.json:9`:
  `"lint": "eslint src scripts test --config eslint.config.mjs"`, and
  `:13` `"typecheck": "tsc -p tsconfig.json --noEmit"`.
- `admin/content-manager/eslint.config.mjs:24-38` — `files:` globs:
  `src/**`, `scripts/**` + repo-root-relative aliases; a comment says the
  `lint` script must stay identical to the CI one-liner.
- `admin/content-manager/tsconfig.test.json` — extends `tsconfig.json`,
  `strict: true`, `include: ["src/**/*.ts(x)", "test/**/*.ts(x)",
"vite-env.d.ts"]`; nothing runs it.
- `admin/content-manager/tsconfig.server.json` — same shape, includes
  `src/{server,shared,domain}`; nothing references it (verify with
  `grep -rn "tsconfig.server" .github admin package.json` before deleting).
- Root `tsconfig.json` (12 lines): `"types": ["cypress"]`,
  `"include": ["src/**/*", "test/**/*", "cypress/**/*.ts"]`.
- `.vscode/launch.json` — two `debugpy` configs (`Run Current Python File`,
  `Content Manager` with `admin.product_manager.content_manager`).
- `.vscode/settings.json` — `python.analysis.*`, `python.*`,
  `python-envs.*`, `PYTHONPATH` env blocks; keep `cSpell`, `markdown`,
  `amazonQ.telemetry` entries.

## Commands you will need

| Purpose                                                        | Command                                                                 | Provenance | Expected on success |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- | ------------------- |
| Install                                                        | `npm ci`                                                                | declared   | exit 0              |
| Admin lint (new)                                               | `npx eslint . --config eslint.config.mjs` (cwd `admin/content-manager`) | declared   | exit 0              |
| Admin typecheck                                                | `npm run admin:typecheck`                                               | declared   | exit 0              |
| Test typecheck (withdrawn — do NOT run; see round-2 amendment) | `npx tsc -p tsconfig.test.json --noEmit` (cwd `admin/content-manager`)  | declared   | n/a                 |
| Admin tests                                                    | `npm run admin:test`                                                    | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/package.json` (lint/typecheck scripts)
- `admin/content-manager/eslint.config.mjs` (glob coverage + comment)
- `.github/workflows/admin.yml` (mirror the lint one-liner)
- `tsconfig.json` (root)
- (test-typecheck wiring withdrawn — see the round-2 amendment;
  `tsconfig.test.json` unchanged)
- `admin/content-manager/tsconfig.server.json` (delete if orphan)
- (Step 5 withdrawn — `.vscode/` is untracked, see the amendment above)

**Out of scope**:

- Fixing pre-existing lint/type errors by changing application code beyond
  what the widened scopes require (if the widened scope finds many, see
  STOP conditions — report, don't grind).
- The root `typecheck` monorepo wiring (`typecheck:astro` + `admin:typecheck`)
  — unchanged.

## Git workflow

- Branch: `advisor/227-admin-dx-coverage`
- Commit: `chore(dx): widen admin lint/typecheck and drop retired editor configs (plan 227)`.

## Steps

### Step 0: Establish a green baseline

Install; run current `npm run admin:lint`, `npm run admin:typecheck`,
`npm run admin:test`. All green → proceed. Red → STOP.

### Step 1: Measure before widening

Run `npx eslint . --config eslint.config.mjs` (cwd admin) and
`npx tsc -p tsconfig.test.json --noEmit` (cwd admin) on the unmodified
checkout. Record the error counts.

- Superseded by round 2: the one-line `rootDir: null` fix unmasked **143**
  real errors in 36 test files. The fix is reverted and the test-typecheck
  wiring dropped from this plan (see the round-2 amendment). Do NOT touch
  `tsconfig.test.json` or `harness.tsx`; the ESLint measurement below is
  the only measurement this plan still uses.
- ESLint findings: expect a handful; fix them in the config files (e.g.
  `vite-env.d.ts` reference) or in the files themselves when mechanical.

### Step 2: Widen lint scope

- `eslint.config.mjs`: extend the `files:` globs with the workspace-root
  TypeScript configs: `'*.{js,mjs,ts,mts}'` and `'admin/content-manager/*.{js,mjs,ts,mts}'`
  (keep the plan-204/prettierignore mirror comment intact; keep the
  lint-staged note accurate or update it in the same commit).
- `admin/content-manager/package.json`: `"lint": "eslint . --config eslint.config.mjs"`.
- `.github/workflows/admin.yml`: same one-liner as the local script (the
  config comment requires this identity), and adjust the F1.2 comment to
  say what is actually covered now.

**Verify**: `npx eslint . --config eslint.config.mjs` (cwd admin) → exit 0.

### Step 3 (withdrawn by reviewer): Typecheck the tests

Round 2 measured 143 pre-existing errors across 36 test files once the
`rootDir` interplay stopped hiding them — that cleanup is its own project
(registered in the deferrals register, plan 250) and **is NOT wired here**.
The `typecheck` script stays exactly as it is. Keep only the sub-item:
`tsconfig.server.json` → `grep -rn "tsconfig.server" .` (excluding
node_modules); if truly unreferenced, delete it, else leave it and note the
reference in the PR.

### Step 4: Root tsconfig for the active surface

Replace root `tsconfig.json` with a minimal editor config for the Playwright
surface (no tooling reads it — `typecheck` does not use it; verify with
`grep -rn "tsconfig.json" package.json playwright.*.ts .github/ | head`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": false,
    "types": ["node"]
  },
  "include": ["playwright.config.ts", "playwright.astro.config.ts", "test/e2e-astro/**/*.ts"]
}
```

**Verify**: no `cypress` string remains: `grep -rn "cypress" tsconfig.json` → nothing.

### Step 5 (withdrawn by reviewer): Python editor leftovers

`.vscode/launch.json` and `.vscode/settings.json` are **not tracked by git**
(`.gitignore:22`; untracked since `b1eaf0a0`) and are absent from fresh
worktrees. This step cannot land via a branch: **skip it entirely**. Local
cleanup of the operator's machine copy is optional and out of scope.

### Step 6: Full gates

**Verify**: `npm run admin:lint` → exit 0; `npm run admin:typecheck` →
exit 0; `npm run admin:test` → all pass; root `npm run lint` → exit 0.

## Test plan

- No new runtime tests; verification is the widened commands themselves
  (that is the point). Ensure CI wiring (admin.yml) is updated identically
  or the local/CI divergence returns.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx eslint . --config eslint.config.mjs` (cwd `admin/content-manager`) exits 0
- [ ] `npm run admin:typecheck` exits 0 (unchanged single-project script — the test-typecheck wiring was withdrawn)
- [ ] `grep -rn "cypress" tsconfig.json` returns nothing
- [ ] `grep -n "eslint . --config eslint.config.mjs" .github/workflows/admin.yml admin/content-manager/package.json` shows both
- [ ] `npm run admin:test` exits 0; `npm run lint` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `tsc -p tsconfig.test.json --noEmit` reports >30 errors (report; do not
  mass-fix).
- Widening ESLint surfaces errors inside generated code or vendored trees
  (report; add ignores only for generated paths, with the plan-204 mirror
  comment updated).
- Root `tsconfig.json` turns out to be referenced by a tool (report the
  reference).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- The admin lint script and admin.yml line must stay identical (config
  comment); if a future refactor splits them, update the comment.
- tsconfig.test.json becomes load-bearing; adding new test dirs means
  extending its `include` (it already covers `test/**`).
- **Deferred:** root `src/**` removal from includes is moot (no root src);
  keep the minimal include list aligned with real files if Playwright
  configs are renamed.
