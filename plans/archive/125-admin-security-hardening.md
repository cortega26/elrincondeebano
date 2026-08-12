# 125 — Admin security hardening: crypto IDs + credential delivery via 0600 file

- **Source**: Auditoría 9, SEC-02 + SEC-04
- **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `b3805e1`

## Problem

Two low-cost security findings:

1. **`Math.random()` identifiers gating unauthenticated read endpoints**
   (`shared/identity.ts:10-22` — UUIDv7 from `Math.random()`;
   `shared/schemas/changeSet.ts:67-68` — `cs-${Date.now()}-${Math.random()...}`;
   `shared/schemas/mediaIntent.ts:31-32` — same, ~31 bits of entropy).
   These IDs are the sole key for `GET /change-sets/:id`
   (`routes/changes.ts:114-128`) and media-intent reads — all `read` class,
   no credential required (`security/routePolicy.ts:60,69-70`). A
   loopback-local process can enumerate pending change-sets and media
   intents (incl. the absolute `source_path` of staged uploads,
   `routes/media.ts:210`). Not remotely exploitable (Host allowlist), but
   far below the 256-bit credential standard used elsewhere.
2. **Generated credential logged to stdout**
   (`admin/content-manager/src/server/start.ts:53-61`): when
   `ADMIN_CREDENTIAL` is unset, the generated 256-bit credential
   (`app.ts:69-70`) is printed verbatim (`generated launch credential:
<value>`). Stdout is routinely captured by journald/supervisor/pm2/CI
   runners — the sole mutation gate (`app.ts:229-241`) lands in log
   archives with no rotation mechanism.

## Scope

**In**: `admin/content-manager/src/shared/identity.ts`,
`shared/schemas/changeSet.ts`, `shared/schemas/mediaIntent.ts`,
`server/start.ts`, and the tests that assert on ID format or the credential
print.

**Out**: the credential check (`app.ts`), the route policy, existing
intent/change-set file formats on disk (IDs are opaque strings — no format
contract depends on the RNG; verify with a grep for `cs-`/`intent-`
prefix parsing before changing).

## Steps

1. Replace the three `Math.random()`-based generators with
   `crypto.randomUUID()` (already used at `server/httpServer.js:27` for the
   same purpose — follow its style), keeping the `cs-`/`intent-` prefixes
   (use e.g. `cs-${randomUUID()}`).
2. `start.ts`: stop printing the credential to stdout. Instead write it to
   `data/.admin-credential` (repo-relative, gitignored — verify `.gitignore`
   has the entry or add it) with mode `0o600`, and log only the file path:
   `generated launch credential written to <path> (0600)`.
3. If any test asserts the stdout line or the ID shape, update them to the
   new contract.
4. Update `.env.example` / the README's operator-onboarding section if it
   documents the stdout credential.

## Tests

- Unit: `generateUuidV7`/`generateChangeSetId`/`generateMediaIntentId`
  return unique, prefixed, UUID-shaped values (no `Math.random` source —
  assert two calls differ and the format matches the new contract).
- Integration: starting the app without `ADMIN_CREDENTIAL` creates
  `data/.admin-credential` with mode 0600 and does not contain the value in
  stdout (capture stdout in the test if the harness allows; otherwise
  assert the file exists + mode + the credential in it authenticates).
- `npm run admin:test` green.

## Done criteria

- [ ] `grep -rn "Math.random" src/shared/ src/server/` → only unrelated
      legitimate uses (none in ID generation).
- [ ] `start.ts` contains no `console.log` of the credential value.
- [ ] `data/.admin-credential` documented in `.gitignore` + README.
- [ ] `npm run admin:test` + `npm run lint` green.

## Maintenance

This is the local-first threat-model surface: read-class IDs are the
enumerability line, and the credential's delivery channel is the leak line.
Plan 100 (path validation) completes the input side of the same model.

## Rollback

`git revert <sha>` — note: any previously-printed credential is already
burned; rotation = set `ADMIN_CREDENTIAL` explicitly (documented in the
README update).
