# Plan 232: Docs drift batch — remote mode reality, stale plan status, dead `src/js` pointers, CODEBASE_MAP/RUNBOOK/CLAUDE corrections, comms indexing, release flow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- docs/ AGENTS.md CLAUDE.md CONTRIBUTING.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live text before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (independent doc fixes); coordinate notes with plan 242 (assets/css) — see Step 5
- **Category**: docs
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Nine verified doc-vs-code drifts, each with a concrete cost (agents and
contributors follow these texts verbatim). Every item below was verified
against source during the audit; none is a style preference.

## Current state (each item verified)

1. **ADR 0011 / COMMS.md contradict the shipped remote mode.**
   `docs/adr/0011-private-whatsapp-comms-module.md:65-68`: "El admin no es
   accesible desde el teléfono… es una decisión aparte"; queued item in
   `plans/archive/217-whatsapp-comms/spec.md:25-26` ("Requiere acceso
   autenticado fuera de loopback"). Shipped 2026-10-13 (`5a15428d`):
   `admin/content-manager/README.md:33-45` documents `ADMIN_REMOTE_ORIGIN`
   behind Cloudflare Access. `docs/operations/COMMS.md:13-14` ("Desde
   127.0.0.1 no se pide credencial") and `:55` ("No funciona desde el
   teléfono") are false in a remote deployment.
2. **AGENTS.md stale.** `AGENTS.md:26-27` says "planes 001–169 cerrados;
   lote de auditoría 11 (170–214) en curso" — 170–214 are all DONE
   (plans/README.md) and 215–217 shipped; the header date says 2026-09-15.
   `plans/README.md:3` intro still says "(001–127)" (the curator updates
   this file when the batch lands — see plan 218+ README section; if it is
   already updated when you run, skip that half).
3. **Dead `src/js/` pointers.** `docs/START_HERE.md:19` and `:25` route
   storefront/perf work to `src/js/`; `docs/operations/RUNBOOK.md:195` says
   "PRs en `src/js/**`". `src/js` was retired (plan 155). The live tree is
   `astro-poc/src/scripts/storefront/`.
4. **CODEBASE_MAP cross-references.** `docs/architecture/CODEBASE_MAP.md:13`
   says `assets/css` is read by dev-server.mjs (grep: dev-server has no
   reference; the reader is `tools/guardrails/critical-css.mjs:3-4`); the
   workflow map `:96-111` lists 14 files but `.github/workflows/` has 16
   (missing `changesets.yml`, `dependabot-auto-merge.yml`); the data-flow
   block at `:44` shows `npm --prefix astro-poc run build`, a form
   `START_HERE.md:43` explicitly forbids (live command: `npm -w astro-poc run build`,
   `package.json:31`).
5. **VALIDATION_MATRIX legacy tree.** `docs/operations/VALIDATION_MATRIX.md:26`
   claims the gates cover "the legacy tree"; `package.json:65`
   `typecheck:legacy` is `echo 'legacy typecheck retired (plan 155)'`.
6. **CLAUDE.md lint row + AGENTS.md warning about it.**
   `CLAUDE.md:19` says the admin is linted only in pre-commit/CI;
   `package.json:36` runs `admin:lint` in `npm run lint`. `AGENTS.md:46-47`
   warns "CLAUDE.md está desactualizado (run-all.js)" — CLAUDE.md no longer
   mentions run-all.js (plan 205 re-synced it).
7. **RUNBOOK `node:test` guidance.** `docs/operations/RUNBOOK.md:226`
   teaches `.test.js` with `node:test`; the repo is Vitest-only (plan 024),
   `package.json:61` runs `vitest run`.
8. **COMMS.md unindexed.** `docs/README.md` (Documentation Index →
   Operations) and the `AGENTS.md` doc map do not list
   `docs/operations/COMMS.md` (nor several older ops docs).
9. **Release flow undocumented.** `CHANGELOG.md:6` last entry `[1.5.0]`,
   357 commits since; `.changeset/` has only config/README; no doc says
   when to add a changeset or how releases are cut (`docs/RELEASE.md`
   exists — check and update it).

## Commands you will need

| Purpose       | Command                                                       | Provenance | Expected on success |
| ------------- | ------------------------------------------------------------- | ---------- | ------------------- |
| Markdown lint | `npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules'` | declared   | clean               |
| Plans checker | `node tools/check-plan-archive.mjs`                           | declared   | exit 0              |
| Links sanity  | `grep -rn "src/js" docs/ AGENTS.md CLAUDE.md`                 | declared   | no stale pointers   |

## Scope

**In scope**:

- `docs/adr/0011-private-whatsapp-comms-module.md` (amend) and, if you
  choose, a new `docs/adr/0012-*.md`
- `docs/operations/COMMS.md`
- `AGENTS.md`, `CLAUDE.md`, `docs/START_HERE.md`
- `docs/architecture/CODEBASE_MAP.md`
- `docs/operations/VALIDATION_MATRIX.md`, `docs/operations/RUNBOOK.md`
- `docs/README.md`
- `docs/RELEASE.md` (release flow documentation)
- `docs/repo/ACTIVE_SURFACES.json` only if a link target changes

**Out of scope**:

- `plans/**` beyond the README row (the audit's own README section is
  maintained by the reviewer).
- Rewriting docs beyond the listed items; no new doc pages except the ADR
  if you add one.

## Git workflow

- Branch: `advisor/232-docs-drift`
- Commits: `docs: …` per theme (2–4 commits).

## Steps

### Step 1: ADR 0011 + COMMS.md (remote mode reality)

Preferred (smallest): append an addendum section to ADR 0011 rather than a
new ADR — "Addendum 2026-10-18: authenticated remote mode shipped" with:
`ADMIN_REMOTE_ORIGIN` behind Cloudflare Access (deny-by-default
prerequisite), every `/api/v1/*` request requires `x-admin-credential`
(including health), and the phone item from the 217 spec is now unblocked
(implementation tracked separately). Update:

- `COMMS.md:13-14` → credential note: "En loopback no se pide credencial;
  en modo remoto (ADMIN_REMOTE_ORIGIN) toda petición requiere
  `x-admin-credential`."
- `COMMS.md:55` → replace "No funciona desde el teléfono" with the remote
  mode pointer.
- `docs/adr/README.md` — update the 0011 row wording if it quotes the old
  limitation.

If the operator already decided against an addendum in favor of a new ADR,
follow that; otherwise addendum is the default.

### Step 2: AGENTS.md + plans/README intro

- `AGENTS.md`: plans bullet → "planes 001–214 cerrados/archivados;
  auditoría 12 (218+) en curso — el README es la fuente de estado"; update
  the "Última actualización" date to the day you commit.
- `AGENTS.md:46-47`: replace the CLAUDE.md warning with a neutral note
  ("Vitest reemplazó `node:test`/`run-all.js` — plan 024").
- `plans/README.md:3`: if the intro still says "(001–127)", widen it to
  cover the current batch (coordinate: the audit-12 README section update
  happens outside this plan).

### Step 3: Dead pointer sweep

- `docs/START_HERE.md:19` → "`astro-poc/src/` (storefront), `astro-poc/src/scripts/storefront/` (browser runtime)".
- `:25` → same replacement in the performance row.
- `docs/operations/RUNBOOK.md:195` → "PRs en `astro-poc/src/**` o
  `admin/content-manager/**`".

**Verify**: `grep -rn "src/js" docs/ AGENTS.md CLAUDE.md` → no matches.

### Step 4: CODEBASE_MAP corrections

- Row 13: change the reader to `tools/guardrails/critical-css.mjs`
  (and add a note that these files are candidate for removal under plan
  242 — one line, no removal here).
- Workflow map: add `changesets.yml` (release automation, on push to main)
  and `dependabot-auto-merge.yml` (patch-only auto-merge).
- Data-flow block: `npm -w astro-poc run build`.

### Step 5: VALIDATION_MATRIX + RUNBOOK test guidance

- `VALIDATION_MATRIX.md:26`: drop "the legacy tree" from the covered set.
- `RUNBOOK.md:226`: collapse the playbook entry to "all new tests use
  Vitest (`test/**`), following `*.spec.js`/`*.test.js` style".

### Step 6: CLAUDE.md lint row

`CLAUDE.md:19`: change to "ESLint root + astro-poc + admin (`admin:lint`;
mirror of CI)".

### Step 7: Index COMMS.md

- `docs/README.md` Operations list: add `operations/COMMS.md` (and, while
  there, the other unlisted ops docs it enumerates — one line each:
  `CUTOVER.md`, `EDGE_SECURITY_HEADERS.md`, `SHARE_PREVIEW.md` if absent).
- `AGENTS.md` doc map: add a `Comms / mensajes WhatsApp → docs/operations/COMMS.md` row.

### Step 8: Release flow documentation

In `docs/RELEASE.md` (read it first): add a "Current flow" section stating
the truth — version `1.5.0` in `package.json` is the last manual release,
CHANGELOG entries are written manually at release time, and `.changeset/`

- the changesets workflow are wired but **not adopted** (wave-3 RFC per
  AGENTS.md); contributors do NOT add changesets yet. If the read of
  `docs/RELEASE.md` shows a documented flow already, align instead of
  duplicating.

**Verify**: `grep -n "changeset" docs/RELEASE.md` → the adopted/not-adopted
sentence exists.

### Step 9: Lint the docs

`npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules'` → clean (fix
any MD060-style table spacing issues introduced).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "src/js" docs/ AGENTS.md CLAUDE.md` returns nothing
- [ ] `grep -n "170–214" AGENTS.md` shows the closed status (or the bullet no longer claims "en curso")
- [ ] `grep -n "COMMS.md" docs/README.md AGENTS.md` matches in both
- [ ] `grep -n "node:test" docs/operations/RUNBOOK.md` returns nothing
- [ ] `grep -n "legacy tree" docs/operations/VALIDATION_MATRIX.md` returns nothing
- [ ] `npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules'` exits 0
- [ ] `node tools/check-plan-archive.mjs` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "stale" text turns out to be accurate today (report the file:line —
  the audit finding would be wrong).
- Writing the ADR amendment requires a policy decision you cannot infer
  (e.g. whether remote mode's Cloudflare Access is enforced in production —
  if unknown, phrase the addendum as "documented prerequisite, verified
  externally" and say so).
- Markdownlint demands table reformatting of untouched tables (limit
  changes to the tables you edit).

## Maintenance notes

- `docs/repo/ACTIVE_SURFACES.json` has a contract test; if any edited doc is
  listed there, update the manifest in the same commit.
- The AGENTS.md status bullet is the first thing agents read — the audit
  README section (written by the reviewer) will supersede the batch
  wording when it lands; keep them consistent.
- **Deferred:** adopting changesets for real (a process decision for the
  operator; the doc now says so explicitly).
