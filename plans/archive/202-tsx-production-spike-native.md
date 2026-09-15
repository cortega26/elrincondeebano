# Plan 202: Promote tsx to production deps; spike Node-native type stripping

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/package.json admin/content-manager/tsconfig.json admin/content-manager/src/server/services/backupManager.ts admin/content-manager/src/server/services/changeSetApplier.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (native-stripping half changes runtime semantics — spike only)
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: migration
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`tsx ^4.23.12` sits in `devDependencies` while the recorded production entry
(`start: ADMIN_MODE=operator node --import tsx src/server/start.ts`) and six
more scripts need it at runtime — any `--omit=dev` install (production
image, minimal CI) breaks `admin:start`. That miscategorization is a safe,
immediate fix. Separately, Node 24 has stable native type-stripping
(warning-free since 24.3), which would remove the second TS-execution
semantic entirely — but two files use non-erasable parameter properties and
native stripping has sharp edges (no tsconfig-paths, no `.tsx`, enums/
namespaces error), so that half is a spike behind `doctor`, not a migration.

## Current state

Verified by advisor read:

```json
// admin/content-manager/package.json:11 (production entry needs tsx)
"start": "ADMIN_MODE=operator node --import tsx src/server/start.ts",
// :51 — but tsx is a devDep:
"tsx": "^4.23.12",   // under devDependencies
// same --import tsx in dev, parity/contract, shadow-read, certify, doctor (:8, :18-22)
```

```ts
// Non-erasable syntax blockers (constructor parameter properties):
// backupManager.ts:34 and changeSetApplier.ts:46 — constructor(private readonly ...)
// tsconfig.json has verbatimModuleSyntax/isolatedModules but NO erasableSyntaxOnly
```

Conventions: `engines >=24 <25` so native stripping is available on every
supported runtime; `admin:doctor` is the natural spike host; `admin:certify`
is the acceptance gate for any runtime-semantics change.

## Commands you will need

| Purpose        | Command                                                          | Provenance | Expected on success         |
| -------------- | ---------------------------------------------------------------- | ---------- | --------------------------- |
| Install/lock   | `npm install --package-lock-only`, `npm ci`                      | declared   | exit 0                      |
| Omit-dev proof | `npm ls tsx` in an `--omit=dev` probe (or `npm pack` inspection) | declared   | tsx present after promote   |
| Typecheck      | `npm run admin:typecheck`                                        | declared   | exit 0                      |
| Tests          | `npm run admin:test`                                             | declared   | all pass                    |
| Native probe   | `node --watch src/server/start.ts` (spike, no --import tsx)      | declared   | boots (or verdict recorded) |

## Scope

**In scope**: promote `tsx` to `dependencies` (+lock); enable
`erasableSyntaxOnly`; de-sugar the 2 blocker constructors; native-stripping
spike report.

**Out of scope**: removing `tsx` (spike decides; removal is a follow-up);
`.tsx`/enum/namespace refactors beyond the 2 blockers; `--watch` semantics
for production (dev parity only).

## Git workflow

- Branch: `advisor/202-tsx-production-spike-native`
- Two commits: (1) promote (safe), (2) erasableSyntaxOnly + de-sugar + spike
  verdict (do NOT remove tsx in this plan).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

`npm ls tsx` recorded; typecheck + tests green unmodified.

**Verify**: green; otherwise STOP.

### Step 1: Promote tsx (safe, immediate)

Move `tsx` from `devDependencies` to `dependencies` in
`admin/content-manager/package.json`; regenerate lock; prove an
`--omit=dev`-style install still resolves it (use the least invasive probe
available: `npm ls`, pack inspection, or a throwaway prefix install — do NOT
disturb the working `node_modules`).

**Verify**: probe proves production resolvability; suite green.

### Step 2: Enforce erasable syntax; de-sugar blockers

Enable `erasableSyntaxOnly` in the admin tsconfig; rewrite the two
parameter-property constructors as explicit field declarations +
assignments (no behavior change — pure de-sugar). Typecheck must pass with
the flag on (that IS the proof of erasability for the touched surface; full
codebase erasability is NOT proven by this — the spike checks runtime).

**Verify**: `npm run admin:typecheck` green with the flag on; tests green.

### Step 3: Native-stripping spike (no removal)

Behind `admin:doctor` (or a scratch script, never the production entry):
boot `src/server/start.ts` with plain `node` (no `--import tsx`) and
exercise: server boot, one catalog read, one write + certify-adjacent smoke.
Record: boots? watch mode parity? which files error (enums/namespaces/tsx
imports/tsconfig-paths)? Verdict: ADOPT (file removal plan) / KEEP tsx /
NEEDS-WORK (list). Do NOT change any `package.json` script in this step.

**Verify**: verdict recorded with error list (or clean boot log).

## Test plan

- Steps 1–2: existing typecheck + suite (no new tests needed; de-sugar is
  behavior-identical by construction — reviewers check the diff).
- Step 3: spike log (not a test).
- Verification: green suites + probe + verdict.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `tsx` is under `dependencies`; omit-dev probe passes.
- [ ] `erasableSyntaxOnly` on; typecheck green; both constructors de-sugared.
- [ ] Spike verdict recorded (adopt/keep/needs-work + evidence).
- [ ] `tsx` NOT removed; no production script changed to native yet.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The omit-dev probe cannot be done safely (record method limits; the
  manifest move is still correct — say so and continue).
- De-sugaring either constructor changes behavior caught by tests (revert
  that hunk; the constructor may carry logic — report).
- `erasableSyntaxOnly` surfaces MANY more violations (narrow to the two
  files + flag, file the rest separately).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- If the spike says ADOPT, the removal plan must re-run `admin:certify` +
  full E2E (runtime semantics change) — note that requirement in the verdict.
- New server code MUST stay erasable-syntax-clean (the flag enforces it —
  that is the durable win regardless of the spike outcome).
- Reviewer: confirm the de-sugars are semantics-preserving line by line.
- **Deferred:** tsx removal (only on ADOPT verdict, separate plan).
