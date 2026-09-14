# Roadmap — Auditoría 11 (planes 170–214)

> Living document: scoreboard + backlog + assistant prompt library for the
> whole batch. Status source of truth per plan stays `plans/README.md`
> (this file mirrors it; update both when a plan lands).
> Base commit: `0847089c` (2026-09-14). Landed on `main` as `4b526127`
> (merge) + `4063eb68` (SW sync); Wave 0 executes on `main`.

## How to use this document

- **Scoreboard**: §1. Each row mirrors `plans/README.md`. Mark progress
  there first (`TODO → IN PROGRESS → DONE` + `git mv` to `plans/archive/`
  in the same commit, per the enforced archive rule), then mirror here.
- **Backlog**: §3. Priority-ordered queue with the "why now" per item.
- **Goto prompts**: §4. Copy-paste blocks to dispatch implementation to an
  assistant (via `/improve execute <plan>` or by handing the plan file to
  an executor). One block per wave + one single-plan template.
- **Rules of the road**: §5 (same-file serialization), §6 (decisions you
  must make), §7 (CI-proof batching), §8 (risks + rollback).

## 1. Scoreboard

Legend: ⬜ TODO · 🔄 IN PROGRESS · ✅ DONE (archived) · 🛑 BLOCKED (reason).

### Wave 0 — Foundation (gate for everything)

| Plan                                             | Title                              | Effort | Status             |
| ------------------------------------------------ | ---------------------------------- | ------ | ------------------ |
| [170](archive/170-land-working-tree-baseline.md) | Land working tree + green baseline | S      | ✅ DONE (archived) |

### Wave 1 — Protect the data (P1 bugs + auth)

| Lane | Plan                                               | Title                                | Effort | Status             |
| ---- | -------------------------------------------------- | ------------------------------------ | ------ | ------------------ |
| L1   | [171](archive/171-catalog-cache-miss-isolation.md) | Cache-miss isolation leak            | S      | ✅ DONE (archived) |
| L1   | [175](archive/175-changeset-apply-robustness.md)   | Apply crash-safe + idempotency-first | M      | ✅ DONE (archived) |
| L2   | [172](archive/172-bulk-action-validation.md)       | Bulk validation hardening            | S      | ✅ DONE (archived) |
| L2   | [173](archive/173-reorder-membership-scale.md)     | Reorder membership + scale           | S      | ✅ DONE (archived) |
| L3   | [180](archive/180-import-preview-hardening.md)     | Import preview hardening             | S-M    | ✅ DONE (archived) |
| L3   | [182](archive/182-loopback-bypass-ip-only.md)      | Loopback bypass IP-only              | S      | ✅ DONE (archived) |
| L3   | [183](archive/183-credential-hygiene.md)           | Credential hygiene                   | S      | ✅ DONE (archived) |
| L4   | [192](archive/192-web-contract-coverage.md)        | Web contract coverage (pins)         | M      | ✅ DONE (archived) |

### Wave 2 — Correctness cleanup + build perf

| Lane | Plan                                           | Title                      | Effort | Status             |
| ---- | ---------------------------------------------- | -------------------------- | ------ | ------------------ |
| L1   | [174](archive/174-undo-server-snapshots.md)    | Undo from server snapshots | M      | ✅ DONE (archived) |
| L1   | [177](archive/177-admin-feedback-papercuts.md) | Admin feedback papercuts   | S      | ✅ DONE (archived) |
| L2   | [176](archive/176-media-apply-outputs.md)      | Media apply outputs        | M      | ✅ DONE (archived) |
| L3   | [181](archive/181-state-machine-gaps.md)       | State-machine gaps batch   | S-M    | ✅ DONE (archived) |
| L3   | [185](archive/185-build-probe-memoization.md)  | Build probe memoization    | S-M    | ✅ DONE (archived) |
| L4   | [179](179-cross-tab-cart-merge.md)             | Cross-tab cart merge       | M      | ⬜ TODO            |
| L4   | [178](178-parking-stay-caps.md)                | Parking stay caps          | S      | ⬜ TODO            |
| L5   | [187](187-storefront-runtime-perf.md)          | Storefront runtime perf    | M      | ⬜ TODO            |
| L6   | [184](184-security-investigate-batch.md)       | Security investigate batch | S      | ⬜ TODO            |
| L6   | [195](195-shared-helper-dedup.md)              | Shared helper dedup        | M      | ⬜ TODO            |

### Wave 3 — Server perf + structural debt

