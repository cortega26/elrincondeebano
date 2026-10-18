# Plan 224: Handle renames in the porcelain status parser

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/server/adapters/gitAdapter.ts admin/content-manager/test/integration/gitAdapter.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

`parsePorcelainStatus` only collects `M/A/D` entries. A staged rename
(`R` in the index column) is dropped from `staged` entirely, so
`/git/status` under-reports and the publication preflight
(`publicationService.ts:72-88`, `no-unrelated-staged`) can pass a tree it
should review. Worse, when a rename entry _does_ contain an `M`/`A`
(`RM`, `AM`), the "path" pushed is the raw `old -> new` string (with
`core.quotepath` quoting on each side), which either spuriously fails the
unrelated-staged check ("Unrelated staged file: old -> new") or, for
`assets/…` prefixes, silently matches the owned-path filter. Product image
paths routinely contain spaces and accents (`Nova Clásica…`), so quoting is
the common case, not an edge case.

## Current state

`admin/content-manager/src/server/adapters/gitAdapter.ts:205-235`:

```ts
const status = line.substring(0, 2);
// Quotepath-aware: stock git quotes non-ASCII paths (core.quotepath),
// which must be decoded before ownedPaths prefix-matching.
const file = unquotePorcelainPath(line.substring(3).trim());
if (/^[ADU][ADU] /.test(line)) hasConflicts = true;
if (status.includes('M') || status.includes('A') || status.includes('D')) {
  if (status[0] !== ' ') staged.push(file);
  if (status[1] !== ' ') unstaged.push(file);
}
if (status.includes('?')) untracked.push(file);
```

Porcelain v1 rename shape: `R  "old name" -> "new name"` (and `RM` when the
worktree copy is also modified; `C` for copies in some configs).

Test pattern: `admin/content-manager/test/integration/gitAdapter.test.ts`
uses real temp git repos (`git init`, fs writes, `git add`/`git mv`); follow
it. Run admin tests with `npm run admin:test`.

## Commands you will need

| Purpose      | Command                                                                            | Provenance | Expected on success |
| ------------ | ---------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install      | `npm ci`                                                                           | declared   | exit 0              |
| Focused test | `npx vitest run test/integration/gitAdapter.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests  | `npm run admin:test`                                                               | declared   | all pass            |
| Admin lint   | `npm run admin:lint`                                                               | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/server/adapters/gitAdapter.ts`
- `admin/content-manager/test/integration/gitAdapter.test.ts`

**Out of scope**:

- `publicationService.ts` owned-path logic — it consumes the corrected list;
  no change there.
- Untracked (`??`) handling.

## Git workflow

- Branch: `advisor/224-git-porcelain-renames`
- Commit: `fix(admin): parse rename/copy entries in git status (plan 224)`.

## Steps

### Step 0: Establish a green baseline

Run Install + the focused test on the unmodified checkout. If it fails,
STOP.

**Verify**: focused test → all pass.

### Step 1: Parse rename/copy entries

In the loop, compute the entry kind once and resolve the path per kind:

```ts
const kind =
  status[0] === 'R' || status[0] === 'C' || status[1] === 'R' || status[1] === 'C'
    ? 'rename'
    : 'plain';
let file: string;
if (kind === 'rename') {
  const raw = line.substring(3).trim();
  const arrowIndex = raw.lastIndexOf(' -> ');
  file = unquotePorcelainPath(arrowIndex >= 0 ? raw.slice(arrowIndex + 4) : raw);
} else {
  file = unquotePorcelainPath(line.substring(3).trim());
}
if (status.includes('M') || status.includes('A') || status.includes('D') || kind === 'rename') {
  if (status[0] !== ' ') staged.push(file);
  if (status[1] !== ' ') unstaged.push(file);
}
```

Notes:

- The **new** path is the one callers care about (ownedPaths/preflight);
  the old path is intentionally dropped — document that in a comment.
- `lastIndexOf(' -> ')` is deliberate: it survives an (unquoted) `->`
  inside the old path. Quoted sides never contain a raw `->` because git
  escapes the inner quotes; still, take the substring after the **last**
  arrow and `unquotePorcelainPath` it (strips the `"…"` and escaped bytes
  exactly as the existing helper does for plain paths).
- The conflict regex stays as-is.

### Step 2: Tests with a real rename (quoted + accented)

Extend `gitAdapter.test.ts` with cases against a temp repo:

1. `git mv "Nova Clásica.png" "Nova Clasica renombrada.png"` (create the
   file first, `git add` it, commit; then `git mv` without committing) →
   `staged` contains exactly the **new** path (decoded, no quotes, no
   `->`), `unstaged` does not contain the mangled string.
2. A rename plus a worktree modification (`git mv` then edit the new file)
   → appears in both `staged` and `unstaged` with the new path.
3. A plain `M`/`A`/`D` case (existing tests) still passes unchanged.

**Verify**: `npx vitest run test/integration/gitAdapter.test.ts` (cwd
`admin/content-manager`) → all pass, including the new cases.

### Step 3: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0;
`npm run admin:typecheck` → exit 0.

## Test plan

- Real-git rename cases (Step 2) in the existing integration suite.
- Any publication preflight test that feeds a hand-written porcelain string
  containing `R` should be checked; if none exists, add one string-level
  case asserting the preflight sees the new path (follow the existing
  `no-unrelated-staged` test fixture).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:test` exits 0 including ≥3 new gitAdapter cases
- [ ] `npm run admin:lint` exits 0 and `npm run admin:typecheck` exits 0
- [ ] `grep -n "lastIndexOf(' -> ')" admin/content-manager/src/server/adapters/gitAdapter.ts` matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- Real porcelain output for the accented rename does not contain `->` in
  the tested git version (report the actual bytes — the split needs an
  adjustment).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Any future status-column handling (e.g. `T` type-change) must go through
  the same `kind` branch; the new-path-only rule is deliberate for
  ownedPaths matching.
- Reviewer: confirm the dropped old path is not needed by any preflight
  reason message.
- **Deferred:** none.
