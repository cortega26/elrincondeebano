# Vendored anymatch 3.1.3

## Why vendored

Astro 6.4.4 depends on `picomatch@^4.0.4` via its dependency chain. The upstream
`anymatch@3.1.3` package depends on `picomatch@^2.0.4`. This version conflict
prevents npm from deduplicating picomatch, causing two copies to be installed.

This vendored copy patches `anymatch/package.json` to accept `picomatch@^4.0.4`,
allowing npm to resolve picomatch to a single version (4.0.4) across the entire
dependency tree.

The override in astro-poc/package.json (`"anymatch": "$anymatch"`) ensures this
vendored copy is used instead of the upstream package.

## Changes from upstream

Only `package.json` was modified:

- `"picomatch": "^2.0.4"` → `"picomatch": "^4.0.4"`

Source code (`index.js`) is identical to upstream anymatch 3.1.3.

## Upstream

- Package: https://www.npmjs.com/package/anymatch
- Version: 3.1.3
- License: ISC (see LICENSE file)
