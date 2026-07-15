# Plan 020: Consolidar módulos duplicados de observabilidad

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```
> git diff --stat 633eeb8..HEAD -- astro-poc/src/scripts/storefront/observability.js src/js/modules/observability.mjs astro-poc/src/scripts/storefront.js src/js/main.js
> ```
>
> If any in-scope file changed, compare excerpts against live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 013 (Astro version correct)
- **Category**: tech-debt
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Existen dos módulos de observabilidad con funcionalidad casi idéntica:

- `astro-poc/src/scripts/storefront/observability.js` (267 líneas) — el módulo activo
- `src/js/modules/observability.mjs` (276 líneas) — el módulo legacy

Ambos trackean LCP, CLS, INP vía `PerformanceObserver`, mantienen contadores de errores, registran endpoints lentos con `MAX_SLOW_ENDPOINT_ENTRIES = 50`, y exportan `getObservabilitySnapshot()` + `initObservability()`. 513 líneas de diff confirman divergencia. Dos inicializaciones independientes pueden registrar listeners duplicados. El formato de métricas difiere, imposibilitando dashboards unificados. Bug fixes en uno no se propagan al otro. Ya existe el plan 009 para consolidar los loggers duplicados — este plan hace lo mismo para observabilidad.

## Current state

- `astro-poc/src/scripts/storefront/observability.js:1-267` — módulo activo, importado por `storefront.js`
- `src/js/modules/observability.mjs:1-276` — módulo legacy, importado por `src/js/main.js`
- Ambos exports: `initObservability`, `getObservabilitySnapshot`
- Constantes compartidas: `MAX_SLOW_ENDPOINT_ENTRIES = 50`, `MAX_ERROR_BUCKETS = 5`
- Tests: `test/observability.metrics.test.js` — verificar cuál de los dos módulos testea

## Commands you will need

| Purpose | Command            | Expected on success |
| ------- | ------------------ | ------------------- |
| Build   | `npm run build`    | exit 0              |
| Lint    | `npm run lint`     | exit 0              |
| Test    | `npm test`         | all pass            |
| E2E     | `npm run test:e2e` | all pass            |

## Scope

**In scope**:

- `src/js/modules/observability.mjs` — convertir en re-export del módulo activo
- `src/js/main.js` — actualizar import si es necesario
- `test/observability.metrics.test.js` — actualizar imports si apuntan al módulo legacy

**Out of scope** (do NOT touch):

- `astro-poc/src/scripts/storefront/observability.js` — es el canonical, no se modifica su lógica interna
- `storefront.js` — ya importa el módulo correcto
- Plan 009 (consolidar loggers) — diferente módulo, ejecutar independientemente

## Git workflow

- Branch: `advisor/020-consolidate-observability`
- Commit message: `refactor(observability): consolidate legacy module as re-export of active module`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Verificar que el módulo activo exporta todo lo necesario

Leer `astro-poc/src/scripts/storefront/observability.js` y confirmar que exporta al menos:

- `initObservability`
- `getObservabilitySnapshot`

**Verify**: `grep -n "export" astro-poc/src/scripts/storefront/observability.js` muestra al menos estas dos funciones.

### Step 2: Convertir módulo legacy en re-export

Reemplazar el contenido de `src/js/modules/observability.mjs` con:

```javascript
export {
  initObservability,
  getObservabilitySnapshot,
} from '../../astro-poc/src/scripts/storefront/observability.js';
```

**Verify**: `npm run lint` → exit 0. Verificar que el path de import es correcto (relativo desde `src/js/modules/` a `astro-poc/src/scripts/storefront/`).

### Step 3: Verificar que no hay diferencias de API

Revisar si el módulo legacy exporta funciones adicionales que el activo no tiene. Si existen, considerar si deben añadirse al módulo activo o si son dead code.

```bash
grep -n "export" astro-poc/src/scripts/storefront/observability.js
grep -n "export" src/js/modules/observability.mjs.bak  # si existe backup
```

Si el módulo legacy exporta funciones que el activo no tiene y que NO son usadas por ningún caller, eliminar el export del re-export.

### Step 4: Actualizar tests

Si `test/observability.metrics.test.js` importa del módulo legacy:

```bash
grep -rn "modules/observability" test/
```

Cambiar los imports para que apunten al módulo activo:

```javascript
// Antes
import { initObservability } from '../src/js/modules/observability.mjs';
// Después
import { initObservability } from '../astro-poc/src/scripts/storefront/observability.js';
```

**Verify**: `npm test` → todos los tests pasan.

### Step 5: Validación completa

```bash
npm run build && npm run lint && npm test && npm run test:e2e
```

**Verify**: todos exit 0.

## Test plan

- Ejecutar `npm test` — asegurar que `test/observability.metrics.test.js` sigue pasando con el nuevo import.
- Si no hay tests para observabilidad, verificar manualmente en `npm run dev` que no hay errores en consola relacionados con `initObservability`.

## Done criteria

All must hold:

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `src/js/modules/observability.mjs` contiene solo re-exports (≤10 líneas)
- [ ] `grep -rn "from.*modules/observability" src/js/` no encuentra imports del módulo legacy (todos usan el canonical)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- El path de re-export no funciona (Astro/Vite no resuelve imports fuera del workspace `astro-poc/`). Alternativa: mover `observability.js` a un directorio compartido (ej. `src/shared/`) o duplicar el re-export en `astro-poc/src/` con un alias en `astro-poc/tsconfig.json`.
- El módulo legacy exporta funciones que el activo no tiene y que SÍ son usadas por `src/js/main.js` — evaluar si migrar la funcionalidad al módulo activo antes de consolidar.
- `npm test` falla porque los tests dependen de implementación interna del módulo legacy que difiere del activo.

## Maintenance notes

- Después de este plan, TODO el código nuevo de observabilidad va en `astro-poc/src/scripts/storefront/observability.js`. El archivo legacy es solo un re-export y no debe modificarse.
- Si `src/js/` se elimina en el futuro (plan 023), el re-export deja de ser necesario y `observability.mjs` puede eliminarse.
