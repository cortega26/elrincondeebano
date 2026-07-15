# Plan 024: Unificar test runners bajo Vitest

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat 633eeb8..HEAD -- vitest.config.mts test/run-all.js package.json
> ```
>
> If files changed, compare excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 013 (Astro version), plan 022 (si archiva src/js/ — tests legacy deben migrarse primero)
- **Category**: tests
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

El proyecto tiene DOS runners de tests paralelos:

1. **Node test runner** (`test/run-all.js`) — ejecuta 63 archivos `.test.js` secuencialmente con `node --experimental-strip-types`. Cada archivo en un proceso separado.
2. **Vitest** (`vitest run`) — ejecuta 17 archivos `.spec.{js,mjs,ts}` en paralelo con soporte de coverage v8.

Problemas:

- **Sin visibilidad unificada**: `npm run test:coverage` usa `c8` que no se integra bien con Vitest. Los thresholds de coverage en `vitest.config.mts` (33% statements, 25% branches) solo aplican a los 17 archivos Vitest — los 63 archivos node:test no tienen thresholds.
- **Doble mantenimiento**: Dos configuraciones de test, dos formas de escribir tests, dos conjuntos de dependencias.
- **Lentitud**: `run-all.js` es secuencial (spawnSync). En una máquina de 8 cores, es ~6-8x más lento que la ejecución paralela de Vitest.
- **Test quality**: Los tests node:test usan `global.window`/`global.document` mutado sin cleanup consistente entre archivos. Esto "funciona" solo porque cada archivo corre en un proceso separado — migrar a Vitest expondrá dependencias de orden.

## Current state

- `package.json:47` — `"test": "node test/run-all.js && vitest run"`
- `test/run-all.js:8-73` — lista hardcodeada de 63 archivos `.test.js`
- `test/run-all.js:75-88` — bucle `spawnSync` secuencial
- `vitest.config.mts:11` — `include: ['test/**/*.spec.{js,mjs,ts}']`
- `vitest.config.mts:5` — `environment: 'jsdom'` (ya configurado, listo para tests DOM)
- `vitest.config.mts:14-23` — coverage thresholds (33/25/28/33)
- `stryker.conf.mjs:9-11` — muta `src/js/script.mjs` y `src/js/modules/**/*.mjs` (legacy)
- Test files con `global.window` manual: `cart.render.test.js:32-45`, `checkout.test.js:9-14`, `catalog-manager.test.js:38-39`

## Commands you will need

| Purpose        | Command                     | Expected on success |
| -------------- | --------------------------- | ------------------- |
| Test (current) | `npm test`                  | all pass            |
| Vitest only    | `npx vitest run`            | all pass            |
| Coverage       | `npx vitest run --coverage` | report generated    |
| Lint           | `npm run lint`              | exit 0              |

## Scope

**In scope**:

- `test/run-all.js` — eventualmente eliminar
- `vitest.config.mts` — expandir `include` para cubrir todos los archivos de test
- Archivos `.test.js` → renombrar/migrar a `.spec.ts` o `.test.ts` con imports Vitest
- `package.json:47-48` — simplificar scripts de test
- `stryker.conf.mjs` — actualizar paths de mutación si es necesario

**Out of scope** (do NOT touch):

- Los tests en sí — no se modifica la lógica de assertions, solo el runner
- `test/e2e/` y `test/e2e-astro/` — siguen con Playwright
- Plan 010 (añadir tests unitarios para lib) — complementa, no reemplaza

## Git workflow

- Branch: `advisor/024-unify-test-runners`
- Commit per phase. Message style: `test: migrate <N> test files to vitest`
- Do NOT push or open a PR unless instructed.

## Steps

### Fase 1: Preparación — investigación

Antes de migrar, responder:

1. ¿Cuántos de los 63 archivos `.test.js` usan `node:assert` vs `describe`/`it` global?
2. ¿Cuántos manipulan `global.window`/`global.document` manualmente?
3. ¿Hay tests que dependen del orden de ejecución (pasan en secuencial pero fallan en paralelo)?

```bash
# Contar usos de node:assert
grep -rl "node:assert\|require('assert')" test/*.test.js | wc -l

# Contar usos de global.window manual
grep -rl "global.window\|global.document" test/*.test.js | wc -l

# Listar archivos que usan describe/it (compatibles con Vitest sin cambios)
grep -rl "^describe\(\|^it\(\|test(" test/*.test.js | wc -l
```

### Fase 2: Migrar tests compatibles (bajo riesgo)

Archivos que usan `describe`/`it`/`test` y NO manipulan `global.window`/`global.document` manualmente pueden migrarse directamente:

1. Renombrar de `.test.js` a `.test.ts` (o mantener `.js`)
2. Agregar `import { describe, it, expect } from 'vitest';` al inicio
3. Reemplazar `require('node:assert')` por `expect()`
4. Probar con `npx vitest run <archivo>`

Migrar en batches de 5-10 archivos, verificando que Vitest los ejecuta correctamente.

### Fase 3: Migrar tests con DOM manual

Archivos que asignan `global.window`/`global.document` — Vitest con `environment: 'jsdom'` ya provee `window` y `document` globales. El setup manual es redundante:

1. Eliminar el bloque `setupDom`/`installDom` que asigna `global.window`
2. Usar `beforeEach` para configurar el DOM via `document.body.innerHTML = '...'`
3. Usar `afterEach` para limpiar (`document.body.innerHTML = ''`)

Ejemplo de migración:

```typescript
// Antes (node:test)
const { JSDOM } = require('jsdom');
let dom;
beforeEach(() => {
  dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
});

// Después (Vitest con jsdom environment)
import { beforeEach } from 'vitest';
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  document.body.innerHTML = '';
});
```

### Fase 4: Actualizar vitest.config.mts

Expandir el `include` para cubrir todos los archivos de test:

```typescript
include: ['test/**/*.{spec,test}.{js,mjs,ts}'],
```

Ajustar thresholds de coverage para reflejar la realidad post-migración. Los thresholds actuales (33/25/28/33) son muy bajos — mantenerlos temporalmente y subirlos en un plan futuro.

### Fase 5: Simplificar scripts

Una vez que todos los tests migraron a Vitest, actualizar `package.json`:

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage",
"test:watch": "vitest"
```

