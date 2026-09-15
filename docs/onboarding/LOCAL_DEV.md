# Local Development Guide

This guide provides a short, repeatable setup for contributors.

## Requirements

- Node.js 24.x. Keep in sync with `.nvmrc`, `.node-version`, `.tool-versions`,
  `engines`, and CI (`24.x`) — single story (plan 200; no Volta pin).
- Git.

## Ports (plan 204 — values are code defaults; change nothing here)

| Service                                             | Default port | Override                               |
| --------------------------------------------------- | ------------ | -------------------------------------- |
| Storefront dev (`dev-server.mjs`)                   | 8080         | `PORT=... node scripts/dev-server.mjs` |
| Storefront E2E (Playwright)                         | 8081         | `PORT` in `.env`                       |
| Smoke/preview (`serve`, `SMOKE_BASE_URL`)           | 4173         | `SMOKE_BASE_URL`                       |
| Admin Content Manager                               | 3000         | `PORT` (admin `start.ts`)              |
| Admin E2E harnesses (import/scope/media/storefront) | 3101–3104    | per-config `PORT=`                     |

The E2E suites share one `PORT` variable — a collision with another project
on :3000 breaks `admin:dev` with `EADDRINUSE` (stop the squatter or export
`PORT` for the conflicting service).

## First run (site)

1. Follow [`BOOTSTRAP`](./BOOTSTRAP.md).
2. `npm run build`.
3. Preview the staged site:

Option A: built-in server

```
node scripts/dev-server.mjs astro-poc/dist
```

Open `http://127.0.0.1:8080/`.

Option B: `serve`

```
npx serve astro-poc/dist -l 4173
```

> Smoke preview uses `4173` by default (`SMOKE_BASE_URL`); any free port works if `SMOKE_BASE_URL` matches.

## Local runtime flags

- Allow HTTP on localhost:
  - Query param: `?http=on`
  - localStorage: `localStorage.setItem('ebano-allow-http-local', 'true')`
  - Console: `window.__ALLOW_LOCALHOST_HTTP__ = true`
- Enable service worker on localhost:
  - Query param: `?sw=on`
  - localStorage: `localStorage.setItem('ebano-sw-enable-local', 'true')`
- Include admin panel in build:
  - `INCLUDE_ADMIN_PANEL=1 npm run build`

## Admin: Content Manager (canónico)

The canonical admin application is the TypeScript Content Manager
(`admin/content-manager/`, Fastify + React). From the repo root:

```bash
npm run admin:dev      # dev server (http://127.0.0.1:3000)
ADMIN_MODE=operator npm run admin:start   # production start, writes enabled
```

In operator mode the launch credential comes from `ADMIN_CREDENTIAL` or, if absent,
is generated and written to `data/.admin-credential` (0600, gitignored; plan 125/127);
the UI prompts for it on first use. See `admin/content-manager/README.md` and
`.env.example`.

## Notes

- `npm test` runs the root Vitest suite, then the admin Vitest suite (`vitest run && npm run admin:test`).
- Active storefront checks read from `astro-poc/dist/`; run `npm run build` after Astro, data, or shared asset changes.
- `npm run build` is the only supported storefront build path for local verification.
