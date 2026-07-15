# Plan 023: Corregir brechas de tooling de desarrollo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat 633eeb8..HEAD -- package.json .gitignore .prettierrc
> ```
>
> If files changed, compare excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S (pre-commit + prettierignore) + M (build:fast)
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Tres brechas en la experiencia de desarrollo que ralentizan el ciclo de feedback:

1. **DX-N01** — Husky está instalado (`package.json:71` tiene `"prepare": "husky"`) pero el directorio `.husky/` no existe. No hay pre-commit hooks. El config de `lint-staged` en `package.json:125-137` es configuración muerta. Cualquier developer puede hacer commit de código que falla lint/typecheck.

2. **DX-N02** — `npm run build` ejecuta `preflight` (8 herramientas de generación de imágenes + `preflight.js`) en CADA build. Un cambio de CSS o TypeScript dispara la generación completa de imágenes. `npm run dev` no tiene este problema, pero `npm run validate` (que incluye build) se vuelve innecesariamente lento para iteración de código.

3. **DX-N03** — No existe `.prettierignore`. Aunque Prettier ignora `node_modules` por defecto, directorios como `dist/`, `build/`, `coverage/`, `reports/`, `.stryker-tmp/` pueden ser formateados accidentalmente.

## Current state

### DX-N01: Sin pre-commit hooks

- `package.json:71` — `"prepare": "husky"` (husky init hook)
- `.husky/` — no existe
- `.git/hooks/` — solo `.sample` files
- `package.json:125-137` — `lint-staged` config existe pero nunca se ejecuta

### DX-N02: Preflight en cada build

`package.json:16-17`:

```json
"preflight": "npm run categories:sync && npm run images:logo && npm run images:avif && npm run images:og:home && npm run images:og:overrides && npm run images:og:categories && npm run images:og:parking && npm run images:og:clean-overrides && node tools/preflight.js",
"build": "npm run preflight && npm -w astro-poc run build"
```

### DX-N03: Sin .prettierignore

El archivo `.prettierignore` no existe en el repo.

## Commands you will need

| Purpose | Command          | Expected on success |
| ------- | ---------------- | ------------------- |
| Build   | `npm run build`  | exit 0              |
| Lint    | `npm run lint`   | exit 0              |
| Format  | `npm run format` | exit 0              |
| Test    | `npm test`       | all pass            |

## Scope

**In scope**:

- `.husky/pre-commit` — nuevo archivo
- `package.json:16-17` — añadir `build:fast` script, mantener `build` como está
- `.prettierignore` — nuevo archivo
- `README.md` — documentar `build:fast`

**Out of scope** (do NOT touch):

- `lint-staged` config en `package.json` — ya está bien, solo necesita que los hooks existan
- `eslint.config.cjs` — el ignore de `astro-poc/**` en el config de root ESLint es por diseño (astro-poc tiene su propio config)
- Cambiar el comportamiento de `build` en CI — CI debe seguir usando el build completo
- Plan 008 (DX fixes del audit anterior) — complementa pero no reemplaza

## Git workflow

- Branch: `advisor/023-fix-dx-tooling`
- Three commits:
  1. `dx: add pre-commit hooks with lint-staged`
  2. `dx: add build:fast script to skip preflight for code-only iteration`
  3. `dx: add .prettierignore for generated directories`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Crear pre-commit hooks

```bash
npx husky init
```

Esto crea `.husky/` con un `pre-commit` default.

Reemplazar el contenido de `.husky/pre-commit` con:

```bash
npx lint-staged
```

**Verify**: `ls -la .husky/pre-commit` → el archivo existe y es ejecutable.

Probar manualmente:

```bash
echo "test" >> /tmp/test-hook.txt && git add /tmp/test-hook.txt && .husky/pre-commit; git reset HEAD /tmp/test-hook.txt
```

El hook debe ejecutar lint-staged (que no encontrará archivos staged de los patrones configurados).

### Step 2: Añadir build:fast script

En `package.json`, añadir después del script `build`:

```json
"build:fast": "npm -w astro-poc run build",
```

Documentar en `README.md` (después de la sección "Build Notes"):

````markdown
### Fast build (skip preflight)

For code-only changes (CSS, TypeScript, Astro components) where catalog data
and images haven't changed, use the fast build:

```bash
npm run build:fast
```
````

This skips the image generation pipeline and runs only the Astro build.
Use `npm run build` (full) for CI and when catalog data or images have changed.

```

**Verify**: `npm run build:fast` → exit 0. Debe ser más rápido que `npm run build`.

### Step 3: Crear .prettierignore

Crear `.prettierignore` en la raíz del repo:

```

dist/
build/
coverage/
reports/
.stryker-tmp/
.turbo/
astro-poc/dist/
astro-poc/.astro/
node_modules/
package-lock.json
astro-poc/package-lock.json
_archive/
_products/

````

**Verify**: `npm run format` → exit 0. No debe modificar archivos en los directorios ignorados.

### Step 4: Validación

```bash
npm run lint && npm run format -- --check && npm test
````

**Verify**: todos exit 0.

## Test plan

No se añaden tests automatizados para tooling. Verificación manual:

1. `npm run build:fast` — más rápido que `npm run build`, produce `astro-poc/dist/` con el sitio funcional.
2. `.husky/pre-commit` — al hacer commit de un archivo JS con errores de lint, el commit debe fallar.

## Done criteria

All must hold:

- [ ] `.husky/pre-commit` exists and is executable
- [ ] `npm run build:fast` exits 0 and is faster than `npm run build`
- [ ] `.prettierignore` exists with entries for generated directories
- [ ] `npm run format -- --check` exits 0 (no unformatted files)
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `README.md` documents `npm run build:fast`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `npx husky init` falla porque husky no está instalado (debería estarlo — `package.json:98`). Si falla, verificar `npm ls husky`.
- `npm run build:fast` produce un build incompleto (faltan imágenes, datos, etc.) — esto indicaría que algunas herramientas de preflight son necesarias para el build de Astro. En ese caso, mover esas herramientas específicas al script de build de `astro-poc/` en lugar del `preflight` root.
- `npm run format -- --check` encuentra archivos sin formatear — ejecutar `npm run format` primero para corregirlos (esto no debería pasar si el repo ya está formateado).

## Maintenance notes

- Cada vez que se añadan nuevas herramientas de generación de assets al preflight, evaluar si deben estar en `build` (CI) o si pueden omitirse en `build:fast` (dev).
- El pre-commit hook ejecuta `lint-staged` que a su vez ejecuta ESLint + Prettier. Si el hook se vuelve muy lento (>5 segundos), considerar mover typecheck al hook de pre-push en lugar de pre-commit.
- `.prettierignore` debe mantenerse sincronizado con `.gitignore` para directorios generados.
