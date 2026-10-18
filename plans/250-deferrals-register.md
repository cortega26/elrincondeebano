# Plan 250: Deferrals register — one repo-visible place with reopen conditions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- docs/operations/DEFERRALS.md docs/README.md AGENTS.md plans/README.md`
> If any changed, re-read before editing; unexplained divergence is a STOP
> condition.

## Status

- **Priority**: P3 (direction — operator-selected)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 247/248 outcomes (their rows are written here)
- **Category**: direction
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Time-boxed deferrals live as one string in `plans/README.md:124`
("re-confirmar 2026-12" for the waitlist) and as prose triggers inside
archived plans (212: "revisit on any missed-fire incident"; 213:
"re-opens if CSV→JSON conversion is observed"). Nothing in the repo fires
those decisions: the operator + AI-agent workflow has no calendar, and the
only decision-tracking mechanism (batch-scoped decision logs in
`plans/ROADMAP.md` for audit 11) closed with its wave. The December date
will pass silently — for a feature about out-of-stock (the shop's most
common lost sale). Same for the other reopen conditions.

## Current state

- `plans/README.md:124` — waitlist DEFERRED (re-confirm 2026-12), feature
  still wired but inert; `test/e2e-astro/notify-when-back.spec.ts:10,60`
  skipped.
- `plans/archive/212-durable-schedule-spike.md:134-141` — "Revisit
  trigger: any missed-fire incident" (superseded if plan 248 lands).
- `plans/README.md:127` — CSV import re-opens "if CSV→JSON conversion is
  observed".
- Audit-12 deferred items to register: DEP-05 (`@astrojs/compiler-rs`
  duplicate — re-check when `astro-eslint-parser` adopts 0.5.x), DX-10
  (changesets adoption — wave-3 RFC), cart-interaction batching (bounded by
  plan 187's numbers), plan 247's outcome (if REJECTED, its reopen
  condition), comms reminders ("medir el uso"; ADR 0010 forbids
  transmission — local signal only).
- Indexes to touch: `docs/README.md` (Operations list), AGENTS doc map.

## Commands you will need

| Purpose       | Command                                                       | Provenance | Expected on success |
| ------------- | ------------------------------------------------------------- | ---------- | ------------------- |
| Markdown lint | `npx markdownlint-cli2 'docs/**/*.md' '*.md' '#node_modules'` | declared   | clean               |
| Plans check   | `node tools/check-plan-archive.mjs`                           | declared   | exit 0              |

## Scope

**In scope**:

- `docs/operations/DEFERRALS.md` (create)
- `docs/README.md`, `AGENTS.md` (index rows), `plans/README.md` (pointer
  from the relevant rows — coordinate with the audit-12 README section,
  which the reviewer maintains; link, do not duplicate)

**Out of scope**:

- Mechanical date-checking CI (optional follow-up; see Maintenance).
- Re-deciding any deferred item.

## Git workflow

- Branch: `advisor/250-deferrals`
- Commit: `docs(ops): deferrals register with reopen conditions (plan 250)`.

## Steps

### Step 1: The register

Create `docs/operations/DEFERRALS.md` with this table shape (one row per
open deferral — fill from the sources above; keep the register **minimal**
and cite the decision doc per row):

| Item | Deferred by | Reopen condition | Date/trigger | Status |
| ---- | ----------- | ---------------- | ------------ | ------ |

Rows to include (verify each against its source before writing):
waitlist re-confirm (2026-12) · plan 212 trigger (or "resolved by plan 248"
once it lands) · CSV import (observable: CSV→JSON conversion observed) ·
DEP-05 (external: astro-eslint-parser adopts compiler-rs 0.5.x) ·
changesets adoption (wave-3 RFC) · cart-interaction batching (measure
click cycle; plan 187 numbers as the bar) · plan 247 outcome (if REJECTED:
reopen if `/impresiones/` becomes a primary landing or entry grows past its
recorded size) · comms reminders (local usage signal, e.g. × sessions
where the operator re-uses a template manually) · canary live-probe
`needs.*.outputs` inline interpolation en `post-deploy-canary.yml` (nota del
plan 225: extender el env-pass cuando se toque la semántica del canary) ·
typecheck del árbol de tests del admin (143 errores reales en 36 archivos,
TS2339×60 + singletons + import cross-workspace a astro-poc — desenmascarado
por el plan 227 ronda 2; extraer como plan propio cuando se priorice) ·
typecheck de los specs e2e contra la config raíz nueva (19 errores
preexistentes: 17× TS2339 `window.__APP_READY__` sin declaración ambiente +
2× TS5097 imports `.ts` desde astro-poc — nota de las rondas 2/3 del plan 227).

Add a 5-line header stating: what this file is, that `reconcile` reads it
at session start, and that resolved rows move to a "Resolved" section with
the landing commit (never deleted silently).

### Step 2: Index it

- `docs/README.md` Operations list: add the row.
- AGENTS doc map: add `Diferidos y condiciones de reapertura → docs/operations/DEFERRALS.md`.
- `plans/README.md`: turn the waitlist note into a pointer
  ("ver DEFERRALS.md") without changing its status semantics.

### Step 3: Lint

`npx markdownlint-cli2 …` → clean; `node tools/check-plan-archive.mjs` →
exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls docs/operations/DEFERRALS.md` exists with ≥ 6 rows
- [ ] `grep -n "DEFERRALS" docs/README.md AGENTS.md plans/README.md` → 3 matches
- [ ] `grep -n "2026-12" docs/operations/DEFERRALS.md` matches (waitlist row)
- [ ] markdownlint clean; plan-archive checker exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A "deferral" turns out to be already resolved or rejected in a decision
  doc (do not resurrect it; note it and skip).
- The plan-archive checker flags the README edit (it checks DONE plans —
  the waitlist note edit must not move any plan).

## Maintenance notes

- The register is only as good as its discipline: any new "deferred" line
  in an audit plan or README row must add its entry here in the same
  commit — state that rule in the file header.
- A stale register is worse than none: `reconcile` prunes it.
- **Deferred:** mechanical stale-date check (`tools/check-deferrals.mjs`)
  wired into `validate` — build it only if the manual pass proves
  forgettable.
