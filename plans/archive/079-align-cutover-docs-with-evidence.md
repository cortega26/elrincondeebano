# Plan 079: Align cutover and onboarding docs with the certified evidence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- docs README.md AGENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: docs
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The docs that agents and operators read first contradict the repo's own
evidence about the migration state:

- `docs/operations/CUTOVER.md` says the TypeScript manager is "fully
  functional… certified with 21/21 parity rows passing" — but the newest
  certification report (`reports/certification/certification-2026-07-16T15-36-32-416Z.json`)
  shows `total: 30, pass: 6, fail: 2, untested: 20, manual: 2`, and the
  parity report samples only 9 products (of 184) with a "Python golden
  category file not found" warning. The "21/21" number is a known hardcoded
  literal (plan 056 documents this).
- `AGENTS.md`, `README.md`, `docs/START_HERE.md`, `docs/operations/RUNBOOK.md`,
  and `docs/onboarding/LOCAL_DEV.md` route product-data work to the Python
  Tkinter fallback as if it were the manager, while `AGENTS.md:6-8` declares
  the TypeScript app canonical — two documented sources of truth.
- `docs/adr/0008-catalog-data-authority.md` is indexed "Proposed" but the
  retirement notice executes its decisions; it also claims
  `astro-poc/src/data/products.json` is "stale… no process writes it", which
  is false — `astro-poc/scripts/sync-data.mjs:35` copies it on every build
  and it is byte-identical to `data/product_data.json`.

After this plan: every doc states the same migration state, the certified
numbers are cited from the evidence files (not from memory), and the ADR
statuses match what ops docs do.

## Current state

Verified facts:

- `docs/operations/CUTOVER.md:8-10` — "fully functional… certified with 21/21
  parity rows passing".
- `reports/certification/certification-2026-07-16T15-36-32-416Z.json` —
  `summary: { total: 30, pass: 6, fail: 2, untested: 20, manual: 2 }`,
  `exit_gate` shows coverage 44.93% lines vs 55% threshold and e2e-smoke fail.
- `reports/parity/parity-2026-07-16T16-10-34-672Z.json` — `product_count_ts: 9,
product_count_py: 9, category_count_ts: 0, category_count_py: 0, warnings:
["Python golden category file not found"]`.
- `plans/archive/055-progress.md` — phases 6-12 TODO.
- `docs/adr/README.md:27` — ADR 0008 "Proposed".
- `docs/archive/streamlit-retirement-notice.md:4` — "Decision: ADR 0008" and
  `:16-17` says the TS manager "now serves as the replacement".
- `docs/adr/0008-catalog-data-authority.md:59` — "stale artifacts that no
  process currently writes" (about `astro-poc/src/data/products.json`).
- `astro-poc/scripts/sync-data.mjs:35` — `copyJson(repoRoot/data/product_data.json → src/data/products.json)`;
  both files are 140,974 bytes (byte-identical, verified).
- `docs/START_HERE.md:20` — task router sends product/category work to
  `data/, admin/product_manager/`; `docs/operations/RUNBOOK.md:146-152` —
  "Content Manager (modo offline): Ruta: `admin/product_manager/` (Tkinter)";
  `docs/onboarding/LOCAL_DEV.md:43-52` — documents only the Python venv path;
  `README.md` — no mention of `admin/content-manager` at all.
- `admin/content-manager/` has no README and no `.env.example`; env vars
  read: `PORT`, `HOST`, `ADMIN_MODE`, `REPO_ROOT` (start.ts:4-21),
  `SYNC_API_TOKEN` (routes/conflicts.ts:117,161).

## Commands you will need

| Purpose    | Command     | Expected on success    |
| ---------- | ----------- | ---------------------- |
| No code    | (docs only) | n/a                    |
| Link check | See Step 4  | all listed paths exist |

## Scope

**In scope**:

- `docs/operations/CUTOVER.md`
- `docs/onboarding/LOCAL_DEV.md`, `docs/onboarding/BOOTSTRAP.md`
- `docs/START_HERE.md`, `docs/operations/RUNBOOK.md`
- `README.md`, `AGENTS.md`
- `docs/adr/README.md`, `docs/adr/0008-catalog-data-authority.md`
- `admin/content-manager/README.md` and `admin/content-manager/.env.example`
  (both new)

**Out of scope**:

- Making the certification numbers improve (plans 056, 082).
- Any code change to the manager or storefront.
- Rewriting the plan 055 directive section of `plans/README.md`.

## Git workflow

- Branch: `advisor/079-align-cutover-docs`.
- Commit per logical file group, message style `docs: ...` (see
  `git log --oneline -- docs` for examples), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make CUTOVER.md truthful

