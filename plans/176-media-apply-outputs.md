# Plan 176: Guard media apply against empty outputs and shared staged paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/routes/media.ts admin/content-manager/src/shared/schemas/mediaIntent.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Media apply links the product to `intent.outputs[0] ?? ''` even when the
promotion loop ran zero times (empty outputs) — pointing the product at a
file that was never promoted (broken image with a 200 response). Separately,
`canonicalTargetFor` ignores its `_output` parameter, so a multi-output job
promotes N staged files onto one canonical path (last wins), and staged
files are content-hash-named so two intents for identical bytes share one
staged path (one's discard can unlink the sibling's source). The empty-output
link is certain; the other two need the `mediaJobs` output contract verified
first — hence investigate-then-fix steps.

## Current state

Relevant files:

- `admin/content-manager/src/server/routes/media.ts` — apply handler
  (lines ~500–605), `canonicalTargetFor` (lines 631–640), staging/intent
  creation (lines 52–181).
- `admin/content-manager/src/server/services/mediaJobs.ts` — job/output
  contract (read during investigation).
- `admin/content-manager/src/shared/schemas/mediaIntent.ts` —
  `MEDIA_UPLOAD_MAX_BYTES = 10MB` (line 35).

Excerpts (verified by advisor read):

```ts
// media.ts ~548-556 — per-output promotion with MISSING_OUTPUT guard ...
for (const output of intent.outputs) {
  if (!isContainedWithin(intents.stagingRoot, output) || !existsSync(output)) {
    return reply.status(422).send({ error: { code: 'MISSING_OUTPUT', ... } });
  }
  ...
```

```ts
// media.ts ~575-592 — ... but empty outputs skip the loop, then link '' anyway
product.image_avif_path = canonicalTargetFor(intent, intent.outputs[0] ?? '');
// (else branch: product.image_path = same)
```

```ts
// media.ts:631-640 — every output maps to ONE canonical path
function canonicalTargetFor(intent: MediaIntent, _output: string): string {
  const base = intent.target_path ?? '';
  if (intent.type === 'avif') return base.replace(/\.(png|jpe?g|webp)$/i, '.avif');
  if (intent.type === 'variant') return base.replace(/(\.[a-z0-9]+)$/i, '-480$1');
  return base;
}
```

Conventions: media errors use typed codes (`MISSING_OUTPUT`, `FORBIDDEN`);
apply is wrapped in try/catch with best-effort file rollback (keep that
structure); existing rollback tests pin promote/rollback pairing — run them
first and keep them green.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/media.ts` (apply + target
  derivation + staged naming)
- `admin/content-manager/test/integration/mediaApplyOutputs.test.ts` (create)

**Out of scope**:

- `mediaJobs` runner semantics (read-only investigation unless the output
  contract itself is broken — then report, do not redesign the runner).
- Rollback pairing changes beyond keeping them working.
- New media types or UI workbench changes.

## Git workflow

- Branch: `advisor/176-media-apply-outputs`
- Commit per step; e.g. `fix(admin): guard media apply on empty outputs; per-output targets (plan 176)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline + investigate the output contract

Requires plan 170 DONE. Run Install + typecheck + media tests unmodified.
Then read `mediaJobs.ts` fully and answer: can an intent legally have (a)
zero outputs, (b) >1 outputs, (c) outputs sharing one staged path across
intents? Record the answers in the commit message of Step 1.

- If zero-output intents are impossible by construction (schema + runner
  guarantee), narrow Step 1 to a defensive 422 and say so.
- If multi-output intents are impossible, narrow Step 2 to a defensive
  single-output assertion and skip per-output naming.

**Verify**: baseline green; investigation answers recorded.

### Step 1: 422 on empty outputs before touching the catalog

At the top of the apply handler (before the promotion loop AND before the
product-reference update): if `intent.outputs.length === 0`, return 422
`{ code: 'MISSING_OUTPUT', message: 'Intent has no outputs to promote' }`.
No catalog write, no status change.

**Verify**: `npm run admin:typecheck` → exit 0; existing media tests pass.

### Step 2: Per-output canonical targets (+ intent-scoped staged names if needed)

- Change `canonicalTargetFor` to derive from the passed `output` (use the
  parameter instead of ignoring it): each output maps to a distinct
  canonical name (e.g. preserve the output's own basename/variant suffix
  under the target directory). The product reference update uses the
  primary output's canonical target (document which one is primary).
- If investigation proved staged-path sharing across intents, suffix staged
  file names with the intent id at creation (and update discard/rollback to
  match). If not proven, skip this half and record why.

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 3: Add apply-output tests

Create `test/integration/mediaApplyOutputs.test.ts`:

1. Apply with empty outputs → 422, product image fields unchanged, intent
   not `applied`.
2. (If multi-output possible) apply with 2 outputs → 2 distinct canonical
   files exist, product points at the documented primary.
3. Rollback pairing still works after the change (promote then force a
   catalog-write failure → staged files restored).

**Verify**: `npm run admin:test` → all pass including the new file.

## Test plan

- New integration file, cases above (2–3 depending on investigation).
- Existing media/rollback tests green (they pin the pairing).
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with new media-apply tests passing.
- [ ] `grep -n "outputs.length === 0" admin/content-manager/src/server/routes/media.ts` matches (empty guard present).
- [ ] `canonicalTargetFor` reads its output parameter (no `_output` unused param).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The apply handler does not match excerpts (drift).
- `mediaJobs` output contract makes per-output naming wrong (e.g. outputs
  are renditions of one file by design — then the fix is different: apply
  the primary only and report).
- The staged-sharing fix requires touching discard paths outside `media.ts`.
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Document which output is "primary" for product linking in a code comment;
  future output kinds must update the mapping table, not add another
  `outputs[0] ?? ''`.
- Reviewer: verify the rollback test actually forces the failure AFTER
  promotion (otherwise it proves nothing).
- **Deferred:** `mediaJobs` runner redesign (only if investigation shows the
  contract itself is broken).
