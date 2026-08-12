# Plan 058: Make publication manifests and repository paths fail closed

> **Executor instructions**: Preserve the user's Git index exactly. Never test by
> committing or pushing from the developer working tree; all Git tests use temporary
> repositories.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/domain/publication admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/server/adapters/gitAdapter.ts admin/content-manager/src/server/repositories/changeSetRepository.ts admin/content-manager/src/shared/schemas/changeSet.ts`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: 057
- **Category**: security / bug
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F03, F04
- **Reconciled (Auditoría 7, 2026-08-03)**: el commit scoped lo ejecuta el plan 072 y la contención de IDs el plan 080 — ejecutar ambos primero; este plan conserva el recovery journal de publicación y el helper de contención compartido.

## Why this matters

Publication declares exact ownership but does not enforce it; pre-existing staged files
can enter a catalog commit, and request paths can be interpreted as Git options.
Separately, change-set PATCH can replace an immutable ID that is used directly in a
resolved filesystem path. Both boundaries need runtime schemas, containment checks,
and negative tests before publication is trustworthy.

## Current state

- `domain/publication/publicationService.ts:24` declares `no-unrelated-staged`;
  `runPreflight()` ignores its manifest argument and never enforces the rule.
- `routes/publication.ts:90-99` shallow-merges caller manifest data over defaults;
  lines 133-150 stage those paths and commit normally.
- `adapters/gitAdapter.ts:58-64` runs `git add ...paths` without `--`.
- `routes/changes.ts:43-60` mass-assigns PATCH body over the stored change set.
- `repositories/changeSetRepository.ts:13-15` resolves `${cs.id}.json` without proving
  it remains below `data/change-sets`.
- Python's `admin/product_manager/git_sync.py:189` uses `git add --` as the safer
  argument-array convention.

## Commands you will need

| Purpose    | Command                                                          | Expected on success |
| ---------- | ---------------------------------------------------------------- | ------------------- |
| Focused    | `npm -w admin/content-manager run test -- publication changeSet` | all pass            |
| Typecheck  | `npm run admin:typecheck`                                        | exit 0              |
| Manager    | `npm run admin:test && npm run admin:build`                      | exit 0              |
| Regression | `npm run validate`                                               | exit 0              |

## Scope

**In scope**:

- publication domain, route, Git adapter, recovery journal, and their tests
- change-set schema, route, repository, and their tests
- a shared repository-path containment helper if needed

**Out of scope**:

- Changing publication-owned paths without an ADR/product decision.
- Real commits, pushes, credentials, remotes, or production catalogs.
- The broader change-set lifecycle, owned by Plan 062.

## Git workflow

- Branch: `security/058-publication-paths`
- Commit: `fix(admin): constrain publication and repository paths`.

## Steps

### Step 1: Make the publication manifest server-owned

Define a strict runtime schema. Prefer immutable server-owned paths; if extensions are
needed, accept only an explicit allowlist of normalized repository-relative paths.
Reject absolute paths, traversal, NULs, option-like values, duplicates, and paths
outside declared roots. Do not accept validation requirements from the caller.

**Verify**: schema tests reject `--all`, absolute/traversal paths, unknown fields, and
arbitrary repository files; the default manifest passes.

### Step 2: Commit exactly the validated path set

Add `--` before all Git pathspecs. Snapshot the pre-existing index and either fail on
unrelated staged entries or use an isolated temporary index. After staging, compare
the complete staged set to the normalized manifest; on every failure/cancel path,
restore the original index byte-for-byte.

**Verify**: temporary-repo integration tests start with unrelated staged changes,
renames, deletions, spaces, and cancellation. No resulting commit contains an
unowned path, and the original staging is preserved after failure.

### Step 3: Constrain repository identifiers

Make change-set `id` immutable in PATCH schemas. Constrain IDs to the generated
`cs-...` form and centralize `resolve-under-root` validation for save/load/delete.
Apply the helper to other API-controlled backup/conflict IDs discovered in scope.

**Verify**: traversal, separator, encoded separator, absolute path, mass-assignment,
and symlink-containment tests fail closed without writing outside owned directories.

## Test plan

- Extend `test/integration/publicationAdvanced.test.ts` to inspect commit contents,
  not merely status output.
- Add Git adapter tests for the `--` terminator and exact argv.
- Add change-set route/repository tests for immutable IDs and containment.
- Inject Git/staging/write failures and assert recovery restores state.

## Done criteria

- [ ] Caller input cannot expand publication ownership.
- [ ] `git add` always separates options from paths.
- [ ] Pre-existing unrelated staging never enters a publication commit.
- [ ] Change-set and related IDs cannot escape owned directories.
- [ ] Failure/cancellation preserves the prior Git index and repository files.
- [ ] Focused and full validation commands pass.

## STOP conditions

- Correct index preservation requires destructive operations in the developer repo.
- Git submodules/worktrees make the chosen isolation strategy ambiguous.
- Existing valid IDs violate the proposed format; report a migration inventory first.
- A symlinked owned directory defeats lexical containment; require canonical-path policy.

## Maintenance notes

Review every new Git path operation for `--`, normalization, and exact staged-set tests.
Repository identifiers should never double as unchecked path fragments.
