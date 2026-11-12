# Plan 289: Aplicar en CI los umbrales de cobertura raíz que hoy nadie verifica

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- vitest.config.mts .github/workflows/ci.yml .github/workflows/admin.yml docs/operations/VALIDATION_MATRIX.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (el primer run con cobertura puede no alcanzar algún umbral bajo el entorno exacto de CI)
- **Depends on**: none (si el plan 284 ya está fusionado, `vitest.config.mts` tiene `globalSetup`: consérvalo)
- **Category**: tests
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

`vitest.config.mts` define umbrales globales (33/25/28/33) y un "ratchet"
por módulo del plan 231 (`sw-registration.js` ≥ 95 líneas/funciones), pero
el job de CI de la suite raíz corre `npx vitest run` **sin** `--coverage`, y
`npm run validate` usa `npm test` (también sin cobertura). La única
cobertura aplicada en CI es la del admin (`admin.yml:57`). Resultado: si la
cobertura de un módulo del storefront cae o se agrega un módulo sin tests,
CI sigue verde; el mecanismo de ratchet del plan 231 está, en la práctica,
apagado para el storefront.

## Current state

- `vitest.config.mts` (raíz):
  ```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 33,
        branches: 25,
        functions: 28,
        lines: 33,
        // Plan 231 ratchet: module-level floors (achieved − 5; measured
        // 100/100 on 2026-10-18). Raise with the PR that keeps it green.
        'astro-poc/src/scripts/storefront/sw-registration.js': {
          lines: 95,
          functions: 95,
        },
      },
    },
  ```
- `.github/workflows/ci.yml:49-65`, job `unit-tests-root`:
  ```yaml
  - name: Run root unit and integration tests
    run: npx vitest run
    env:
      # This job has no build artifacts; the build-contract tests skip
      # explicitly instead of failing (plan 075).
      CI_SKIP_BUILD_CONTRACT: '1'
  ```
- `.github/workflows/admin.yml:57` — ejemplar: el admin corre su suite con `--coverage` (plan 238).
- `package.json`: `"test:coverage": "vitest run --coverage && npm run admin:test:coverage"`; `@vitest/coverage-v8` ya es devDependency.
- Convención de la casa para umbrales (plan 231): "achieved − 5", con comentario de fecha y valor medido.

## Commands you will need

| Purpose            | Command                                              | Provenance | Expected on success |
| ------------------ | ---------------------------------------------------- | ---------- | ------------------- |
| Install            | `HUSKY=0 npm ci`                                     | declared   | exit 0              |
| Cobertura (CI env) | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run --coverage` | declared   | exit 0 + tabla      |
| Suite raíz         | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`            | declared   | verde               |
| Workflow tests     | `npx vitest run test/ci-hardening-workflow.test.js`  | declared   | verde               |
| Lint md            | `npm run lint:md`                                    | declared   | 0                   |

## Scope

**In scope**:

- `.github/workflows/ci.yml` (solo el comando del job `unit-tests-root` y, opcional, un step de upload del reporte)
- `vitest.config.mts` (solo `coverage.thresholds`, y solo si el Step 1 lo exige)
- `test/ci-hardening-workflow.test.js` (un test)
- `docs/operations/VALIDATION_MATRIX.md` (una línea)

**Out of scope**:

- Subir umbrales por encima de lo medido (no es objetivo de este plan).
- `npm run validate` / `npm test` (siguen sin cobertura para mantener el loop local rápido; CI es el gate).
- Escribir tests nuevos para alcanzar umbrales: si no se alcanzan, se reporta (STOP), no se rellena.

## Git workflow

- Branch: `advisor/289-root-coverage-ci`.
- Commit: `ci: enforce root coverage thresholds in the unit-tests job (plan 289)`.

## Steps

### Step 0: Baseline

Install; suite raíz verde.

### Step 1: Medir bajo el entorno de CI

`CI_SKIP_BUILD_CONTRACT=1 npx vitest run --coverage`. Anota los 4 totales
globales y las cifras de `sw-registration.js`.

- Si exit 0 → no toques `vitest.config.mts`.
- Si falla SOLO un umbral global por ≤ 3 puntos (por los 7 archivos de
  build-contract que se saltan en CI): baja ese umbral al valor medido redondeado
  hacia abajo, con un comentario `// Plan 289: measured <x> under CI_SKIP_BUILD_CONTRACT=1 on <fecha>`.
- Si falla por más de 3 puntos, o falla el ratchet de `sw-registration.js` → STOP.

**Verify**: el comando termina en exit 0 (con o sin el ajuste).

### Step 2: CI con cobertura

En `ci.yml`, job `unit-tests-root`: `run: npx vitest run --coverage` (conserva el `env`).
Añade a `test/ci-hardening-workflow.test.js`:
`root unit tests enforce coverage in CI` — el YAML de `ci.yml` contiene `npx vitest run --coverage`.

**Verify**: workflow tests verdes.

### Step 3: Documentar

En `docs/operations/VALIDATION_MATRIX.md`, en la fila/sección de la suite raíz,
añade: "CI aplica los umbrales de `vitest.config.mts` (`--coverage`, plan 289); localmente: `npm run test:coverage`."

**Verify**: `npm run lint:md` → 0.

## Test plan

- Medición del Step 1 en el informe (4 globales + ratchet).
- Test de contrato del workflow (Step 2).

## Done criteria

- [ ] `grep -n "npx vitest run --coverage" .github/workflows/ci.yml` → 1 match en `unit-tests-root`
- [ ] `CI_SKIP_BUILD_CONTRACT=1 npx vitest run --coverage` → exit 0
- [ ] Workflow tests y suite raíz verdes; lint:md 0
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 289 en `plans/README.md`

## STOP conditions

- Un umbral global falla por más de 3 puntos, o falla el ratchet de `sw-registration.js`.
- `--coverage` hace fallar tests que pasan sin cobertura (instrumentación): reporta cuáles.
- El job pasa de ~1 min a > 3 min (mide con `time` local; reporta antes de seguir).

## Maintenance notes

- Al subir cobertura de un módulo del storefront, añade su ratchet ("achieved − 5") en el mismo PR.
- **Deferred:** cobertura en `npm run validate` — se reabre si aparece un "verde local, rojo en CI" por cobertura.
