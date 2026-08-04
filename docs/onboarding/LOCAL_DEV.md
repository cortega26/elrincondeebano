# Local Development Guide

This guide provides a short, repeatable setup for contributors.

## Requirements

- Node.js 24.x. Keep in sync with `.nvmrc`, `.tool-versions`, and Volta.
- Python 3.12 for admin tooling (optional).
- Git.

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
npx serve astro-poc/dist -l 4174
```

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

In operator mode the launch credential comes from `ADMIN_CREDENTIAL` or is
printed once in the startup log (plan 071); the UI prompts for it on first use.
See `admin/content-manager/README.md` and `.env.example`.

## Optional: Python fallback (desktop manager, transition window only)

The Tkinter manager (`admin/product_manager/`) is the fallback during the
transition window (plan 069); prefer the TypeScript manager above.

1. `cd admin/product_manager`.
2. `python -m venv .venv`.
3. Activate the venv for your shell.
4. `python -m pip install --upgrade pip`.
5. `python -m pip install pytest pytest-mock`.
6. Run one of:
   - `python gui.py` (UI)
   - `python -m pytest` (tests)

## Notes

- `npm test` runs node:test, then Vitest.
- Active storefront checks read from `astro-poc/dist/`; run `npm run build` after Astro, data, or shared asset changes.
- `npm run build` is the only supported storefront build path for local verification.
