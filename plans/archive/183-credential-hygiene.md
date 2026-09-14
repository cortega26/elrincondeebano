# Plan 183: Remove committed test credentials; widen audit-log redaction

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/scripts/e2e-scope-server.mjs admin/content-manager/scripts/e2e-import-server.mjs admin/content-manager/src/server/services/auditLogger.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: security
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Two credential-hygiene gaps, both cheap: (1) the E2E harnesses commit
short, guessable launch-credential literals that sit below the secret-scan
length threshold — anyone with the repo knows valid operator credentials for
those harnesses, which matters the moment a harness runs outside strict
loopback (shared CI agent, forwarded port). (2) `AuditLogger` redacts
token/password/secret families but not `credential`/`key` families — a
future caller logging request context writes a long-lived plaintext copy of
an authenticator to `logs/audit.ndjson`. Per standing rules: reference
credential _types and locations only_, never values — and treat both
committed literals as burned (never reuse; rotate anything that matched).

## Current state

Relevant files:

- `admin/content-manager/scripts/e2e-scope-server.mjs` — env
  `ADMIN_CREDENTIAL` set to a short committed literal (line ~26), harness
  binds `HOST: '127.0.0.1'`, `PORT` defaults 3102.
- `admin/content-manager/scripts/e2e-import-server.mjs` — same shape, second
  literal (line ~29), port 3101.
- `admin/content-manager/src/server/services/auditLogger.ts` — lines 14
  (`REDACTED_FIELDS`: token/password/secret/authorization/cookie) and 38–48
  (substring fallback for token/secret/password only); sink
  `logs/audit.ndjson`, best-effort.

Excerpts (verified by advisor read; values deliberately NOT reproduced):

```js
// e2e-scope-server.mjs — committed literal credential for the harness
ADMIN_CREDENTIAL: '<short-committed-literal>',  // file:line per drift check
```

```ts
// auditLogger.ts:14 — no credential/key families
const REDACTED_FIELDS = new Set(['token', 'password', 'secret', 'authorization', 'cookie']);
// auditLogger.ts:38-48 — substring fallback covers token/secret/password only
```

Conventions: harnesses spawn `src/server/start.ts` with temp repos and
`127.0.0.1` bind; tests assert behavior, never credential values. The
secret-scan guardrail (`tools/guardrails/secret-scan.mjs`) has a length
threshold these literals slide under — do not weaken the scanner; remove the
literals instead.

## Commands you will need

| Purpose   | Command                                                | Provenance | Expected on success               |
| --------- | ------------------------------------------------------ | ---------- | --------------------------------- |
| Install   | `npm ci`                                               | declared   | exit 0                            |
| Typecheck | `npm run admin:typecheck`                              | declared   | exit 0                            |
| Tests     | `npm run admin:test`                                   | declared   | all pass                          |
| E2E spot  | `npm run admin:test:e2e` (or the import/scope configs) | declared   | pass (proves harness still boots) |

## Scope

**In scope**:

- The two harness scripts (credential sourcing only).
- `auditLogger.ts` (redaction matcher only).
- A redaction unit test (extend existing auditLogger tests if present,
  else create `test/unit/auditLogger.test.ts` — check first; admin unit
  tests live under `admin/content-manager/test/`).

**Out of scope**:

- Secret-scan threshold changes (explicitly not in scope).
- Production credential rotation mechanics (note as operator step).
- Any other harness env/ports (plan 206 owns the E2E matrix fan-out).

## Git workflow

- Branch: `advisor/183-credential-hygiene`
- Commit per step; e.g. `fix(admin): ephemeral e2e credentials; redact credential/key log fields (plan 183)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Install + typecheck + admin tests unmodified. Confirm both harnesses boot
today (run one isolated config briefly, or trust CI — prefer a local boot
proof and record it).

**Verify**: green; otherwise STOP.

### Step 1: Ephemeral harness credentials

- In both scripts: generate the credential per run with
  `node:crypto` (`randomBytes(32).toString('hex)`), defaulting to
  `process.env.ADMIN_CREDENTIAL` if set (no committed fallback literal).
  Pass it to the spawned server env and to whatever the spec needs (if the
  specs hardcode the literal, update them to read the same env — grep for
  the literals repo-wide first and update every reference in the same commit).
- Delete the literals. Grep the repo for both literal strings afterwards —
  zero matches outside git history (history cannot be rewritten here; note
  "burned, do not reuse" in the commit message).

**Verify**: typecheck green; grep for literals → no matches in working tree.

### Step 2: Widen redaction to credential/key families

Extend both the exact set and the substring fallback with `credential`,
`api_key`/`apikey`, `private_key`, and bare `key` as a substring (careful:
`monkey`/`keyboard` false positives — use boundaries: match `key` only as
`_key` suffix, `key_` prefix, or exact `key`). Add unit tests: those field
names redact, benign fields (`monkey`, `keyboard`, `product_key_id`? decide
and document) pass through.

**Verify**: typecheck + admin tests pass.

### Step 3: Prove the harnesses still work

Run the import and scope isolated E2E configs (or at minimum boot each
harness and hit `/api/v1/health`). Record which you ran.

**Verify**: harness E2E green (or boot proof recorded).

## Test plan

- Redaction unit tests (new or extended): credential/key variants redact,
  benign pass through.
- Harness proof: isolated E2E configs green.
- Verification: `npm run admin:test` + harness run green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] `grep -rn "<literal-1>\|<literal-2>" admin/ --include="*.mjs" --include="*.ts"` returns no matches (find the literals via `git diff` context at plan time — they are the `ADMIN_CREDENTIAL` values in the two scripts).
- [ ] `grep -n "credential" admin/content-manager/src/server/services/auditLogger.ts` matches (matcher widened).
- [ ] Isolated harness E2E (import + scope) green or boot-proven.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Specs hardcode the literals in ways that cannot read env (report the
  files; do not redesign the E2E auth flow).
- The literal strings appear in committed docs Snapshots that tests assert
  on (report; do not rewrite history).
- The `key`-substring matcher cannot avoid false positives on real field
  names in the codebase (report the collisions; narrow the matcher).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Operator step after merge: rotate any credential that ever matched the
  committed literals; never reuse those strings anywhere.
- If any existing `logs/audit.ndjson` is found containing a credential,
  purge the file and rotate — check once during execution and record the
  result.
- New secret-shaped fields must be added to the matcher in the same commit
  that introduces them — leave that sentence as a code comment.
- **Deferred:** session-scoped browser holder (plan 184 investigate).
