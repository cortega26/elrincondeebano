# Local Development Guide

This guide provides a short, repeatable setup for contributors.

## Requirements

- Node.js 22.x (npm 10.x recommended). Keep in sync with `.nvmrc`, `.tool-versions`, and Volta.
- Python 3.12 for admin tooling (optional).
- Git.

## First run (site)

1. `nvm use 22` (or `volta install node@22.20.0 npm@10.9.3`).
2. `npm ci`.
3. `npm run build`.
4. Preview the staged site:

Option A: built-in server

```
node scripts/dev-server.mjs build
```

Open `http://127.0.0.1:8080/`.

Option B: `serve`

```
npx serve build -l 4173
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

## Optional: admin tool (desktop manager)

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
- Some tests read from `build/`; run `npm run build` after template or data changes.