| Lane | Plan                                          | Title                         | Effort | Status  |
| ---- | --------------------------------------------- | ----------------------------- | ------ | ------- |
| L1   | [188](188-admin-request-costs.md)             | Admin request costs           | M      | ⬜ TODO |
| L1   | [186](186-image-pipeline-gates-parallel.md)   | Image pipeline gates+parallel | M      | ⬜ TODO |
| L2   | [194](194-write-path-unification.md)          | Write-path unification        | M      | ⬜ TODO |
| L3   | [196](196-writer-repository-consolidation.md) | Writer/repo consolidation     | M      | ⬜ TODO |
| L3   | [197](197-client-fetch-layering.md)           | Client split + fetch cores    | M      | ⬜ TODO |

### Wave 4 — Toolchain, CI, DX, docs (highly parallel)

| Lane | Plan                                      | Title                        | Effort | Status  |
| ---- | ----------------------------------------- | ---------------------------- | ------ | ------- |
| L1   | [189](189-ci-build-cache-split.md)        | CI build/cache/split         | M      | ⬜ TODO |
| L1   | [190](190-sw-fetch-investigate.md)        | SW + job-queue investigate   | S      | ⬜ TODO |
| L2   | [191](191-release-gate-ownership.md)      | Release-gate ownership       | S      | ⬜ TODO |
| L2   | [193](193-e2e-gate-flake-parity.md)       | E2E gate + flakes + parity   | M      | ⬜ TODO |
| L3   | [200](200-manifest-hygiene.md)            | Manifest hygiene             | S      | ⬜ TODO |
| L3   | [201](201-drop-duplicate-deps.md)         | Drop duplicate deps          | S      | ⬜ TODO |
| L3   | [202](202-tsx-production-spike-native.md) | tsx promote + native spike   | M      | ⬜ TODO |
| L3   | [203](203-sass-use-anymatch-reeval.md)    | Sass @use + anymatch         | M      | ⬜ TODO |
| L4   | [204](204-env-format-versions.md)         | Env + format + versions docs | S      | ⬜ TODO |
| L4   | [205](205-contributor-docs-rewrite.md)    | Contributor docs rewrite     | S      | ⬜ TODO |
| L4   | [206](206-dx-loops-matrix-logs.md)        | DX loops + matrix + logs     | M      | ⬜ TODO |
| L4   | [207](207-entry-docs-drift.md)            | Entry docs drift             | M      | ⬜ TODO |
| L4   | [208](208-ops-adr-docs-drift.md)          | Ops/ADR docs drift           | S      | ⬜ TODO |
| L4   | [209](209-admin-lint-local.md)            | Admin lint local             | S      | ⬜ TODO |

### Wave 5 — Structure slice + direction

| Plan                                   | Title                             | Effort | Status  |
| -------------------------------------- | --------------------------------- | ------ | ------- |
| [198](198-god-module-slice-1.md)       | God-module slice 1 + dead removal | M      | ⬜ TODO |
| [199](199-utils-lockstep-census.md)    | Utils/lockstep census             | S      | ⬜ TODO |
| [210](210-waitlist-spike.md)           | Spike: waitlist WhatsApp          | S      | ⬜ TODO |
| [211](211-preview-build-route.md)      | Preview-build route               | M      | ⬜ TODO |
| [212](212-durable-schedule-spike.md)   | Spike: durable scheduling         | M      | ⬜ TODO |
| [213](213-csv-import-spike.md)         | Spike: CSV import                 | M      | ⬜ TODO |
| [214](214-incremental-typed-client.md) | Incremental typed client          | S-M    | ⬜ TODO |

Effort rollup: S ×16 · S-M ×4 · M ×25 (45 plans). Heaviest waves: 4 (7 M)
and 2–3 (5 M each) — both highly parallelizable by lane.

## 2. Wave playbooks

### Wave 0 — Foundation. Entry: now. Exit: `npm test`, `lint`, `typecheck` green on a clean tree.

- Run plan 170 (land or revert the 12 "Plan 013" files). Nothing else
  starts until the tree is clean — every other plan's drift check assumes it.
- In parallel with execution, collect the §6 owner decisions (191, 210-Q,
  213-Q) so Wave 1+ never waits on you.
- Goto: prompt W0 (§4).

### Wave 1 — Protect the data. Entry: 170 DONE. Exit: corruption paths closed (prove with the new regression tests), bypass matrix green.

