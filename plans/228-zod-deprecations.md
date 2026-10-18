# Plan 228: Replace the deprecated zod v4 string-format APIs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/server/adapters/syncAdapter.ts admin/content-manager/src/shared/schemas/comms.ts admin/content-manager/test/contract/schemas.test.ts admin/content-manager/test/contract/comms.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: deps
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Zod v4 moved string formats to top-level constructors and marks the old
string-method forms as deprecated-for-removal (verified in the installed
typings: `node_modules/zod/v4/classic/schemas.d.ts:112` "Use `z.url()`
instead" and `:160` "Use `z.iso.datetime()` instead"). The repo has exactly
six such usages — one `url`, five `datetime` — all in the admin. After this
plan there are zero, and the schema/contract tests pin the behavior so the
eventual removal of the deprecated forms is a no-op for this repo.

## Current state

- `admin/content-manager/src/server/adapters/syncAdapter.ts:5` —
  `api_base: z.string().url().optional(),`
- `admin/content-manager/src/shared/schemas/comms.ts:58,59,103,119,130` —
  `updated_at: z.string().datetime()`, `last_used_at: z.string().datetime().optional()`,
  `at: z.string().datetime()`, `updated_at: z.string().datetime()`,
  `exported_at: z.string().datetime()`.

No other deprecated string-format usages exist (verified by grep across
`admin/content-manager/src`, `astro-poc/src`, `tools/`).

Existing tests that exercise these schemas: `test/contract/schemas.test.ts`,
`test/contract/comms.test.ts`, `test/integration/commsApi.test.ts`; the
route policy/OpenAPI document does not serialize zod formats directly but
`test/contract/openapi.test.ts` may pin shapes — run it.

## Commands you will need

| Purpose       | Command                                                                                                                                                                  | Provenance | Expected on success |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install       | `npm ci`                                                                                                                                                                 | declared   | exit 0              |
| Focused tests | `npx vitest run test/contract/schemas.test.ts test/contract/comms.test.ts test/integration/commsApi.test.ts test/contract/openapi.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests   | `npm run admin:test`                                                                                                                                                     | declared   | all pass            |
| Typecheck     | `npm run admin:typecheck`                                                                                                                                                | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/adapters/syncAdapter.ts`
- `admin/content-manager/src/shared/schemas/comms.ts`

**Out of scope**:

- Any other schema modernization (v3-era patterns do not exist here) and
  any behavioral change to validation.

## Git workflow

- Branch: `advisor/228-zod-deprecations`
- Commit: `refactor(admin): use zod v4 top-level formats (plan 228)`.

## Steps

### Step 0: Establish a green baseline

Install + the focused tests on the unmodified checkout. Red → STOP.

### Step 1: Replace the six usages

- `z.string().url()` → `z.url()`.
- `z.string().datetime()` → `z.iso.datetime()` (all five).

Keep `.optional()` chaining identical; no parameter changes.

**Verify**: `grep -rn "z.string().url()\|z.string().datetime()" admin/content-manager/src` → no matches; `npm run admin:typecheck` → exit 0.

### Step 2: Tests

Run the focused tests. If any assertion pins the old zod issue format or
error message for these fields (e.g. `invalid_string` vs the new issue
code), update the expectation and note it in the commit body — the
validation behavior itself must be identical (same accepted/rejected
inputs). Add one boundary case per type to `schemas.test.ts` if not already
covered: a valid ISO datetime, an invalid one, a valid URL, an invalid URL.

**Verify**: focused tests → all pass.

### Step 3: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "z.string().url()\|z.string().datetime()" admin/content-manager/src` returns nothing
- [ ] `grep -c "z.iso.datetime()" admin/content-manager/src/shared/schemas/comms.ts` shows 5
- [ ] `npm run admin:test` exits 0
- [ ] `npm run admin:typecheck` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `z.iso.datetime()` rejects an input the old form accepted (report the
  input and both messages — the semantics differ and that is a behavior
  question).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- New zod string formats must use the top-level constructors (`z.url()`,
  `z.iso.datetime()`, `z.email()`); a lint rule is not warranted for six
  call sites, but reviewers should reject the deprecated forms.
- **Deferred:** none.
