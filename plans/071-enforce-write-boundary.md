# Plan 071: Enforce the write boundary — route classification, credential bootstrap, and Host validation

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

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: security
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The plan-057 requirement "per-launch credential required for every mutation"
(F02) is currently non-functional in the shipped code, verified empirically:

1. **The route policy table is stale and fail-open.** `classifyRoute` returns
   `{ class: "read" }` for any URL not listed, and the preHandler only enforces
   the credential for class `"mutation"` and the read-only gate for
   `"mutation" | "preview"`. ~15 registered mutation routes are NOT in the
   table (and the table lists ~7 paths no route registers), so in operator
   mode they run with **no credential check at all**, and in read-only mode
   several of them still write canonical files.
2. **`GET /api/v1/bootstrap` hands out the launch credential unauthenticated**
   (verified with a live server: the response contains `"credential":"…"`).
   Any local process — or a DNS-rebinding web page, since `Host` is never
   validated and GET is exempt from the origin checks — obtains it and then
   passes the credential check on every classified mutation route.
3. **Read-only mode is bypassable**: `POST /backup/:id/restore` overwrites
   `data/*.json` with no `enableWrites` check in the handler.

After this plan: every mutation route requires the launch credential, unknown
routes fail closed, read-only mode rejects all writes even in handlers, the
credential is never served over an unauthenticated endpoint, and the server
rejects unexpected Host headers.

## Current state

Verified code (read directly; excerpts abridged):

- `admin/content-manager/src/server/security/routePolicy.ts:65-87` — fail-open classifier:
  ```ts
  export function classifyRoute(method: string, url: string): RouteMatch {
    ...
    return { class: "read", exact: false };   // :86 — anything unlisted
  }
  ```
  The `ROUTE_POLICY` table (`:9-58`) lists e.g. `/api/v1/changes`, `/media/intent`,
  `/publication/apply`, `/backup/create`, `/backup/restore`, `/backup/prune` —
  **none of which are registered**.
- `admin/content-manager/src/server/app.ts:139-164` — the gate:
  ```ts
  app.addHook("preHandler", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (url.startsWith("/api/v1/health")) return;
    if (url.startsWith("/api/v1/bootstrap")) return;   // :142 — exempt
    const routeClass = classifyRoute(request.method, url);
    if (routeClass.class === "mutation" || routeClass.class === "preview") {
      if (!enableWrites) return reply.status(405).send({ error: { code: "READ_ONLY", ... } });
    }
    if (routeClass.class === "mutation") {
      const credential = extractCredential(request.headers as ...);
      if (!validateCredential(credential, launchCredential)) return reply.status(401).send({ ... });
    }
  });
  ```
- `app.ts:166-192` — the onRequest hook checks `sec-fetch-site`/`origin` only
  for POST/PATCH/PUT/DELETE, and compares `origin` against
  `request.protocol://request.hostname` — the hostname comes from the
  client-controlled `Host` header.
- `admin/content-manager/src/server/routes/bootstrap.ts:35` — returns the credential:
  ```ts
  return { capabilities: {...}, revision: {...}, counts: {...}, credential: launchCredential };
  ```
- Registered mutation routes MISSING from the policy (verified by grep over
  `src/server/routes/*.ts`):
  - `POST /change-sets`, `PATCH /change-sets/:id`, `POST /change-sets/:id/discard` (changes.ts:17,43,68)
  - `POST /backup`, `POST /backup/:id/restore` (backup.ts:40,71)
  - `POST /conflicts/:id/resolve`, `POST /conflicts/:id/retry` (conflicts.ts:46,87)
  - `POST /media/intents`, `DELETE /media/intents/:id`, `POST /media/convert`, `POST /media/generate` (media.ts:27,70,75,85)
  - `POST /publications`, `POST /publications/preview`, `POST /jobs/:id/cancel` (publication.ts:54,83,223)
  - `POST /categories/reorder`, `POST /nav-groups`, `DELETE /nav-groups/:id` (catalog.ts:417,440,461)
- `backup.ts:71-115` — `POST /backup/:id/restore` copies backup files over
  canonical `data/*.json` with no `enableWrites` check (verified: no reference
  to `enableWrites`/`productService` in the file).
- The web app obtains the credential: `src/web/app/api/client.ts:117-131`
  fetches `/api/v1/bootstrap`; `src/web/app/credentialStore.ts:13-24` holds it
  in memory.
- `start.ts:7-10` already refuses non-loopback `HOST` — keep that.

Repo conventions: TypeScript 7, `tsc -p tsconfig.json --noEmit` for typecheck;
vitest tests in `admin/content-manager/test/` (contract/ + integration/);
integration tests use `app.inject` against a real temp repo — pattern:
`test/integration/mutationApi.test.ts` and `test/integration/api.test.ts`.