- L1 sequential (same `productRepository.ts`): 171 → 175.
- L2 sequential (same `productRoutes.ts`): 172 → 173.
- L3 parallel (disjoint files): 180 · 182 · 183.
- L4 parallel (test-only, touches only `test/`): 192.
- Lanes run concurrently; within a lane, strictly in order.
- Goto: prompts W1-L1 … W1-L4 (§4).

### Wave 2 — Correctness cleanup + build perf. Entry: Wave 1 exit. Exit: `build:fast` faster with identical `dist` fingerprint; UI suites green.

- L1 sequential (same `ProductsPage.tsx`): 174 → 177. (Requires 173 DONE.)
- L2: 176. L3 sequential (same `preflight-hash.mjs`): 181 → 185.
  L4: 179 · 178 (parallel, disjoint). L5: 187 (after 179 — same
  `storefront.js`). L6: 184 (investigate, anytime) → 195 (after 173, 174,
  185 — same `productRoutes.ts`/`undo.ts`/`catalog.ts`).
- Goto: prompts W2 (§4).

### Wave 3 — Server perf + structural debt. Entry: Wave 2 exit. Exit: before/after timings recorded; write-path contracts green.

- L1 parallel (disjoint): 188 (after 176, 180, 195) · 186 (after 185).
- L2: 194 (after 175).
- L3: 196 (after 186 + 188) · 197 (after 188 + 192).
- 188 is the wave's critical path — start it first.
- Goto: prompts W3 (§4).

### Wave 4 — Toolchain, CI, DX, docs. Entry: Wave 3 exit (or earlier for doc lanes — see below). Exit: full `validate` green; docs lint green.

- Doc lanes (204, 205, 207, 208) can start as early as Wave 2 — they touch
  only docs. Sequence shared files: 205 → 207 (AGENTS rows); 204 → 206
  (`.env.example` — first wins, other reconciles); 205 ↔ 208 (CONTRIBUTING:45
  copy — check ownership before editing).
- Config chain (same manifests): 200 → 201 → 202. Parallel: 203.
- 209 after 207 (AGENTS lint-row wording).
- 189 · 193 · 206-matrix-slice share ONE CI-proof window (§7) — implement
  on branches, prove together.
- 190, 191 (with §6 decision in hand) anytime.
- Goto: prompts W4 (§4).

### Wave 5 — Structure + direction. Entry: Wave 4 exit (spikes 210/212/213 can start Wave 2 — they are read-only + decision). Exit: slice landed; every spike has ADOPT/REJECT with evidence.

- 198 (after 194; coordinate prototype files with 211/214 — first to land
  wins). 199 anytime. 211 after 198's disposition. 214 after 197.
  210/212/213 need their §6 answers first.
- Goto: prompts W5 (§4).

## 3. Backlog (priority order)

1. **170** — nothing is trustworthy without the baseline. P0.
2. **171, 172, 173, 180, 182** — data corruption + auth bypass. Each is
   hours-scale with regression tests. P1.
3. **175, 192** — crash-safe apply + contract pins that later refactors
   stand on. P1.
4. **174, 176, 185, 186, 188** — correctness remainder + biggest build/server
   wins. P2, high leverage.
5. **177, 178, 181, 183, 191, 195, 196, 197** — papercuts, hygiene,
   unification. P2, steady throughput.
6. **189, 193, 200, 201, 204–209** — toolchain/docs; batch for flow. P2/P3.
7. **179, 184, 190, 199, 202–203, 210–214** — P3 + spikes; schedule around
   the above, decide early (§6) so they never block.

## 4. Goto prompts (copy-paste)

General rules for every dispatch: the executor must read the whole plan
file first, honor STOP conditions (report, never improvise), run every
verification command, and update its `plans/README.md` row (plus `git mv`
to `plans/archive/` when DONE, same commit). Never dispatch two plans that
share a file in parallel (§5).

### W0 — Baseline

```text
Execute plans/170-land-working-tree-baseline.md step by step. Default to
LANDING the 12 listed files (single commit, no --no-verify) unless the tree
is already clean, in which case verify and mark DONE. Prove the baseline:
npm test, npm run lint, npm run typecheck green. Update the plan's row in
plans/README.md and mirror it in plans/ROADMAP.md. STOP and report on any
condition in the plan's STOP section.
```

### W1-L1 — Catalog isolation chain

```text
Execute plans/171-catalog-cache-miss-isolation.md, then
plans/175-changeset-apply-robustness.md, strictly in that order (same
files). Full verification per plan, index rows updated, DONE files moved
with git mv to plans/archive/ in their landing commits.
```