Rewrite the "Current state" section to cite the evidence files: the
certification summary (6/2/20/2), the parity sample (9 products, category
row missing), and the plan 055 phase status. Replace "fully functional" with
a precise statement: "functional for the covered workflows; certification is
in progress (see reports/certification/latest and plans 056-069)". Keep the
cutover steps but mark Step 2/3 as "requires plan 070 to land first" if they
reference the committed tree.

**Verify**: `grep -n "21/21" docs/operations/CUTOVER.md` → no matches.

### Step 2: Point the task router at the canonical manager

In `START_HERE.md`, `RUNBOOK.md`, `LOCAL_DEV.md`, and `README.md`: product
data and category taxonomy work routes to `admin/content-manager/` with
`npm run admin:dev` (canonical), with the Python path explicitly marked
"fallback durante la ventana de transición (plan 069)". Update the
workspace-count text in `BOOTSTRAP.md` and `README.md` ("two packages" →
three: `/`, `astro-poc`, `admin/content-manager`).

**Verify**: `grep -rn "admin/product_manager" docs/START_HERE.md docs/operations/RUNBOOK.md docs/onboarding/LOCAL_DEV.md` → each mention is marked fallback.

### Step 3: Correct ADR 0008 and its index status

- In `docs/adr/README.md`: mark 0008 as it stands — either keep "Proposed"
  and add a note that the retirement notice is "pending acceptance", or
  (preferred, since ops already execute it) move 0008 to "Accepted" with a
  line referencing the retirement notice. Choose ONE and apply consistently.
- In `docs/adr/0008-catalog-data-authority.md`: fix the "stale artifacts"
  claim to state that `astro-poc/src/data/products.json` and
  `astro-poc/public/data/product_data.json` are **build-synced copies**
  (sync-data.mjs), and add a row for the TS manager's product model
  (`admin/content-manager/src/shared/schemas/product.ts`) to the identity
  matrix.

**Verify**: `grep -n "Proposed\|Accepted" docs/adr/README.md` shows the chosen status; no "no process currently writes" phrasing remains for the synced copies.

### Step 4: Add the missing manager docs

Create `admin/content-manager/README.md` (what it is, how to run:
`npm run admin:dev` / `admin:start`, modes `operator|read-only`, where the
launch credential comes from per plan 071's decision, how to obtain it, the
repo it writes) and `admin/content-manager/.env.example` covering
`ADMIN_MODE`, `PORT`, `HOST`, `REPO_ROOT`, `SYNC_API_TOKEN` (and
`ADMIN_CREDENTIAL` if plan 071 landed it — check `start.ts` first). Ensure
every doc link you touch resolves (run the link check: for each path
referenced in the files you edit, `test -e <path>`).

**Verify**: `test -e admin/content-manager/README.md && test -e admin/content-manager/.env.example`; every edited doc's internal links exist.

### Step 5: Consistency sweep

`grep -rn "Streamlit\|streamlit" docs/ README.md AGENTS.md` — every hit
must be either the retirement notice or a past-tense reference. And
`grep -rn "python gui.py\|product_manager" docs/onboarding/ docs/START_HERE.md`
— Python steps must be labeled fallback.

**Verify**: no active-present-tense Streamlit references remain.

## Test plan

Docs only — the verification is the grep/link checks in Steps 1-5, plus:

- `git diff --stat` over the changed docs → only in-scope files.
- Confirm no code file was touched: `git status --short` shows only
  `docs/`, `README.md`, `AGENTS.md`, `admin/content-manager/README.md`,
  `admin/content-manager/.env.example`.

## Done criteria

- [ ] CUTOVER.md cites real evidence numbers; "21/21" gone
- [ ] Task-routing docs point to the TS manager as canonical, Python marked fallback
- [ ] ADR 0008 status consistent between `docs/adr/README.md` and the retirement notice; staleness claim corrected; TS model added to the matrix
- [ ] `admin/content-manager/README.md` + `.env.example` exist and match the runtime env reads
- [ ] No active-present Streamlit references outside the retirement notice
- [ ] `plans/README.md` status row 079 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 071's credential flow is still undecided in code when you write
  README/.env.example — document the CURRENT code state and leave a TODO
  pointing at plan 071 instead of guessing.
- The certification reports' JSON shape doesn't match the "Current state"
  numbers (the reports may be regenerated) — re-read the newest file and use
  its actual numbers.

## Maintenance notes

- These docs will drift again the moment plan 069 (retirement) lands — the
  cutover doc should be revisited then and its fallback language removed.
- The ADR matrix now includes five models — plan 065's contract work should
  update this table, not duplicate it.
- Reviewer focus: the START_HERE/RUNBOOK changes affect what operators
  actually run — keep commands exact (`npm run admin:dev` from repo root).
