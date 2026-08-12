# 124 — Admin dev loop: watch mode (server + client)

- **Source**: Auditoría 9, DX-7
- **Status**: TODO · **Priority**: P3 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

`admin/content-manager/package.json:8` — the `dev` script is byte-identical
to `start`:

```json
"dev": "ADMIN_MODE=operator node --import tsx src/server/start.ts",
"start": "ADMIN_MODE=operator node --import tsx src/server/start.ts",
```

No watch mode anywhere. The Fastify server serves prebuilt SPA bundles from
`dist/web` (`src/server/app.ts:341-345`), so a UI change requires
`npm run admin:build` (tsc + vite build) plus a full server restart. The
vite dev server configured in `vite.config.ts:30-34` (port 5173) is never
started by any script — orphaned config. Contrast: Astro has HMR
(`astro-poc/package.json:14` `astro dev`).

## Scope

**In**: `admin/content-manager/package.json` (scripts), `src/server/start.ts`
or a dev entry (server watch), `vite.config.ts` (verify/align the dev
server for the SPA), `src/server/app.ts` (serve the vite dev origin when in
dev mode — check how `dist/web` is located and whether an env override
exists).

**Out**: production serving, `start` script behavior, CI.

## Steps

1. Server watch: change `dev` to `node --import tsx --watch src/server/start.ts`
   (tsx supports `--watch`; verify it restarts on `src/server/**` changes —
   `tsx watch` is the documented alternative; pick whichever works on Node
   24 with the repo's tsx version).
2. Client HMR: in dev mode, make the SPA served from the vite dev server
   (or proxy it) instead of `dist/web` — follow the existing
   `vite.config.ts:30-34` dev-server block (port 5173, host, proxy) and add
   a `dev:web` script running `vite`; in `app.ts`, when `NODE_ENV !==
'production'` (or an explicit `VITE_DEV_URL` env), serve/redirect to
   `http://127.0.0.1:5173` instead of `dist/web`. Keep production behavior
   untouched.
3. Document the loop in `admin/content-manager/README.md`: two terminals —
   `npm run admin:dev` (server, watch) + `npm run admin:dev:web` (vite HMR).
4. Do not change `start` (production entry) and do not change CI's build
   flow.

## Tests

- Manual smoke per the new README section: change a component → HMR applies
  without server restart; change a server route → tsx watch restarts.
- Automated: `npm run admin:test` + `npm run admin:build` green; the six
  e2e configs still run against the production-style build (they must not
  depend on the dev server).
- `npm run lint` + `npm run typecheck` green.

## Done criteria

- [ ] `dev` and `start` differ; `dev` restarts on server file changes.
- [ ] A UI edit shows up via HMR without a rebuild (documented smoke step).
- [ ] `start`/build/CI behavior unchanged; admin suites green.

## Maintenance

The admin currently has the slowest iteration loop in the repo; this closes
it. Keep the prod path (`dist/web` + `start`) as the default for e2e/CI —
dev mode is opt-in via script choice.

## Rollback

`git revert <sha>` — dev-only changes; production untouched.