### W1-L2 — Bulk + reorder chain

```text
Execute plans/172-bulk-action-validation.md, then
plans/173-reorder-membership-scale.md, strictly in that order (both touch
admin/.../productRoutes.ts). Full verification per plan, index rows updated.
```

### W1-L3 — Security batch (parallel-safe)

```text
Execute plans/180-import-preview-hardening.md,
plans/182-loopback-bypass-ip-only.md, and
plans/183-credential-hygiene.md. They touch disjoint files and may run in
parallel (one executor per plan, separate worktrees/branches). After 182
lands, rotate the launch credential via the file channel per the plan.
```

### W1-L4 — Contract pins (parallel-safe, test-only)

```text
Execute plans/192-web-contract-coverage.md (test-only, no production
changes; if a characterization test exposes a real bug, STOP and file it
instead of fixing).
```

### W2 — Correctness + build perf

```text
Wave 2, respecting lanes (parallel across lanes, sequential within):
L1: plans/174-undo-server-snapshots.md → plans/177-admin-feedback-papercuts.md
L2: plans/176-media-apply-outputs.md
L3: plans/181-state-machine-gaps.md → plans/185-build-probe-memoization.md
L4: plans/179-cross-tab-cart-merge.md + plans/178-parking-stay-caps.md (parallel)
L5: plans/187-storefront-runtime-perf.md (after 179)
L6: plans/184-security-investigate-batch.md, then plans/195-shared-helper-dedup.md
(after 173+174+185). Exit gate: build:fast faster with identical dist
fingerprint; suites green. Record before/after numbers in each commit.
```

### W3 — Server perf + debt core

```text
Wave 3: start plans/188-admin-request-costs.md first (critical path; needs
176+180+195 DONE). In parallel: plans/186-image-pipeline-gates-parallel.md
(needs 185) and plans/194-write-path-unification.md (needs 175). Then
plans/196-writer-repository-consolidation.md (needs 186+188) and
plans/197-client-fetch-layering.md (needs 188+192) in parallel. 188's
isolation tests (plan 171's file, unmodified) must stay green throughout.
```

### W4 — Toolchain/CI/DX/docs

```text
Wave 4: (a) docs: plans/205 → plans/207; plans/204; plans/208; plans/209
(after 207); coordinate shared rows per ROADMAP §2-Wave-4. (b) configs:
plans/200 → plans/201 → plans/202, plus plans/203 in parallel. (c) gates:
plans/191 (decision from §6 in hand), plans/193, plans/189, plans/190.
Batch the CI proofs of 189+193+206-matrix into ONE CI window (§7). Exit:
full npm run validate green.
```

### W5 — Structure + direction

```text
Wave 5: plans/198-god-module-slice-1.md (after 194; check 211/214 status
for prototype files first), plans/199-utils-lockstep-census.md (anytime),
then direction per §6 answers: plans/210, plans/211 (after 198),
plans/212, plans/213, plans/214 (after 197). Spikes end in ADOPT/REJECT
records, not unreviewed code.
```

### Single-plan template

```text
Execute <plans/NNN-slug.md> step by step. Read the whole file first. Run
every verification command; confirm each expected result. On any STOP
condition, stop and report — do not improvise. Update the plan's row in
plans/README.md (and mirror in plans/ROADMAP.md); on DONE, git mv the file
to plans/archive/ in the same commit.
```

### Status / reconcile prompts

```text
Reconcile audit-11 progress: for each DONE row in plans/README.md verify
its done-criteria still hold on HEAD; for BLOCKED rows investigate and
either rewrite the plan or mark REJECTED with rationale; refresh drifted
TODOs (re-verify excerpts); mirror everything in plans/ROADMAP.md §1.
```

## 5. Same-file serialization map (never parallelize these pairs)

- `productRoutes.ts`: 172 → 173 → 195 → 188.
- `productRepository.ts`: 171 → 195 → 188 → 196.
- `ProductsPage.tsx` + `useProductsQuery.ts`: 173 → 174 → 177.
- `undo.ts` / `categoryUndo.ts`: 174 → 195.
- `astro catalog.ts` + `product-card-helpers.ts`: 185 → 195.
- `media.ts`: 176 → 188 → 198.
- `importRoutes.ts`: 170-landing → 180 → 188.
- `routePolicy.ts`: 180 → 211.
- `preflight-hash.mjs`: 170-landing → 181 → 185.
- Image tools (`sync-avif`, `gap-fill`, `generate-images`, `image-pipeline`):
  186 → 196.