## Commands you will need

| Purpose    | Command                                                               | Expected on success             |
| ---------- | --------------------------------------------------------------------- | ------------------------------- |
| Typecheck  | `npm run admin:typecheck`                                             | exit 0                          |
| Tests      | `npm run admin:test`                                                  | exit 0 (289 tests)              |
| Run server | `ADMIN_MODE=operator PORT=4317 node --import tsx src/server/start.ts` | "Write mode enabled"            |
| Probe      | `curl -s http://127.0.0.1:4317/api/v1/bootstrap`                      | no credential field (after fix) |

## Suggested executor toolkit

- `frontend-security` skill if available — the fix touches a local web
  server's authz boundary.

## Scope

**In scope**:

- `admin/content-manager/src/server/security/routePolicy.ts`
- `admin/content-manager/src/server/app.ts`
- `admin/content-manager/src/server/routes/bootstrap.ts`
- `admin/content-manager/src/server/routes/backup.ts` (read-only guard only)
- `admin/content-manager/src/server/routes/changes.ts`, `conflicts.ts`,
  `media.ts`, `publication.ts`, `catalog.ts` — ONLY if a shared guard needs
  adding at the route-registration site; prefer the central hook.
- `admin/content-manager/test/` — new/updated tests.
- `admin/content-manager/src/web/app/` — ONLY if the bootstrap contract change
  (credential no longer served) requires a UI change; see Step 3.

**Out of scope**:

- Fixing the bugs on the unclassified routes themselves (e.g. publication
  commit scoping is plan 072; backup ID collision is plan 076).
- Changing the web UI behavior beyond what the credential hand-off requires.
- Any change to the Astro storefront or the Python fallback.

## Git workflow

- Branch: `advisor/071-enforce-write-boundary`.
- Commit per step; message style follows `git log`: `fix(admin): ...`,
  `feat(admin): ...`. End with the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.
- Note: the working tree may contain uncommitted changes from the migration
  (plan 070 baseline) — stage only the files you modify.

## Steps

### Step 1: Make unknown routes fail closed

In `routePolicy.ts`, change the fallback so an unmatched **non-GET** request
is classified `"mutation"` (requiring credential + write-mode), while an
unmatched GET stays `"read"`:

```ts
return { class: 'mutation', exact: false }; // for non-GET; read for GET
```

Keep `exact: false` so callers can distinguish allowlist matches. Also add a
`classifyRoute` unit test in `test/contract/routePolicy.test.ts` (new file)
covering: listed exact route, listed param route, unlisted GET → read,
unlisted POST/PATCH/PUT/DELETE → mutation.

**Verify**: `npm run admin:typecheck` exit 0; `npm run admin:test` exit 0
with the new tests.

### Step 2: Re-sync the policy table with the registered route tree

Rewrite `ROUTE_POLICY` to match the actual registrations from the grep list
in "Current state" (all routes in `src/server/routes/*.ts`), classifying each:
`mutation` for every POST/PATCH/PUT/DELETE except the read-only previews
(`POST /products/bulk/preview`, `POST /media/intents`? — classify intent as
`preview`, `/publications/preview` as `preview`, `/import/preview` as
`preview`), and remove the seven phantom entries. Keep `GET /git/status` and
`GET /backup` as `read`.

Add a **guarantee test** that prevents future drift: a test in
`test/contract/routePolicy.test.ts` that scans the route registrations —
simplest robust approach: an `app.inject`-based test iterating a list of
known mutation paths and asserting each returns `401` (not `200`) when
called without a credential in operator mode, plus a `404/405`-free probe
that unlisted GET stays readable. Use the existing `createApp` helper from
`test/integration/api.test.ts` with `enableWrites: true`.

**Verify**: `npm run admin:test` exit 0; the new guarantee test fails before
your table fix and passes after.

### Step 3: Stop serving the credential over HTTP

The bootstrap response must no longer contain the credential. Options, pick
the one that keeps the UI working (inspect `client.ts:117-131` and
`credentialStore.ts:13-24` first):

- **Preferred**: operator supplies the credential via env var
  `ADMIN_CREDENTIAL` (document in `start.ts`); `createApp` uses it when set,
  else generates one and **prints it to the server console at startup**
  (so the operator can paste it into the UI login field). The web app keeps
  its existing credential prompt; remove the bootstrap fetch.
- Alternative if the UI needs the bootstrap handshake: gate `/bootstrap` on a
  one-time bootstrap secret from env (`ADMIN_BOOTSTRAP_SECRET`) passed as
  `x-bootstrap-secret` header, still never returning the credential in the
  body without that secret.

