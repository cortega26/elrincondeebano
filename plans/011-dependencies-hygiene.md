# Plan 011: Higiene de dependencias — stale node_modules y documentación del fork anymatch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/package.json astro-poc/package-lock.json astro-poc/vendor/anymatch/ package.json package-lock.json`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: deps
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Dos problemas de higiene de dependencias:

1. **DM-01 — astro instalado desactualizado**: `astro-poc/package.json:21` declara `"astro": "6.4.4"` y `astro-poc/package-lock.json` registra 6.4.4, pero `astro-poc/node_modules/astro/package.json` contiene versión **6.1.8**. Si alguien ejecuta `npm install` en lugar de `npm ci`, la versión stale persiste. En CI esto no ocurre (usa `npm ci`), pero en desarrollo local es un footgun.

2. **DM-02 — Anymatch vendored sin procedencia**: `astro-poc/vendor/anymatch/` contiene un tarball `anymatch-3.1.3.tgz` con un parche que cambia la dependencia `picomatch` de `^2.0.4` a `^4.0.4`. No tiene:
   - LICENSE del upstream (ISC)
   - README o comentario explicando por qué existe el fork
   - Registro del cambio exacto (no hay diff contra upstream)

## Current state

### DM-01: astro stale

```bash
# astro-poc/package.json
"astro": "6.4.4"

# astro-poc/node_modules/astro/package.json
"version": "6.1.8"  # ← 3 minor versions behind
```

### DM-02: Anymatch fork

```bash
astro-poc/vendor/anymatch/
├── anymatch-3.1.3.tgz
└── package.json  # "Patched local anymatch shim for Astro 6 dependency closure"
```

`astro-poc/package.json:20`: `"anymatch": "file:vendor/anymatch/anymatch-3.1.3.tgz"`
`astro-poc/package.json:25`: `"anymatch": "$anymatch"` (override para forzar el vendored)

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Bootstrap | `npm run bootstrap` | exit 0              |
| Build     | `npm run build`     | exit 0              |
| Tests     | `npm test`          | all pass            |
| Audit     | `npm audit`         | 0 vulnerabilities   |

## Scope

**In scope**:

- `astro-poc/node_modules/` — reemplazar con `npm ci`
- `astro-poc/vendor/anymatch/README.md` — crear documentación
- `astro-poc/vendor/anymatch/LICENSE` — añadir ISC license del upstream

**Out of scope**:

- Modificar el tarball de anymatch
- Cambiar la estrategia de vendoring
- `package.json` o `package-lock.json`

## Git workflow

- Branch: `advisor/011-dependencies-hygiene`
- Commit messages:
  - `chore: add license and documentation for vendored anymatch fork`
  - `chore: regenerate astro-poc node_modules from lockfile`
- No push/PR sin indicación.

## Steps

### Step 1: Reinstalar astro-poc desde lockfile

```bash
cd astro-poc
rm -rf node_modules
npm ci
cd ..
```

**Verify**: `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"` → `6.4.4`

### Step 2: Documentar el fork anymatch

Crear `astro-poc/vendor/anymatch/README.md`:

```markdown
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
```

Añadir el archivo `LICENSE` del upstream. Obtener de:

```
https://raw.githubusercontent.com/micromatch/anymatch/3.1.3/LICENSE
```

**Verify**: `cat astro-poc/vendor/anymatch/README.md` → existe. `cat astro-poc/vendor/anymatch/LICENSE` → contiene ISC license.

### Step 3: Ejecutar npm audit

```bash
npm audit
```

**Verify**: 0 vulnerabilidades (o solo vulnerabilidades preexistentes conocidas)

### Step 4: Validación completa

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

**Verify**: Todo exit 0.

## Test plan

No se requieren tests nuevos. `npm test` y `npm run build` verifican que el entorno está correcto.

## Done criteria

- [ ] `astro-poc/node_modules/astro/package.json` versión es 6.4.4
- [ ] `astro-poc/vendor/anymatch/README.md` existe con explicación del fork
- [ ] `astro-poc/vendor/anymatch/LICENSE` existe con ISC license
- [ ] `npm audit` reporta 0 vulnerabilidades (o sin cambios vs antes)
- [ ] `npm run build` exits 0

## STOP conditions

- Si `rm -rf node_modules && npm ci` falla (problemas de red, registry).
- Si `npm audit` revela vulnerabilidades críticas no conocidas — reportarlas pero no bloquear.
- Si el archivo `LICENSE` del upstream no está disponible (repo eliminado/renombrado).

## Maintenance notes

- Cuando Astro o alguna dependencia en la cadena actualice su dependencia de picomatch a ^4.0.4, el vendored anymatch puede eliminarse y volver al package oficial.
- Verificar periódicamente si `anymatch` publica una versión oficial con soporte para picomatch 4.x.
- El tarball debe regenerarse si se actualiza anymatch (cambiar la dependencia picomatch en package.json y re-empaquetar).
