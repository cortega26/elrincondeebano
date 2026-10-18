# Plan 223: Remote-mode hardening — session-scoped credential, gated health, truthful env example

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/web/app/credentialStore.ts admin/content-manager/src/web/api/requestCore.ts admin/content-manager/src/server/app.ts admin/content-manager/.env.example admin/content-manager/test/contract/remoteOrigin.test.ts admin/content-manager/test/web/credentialStore.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Three stale assumptions after the 2026-10-13 OCI remote mode:

1. `credentialStore.ts` persists the operator credential to
   `localStorage` with **no expiry**, under a recorded risk acceptance whose
   rationale is the opposite of what ships: "the admin is **loopback-only**
   with no third-party script surface" (plan 184, 2026-09-14). Remote mode
   serves the same SPA from a public HTTPS origin; write access to the
   catalog (and the comms PII API) then rides a non-expiring secret in
   browser storage. The decision, not the code, drifted — re-scope it:
   loopback keeps localStorage; remote mode uses `sessionStorage` (per
   browser session) and keeps the existing "Credencial ✓" clear action.
2. `/api/v1/health` is the **only** `/api/v1/*` route exempted from the
   remote-mode credential gate (`app.ts:293`) and it returns
   `version`/`node`/`uptime` (`routes/health.ts:6-13`). Anyone who reaches
   the tunnel hostname (e.g. if Cloudflare Access drifts) gets
   unauthenticated reconnaissance of the runtime — the exact failure mode
   README:38-43 promises cannot happen ("every API read and write requires
   `x-admin-credential`").
3. `admin/content-manager/.env.example:14-15` tells operators the credential
   "is printed once in the startup log in operator mode" — plan 125 removed
   exactly that (file `data/.admin-credential`, 0600, only the _path_ is
   logged) and the README documents the file channel. The example must stop
   teaching log-hunting for a credential, and must list
   `ADMIN_REMOTE_ORIGIN`, the only switch that enables the strict gate.

## Current state

`credentialStore.ts:1-13` (comments + key), `:28-63`:

```ts
// Plan 184 accepted risk (owner-confirmed 2026-09-14): localStorage (not
// session) persistence stands — a same-origin XSS could exfiltrate it, but
// the admin is loopback-only with no third-party script surface. ...
const STORAGE_KEY = 'ebano-credential';
...
export function isLoopback(): boolean { /* hostname in {127.0.0.1, localhost, ::1} */ }
```

`admin/content-manager/src/server/app.ts:291-296`:

```ts
app.addHook('preHandler', async (request, reply) => {
  const url = request.url.split('?')[0] ?? '';
  if (url.startsWith('/api/v1/health')) return;
  ...
  if (remoteOrigin && url.startsWith('/api/v1/')) { /* credential gate */ }
```

`admin/content-manager/test/contract/remoteOrigin.test.ts:43` — asserts
`/api/v1/health` → 200 **without** credential in remote mode (this plan
changes that expectation).

`admin/content-manager/.env.example:12-19` — current lines:

```
# Launch credential for mutations (plan 071). If unset, the server generates
# one and prints it once in the startup log in operator mode.
# ADMIN_CREDENTIAL=
```

`admin/content-manager/README.md:56-58` documents the real file channel
(0600, path logged) — that is the truth to mirror.

Admin web tests live in `admin/content-manager/test/web/` (React harness in
`harness.tsx`; vitest config at `admin/content-manager/vitest.config.ts`).
`requestCore.ts:11,44` consumes `getCredentialValue`/`resetCredential` — the
storage swap is transparent to it.

## Commands you will need

| Purpose         | Command                                                                                                            | Provenance | Expected on success |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install         | `npm ci`                                                                                                           | declared   | exit 0              |
| Focused tests   | `npx vitest run test/contract/remoteOrigin.test.ts test/web/credentialStore.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests     | `npm run admin:test`                                                                                               | declared   | all pass            |
| Admin typecheck | `npm run admin:typecheck`                                                                                          | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/credentialStore.ts`
- `admin/content-manager/src/server/app.ts` (health gate only)
- `admin/content-manager/.env.example`
- `admin/content-manager/test/contract/remoteOrigin.test.ts`
- `admin/content-manager/test/web/credentialStore.test.ts` (create)

**Out of scope** (do NOT touch):

- The credential file channel, rotation script, constant-time compare,
  Host allowlist, CSRF/Origin validation (verified correct in audit).
- `requestCore.ts` 401-reset behavior.
- Root `.env.example` (plan 226 owns the cross-repo env surface).

## Git workflow

- Branch: `advisor/223-remote-mode-hardening`
- Commits: `fix(admin): session-scope the credential in remote mode (plan 223)` etc.

## Steps

### Step 0: Establish a green baseline

Run Install then the two focused test files on the unmodified checkout. If a
`declared` command fails, STOP.

**Verify**: focused tests → all pass.

### Step 1: Session-scoped credential for non-loopback origins

In `credentialStore.ts`:

- Add a private `activeStorage()` helper: `isLoopback() ?
window.localStorage : window.sessionStorage` (guard `typeof window`,
  try/catch around access as today; if sessionStorage is unavailable, fall
  back to in-memory only — never to localStorage in remote mode).
- Route `getCredentialValue`, `setCredential`, `resetCredential` through it.
- Rewrite the plan-184 comment to record the new decision: "localStorage is
  for the loopback single-operator PC; any non-loopback origin (remote
  mode) keeps the credential for the browser session only (plan 223
  re-scope). Credential continues to be clearable via the UI button and on
  401."

New unit test `test/web/credentialStore.test.ts`: with a non-loopback
`window.location.hostname`, `setCredential` writes sessionStorage and NOT
localStorage and `getCredentialValue` reads it back; with a loopback
hostname the inverse; `resetCredential` clears the active storage;
throwing storage does not throw. Build the stub window/location the way the
existing web tests do (see `harness.tsx` for the jsdom setup style).

**Verify**: `npx vitest run test/web/credentialStore.test.ts` (cwd
`admin/content-manager`) → all pass.

### Step 2: Gate `/api/v1/health` in remote mode

In `app.ts` change the exemption so it only applies when remote mode is
off:

```ts
if (!remoteOrigin && url.startsWith('/api/v1/health')) return;
```

(loopback/local deployments keep the credential-free probe; remote mode
falls through to the existing credential gate). No payload change needed
once gated.

Update `remoteOrigin.test.ts:43` to the new matrix:
`GET /api/v1/health` without credential → 401; with `x-admin-credential` → 200.

**Verify**: `npx vitest run test/contract/remoteOrigin.test.ts` (cwd
`admin/content-manager`) → all pass.

### Step 3: Truthful `admin/content-manager/.env.example`

Replace the credential block with the file-channel truth and add the remote
switch:

```
# Launch credential for mutations (plan 071/125). If unset in operator mode,
# a credential is generated and written to data/.admin-credential (0600,
# gitignored); only the path is logged. It is never printed or served.
# ADMIN_CREDENTIAL=

# Remote (OCI) mode: exact HTTPS origin of the admin hostname. Enabling it
# requires x-admin-credential on every /api/v1 request (including health)
# and a deny-by-default Cloudflare Access policy in front of the tunnel.
# See admin/content-manager/README.md "OCI remote mode".
# ADMIN_REMOTE_ORIGIN=
```

**Verify**: `grep -n "startup log" admin/content-manager/.env.example` →
no matches.

### Step 4: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:typecheck` →
exit 0; `npm run admin:lint` → exit 0.

## Test plan

- New `test/web/credentialStore.test.ts` (storage matrix, Step 1).
- Updated `remoteOrigin.test.ts` health case (Step 2).
- No e2e changes required (remote mode is not exercised by default e2e).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/contract/remoteOrigin.test.ts test/web/credentialStore.test.ts` (cwd `admin/content-manager`) exits 0
- [ ] `npm run admin:test` exits 0
- [ ] `grep -n "sessionStorage" admin/content-manager/src/web/app/credentialStore.ts` matches
- [ ] `grep -n "!remoteOrigin && url.startsWith('/api/v1/health')" admin/content-manager/src/server/app.ts` matches
- [ ] `grep -n "ADMIN_REMOTE_ORIGIN" admin/content-manager/.env.example` matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- An admin e2e suite depends on localStorage credential persistence from a
  non-loopback hostname (report which suite — e2e runs on 127.0.0.1 and
  must be unaffected).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- The operator gets logged out per browser session in remote mode — that is
  the intended trade. If it proves painful, the follow-up is a
  short-scoped cookie/token session server-side, not a return to
  localStorage.
- Reviewer: confirm the loopback path is unchanged (localhost operators
  should not notice anything).
- **Deferred:** rotating the credential when leaving remote mode unused is
  documented in README (file channel), unchanged here.
