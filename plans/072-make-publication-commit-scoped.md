# Plan 072: Make publication commits scoped to owned paths and validate "no-unrelated-staged"

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

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md (071 recommended — the boundary makes this safer)
- **Category**: security / correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The publication route is the primary operator tool committing to the canonical
repo, and it currently commits **whatever is staged** — not just the catalog
files. `git.commit()` in the adapter runs `git commit -m <msg>` with no
pathspec, and the `ownedPaths` list that gets staged comes from the request
body (`{...createDefaultManifest(), ...body.manifest}`), so a caller can
commit `data/idempotency.json` (command history) or sweep a developer's
half-finished working-tree changes into a "catalog publication" commit. The
manifest even declares a `no-unrelated-staged` validation that is never
implemented (`runPreflight` ignores its manifest argument entirely).

After this plan: the commit is scoped to a server-owned allowlist of paths,
the declared validation actually runs, and unrelated staged files block the
publication with an explicit error.

## Current state

Verified code (read directly):

- `admin/content-manager/src/server/adapters/gitAdapter.ts:62-64`:
  ```ts
  async commit(message: string): Promise<GitResult> {
    return this.run(["commit", "-m", message]);   // no pathspec
  }
  ```
- `admin/content-manager/src/server/routes/publication.ts:83-190` (abridged):
  ```ts
  const manifest = body.manifest
    ? { ...createDefaultManifest(), ...body.manifest }   // :96-98 — client-controlled
    : createDefaultManifest();
  ...
  const stageResult = await git.stage(manifest.ownedPaths);   // :141
  ...
  const commitResult = await git.commit(commitMessage);      // :150 — commits all staged
  ```
- `admin/content-manager/src/domain/publication/publicationService.ts:14-32`:
  `createDefaultManifest()` — `ownedPaths: ["data/product_data.json",
"data/category_registry.json", "data/categories.json",
"astro-poc/src/data/storefront-experience.json",
"astro-poc/src/data/storefront-bundles.json", "assets/images/"]` and
  `requiredValidations: ["products-schema", "category-schema",
"storefront-schema", "no-unrelated-staged"]`.
- `publicationService.ts:34-69` — `runPreflight(_manifest, gitChanges)`
  (note the underscore): implements only `no-conflicts`, a **warning** for
  `dirty`, and `branch`. `no-unrelated-staged` is declared but never checked.
- `gitAdapter.ts:77-113` — `getChanges()` parses `git status --porcelain`
  into `{ staged, unstaged, untracked, ... }` — this is what the new check
  will use.

Repo conventions: same as plan 071 (TS 7, vitest, `app.inject` integration
tests — pattern `test/integration/publicationE2E.test.ts` uses a real temp
git repo; see also `test/integration/failureInjection.test.ts`).

## Commands you will need

| Purpose   | Command                                                                                       | Expected on success |
| --------- | --------------------------------------------------------------------------------------------- | ------------------- |
| Typecheck | `npm run admin:typecheck`                                                                     | exit 0              |
| Tests     | `npm run admin:test`                                                                          | exit 0              |
| Targeted  | `npx vitest run test/integration/publication.test.ts test/integration/publicationE2E.test.ts` | all pass            |

## Scope

**In scope**:

- `admin/content-manager/src/server/adapters/gitAdapter.ts` — add
  `commitWithPaths(paths, message)` (and keep `commit` for compat or remove
  it if nothing else uses it — grep first).
- `admin/content-manager/src/domain/publication/publicationService.ts` —
  implement the `no-unrelated-staged` check in `runPreflight` (compare staged
  files against `manifest.ownedPaths`).
- `admin/content-manager/src/server/routes/publication.ts` — stop merging
  client `ownedPaths`; validate the manifest server-side; use the scoped
  commit.
- `admin/content-manager/test/` — new/updated tests.

**Out of scope**:

- The `backup`/`change-sets`/`conflicts` route bugs (plans 076, 080).
- Changing what the storefront reads after publication (plan 065 territory).
- Any Python-side publication logic.

## Git workflow

- Branch: `advisor/072-make-publication-commit-scoped`.
- Commit per step, conventional style (`fix(admin): scope publication commit to owned paths`), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a pathspec-scoped commit to the git adapter

In `gitAdapter.ts`, add:

