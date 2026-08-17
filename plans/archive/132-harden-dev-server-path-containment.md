# 132 — Harden dev-server.mjs path containment (sibling-prefix traversal + symlinks)

- **Source**: Auditoría 10, SEC-01 · **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- scripts/dev-server.mjs test/`

## Problem

`scripts/dev-server.mjs:33-44` uses a string-prefix containment check that accepts sibling directories, and follows symlinks:

```js
function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let pathname = decoded;
  if (pathname.endsWith('/')) {
    pathname = path.join(pathname, 'index.html');
  }
  const resolved = path.join(rootDir, pathname);
  if (!resolved.startsWith(rootDir)) {
    return null;
  }
  return resolved;
}
```

- `path.join(rootDir, '/../el-rincon-de-ebano-backup/secret.txt')` resolves into the sibling directory; `resolved.startsWith(rootDir)` is still true because the sibling shares the `rootDir` string prefix. Empirically verified.
- `stat()` (`:70`) and `createReadStream()` (`:87`) follow symlinks — a symlink inside the served tree (e.g. `dist` → elsewhere) escapes the root.

The codebase already replaced this exact pattern in the admin static server and identity helpers: `src/shared/identity.ts:70-78` (`isContainedWithin`) and `src/server/app.ts:342` reject `..` segments pre-resolve. The dev server predates that fix.

## Scope

**In**: `scripts/dev-server.mjs` (the `resolvePath` function + serving path), a new root test `test/dev-server.security.test.mjs` (model after `test/tools.staticServer.security.test.mjs`, which tests the admin static server's containment).

**Out**: The admin server (`app.ts`), `identity.ts`, and any other consumer of the dev server.

## Steps

1. In `resolvePath`, before `path.join`: split the decoded pathname on `/` and reject any `..` segment (also normalize percent-encoded `%2e%2e` — `decodeURIComponent` already ran, so a literal `..` segment is the remaining surface).
2. After `path.join`, use a boundary-aware containment check: `resolved === rootDir || resolved.startsWith(rootDir + path.sep)` (matches the convention in `identity.ts`).
3. Before serving (`:70`), `realpath` the resolved path and apply the same boundary check to the real path, so symlinks that point outside `rootDir` return 404/403 instead of streaming.
4. Keep behavior for legitimate paths byte-identical.

## Tests

- New `test/dev-server.security.test.mjs`, modeled on `test/tools.staticServer.security.test.mjs`: (a) `/../el-rincon-de-ebano-<sibling>/x` → 403 (previously 200 with sibling content); (b) `%2e%2e` variants → 403; (c) a symlink inside the served dir pointing outside → 403/404; (d) a normal file inside the root → 200.
- Run: `npx vitest run test/dev-server.security.test.mjs` → all pass; `npm run lint` green; `npm run typecheck` green.

## Done criteria

- [ ] Sibling-prefix request returns 403 (asserted).
- [ ] Symlink escape returns 403/404 (asserted).
- [ ] Normal file still served (asserted).
- [ ] `npm run lint` and `npm run typecheck` green.

## Maintenance

The repo standard is segment-boundary containment (`isContainedWithin`); the dev server should be migrated to that helper if it grows more routing. A reviewer should grep for `startsWith(rootDir`-style checks remaining anywhere.

## Rollback

`git revert <sha>`.

## STOP conditions

- If the e2e or dev workflow depends on serving files via symlink or sibling path, stop and report — that dependency must be resolved explicitly.
