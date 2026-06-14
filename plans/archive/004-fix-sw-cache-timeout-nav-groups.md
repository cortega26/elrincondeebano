# Plan 004: Fix SW cache version en timeout + nil-guard en nav_groups

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación. Si algo en "Condiciones de STOP" ocurre, detente e
> informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/scripts/storefront/service-worker-sync.ts astro-poc/src/lib/catalog.ts`
> Si alguno cambió, compara los excerpts contra el código vivo antes de proceder.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

**Bug 1 — SW cache version no persiste en timeout**: En
`service-worker-sync.ts`, si `sendServiceWorkerMessage` (que envía
`INVALIDATE_ALL_CACHES` al service worker) rechaza o hace timeout (5s por
defecto), el `await` en la línea 138 lanza una excepción no capturada. Como
resultado, la línea 148 (`storage.setItem(storageKey, targetVersion)`) nunca
se ejecuta. Esto deja la versión de caché desactualizada en localStorage, y en
la próxima carga de página el sistema vuelve a intentar la invalidación — que
vuelve a fallar si el service worker sigue sin responder. Los usuarios quedan
atrapados viendo assets obsoletos (producto con precio viejo, imagen antigua)
hasta que el service worker se registra correctamente.

**Bug 2 — `nav_groups` sin nil-guard**: En `catalog.ts:646`,
`categoryRegistry.nav_groups.filter(...)` se llama sin verificar que
`nav_groups` sea un array. Si el JSON del registry de categorías está malformado
(omite la clave `nav_groups` o la tiene como `null`), esta línea lanza
`TypeError: Cannot read properties of undefined (reading 'filter')`. Dado que
`getNavigationGroups()` se llama durante el build de Astro para renderizar el
Navbar (que aparece en todas las páginas), un JSON malformado rompería el build
completo. El patrón defensivo `|| []` ya existe para `categoryRegistry.categories`
en la línea 620 — es la excepción que falta.

## Estado actual

**`astro-poc/src/scripts/storefront/service-worker-sync.ts` (líneas 123–158)**:

```ts
// No hay try-catch alrededor de sendServiceWorkerMessage
await sendServiceWorkerMessage(
  // línea 138 — puede rechazar/timeout
  messageTarget,
  { type: 'INVALIDATE_ALL_CACHES' },
  { channelFactory, timeoutMs }
);