Eliminar `test/run-all.js` (o archivarlo en `_archive/`).

Actualizar `stryker.conf.mjs` para que mute los paths correctos (los módulos activos, no los legacy en `src/js/`).

### Fase 6: Validación completa

```bash
npm test && npm run test:coverage && npm run build && npm run test:e2e
```

**Verify**: todos exit 0. Coverage report muestra resultados unificados.

## Test plan

La migración en sí NO debe romper tests existentes. Para cada batch de migración:

1. Ejecutar el test original con node test runner → debe pasar
2. Migrar → ejecutar con Vitest → debe pasar
3. Si falla en Vitest pero pasaba en node, investigar diferencias de entorno (jsdom vs JSDOM manual)

## Done criteria

All must hold:

- [ ] `npm test` ejecuta solo Vitest (sin `node test/run-all.js`)
- [ ] `npm run test:coverage` genera report unificado
- [ ] Todos los tests existentes pasan (sin regresiones)
- [ ] `test/run-all.js` está eliminado o archivado
- [ ] `vitest.config.mts` incluye todos los archivos de test
- [ ] `stryker.conf.mjs` apunta a los módulos activos (no legacy)
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Más de 10 tests fallan en Vitest que sí pasaban en node test runner — indica problemas sistémicos con el entorno jsdom de Vitest. Reportar qué tests fallan y el error específico.
- Tests que dependen de `global.window` = `undefined` al inicio (esperan que NO exista) fallan porque Vitest siempre provee `window`. En ese caso, ajustar los tests para verificar el estado del DOM en lugar de la existencia de `window`.
- La migración de tests con DOM manual expone dependencias de orden (test B espera que test A haya dejado el DOM en cierto estado). Refactorizar para usar `beforeEach`/`afterEach` con cleanup explícito.
- `npm run test:e2e` falla después de la migración — puede indicar que algún test unitario modificaba estado global que los E2E dependen.

## Maintenance notes

- Después de la migración, TODOS los tests nuevos deben escribirse con Vitest (`describe`/`it`/`expect`). No se aceptan tests con `node:assert`.
- Usar `environment: 'jsdom'` para tests que necesitan DOM y `environment: 'node'` para tests de lógica pura (más rápido).
- Los thresholds de coverage deben subirse gradualmente (plan futuro) a medida que se añaden tests. Meta realista: 60% statements, 50% branches.
- Si `stryker.conf.mjs` deja de funcionar porque los paths legacy ya no existen, actualizar para que mute `astro-poc/src/lib/` y `astro-poc/src/scripts/storefront/`.
