# Plan 182: Narrow the loopback credential bypass to IP-only + pin the matrix

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/server/security/launchCredential.ts admin/content-manager/src/server/app.ts admin/content-manager/test/contract/credential.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: security
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The mutation bypass trusts a client-controlled `Host` header as sufficient:
`isLoopbackRequest` returns true on loopback IP **or** loopback Host. A
non-loopback client that somehow reaches the port (tunnel, proxy
misconfiguration, future bind change) sends `Host: localhost` and skips the
launch credential entirely. The fix (bypass on source IP only) changes
nothing for the single-operator PC flow — which always presents a loopback
source IP — and the existing test file already injects a non-loopback host,
so extending it to a full matrix is cheap. Rotate the launch credential
after deploying since bypass semantics change (rotation channel: replace
`data/.admin-credential` / `ADMIN_CREDENTIAL` and restart, per `start.ts`).

## Current state

Relevant files:

- `admin/content-manager/src/server/security/launchCredential.ts` — lines
  35–52 (verified by advisor read).
- `admin/content-manager/src/server/app.ts` — bypass call site (line ~268),
  `onRequest` Host allowlist rejecting non-loopback Host (lines ~284–292).
- `admin/content-manager/test/contract/credential.test.ts` — lines 49–87:
  asserts old credential allowed on loopback, rejected on hard-coded
  `192.168.1.10:3000` host; no `X-Forwarded-For`, `::ffff:`-mapped, or
  `localhost`-vs-`127.0.0.1` matrix.

Excerpts (verified by advisor read):

```ts
// launchCredential.ts:47-52 — OR logic trusts the header
export function isLoopbackRequest(
  ip: string | undefined,
  hostHeader: string | string[] | undefined
): boolean {
  return isLoopbackIp(ip) || isLoopbackHost(hostHeader);
}
```

```ts
// app.ts — bypass skips the credential for "loopback" requests
if (isLoopbackRequest(request.ip, request.headers.host as ...)) {
  return;   // no credential check
}
```

Note: `start.ts` refuses non-loopback `HOST` at boot and the `onRequest`
allowlist rejects non-loopback `Host` — so today a remote attacker must
_also_ present a loopback Host to exploit this (which the vulnerable OR
then honors). The finding is real defense-in-depth, not a live hole; say so
in the commit message. No secret values are involved in code or tests.

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success |
| --------- | ------------------------- | ---------- | ------------------- |
| Install   | `npm ci`                  | declared   | exit 0              |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0              |
| Tests     | `npm run admin:test`      | declared   | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/security/launchCredential.ts`
  (`isLoopbackRequest` only — keep `isLoopbackHost` exported for the
  `onRequest` rejection layer)
- `admin/content-manager/test/contract/credential.test.ts` (matrix)
- Any callers of `isLoopbackRequest` that need updating (grep first)

**Out of scope**:

- The `onRequest` Host allowlist (keep as the independent rejection layer).
- `start.ts` bind logic, credential generation/rotation mechanics.
- `X-Forwarded-For` trust policy beyond the test matrix (Fastify `trustProxy`
  is unset — document that forwarded headers are currently untrusted and
  keep it that way).

## Git workflow

- Branch: `advisor/182-loopback-bypass-ip-only`
- Commit per step; e.g. `fix(admin): loopback bypass on source IP only + matrix tests (plan 182)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Install + typecheck + credential contract tests unmodified. Grep all
callers of `isLoopbackRequest` and `isLoopbackHost` to confirm the blast
radius is `app.ts` only.

**Verify**: green; caller list recorded; otherwise STOP.

### Step 1: Bypass on loopback source IP only

Change `isLoopbackRequest` to `return isLoopbackIp(ip)` (drop the Host-OR).
Keep `isLoopbackHost` for the `onRequest` allowlist (independent rejection
layer — a remote client with `Host: localhost` must now be _rejected_ there
or _challenged_ here, never bypassed). Update the doc comment to state the
rule: "bypass requires loopback source IP; Host is never sufficient."

**Verify**: `npm run admin:typecheck` → exit 0.

### Step 2: Parameterized bypass matrix test

Extend `credential.test.ts` with a matrix over (source IP via `app.inject`
`remoteAddress`, Host header, `X-Forwarded-For`) × (with/without valid
credential) asserting bypass vs 401/403. Minimum rows: loopback IP +
loopback host (bypass, no credential); loopback IP + evil host (rejected by
allowlist); remote IP + loopback host + no credential (must demand
credential — the fixed behavior); remote IP + valid credential (pass);
`::ffff:127.0.0.1` mapped loopback (bypass); `X-Forwarded-For: 127.0.0.1`
with remote source (must NOT bypass — forwarded headers untrusted).

**Verify**: `npm run admin:test` → all pass including the matrix.

## Test plan

- Extended `credential.test.ts` matrix (≥6 rows above).
- Existing route-policy guarantee tests green.
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0.
- [ ] `npm run admin:test` exits 0 with matrix rows passing.
- [ ] `grep -n "isLoopbackHost" admin/content-manager/src/server/security/launchCredential.ts` shows it still exists but `isLoopbackRequest` no longer calls it.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `isLoopbackRequest` has callers beyond `app.ts` with different trust needs.
- Fastify `trustProxy` is enabled anywhere (then `request.ip` itself is
  header-derived — report; the fix changes shape).
- The matrix shows the loopback operator flow now demands a credential on
  localhost (bypass broken — report, do not ship).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- After deploy: rotate the launch credential via the file channel
  (`data/.admin-credential` replace + restart) since bypass semantics
  changed; note it in the commit message.
- If the admin is ever bound non-loopback intentionally, this bypass must be
  re-examined — leave a comment to that effect at the call site.
- **Deferred:** session-scoped credential holder (plan 184 investigate).