if (registration?.waiting && typeof registration.waiting.postMessage === 'function') {
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

storage.setItem(storageKey, targetVersion); // línea 148 — NO se ejecuta si línea 138 lanza
```

**`sendServiceWorkerMessage` (líneas 46–79)** — puede rechazar con:

- `Error('Service worker target is unavailable.')` si el target no tiene `postMessage`
- `Error('Service worker message timed out after Xms.')` si no responde en tiempo

**`astro-poc/src/lib/catalog.ts` (líneas 643–648)**:

```ts
export function getNavigationGroups(): NavGroup[] {
  const activeCategories = getActiveCategories();

  const groups = categoryRegistry.nav_groups   // línea 646 — sin nil-guard
    .filter((group) => group.active !== false)
    .sort(...)
    .map(...);
```

Patrón correcto existente en la misma función (línea 620):

```ts
return (categoryRegistry.categories || [])  // ← este patrón correcto ya existe
  .filter(...)
```

## Comandos necesarios

| Propósito | Comando             | Éxito esperado |
| --------- | ------------------- | -------------- |
| Typecheck | `npm run typecheck` | exit 0         |
| Tests     | `npm test`          | exit 0         |
| Lint      | `npm run lint`      | exit 0         |
| Build     | `npm run build`     | exit 0         |

## Alcance

**En scope**:

- `astro-poc/src/scripts/storefront/service-worker-sync.ts` — agregar try-catch
  alrededor de `sendServiceWorkerMessage`
- `astro-poc/src/lib/catalog.ts` — agregar `|| []` en `nav_groups` (línea 646)

**Fuera de scope** (no tocar):

- `astro-poc/src/scripts/storefront.js` — usa `syncStorefrontServiceWorkerVersion`
  como llamador; no se modifica
- El tipo `NavGroupRecord` en catalog.ts — no cambiar las interfaces de tipos
- `test/storefront.service-worker-sync.spec.js` — el test existente pasa; los
  tests nuevos son opcionales (ver Plan de tests)

## Workflow git

- Rama: `fix/correctness-sw-navgroups-004`
- Commits separados:
  - `fix: handle service worker message timeout in cache version sync`
  - `fix: add nil-guard for nav_groups in getNavigationGroups`
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Agregar try-catch en `service-worker-sync.ts`

En `astro-poc/src/scripts/storefront/service-worker-sync.ts`, envuelve las
líneas 138–155 (el bloque que comienza con `await sendServiceWorkerMessage`) en
un try-catch:

**Antes** (líneas 138–157):

```ts
await sendServiceWorkerMessage(
  messageTarget,
  { type: 'INVALIDATE_ALL_CACHES' },
  { channelFactory, timeoutMs }
);

if (registration?.waiting && typeof registration.waiting.postMessage === 'function') {
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

storage.setItem(storageKey, targetVersion);

if (typeof log === 'function') {
  log('info', 'service_worker_cache_version_synced', {
    version: targetVersion,
    invalidated: true,
  });
}

return { available: true, invalidated: true, version: targetVersion };
```

**Después**:

```ts
let invalidated = true;
let invalidationFailureReason: string | undefined;

try {
  await sendServiceWorkerMessage(
    messageTarget,
    { type: 'INVALIDATE_ALL_CACHES' },
    { channelFactory, timeoutMs }
  );
} catch (error) {
  invalidated = false;
  invalidationFailureReason = error instanceof Error ? error.message : String(error);

  if (typeof log === 'function') {
    log('warn', 'service_worker_cache_invalidation_failed', {
      version: targetVersion,
      reason: invalidationFailureReason,
    });
  }
}

if (registration?.waiting && typeof registration.waiting.postMessage === 'function') {
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

storage.setItem(storageKey, targetVersion);

if (typeof log === 'function') {
  log('info', 'service_worker_cache_version_synced', {
    version: targetVersion,
    invalidated,
  });
}

return {
  available: true,
  invalidated,
  version: targetVersion,
  ...(invalidationFailureReason ? { reason: 'message-failed' } : {}),
};
```

> **Razonamiento del catch**: guardar la versión incluso en fallo evita el
> bucle infinito de re-intentos. Devolver `invalidated: false` en lugar de
> `true` distingue el caso "intentamos pero falló" del caso exitoso. El caller
> en `storefront.js` puede logear o ignorar según corresponda.

**Verificar**: `npm run typecheck` → exit 0. Si TypeScript se queja del tipo
de `error` (en TS strict mode), usa `error instanceof Error ? error.message : String(error)`.

### Paso 2: Agregar nil-guard en `catalog.ts`

En `astro-poc/src/lib/catalog.ts`, en la función `getNavigationGroups` (línea
643), cambia la línea 646:

**Antes**:

```ts
const groups = categoryRegistry.nav_groups;
```

**Después**:

```ts
const groups = categoryRegistry.nav_groups || [];
```

Asegúrate de que el cierre de paréntesis sea correcto y el `.filter(...)` siga
en la misma línea o la siguiente — mantén el estilo del código circundante.

**Verificar**: `grep -n "categoryRegistry.nav_groups" astro-poc/src/lib/catalog.ts`
→ debe mostrar `(categoryRegistry.nav_groups || [])`.

### Paso 3: Typecheck y build

```bash
npm run typecheck
```

**Verificar**: exit 0. Si hay errores de tipo en el `catch` del Paso 1, ajusta
el tipo del catch según lo indicado en el Paso 1.

```bash
npm run build
```

**Verificar**: exit 0.

### Paso 4: Tests y lint

```bash
npm test && npm run lint
```

**Verificar**: exit 0 en ambos.

## Plan de tests

El archivo `test/storefront.service-worker-sync.spec.js` existe. Agrega 2 tests
al grupo existente:

```js
// Test 1: timeout del mensaje SW no impide que se guarde la versión
it('persiste la versión incluso cuando sendServiceWorkerMessage hace timeout', async () => {
  // Mock de messageTarget que nunca responde
  // Configurar timeoutMs muy pequeño (5ms)
  // Llamar a syncStorefrontServiceWorkerVersion
  // Assert: storage.setItem fue llamado con la clave de versión correcta
  // Assert: resultado tiene { invalidated: false, reason: 'message-failed' }
});

// Test 2: rechazo inmediato del mensaje SW tampoco bloquea la persistencia
it('persiste la versión cuando sendServiceWorkerMessage rechaza', async () => {
  // Mock de messageTarget que rechaza inmediatamente
  // Llamar a syncStorefrontServiceWorkerVersion
  // Assert: storage.setItem fue llamado
});
```

Para `catalog.ts`, agrega a `test/catalog.test.js` (o créalo si no existe):

```js
it('getNavigationGroups retorna [] cuando nav_groups es undefined', () => {
  // Mock categoryRegistry sin nav_groups
  // Assert: getNavigationGroups() retorna []
});
```

## Criterios de done

- [ ] `grep "await sendServiceWorkerMessage" astro-poc/src/scripts/storefront/service-worker-sync.ts` → dentro de un bloque `try {}`
- [ ] `grep "nav_groups || \[\]" astro-poc/src/lib/catalog.ts` → al menos 1 resultado
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run build` → exit 0
- [ ] `npm test` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- TypeScript rechaza el try-catch con un error que no puedes resolver con el
  cast indicado en el Paso 1 — el tipo de SyncResult puede necesitar actualización.
- El build falla en un lugar inesperado relacionado con `nav_groups` (indicaría
  que la interfaz TypeScript enforza la presencia del campo y el problema es
  upstream).
- `npm test` falla en tests de SW sync no relacionados a este cambio.

## Notas de mantenimiento

- Si se cambia el mecanismo de logging en el futuro, actualizar el `log('warn', ...)`
  del catch para mantener consistencia.
- El nil-guard de `nav_groups` podría quitarse si se agrega validación de
  schema JSON en el pipeline de build — en ese caso, documentar esa garantía.
