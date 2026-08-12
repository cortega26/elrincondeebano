# 122 — Shared ESLint base config (kill the triplicated rule blocks)

- **Source**: Auditoría 9, DX-5
- **Status**: TODO · **Priority**: P3 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

The identical sonarjs rule block appears verbatim in three configs:

```js
// eslint.config.cjs:55-71, astro-poc/eslint.config.mjs:33-50, admin/content-manager/eslint.config.mjs:43-60
complexity: ['warn', 10],
'max-depth': ['warn', 4],
'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
'max-params': ['warn', 4],
'sonarjs/cognitive-complexity': ['warn', 15],
'sonarjs/no-identical-functions': 'warn',
'sonarjs/no-duplicate-string': 'warn',
```

The `no-unused-vars` pair and the `scripts/**` complexity-exemption block
are likewise triplicated (`eslint.config.cjs:56-63,113-122`;
`astro-poc/eslint.config.mjs:34-42,81-88`; admin equivalents). Any rule
change must be made three times.

## Scope

**In**: `eslint.config.cjs` (root), `astro-poc/eslint.config.mjs`,
`admin/content-manager/eslint.config.mjs`, and a new shared config file.

**Out**: rule behavior (the extracted rules keep identical values), lint
results on current files.

## Steps

1. Create a shared base (e.g. `config/eslint-base.mjs` or a package-level
   `eslint.base.config.mjs` at the root) exporting the common rule objects:
   `sonarRules`, `unusedVarsRules`, `scriptsExemptions`.
2. Import it from all three configs; replace the triplicated blocks with
   the imported constants. Verify each config still applies the rules to the
   same files (file patterns stay per-config — only the rule objects are
   shared).
3. Run all three linters and diff the output vs `b3805e1` baseline:
   `node tools/../eslint/bin/eslint.js` runs must produce the same
   errors/warnings as before the refactor (0 errors; same warning set).
4. Do not change any rule values in this plan.

## Tests

- Lint parity: run the root lint, the astro-poc lint, and the admin lint on
  the same tree before/after — identical output (the pre-commit lint-staged
  gates use the same configs).
- `npm run lint` + `npm run typecheck` green.

## Done criteria

- [ ] `grep -rn "max-lines-per-function" eslint.config.cjs astro-poc/eslint.config.mjs admin/content-manager/eslint.config.mjs` → the rule appears only via the shared import (or is absent from the files).
- [ ] Lint output identical to baseline (recorded in the commit).
- [ ] `npm run validate` green.

## Maintenance

One place to tune repo-wide lint policy. Keep per-package `files:`/globals
blocks where they are — only the rule objects are shared.

## Rollback

`git revert <sha>`.
