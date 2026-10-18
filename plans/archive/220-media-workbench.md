# Plan 220: Media workbench — make cancel actually cancel, keep JSON and assets split-free, and stage at 0700

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/server/routes/mediaIntentRoutes.ts admin/content-manager/src/server/routes/mediaApplyRoutes.ts admin/content-manager/src/server/routes/mediaUploadRoutes.ts admin/content-manager/test/integration/mediaWorkbench.test.ts admin/content-manager/test/integration/mediaApplyOutputs.test.ts admin/content-manager/test/integration/mediaUpload.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Three defects in the media workbench:

1. **Cancel never takes effect.** `startIntentJob` holds the `intent` object
   it was given; the cancel route loads a **fresh copy** from disk, sets
   `cancel_requested = true` and saves. The running job (a) polls
   `isCancelled: () => intent.cancel_requested` on its stale copy (always
   `false`), and (b) on the next progress tick writes the **whole object**
   back (`Object.assign(intent, patch)` + `intents.save(intent)`), clobbering
   the persisted flag to `false`. The operator sees `{status:"cancelling"}`
   and the job runs to completion. The jobs themselves
   (`mediaJobs.ts:52,56,74,80,133`) already honor `isCancelled` — the route
   starves them of the flag.
2. **Rollback after commit.** In `mediaApplyRoutes`, the catalog write
   happens, then `intents.save(intent)` runs inside the same `try`. If that
   save throws (e.g. ENOSPC), the catch renames canonical assets **back** to
   staging while `data/product_data.json` already points at canonical paths
   — the exact JSON/assets split the comment promises to avoid.
3. **Staging perms.** `mkdirSync(intents.stagingRoot, { recursive: true })`
   has no `mode` (umask default 0755), unlike comms state (0700) and the
   credential (0600).

## Current state

`admin/content-manager/src/server/routes/mediaIntentRoutes.ts:166-181`:

```ts
const update = (patch: Partial<MediaIntent>): void => {
  Object.assign(intent, patch, { updated_at: new Date().toISOString() });
  intents.save(intent);
};
...
onProgress: (percent: number) => update({ progress: percent }),
isCancelled: () => intent.cancel_requested,
```

`:193-201` — completion trusts the stale copy:
`if (intent.cancel_requested) { update({ status: 'cancelled', ... }) }`.

`:229-251` single cancel and `:295-307` batch cancel both do
`intent = intents.load(id); ... intent.cancel_requested = true; intents.save(intent)`
(two copies of the same logic).

`admin/content-manager/src/server/routes/mediaApplyRoutes.ts:146-176` —
catalog write, then `intents.save(intent)`, then the catch with the
asset rollback loop (see plan context; the rollback must keep applying only
when the catalog write did NOT succeed).

`admin/content-manager/src/server/routes/mediaUploadRoutes.ts:135` —
`mkdirSync(intents.stagingRoot, { recursive: true });` then
`writeFileSync(stagedPath, decoded, { flush: true })`.

Conventions: intent jobs and their tests follow the temp-repo pattern
(`createApp({ repoRoot: tmp })` + `app.inject`) in
`admin/content-manager/test/integration/mediaWorkbench.test.ts`; the
media apply tests are in `mediaApplyOutputs.test.ts` (plan 176 contract);
run admin tests with `npm run admin:test`.

## Commands you will need

| Purpose            | Command                                                                                                                                                                | Provenance | Expected on success |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install            | `npm ci`                                                                                                                                                               | declared   | exit 0              |
| Admin typecheck    | `npm run admin:typecheck`                                                                                                                                              | declared   | exit 0              |
| Focused admin test | `npx vitest run test/integration/mediaWorkbench.test.ts test/integration/mediaApplyOutputs.test.ts test/integration/mediaUpload.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests        | `npm run admin:test`                                                                                                                                                   | declared   | all pass            |
| Lint (admin)       | `npm run admin:lint`                                                                                                                                                   | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/mediaIntentRoutes.ts`
- `admin/content-manager/src/server/routes/mediaApplyRoutes.ts`
- `admin/content-manager/src/server/routes/mediaUploadRoutes.ts`
- The three test files listed in the drift check

**Out of scope** (do NOT touch):

- `mediaJobs.ts` cancel checks — they are correct; the route must feed them.
- Intent state machine semantics beyond cancel (statuses, discard, batch
  report shape) — plan 176/127 contracts stay.
- OG canonical-write behavior (`categoryOgLifecycle.ts`).

## Git workflow

- Branch: `advisor/220-media-workbench`
- Commits: conventional, e.g.
  `fix(admin): make media intent cancel observable (plan 220)`.

## Steps

### Step 0: Establish a green baseline

Run Install, then the focused admin tests on the unmodified checkout. If a
`declared` command fails, STOP and report.

**Verify**: focused admin test command → all pass.

### Step 1: Make cancel observable end-to-end

In `mediaIntentRoutes.ts` (inside `startIntentJob`):

```ts
const update = (patch: Partial<MediaIntent>): void => {
  const persisted = intents.load(intent.id) ?? intent;
  Object.assign(intent, patch, {
    // Never clobber an operator-set cancel flag with the job's stale copy.
    cancel_requested: persisted.cancel_requested,
    updated_at: new Date().toISOString(),
  });
  intents.save(intent);
};
```

