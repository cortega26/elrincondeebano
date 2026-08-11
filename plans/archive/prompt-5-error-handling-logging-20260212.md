# Prompt 5 - Error Handling & Logging (2026-02-12)

## Error taxonomy mínima (aplicada)

### Frontend product data

1. `PRODUCT_DATA_HTTP_ERROR`
   - Cuando `fetch` responde `!ok`.
   - Contexto: `status`, `url`, `attempt`.
2. `PRODUCT_DATA_FETCH_FAILED`
   - Fallo final tras reintentos cuando no hay código previo específico.
   - Contexto: `url`, `retries`, `attempts`.
3. `PRODUCT_DATA_FETCH_UNEXPECTED`
   - Excepción no tipada al cargar productos en bootstrap.

### Sync API (server)

1. `INVALID_PRODUCT_IDENTIFIER` (400)
2. `INVALID_JSON_PAYLOAD` (400)
3. `PAYLOAD_TOO_LARGE` (413)
4. `SYNC_PATCH_REJECTED` (4xx en validación/aplicación de patch)
5. `INVALID_REQUEST_URL` (400)
6. `NOT_FOUND` (404)
7. `INTERNAL_SERVER_ERROR` (500)

## Estructura estándar usada

### Frontend (`ProductDataError`)

- `code`
- `message`
- `context`
- `cause`
- `correlationId`
- `userMessage` (opcional)

### API JSON de errores (`server/httpServer.js`)

- `error` (compat)
- `code`
- `message`
- `context`
- `cause` (sanitizado o `null`)

Además se agrega `x-correlation-id` en respuestas de la API sync.

## Logging: niveles y redacción sensible

1. Se reforzó `src/js/utils/logger.mts`:
   - Se agrega `timestamp` a cada entrada.
   - Redacción automática recursiva de claves sensibles:
     - `authorization`, `cookie`, `token`, `secret`, `password`, `api_key`, `session`, `credential`.
   - Protección contra ciclos y truncamiento de strings extensos.
2. Se añadió logging estructurado en API sync:
   - eventos `sync_api_invalid_payload`, `sync_api_patch_failed`, `sync_api_changes_failed`.
   - sanitización de metadatos antes de serializar.

## Mapa de puntos de falla cubiertos

1. Fetch de catálogo:
   - no-OK HTTP
   - errores de red
   - URL inválida
2. Parsing:
   - JSON inválido en API PATCH
3. Render/UX:
   - error user-facing de carga de catálogo con código/referencia.
4. Acciones de usuario/sync:
   - PATCH con payload excesivo
   - id de producto mal codificado
   - errores de sincronización con correlación por request.

## Tests agregados/actualizados para error paths

1. `test/httpServer.securityHeaders.test.js`
   - verifica payload de error estructurado (`code/message/context/cause`)
   - verifica `x-correlation-id` (incluyendo echo de ID cliente válido)
2. `test/fetchWithRetry.test.js`
   - agrega caso de `ProductDataError` estructurado para HTTP 503.
3. `test/logger.redaction.spec.js`
   - verifica redacción recursiva de datos sensibles.

## Riesgos restantes

1. Persisten algunos logs heredados con `console.*` en módulos no críticos.
   - Mitigado parcialmente: `src/js/modules/service-worker-manager.mjs`, `src/js/modules/cart.mjs`, `src/js/modules/catalog-manager.mjs`, `src/js/modules/ui-components.mjs`, `src/js/modules/notifications.mjs` y `src/js/modules/bootstrap.mjs` ya migrados a `log(...)` estructurado.
   - Pendiente: módulos legacy/UI auxiliares (`a11y`, `pwa`, `perf`, `enhancements`) y algunos mensajes de `script.mjs` orientados a métricas.
2. Correlación extremo a extremo aún no está completa en storefront; mitigado en flujo admin sync remoto con `X-Correlation-Id`.
3. `cause` en 500 de API se mantiene resumido (mensaje), no stack, para evitar filtrado.

## Próximo paso recomendado

1. Migrar progresivamente logs `console.*` de módulos críticos a `log(...)` con códigos de evento.
2. Extender el esquema de errores estándar al resto de módulos frontend (cart/catalog/bootstrap).
