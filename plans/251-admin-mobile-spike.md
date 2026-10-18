# Plan 251: Spike — mobile path for the admin/comms behind the authenticated remote mode

> **Executor instructions**: This is a design/spike plan (direction item).
> Its deliverable is a **design record + a minimal, reversible prototype**,
> not a full rollout. Follow the steps; keep the prototype behind no
> behavior change for local/loopback operators. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/README.md admin/content-manager/src/web/index.html admin/content-manager/vite.config.ts docs/operations/COMMS.md docs/adr/0011-private-whatsapp-comms-module.md`
> Plans 223/232 touch some of these — re-read if changed; unexplained
> divergence is a STOP condition.

## Status

- **Priority**: P3 (direction — operator-selected)
- **Effort**: M (spike + prototype; the full rollout depends on ops work
  outside the repo)
- **Risk**: LOW for the spike; the rollout's cost is the exposed surface
- **Depends on**: 223 (credential re-scope: remote mode uses sessionStorage)
- **Category**: direction
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

The comms spec (`plans/archive/217-whatsapp-comms/spec.md:25-26`) parked
"Acceso móvil / PWA" precisely on "requiere acceso autenticado fuera de
loopback" — and the authenticated remote mode shipped 2026-10-13
(`admin/content-manager/README.md:33-45`: `ADMIN_REMOTE_ORIGIN` behind
Cloudflare Access, credential on every `/api/v1` request). The premise
that parked the item changed; the operator's WhatsApp lives on the phone,
and promotion prep + neighbor replies currently require the desktop admin.
The comms UI already survives 390 px (e2e `comms.spec.ts:251-258`) — the
gap is **access + installability + docs**, not layout. What this spike
must settle: is the mobile path a PWA on the admin origin, what are the
real flows, and what remains ops (tunnel/Access) vs code.

## Current state

- Remote mode: `admin/content-manager/README.md:33-49` (exact
  `ADMIN_REMOTE_ORIGIN`, deny-by-default Access prerequisite, credential
  on every request; publication needs a deploy key on the VM).
- Admin shell: `admin/content-manager/src/web/index.html` — no
  `rel="manifest"`, no PWA plugin in `vite.config.ts`.
- Credential UX after plan 223: sessionStorage in remote mode (per browser
  session prompt) — the phone flow starts with the credential prompt every
  session.
- Docs to refresh (plan 232 already updates the stale claims; reference,
  don't duplicate): `docs/operations/COMMS.md:55`, ADR 0011 addendum.
- Storefront icons exist under `assets/images/web/` (icon-192/512) — the
  admin is a separate app shell; decide icon source in the spike.

## Commands you will need

| Purpose     | Command                        | Provenance | Expected on success |
| ----------- | ------------------------------ | ---------- | ------------------- |
| Install     | `npm ci`                       | declared   | exit 0              |
| Admin dev   | `npm run admin:dev` (loopback) | declared   | boots               |
| Admin build | `npm run admin:build`          | declared   | exit 0              |
| Admin tests | `npm run admin:test`           | declared   | all pass            |

## Scope

**In scope (spike)**:

- Design record (below) with the concrete flows + open questions
- Prototype (minimal, reversible): `rel="manifest"` + a hand-written
  `admin/content-manager/public/manifest.webmanifest` (or the existing
  static dir — find where `index.html` assets live) with name/icons/theme,
  served by the vite dev/build path; safe-area CSS pass only if trivial
- Verification that the prototype changes nothing for loopback/local flows
  (build + suites green)

**Out of scope**:

- Deploying the Cloudflare Tunnel / Access policy (ops; not this repo).
- Web Share/file handling from the admin PWA, offline caching of the admin
  app (decide AGAINST in the record unless evidence says otherwise —
  offline write surfaces are a footgun), push notifications.
- Re-doing the credential UX beyond what plan 223 shipped.

## Git workflow

- Branch: `advisor/251-admin-mobile-spike`
- Commit: design record + prototype (small), `spike(admin): … (plan 251)`.

## Steps

### Step 0: Baseline

`npm ci`; `npm run admin:test`; `npm run admin:build`. Green → proceed.

### Step 1: Design record (the real deliverable)

Write `admin/content-manager/docs/MOBILE.md` (or the repo's admin docs
location — check for an existing docs dir; do not invent a parallel
docs tree under `docs/` for admin internals): the three flows with step
lists and failure modes — (1) promotion with photo from the phone,
(2) neighbor reply from a pasted number, (3) stock toggle after a delivery —
plus:

- **Access model**: remote mode + Access + deploy key (from README); what
  the operator does on a phone (credential prompt per session; iOS
  standalone quirks).
- **Installability**: manifest-only vs plugin; icon source (reuse
  storefront icons vs admin-specific); display mode (`standalone`?).
- **Open questions** (≥3, each with the decision owner): does Access
  support the phone flow headlessly? Does the publication path work from
  the phone (git operations on the VM via the deploy key)? Is
  `sessionStorage` credential entry acceptable per session? Should the
  manifest exist on loopback too (harmless)?
- **Verdict + build-plan sketch** (S/M/L, with the ops-vs-code split).

### Step 2: Prototype (minimal)

Add the manifest file + `rel="manifest"` link + (only if trivial)
`theme-color`. No service worker in the prototype — if the record
concludes offline caching is wanted, that is a follow-up build plan, not
this spike. Icons: use existing repo icons or a 1-file placeholder with a
TODO explicitly noted.

**Verify**: `npm run admin:build` → exit 0 and `dist/web/manifest.webmanifest`
present; `npm run admin:test` → all pass (no behavior change).

### Step 3: Manual smoke (report honestly)

If a phone is available to the operator, describe the manual checklist to
run against the remote deployment; otherwise state it was not run. Do not
claim mobile validation from the 390 px e2e alone.

### Step 4: Close the spike

Update `plans/README.md` (DONE — spike with verdict; follow-ups listed).
Add the follow-up build entries to the deferrals register (plan 250) if
not selected now.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Design record committed with ≥3 open questions + verdict
- [ ] `grep -n "manifest" admin/content-manager/src/web/index.html` matches
- [ ] `npm run admin:build` exits 0 with the manifest in dist; `npm run admin:test` exits 0
- [ ] `plans/README.md` status row updated (verdict recorded)

## STOP conditions

Stop and report back (do not improvise) if:

- The admin has no static-assets directory in its vite config (report;
  the manifest placement is then a build-config decision for the owner).
- Adding the manifest changes any admin test behavior (report).

## Maintenance notes

- The spike's verdict decides whether a BUILD plan follows; do not accrete
  mobile features on the prototype.
- The docs refreshed by plan 232 are the user-visible truth; keep
  `MOBILE.md` additive (admin-internal).
- **Deferred:** offline caching, push, Web Share — per the record.
