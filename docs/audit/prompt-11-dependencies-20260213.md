# Prompt 11 - Dependencias y mantenimiento (2026-02-13)

## Objetivo

Actualizar dependencias con riesgo controlado y dejar una política operativa de mantenimiento continuo.

## Inventario de dependencias críticas

### Node (directas)

1. Runtime/build: `esbuild`, `typescript`, `sharp`, `serve`
2. Calidad/pruebas: `eslint`, `vitest`, `@playwright/test`, `cypress`, `jsdom`
3. Seguridad/operación: `undici`, `lighthouse`
4. UI runtime: `bootstrap`, `@popperjs/core`, `ejs`

### Python admin (`admin/product_manager/requirements.txt`)

1. Testing: `pytest`, `pytest-mock`, `pytest-cov`, `pytest-xdist`
2. Quality/security: `ruff`, `pylint`, `mypy`, `bandit`, `pip-audit`
3. Runtime util: `portalocker`, `types-Pillow`

### Transitive health snapshot

1. `npm audit --omit=dev`: 0 vulnerabilidades (prod limpio).
2. `npm audit` (incluyendo dev): inicialmente 2 vulnerabilidades; corregidas en este prompt.

## Cambios aplicados

1. Transitive security fixes en lockfile:
   - `@isaacs/brace-expansion`: `5.0.0 -> 5.0.1`
   - `qs`: `6.14.1 -> 6.14.2`
2. Hardening de automatización de updates:
   - `.github/dependabot.yml`
   - Grupos por riesgo (`patch/minor` vs `major`) para `npm`, `pip` y `github-actions`.
   - Límites de PR por ecosistema para evitar ruido operativo.
   - Prefijos de commit y labels por ecosistema.
3. Política de mantenimiento documentada:
   - `docs/operations/DEPENDENCY_POLICY.md`
4. Índice de docs actualizado:
   - `docs/README.md`

## Estado de upgrades (post-cambios)

### npm outdated

Pendientes (solo major):

1. `eslint` `9.39.2 -> 10.0.0` (major)
2. `purgecss` `7.0.2 -> 8.0.0` (major)

No se aplicaron en este prompt para evitar regresión de tooling y pipeline.

### Python outdated (entorno aislado temporal)

1. `astroid` `4.0.4 -> 4.1.0` (patch)

No se aplicó en este prompt porque `requirements.txt` no está pinneado y requiere PR dedicado para lock/constraints o estrategia de pinning.

## Evidencia de verificación

Ejecutado con Node 22 (`npx -y node@22 ... npm-cli.js ...`):

1. `npm run lint` -> OK
2. `npm test` -> OK
3. `npm run build` -> OK
4. `npm run test:e2e` -> OK (26 passed, 12 skipped)
5. `npm audit --omit=dev --json` -> 0 vulnerabilidades

Nota: una ejecución inicial en paralelo de `build` y `test:e2e` provocó conflicto en `build/` (Windows ENOTEMPTY). Se repitió en secuencia y quedó verde.

## Riesgos restantes

1. Majors pendientes (`eslint@10`, `purgecss@8`) pueden romper linting y extracción de CSS.
2. Dependencias Python sin pinning estricto dificultan reproducibilidad exacta entre máquinas.
3. `typecheck` global sigue como deuda histórica (fuera de este prompt).

## Plan de PRs pequeños

1. PR11-A: lockfile security refresh + dependabot grouping (este cambio).
2. PR11-B: estrategia de pinning Python (`requirements.in` + lock/constraints) sin mezclar funcionalidad.
3. PR11-C: `eslint@10` con migración de config y baseline de lint.
4. PR11-D: `purgecss@8` con benchmark de CSS generado y smoke visual.
