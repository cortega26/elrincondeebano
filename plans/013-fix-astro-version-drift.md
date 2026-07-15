# Plan 013: Corregir drift de versión de Astro — 6.4.6 instalado, 7.0.4 declarado

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"`
> If this prints `7.0.4`, the drift is already resolved — mark this plan DONE.
> If it prints anything else, proceed.

## Status

- **Priority**: P0 (unblocks all other work — wrong runtime version)
- **Effort**: S
- **Risk**: MED (Astro 7 may have breaking changes from 6)
- **Depends on**: none
- **Category**: deps
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

`astro-poc/package.json:24` declara `"astro": "7.0.4"`, ambos lockfiles (`package-lock.json` root y `astro-poc/package-lock.json`) registran `7.0.4`, pero los bytes en disco (`astro-poc/node_modules/astro/package.json`) son `6.4.6`. Cada `dev`, `build` y `preview` corre Astro 6 cuando se cree que corre Astro 7. Esto significa que features, APIs y breaking changes de Astro 7 no están disponibles y código que asume Astro 7 podría fallar silenciosamente con Astro 6. Además, `astro-poc/vendor/anymatch` fue documentado como "shim para Astro 6" — si Astro 7 ya no necesita ese shim, también podemos eliminarlo.

## Current state

- `astro-poc/package.json:24` — `"astro": "7.0.4"`
- `astro-poc/package-lock.json` — `packages["node_modules/astro"].version = "7.0.4"`
- `package-lock.json` — `packages["node_modules/astro"].version = "7.0.4"`
- Disco: `astro-poc/node_modules/astro/package.json` → `"version": "6.4.6"`
- `astro-poc/vendor/anymatch/package.json:4` — `"description": "Patched local anymatch shim for Astro 6 dependency closure"`
- `astro-poc/package.json:27-28` — `picomatch: "4.0.4"` override y `anymatch: "$anymatch"` override

## Commands you will need

| Purpose                  | Command                                                                                 | Expected on success |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------- |
| Verify installed version | `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"` | `7.0.4`             |
| Reinstall                | `rm -rf node_modules astro-poc/node_modules && npm ci`                                  | exit 0              |
| Build                    | `npm run build`                                                                         | exit 0              |
| Typecheck                | `npm run typecheck`                                                                     | exit 0, no errors   |
| Lint                     | `npm run lint`                                                                          | exit 0              |
| Test                     | `npm test`                                                                              | all pass            |
| E2E                      | `npm run test:e2e`                                                                      | all pass            |

## Scope

**In scope** (the only files you should modify):

- Ninguno si `npm ci` resuelve el drift sin problemas
- `astro-poc/vendor/` — eliminar si el shim anymatch ya no es necesario con Astro 7
- `astro-poc/package.json:23,27-28` — remover dep y overrides de anymatch si ya no se usan

**Out of scope** (do NOT touch):

- Cualquier otro archivo de `astro-poc/src/` — el código no cambia en este plan
- `astro-poc/package-lock.json` — npm ci lo regenera
- Configuración de Astro (`astro.config.mjs`) — no se modifica

## Git workflow

- Branch: `advisor/013-fix-astro-drift`
- Commit message: `fix(deps): reconcile astro 7.0.4 install — npm ci + remove stale anymatch shim`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Reconciliar instalación de dependencias

```bash
rm -rf node_modules astro-poc/node_modules
npm ci
```

**Verify**: `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"` → `7.0.4`

### Step 2: Verificar si el shim anymatch sigue siendo necesario

```bash
npm ls anymatch 2>&1
```

Si Astro 7 ya no depende transitivamente de `anymatch` (vía `unstorage → chokidar → anymatch`), proceder al paso 3. Si la salida muestra que Astro 7 aún usa anymatch pero el shim funciona, SKIP al paso 4.

### Step 3: (Condicional) Eliminar shim anymatch

Solo si el paso 2 confirma que anymatch ya no es necesario:

```bash
rm -rf astro-poc/vendor/
```

En `astro-poc/package.json`:

- Remover línea 23: `"anymatch": "file:vendor/anymatch/anymatch-3.1.3.tgz",`
- Remover línea 27: `"picomatch": "4.0.4",` del bloque `overrides`
- Remover línea 28: `"anymatch": "$anymatch"` del bloque `overrides`
- Si `overrides` queda vacío, eliminar el bloque completo

```bash
rm -rf node_modules astro-poc/node_modules && npm ci
```

**Verify**: `npm run build` → exit 0

### Step 4: Validación completa post-migración

```bash
npm run build && npm run typecheck && npm run lint && npm test && npm run test:e2e
```

**Verify**: todos los comandos exit 0, no errores nuevos.

## Test plan

No se añaden tests nuevos. El plan es puramente operacional (reconciliar versiones). La suite existente (`npm test`, `npm run test:e2e`) actúa como verificación de que Astro 7 funciona correctamente.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node -e "console.log(require('./astro-poc/node_modules/astro/package.json').version)"` → `7.0.4`
- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0, no errors
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run test:e2e` exits 0 (all pass)
- [ ] `npm run validate:release` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm ci` falla con errores de resolución de dependencias (Astro 7 conflictua con algún otro paquete).
- `npm run build` produce errores que no existían antes del `npm ci`.
- `npm run test:e2e` falla con errores de renderizado nuevos (Astro 7 cambió la salida HTML).
- El shim anymatch SÍ es necesario para Astro 7 pero eliminarlo rompe el build — reportar y mantener el shim actualizando su documentación a "Astro 7".

## Maintenance notes

- Después de este plan, cualquier código que asuma APIs de Astro 7 debe verificarse contra la documentación de breaking changes entre 6→7.
- Si Astro 7 introduce un formato de build diferente, revisar `playwright.astro.config.ts` y `tools/lighthouse-audit.mjs`.
- El shim anymatch es un workaround de compatibilidad — documentar en `astro-poc/vendor/` por qué existe si se mantiene.
