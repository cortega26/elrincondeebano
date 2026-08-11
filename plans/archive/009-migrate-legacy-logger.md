# Plan 009: Migrar funcionalidades del logger legacy al logger activo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/lib/logger.ts src/js/utils/logger.mts`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt + dx
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

El proyecto tiene dos loggers: el legacy (`src/js/utils/logger.mts`, 92 líneas) y el activo (`astro-poc/src/lib/logger.ts`, 44 líneas). El storefront en producción usa el logger activo, pero este carece de las funcionalidades de seguridad del legacy:

1. **Redacción de datos sensibles**: El logger legacy (`logger.mts:9-70`) tiene `SENSITIVE_KEY_PATTERN`, `redactIfSensitive`, `sanitizeMetaValue` (con detección de referencias circulares vía WeakSet, truncado de strings >512 chars, normalización de errores). El logger activo (`logger.ts:1-27`) tiene `normalizeMetaValue` que solo normaliza errores y arrays — sin redacción, sin truncado, sin detección de ciclos.

2. **Correlation IDs**: El logger legacy exporta `createCorrelationId()` para tracing de requests. El logger activo no tiene este concepto.

3. **Riesgo concreto**: Si se loguea un objeto con referencias circulares, el logger activo tira `TypeError: Converting circular structure to JSON`. Si se loguea metadata con cookies/tokens/API keys, se escriben en texto plano a la consola.

## Current state

### Logger legacy (fuente de verdad para features de seguridad)

```typescript
// src/js/utils/logger.mts (92 líneas)
export function createCorrelationId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[-_]?key|session|credential)/i;

function redactIfSensitive(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
  return value;
}

function sanitizeMetaValue(value, keyPath = [], seen = new WeakSet()): unknown {
  // ... redacción, truncado de strings, WeakSet circular detection, Error normalization
}

export function sanitizeLogMeta(meta = {}): Record<string, unknown> { ... }

export function log(level, message, meta = {}) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...sanitizeLogMeta(meta) };
  // ...
}
```

### Logger activo (usa el storefront en producción)

```typescript
// astro-poc/src/lib/logger.ts (44 líneas)
export function normalizeMetaValue(value: unknown): unknown {
  // Solo normaliza Error, Array, y objetos planos — sin redacción ni circular detection
}

export function log(level: string, message: string, meta = {}) {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(normalizeMetaValue(meta) as Record<string, unknown>),
  });
  // ...
}
```

### Consumidores del logger activo

- `astro-poc/src/scripts/storefront.js:10` — `import { log } from '../lib/logger.js'`
- `astro-poc/src/scripts/storefront/storage-contract.ts` — recibe `log` como parámetro

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/lib/logger.ts` — añadir `createCorrelationId`, `sanitizeMetaValue` con redacción + circular detection, integrar en `log()`

**Out of scope**:

- `src/js/utils/logger.mts` — no se modifica (se eliminará cuando se complete la migración de `src/js/`)
- Cambios en los callers del logger — la API de `log()` no cambia
- Tests del logger legacy (`test/logger.redaction.spec.js`) — no se migran en este plan

## Git workflow

- Branch: `advisor/009-migrate-legacy-logger`
- Commit messages: `feat: add secret redaction, circular reference protection, and correlation IDs to active logger`
- No push/PR sin indicación.

## Steps

### Step 1: Portar features de seguridad al logger activo

En `astro-poc/src/lib/logger.ts`:

1. Añadir `createCorrelationId()` (copiar del legacy, líneas 1-7 de `logger.mts`).
2. Añadir `SENSITIVE_KEY_PATTERN` y `redactIfSensitive` (copiar del legacy, líneas 9-17).
3. Reemplazar `normalizeMetaValue` con la versión completa del legacy (`sanitizeMetaValue`, líneas 19-62 de `logger.mts`) que incluye:
   - Redacción de keys sensibles
   - Truncado de strings > 512 caracteres
   - Detección de ciclos con `WeakSet`
   - Normalización de `Error` objects
4. Añadir `sanitizeLogMeta` wrapper.
5. Integrar `sanitizeLogMeta` en la función `log()` existente (reemplazar `normalizeMetaValue(meta)` por `sanitizeLogMeta(meta)`).
6. Mantener la firma de `log(level, message, meta)` sin cambios.
7. Exportar `createCorrelationId` y `sanitizeLogMeta`.

**Verify**: `npm run typecheck` → exit 0

### Step 2: Verificar compatibilidad

1. Verificar que los callers existentes no rompen:
   ```bash
   grep -rn "from.*logger" astro-poc/src/
   ```
2. Los imports existentes (`import { log } from '../lib/logger.js'`) deben seguir funcionando sin cambios.

**Verify**: `npm test` → all pass

### Step 3: Añadir tests de redacción

Crear o modificar tests para verificar que el nuevo logger redacta datos sensibles:

```javascript
// En test/logger.redaction.spec.js o nuevo test
it('redacts sensitive keys in log metadata', () => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  log('info', 'test', { authorization: 'Bearer secret123', name: 'test' });
  const entry = JSON.parse(spy.mock.calls[0][0]);
  expect(entry.authorization).toBe('[REDACTED]');
  expect(entry.name).toBe('test');
  spy.mockRestore();
});
```

**Verify**: `npm test` → nuevos tests pasan

### Step 4: Validación completa

```bash
npm run typecheck && npm run lint && npm test
```

**Verify**: Todo exit 0.

## Test plan

1. **Redacción de keys sensibles**: `authorization`, `cookie`, `token`, `secret`, `password`, `api_key`, `session`, `credential` → todas deben redactarse.
2. **Truncado de strings largos**: string de 600 chars → se trunca a 512 + "...".
3. **Detección de ciclos**: objeto con referencia circular → `'[Circular]'` en lugar de tirar `TypeError`.
4. **Normalización de Error**: `new Error('test')` → `{ name: 'Error', message: 'test' }`.
5. **createCorrelationId**: retorna string no vacío, diferente en cada llamada.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `logger.ts` exporta `createCorrelationId`, `sanitizeLogMeta`, `log`
- [ ] `log()` aplica redacción, truncado, y circular detection al metadata
- [ ] No se modificó `src/js/utils/logger.mts`
- [ ] Los imports existentes de `logger.ts` no requirieron cambios

## STOP conditions

- Si algún caller del logger depende de que NO haya redacción (ej: espera ver keys sensibles en logs de desarrollo).
- Si `sanitizeLogMeta` causa problemas de performance en hot paths (poco probable — los objetos de metadata son pequeños).
- Si los tests existentes de `logger.redaction.spec.js` (que testean el logger legacy) rompen porque accidentalmente se modificó el legacy.

## Maintenance notes

- Cuando `src/js/` se elimine completamente, borrar `src/js/utils/logger.mts` y sus tests asociados.
- Si se añade un sistema de logging estructurado (ej: enviar logs a un servicio), este logger es el punto único de modificación.
- `createCorrelationId` usa `Math.random()` — suficiente para tracing client-side. Si se necesita para seguridad (nonces, tokens), usar `crypto.randomUUID()`.
