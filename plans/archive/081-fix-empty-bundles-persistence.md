# Plan 081: Persist an empty bundles file when all storefront bundles are cleared

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

Clearing all storefront bundles (a legitimate operation — "sacar todos los
combos") never updates `astro-poc/src/data/storefront-bundles.json`: the
repository only writes that file when the new bundle list is non-empty
(`storefrontRepository.ts:92-99`). The old bundles stay on disk, get picked
up by the publication's `ownedPaths`, and are committed as if current —
so any consumer of the standalone bundles file (the Astro build, the Python
tool) shows bundles the operator deleted. The experience file says
`bundles: []`, so reads through the manager look correct — the corruption is
silent until another tool reads the file.

After this plan: writing `[]` persists `[]`, and the two canonical
storefront files can't diverge through this path.

## Current state

Verified code (read directly):

- `admin/content-manager/src/server/repositories/storefrontRepository.ts:91-99`:
  ```ts
  // Also write bundles separately if modified
  if (result.data.bundles.length > 0) {
    const bundlesTmp = `${this.bundlesPath}.tmp`;
    writeFileSync(bundlesTmp, JSON.stringify(result.data.bundles, null, 2), { encoding: "utf-8", flush: true });
    if (existsSync(this.bundlesPath)) {
      renameSync(this.bundlesPath, `${this.bundlesPath}.backup_${...}`);
    }
    renameSync(bundlesTmp, this.bundlesPath);
  }
  ```
- The bundles file path: `astro-poc/src/data/storefront-bundles.json`
  (`:16`), and it is in the publication `ownedPaths`
  (`publicationService.ts:21`).
- The experience file is `astro-poc/src/data/storefront-experience.json`
  (`:15`), written unconditionally above the guarded block.
- `storefrontRepository.load()` (`:51-53`) falls back to the bundles file
  when the experience file lacks a `bundles` key — so a stale bundles file
  can also corrupt reads through this same repository.

Repo conventions: same as plans 071-080. Existing test:
`test/integration/repositories.test.ts` (temp-repo repository tests) and
storefront bundle tests referenced in the audit (`4 refs`).

## Commands you will need

| Purpose   | Command                                                | Expected on success |
| --------- | ------------------------------------------------------ | ------------------- |
| Typecheck | `npm run admin:typecheck`                              | exit 0              |
| Tests     | `npm run admin:test`                                   | exit 0              |
| Targeted  | `npx vitest run test/integration/repositories.test.ts` | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/repositories/storefrontRepository.ts`
- `admin/content-manager/test/integration/repositories.test.ts` (or the
  storefront bundle test file — find it via `grep -rn "bundles" test/`)

**Out of scope**:

- Removing the duplicate bundles file entirely (single-source decision —
  plan 065/066 territory; this plan only stops the divergence).
- The `load()` fallback semantics beyond what the test reveals.

## Git workflow

- Branch: `advisor/081-fix-empty-bundles-persistence`.
- Single commit: `fix(admin): persist empty bundles file so cleared combos survive publication` + `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the length guard

Delete the `if (result.data.bundles.length > 0)` condition so the bundles
file is always written from `result.data.bundles` (including `[]`). Keep the
tmp+rename pattern and the backup naming as-is.

**Verify**: `npm run admin:typecheck` exit 0.

### Step 2: Regression test

Find the storefront bundles test (grep `bundles` in `test/integration/`),
extend or add: in a temp repo, write a storefront experience with
`bundles: []` → assert `astro-poc/src/data/storefront-bundles.json` (path
resolved under the temp repo) exists and contains `[]`; then assert a
subsequent `load()` returns `bundles: []` (not the stale content).

**Verify**: `npx vitest run <the bundles test file>` → all pass.

### Step 3: Verify the divergence is gone

Also assert the reverse: write `bundles: [bundle]` → the bundles file
contains exactly that bundle (guards against a future regression of the
write path).

**Verify**: `npm run admin:test` exit 0.

## Test plan

- Temp-repo repository test (Step 2): empty-bundles write persists `[]`;
  stale file is overwritten.
- Non-empty write still works (Step 3).
- Existing repository and storefront tests stay green.

## Done criteria

- [ ] `storefrontRepository.ts` writes the bundles file unconditionally
- [ ] Test proves `bundles: []` persists `[]` and overwrites stale content
- [ ] `npm run admin:typecheck` and `npm run admin:test` exit 0
- [ ] `plans/README.md` status row 081 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Some consumer treats a `[]` bundles file as an error (grep the Astro side
  — `astro-poc/src/data/storefront-bundles.json` readers in `catalog.ts` or
  the combos page; if `[]` breaks a reader, report before landing).
- A test asserts the current guarded behavior.

## Maintenance notes

- When plan 066 (storefront curation) lands, the decision to keep or remove
  the standalone bundles file should revisit this — until then, this plan
  keeps the two files consistent.
- Reviewer focus: the backup rename now also happens for empty writes —
  backup pruning (`pruneBackups`-style logic) for the bundles file may
  accumulate; note if the file grows backups.