- `storefront.js`: 179 → 187 → 206-§Step-3.
- `client.ts` + `credentialStore.ts` + `syncAdapter.ts`: 192-pins → 188 →
  197 → 214.
- `categoryRoutes.ts` + `catalog-command.ts` + `productService.ts`:
  171/172/175 → 194 → 198.
- Root `package.json`: 170 → 200 → 201 → 206 → 209 → 186 (scripts/deps).
- Admin `package.json`: 170 → 200 → 201 → 202 → 209 → 193 (scripts).
- CI workflows: 185 → 189 → 193 → 206-matrix (one proof window, §7).
- `AGENTS.md`: 205 → 207 → 209 (wording chain).
- Prototype files: 198 ↔ 211 ↔ 214 (first to land wins; others reconcile).
- `.env.example`: 204 ↔ 206-Step-1 (first wins, other reconciles).

## 6. Decision log (owner inputs — collect in Wave 0)

| #   | Decision                                                          | Needed by | Default if unreachable                |
| --- | ----------------------------------------------------------------- | --------- | ------------------------------------- |
| D1  | 191: release gate gains selectors+plans checks, or split stays?   | Wave 4    | Add them (reversible, fail-closed)    |
| D2  | 210: is the out-of-stock hide still temporary?                    | Wave 5    | Keep deferred, re-confirm quarterly   |
| D3  | 213: do operators round-trip CSV exports?                         | Wave 5    | No → reject the build                 |
| D4  | 195-Step-2: which discount precision is canonical (12.5% vs 13%)? | Wave 2    | STOP, do not unify blind              |
| D5  | 200-Step-3: is the exact `astro` pin deliberate?                  | Wave 4    | Blame decides; document either way    |
| D6  | 200-Step-5 / 204-Step-3: exact-vs-range Node story + ports        | Wave 4    | Float Volta to 24.x, add engines      |
| D7  | 206: enable doctor as CI gate?                                    | Wave 4    | No — propose only                     |
| D8  | 208: docs/api pointer page vs stays utils-only?                   | Wave 4    | Pointer page                          |
| D9  | 184 items 2/4/6 (CSV workflow, apex routes, session holder)       | Wave 2    | Record verdicts, no unilateral change |
| D10 | 179: max-vs-sum merge semantics                                   | Wave 2    | Max (no double-count)                 |

### Wave 0 outcomes (2026-09-14, owner)

- **D1 → ADD**: `validate:release` gains both stages (plan 191 implements
  outcome (a)).
- **D2 → DEFERRED**: out-of-stock hiding stays in force; plan 210 records
  "still deferred, re-confirm next quarter".
- **D3 → INVESTIGATE**: plan 213 proceeds to gather workflow evidence
  before any build decision.
- D4–D10 remain open for their waves.

## 7. CI-proof batching (one window)

These slices can only be proven with CI runs — implement on branches, prove
together, land in order: **189** (determinism semantics + time improvement),
**193-Step-1** (sharded E2E scripts green in CI), **206-Step-2** (matrix
false-green experiment). If no CI run is triggerable, mark each BLOCKED with
the workflow + branch to watch instead of claiming victory on YAML review.

## 8. Risk register + rollback

- MED-risk plans (touches write paths / runtime / CI): 175, 186, 187, 188,
  194, 195, 196, 193, 202-spike-half, 206-storefront-slice. Each has
  characterization/pin tests BEFORE the change inside the plan — enforce that
  ordering in review.
- Rollback for every plan: `git revert <landing-sha>` (plans are
  single-concern commits by construction) + re-run the plan's verification
  commands. Data-path plans (171, 172, 175, 194, 196) additionally require a
  catalog-integrity check after revert (`loadCatalog` clean + one write
  round-trip on a temp repo).
- Never batch two MED-risk plans in one commit; never land a MED plan on a
  red baseline.

## 9. Global definition of done (every plan)

- [ ] All plan checkboxes hold (machine-checkable section).
- [ ] `plans/README.md` row updated; DONE files `git mv`'d to
      `plans/archive/` in the landing commit; checker
      (`node tools/check-plan-archive.mjs`) prints OK.
- [ ] §1 mirrored here.
- [ ] Commit message cites the plan number + before/after evidence
      (timings, scores, bytes) where the plan produced any.
- [ ] No out-of-scope files in the diff.