and:

```ts
isCancelled: () => {
  const persisted = intents.load(intent.id);
  if (persisted?.cancel_requested) intent.cancel_requested = true;
  return intent.cancel_requested;
},
```

Extract the duplicated cancel logic (single route `:229-251` and batch
`:295-307`) into one helper `requestCancel(intent): 'cancelled' | 'cancelling' | 'ALREADY_FINISHED'`
used by both, keeping the route responses identical (`{status:'cancelling'}`,
409 `ALREADY_FINISHED`, etc.). The helper re-loads the intent, applies the
pending/running rule and saves.

**Verify**: `npx vitest run test/integration/mediaWorkbench.test.ts` (cwd
`admin/content-manager`) → all pass. Add the new test below before claiming
the step done.

New test (in `mediaWorkbench.test.ts`): create an intent whose job is slow
enough to interrupt — the existing suite already has patterns for this; if
none exists, inject a controllable job by monkey-patching is not available
from the route; use a small fake via a large image? Prefer: start an intent,
immediately POST cancel between two progress saves, then poll the intent
until terminal: assert it ends `cancelled` (not `succeeded`) and that
`cancel_requested` was never reset by a progress tick. If a deterministic
slow job cannot be constructed with the existing fixtures, assert the two
lower-level invariants instead: (a) after `requestCancel`, a subsequent
`update()` from the job preserves `cancel_requested: true`; (b) `isCancelled`
returns true once the disk flag is set. State clearly in the test names what
is simulated.

### Step 2: No asset rollback after the catalog commit

In `mediaApplyRoutes.ts`: track whether the catalog write succeeded
(`let catalogWritten = false;` → set `true` right after
`writeResult.ok`). In the catch, only run the promoted-files rollback loop
when `!catalogWritten`. When `catalogWritten` is true, log the failure
(`request.log.error` or the route's logger) and still attempt to mark the
intent failed in a nested try/catch (best effort), then rethrow. The comment
should state the invariant: once the JSON points at canonical paths, files
stay put; the only recovery is a re-run (`MISSING_OUTPUT` 422 path already
exists).

**Verify**: `npx vitest run test/integration/mediaApplyOutputs.test.ts` (cwd
`admin/content-manager`) → all pass. Add one test that forces
`intents.save` to throw after a successful catalog write (simulate via a
read-only intents file or a corrupted intents dir — follow the fault
injection patterns already used in the admin contract tests) and asserts the
canonical asset is still at its canonical path while the response is 500.

If forcing that failure is not feasible with the existing fixtures within
~30 minutes, downgrade the test to asserting the flag-gated structure
(unit-level) and note it in the PR; do not remove the guard.

### Step 3: Stage at 0700

`mediaUploadRoutes.ts:135`: create with `mode: 0o700` and `chmodSync` as
best effort when the directory already exists (mirror
`commsRepository.ts:61-67`):

```ts
mkdirSync(intents.stagingRoot, { recursive: true, mode: 0o700 });
try {
  chmodSync(intents.stagingRoot, 0o700);
} catch {
  /* best-effort on non-POSIX filesystems */
}
```

**Verify**: extend `mediaUpload.test.ts` with a POSIX-only assertion
(skip on win32) that `fs.statSync(stagingRoot).mode & 0o777 === 0o700`
after an upload.

### Step 4: Full gates

**Verify**: `npm run admin:typecheck` → exit 0; `npm run admin:test` → all
pass; `npm run admin:lint` → exit 0.

## Test plan

- New: cancel observability (Step 1), post-commit no-rollback (Step 2),
  staging mode (Step 3).
- Patterns: `mediaWorkbench.test.ts`, `mediaApplyOutputs.test.ts`,
  `mediaUpload.test.ts` (temp-repo + `app.inject`).
- Expected totals: admin suite green; new tests named `(plan 220)` in the
  describe/it text.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:test` exits 0, including the 3+ new tests
- [ ] `npm run admin:typecheck` exits 0 and `npm run admin:lint` exits 0
- [ ] `grep -n "cancel_requested: persisted.cancel_requested" admin/content-manager/src/server/routes/mediaIntentRoutes.ts` matches
- [ ] `grep -n "catalogWritten" admin/content-manager/src/server/routes/mediaApplyRoutes.ts` matches
- [ ] `grep -n "mode: 0o700" admin/content-manager/src/server/routes/mediaUploadRoutes.ts` matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- A deterministic cancel test cannot be built and the invariant-level tests
  from Step 1 cannot express "progress tick cannot clobber cancel" (report
  what you tried).
- Changing the apply ordering breaks an existing test that asserts
  rollback-after-catalog-write (that would mean the current behavior is
  intentional — the finding premise would be false; report it).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Any future field written by both the job and the operator must follow the
  "re-read before full-object save" discipline established in `update()`.
- Reviewer: check the cancel tests actually exercise the disk flag (not just
  in-memory), and that the apply rollback still happens when the catalog
  write itself failed.
- **Deferred:** none.