```ts
async commitWithPaths(paths: string[], message: string): Promise<GitResult> {
  return this.run(["commit", "-m", message, "--", ...paths]);
}
```

**Verify**: `npm run admin:typecheck` exit 0.

### Step 2: Server-own the manifest

In `publication.ts`, remove the client merge. The route should read only
`commitMessage` and `push` from the body; `ownedPaths` always comes from
`createDefaultManifest()` (imported from `publicationService.ts`). If a
future manifest extension is needed, define a zod schema for it in
`src/shared/schemas/` and validate — do not spread the raw body.

**Verify**: grep `body.manifest` in `publication.ts` → no matches.

### Step 3: Implement `no-unrelated-staged`

In `runPreflight` (it currently ignores `_manifest` — rename to `manifest`),
add a check: for each file in `gitChanges.staged`, if it is not covered by
any path in `manifest.ownedPaths` (prefix match on `assets/images/`; exact or
`path.startsWith(owned)` for files), push an error:

```ts
for (const f of gitChanges.staged) {
  const covered = manifest.ownedPaths.some((p) => f === p || f.startsWith(p.replace(/\/?$/, '/')));
  if (!covered) {
    errors.push(`Unrelated staged file: ${f}`);
  }
}
```

Note `assets/images/` must match paths nested below it. Add the check result
to `checks` as `{ name: "no-unrelated-staged", status: fail|pass }`.

**Verify**: `npm run admin:typecheck` exit 0; unit test (Step 5) covers the
covered/uncovered cases.

### Step 4: Use the scoped commit and keep the stage step

`publication.ts:141` already stages `manifest.ownedPaths`; change `:150` to
`git.commitWithPaths(manifest.ownedPaths, commitMessage)`. The pathspec on
the commit is belt-and-braces on top of the staged set — the preflight
`no-unrelated-staged` check now rejects the case where unrelated files are
already staged.

**Verify**: `npm run admin:test` exit 0; the existing publication tests still
pass (they commit real temp repos).

### Step 5: Tests

- `test/contract/publicationService.test.ts` (new, or extend the existing
  publication test): `runPreflight` with (a) unrelated staged file →
  `ok: false`, error mentions the file; (b) only owned paths staged →
  `ok: true`; (c) staged file under `assets/images/` prefix → covered.
- `test/integration/publication.test.ts`: assert the commit created by a
  publication contains ONLY owned files: after the job, run
  `git show --stat --format="" HEAD` in the temp repo and assert no
  non-owned path appears.
- `test/integration/publicationE2E.test.ts` also exercises real git — keep
  it green.

**Verify**: `npx vitest run test/contract/publicationService.test.ts test/integration/publication.test.ts` → all pass.

## Done criteria

- [ ] `gitAdapter` has `commitWithPaths`; `git commit` with no pathspec is not
      used by the publication route (grep `git.commit(` in `routes/` → no match)
- [ ] `body.manifest` is not merged anywhere in `publication.ts`
- [ ] `runPreflight` fails on unrelated staged files (unit test proves it)
- [ ] Publication integration test proves the commit contains only owned paths
- [ ] `npm run admin:typecheck` and `npm run admin:test` exit 0
- [ ] `plans/README.md` status row 072 updated

## STOP conditions

Stop and report back (do not improvise) if:

- An existing test or workflow relies on the old behavior of committing
  unrelated staged files together with the catalog (e.g. the operator
  intentionally commits code changes in the same commit) — report the
  conflict rather than silently changing it.
- `git commit -- <paths>` behaves differently than expected in the temp-repo
  tests (e.g. an untracked-owned file not committed — then the stage step in
  the route already handles it; verify with the integration test).

## Maintenance notes

- If the catalog ever gains a new owned path (new data file), it must be
  added to `createDefaultManifest()` — the `no-unrelated-staged` check will
  loudly reject publications of it until then, which is the desired failure
  mode (update manifest, not the check).
- Plan 065 (canonical content contracts) may later replace the owned-path
  list with a schema-driven manifest — the `runPreflight` signature should
  survive that unchanged.
- Reviewer focus: the `startsWith(p.replace(/\/?$/, "/"))` prefix logic for
  directory entries — make sure `data/product_data.json` matches exactly and
  `assets/images/` matches descendants but not `assets/images-evil`.