Whichever you choose: `bootstrap.ts` must not return `credential` in the
response body, and `start.ts` must log the credential (or its env source)
exactly once at startup in operator mode.

**Verify**: start the server in operator mode, `curl -s http://127.0.0.1:4317/api/v1/bootstrap`
→ response has no `credential` field; the terminal shows the credential line.

### Step 4: Add Host-header allowlist to the onRequest hook

In `app.ts` onRequest hook (before the origin checks), reject requests whose
`Host` is not one of `localhost`, `127.0.0.1`, `[::1]` (with optional
`:port`). Read the port from the request (`request.hostname`), compare the
hostname part only:

```ts
const host = (request.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Invalid Host header' } });
}
```

**Verify**: with the server running, `curl -s -H "Host: evil.example" http://127.0.0.1:4317/api/v1/health` → 403; without the header → 200.

### Step 5: Enforce write mode inside handlers that bypass the hook

`POST /backup/:id/restore` writes canonical files in read-only mode. Add an
`enableWrites` check to `backupRoutes` (pass the flag from `app.ts:136` —
`backupRoutes(instance, repoRoot, enableWrites)`) and return 405 READ_ONLY
when disabled. Grep the other unclassified-now-classified routes for direct
file writes (media upload, change-set save, conflicts save, sync config
write) and confirm the central hook now covers them (Step 1's fail-closed +
Step 2's table) — add handler guards ONLY where a route still writes with
class `"preview"` or `"read"`.

**Verify**: in read-only mode (`ADMIN_MODE=read-only`), `POST /backup/anything/restore` → 405; in operator mode with a valid backup id → not 405.

### Step 6: End-to-end verification

With the server in operator mode and `ADMIN_CREDENTIAL` set:

1. `curl -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:4317/api/v1/products` → 401 (no credential).
2. Same with `-H 'x-admin-credential: <bad>'` → 401.
3. Same with the real credential → 400/422 (validation), NOT 401.
4. `POST /api/v1/backup` without credential → 401.
5. `POST /api/v1/change-sets` without credential → 401.
6. In read-only mode: any of the above with valid credential → 405 READ_ONLY.

**Verify**: every probe returns the listed status; record the output in your
commit message.

## Test plan

- `test/contract/routePolicy.test.ts` (new): classifier units + the
  registered-routes guarantee test from Step 2.
- `test/integration/writeBoundary.test.ts` (new, modeled on
  `test/integration/mutationApi.test.ts`): for each mutation route in the
  table — no credential → 401; wrong credential → 401; read-only mode → 405;
  valid credential → not 401. At minimum cover: products POST, backup POST,
  backup restore, change-sets POST, conflicts resolve, media upload,
  publications POST, sync config PUT.
- Update any existing test that relied on the old bootstrap contract
  (search `bootstrap` in `test/` and `src/web/`).
- **Verify**: `npm run admin:typecheck` exit 0; `npm run admin:test` exit 0
  (289 + new tests).

## Done criteria

- [ ] `classifyRoute` returns `mutation` for unlisted non-GET routes
- [ ] `ROUTE_POLICY` contains every registered mutation route; no phantom entries
- [ ] `GET /api/v1/bootstrap` response contains no `credential` field (verified by curl)
- [ ] Host header not in the allowlist → 403 (verified by curl)
- [ ] `POST /backup/:id/restore` → 405 in read-only mode
- [ ] All six operator-mode probes in Step 6 return their expected status
- [ ] `npm run admin:typecheck` and `npm run admin:test` exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row 071 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The route table/classifier code doesn't match the "Current state" excerpts
  (drift).
- The web UI credential flow depends on the bootstrap response in a way that
  breaks the admin app's login (inspect `credentialStore.ts`/`client.ts`
  before choosing the Step 3 approach; if both options break the UI, STOP
  and report).
- Any probe in Step 6 returns a status outside the expected set after a
  reasonable fix attempt.
- You find a route that writes files but is classified `read` — that means
  the table is still wrong; fix the table, don't silence it.

## Maintenance notes

- Every new route must be added to `ROUTE_POLICY` in the same change that
  registers it — the Step 2 guarantee test enforces this; if it ever fails
  in CI, the fix is to classify, not to weaken the test.
- Plan 072 (publication commit scoping) and 076 (backup IDs) build on this
  boundary; land 071 first.
- The credential flow decision in Step 3 becomes the documented operator
  contract — mirror it in `admin/content-manager/.env.example` (plan 079
  covers docs; leave a comment in `start.ts` referencing it).
