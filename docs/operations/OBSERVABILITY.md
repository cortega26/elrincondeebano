# Observabilidad mínima (Storefront)

## Objetivo

Disponer de señales operativas útiles en producción sin introducir tracking invasivo:

1. Web Vitals (`LCP`, `INP`, `CLS`)
2. tasa de errores de frontend
3. endpoints lentos (latencia en fetch crítico de catálogo)

## Umbrales de triage

Usar estos valores como señal operativa para investigar antes de release o como
parte de una regresión en producción:

1. `LCP > 2.5s`
2. `INP > 200ms`
3. `CLS > 0.1`
4. fetch crítico de catálogo por sobre `1200ms`
5. incremento visible de `error` o `unhandledrejection` tras un cambio

## Implementación actual

### Inicialización

- Módulo: `astro-poc/src/scripts/storefront/observability.js`
- Arranque: `astro-poc/src/scripts/storefront.js` llama a `observability.initObservability({ enabled: true, slowEndpointMs: 1200 })` durante `initStorefront()`.
- Kill switch local: `localStorage.ebano-observability-disabled = "true"`.
- La inicialización es idempotente: una segunda llamada devuelve el snapshot sin reinstalar listeners.

### Métricas capturadas

1. Web Vitals (via `PerformanceObserver`):
   - `LCP`: último `largest-contentful-paint`.
   - `CLS`: suma de `layout-shift` sin input reciente.
   - `INP`: máximo `event.duration` con `interactionId > 0`.
   - Snapshot automático al cambio de visibilidad (`visibilitychange` → `hidden`).
2. Error rate:
   - Contadores separados para `error` (`state.errors.runtime`) y `unhandledrejection` (`state.errors.unhandledRejection`), más total acumulado.
3. Endpoints lentos:
   - `recordEndpointMetric({ name, url, method, status, durationMs })` registra sólo métricas sobre el umbral configurable (`slowEndpointMs`, default 1200 ms).
   - Retiene máximo 50 entradas en buffer circular (`state.endpoints.slow`).
   - La URL se sanitiza a pathname (sin query string, sin PII).

### Salida operativa

- Eventos estructurados via `log(...)`:
  - `observability_initialized`
  - `web_vitals_snapshot`
  - `slow_endpoint_detected`
- Snapshot local:
  - `getObservabilitySnapshot()` (uso interno/test).
  - `cleanup()` desregistra listeners y desconecta observers.

### Limitaciones conocidas

- No hay integración automática con `fetch` del catálogo; `recordEndpointMetric` debe llamarse explícitamente desde el código de fetch si se desea rastrear latencia de endpoints.
- El kill switch se evalúa sólo en la inicialización; cambiarlo en runtime no desactiva métricas ya activas sin una recarga.

## Privacidad y retención

1. No se capturan PII, payloads de usuario ni contenido de formularios.
2. En endpoints sólo se persiste `path`, método, status y duración; sin query string.
3. Retención en memoria de endpoints lentos: máximo 50 entradas.
4. No hay envío automático a terceros desde esta capa.
5. Cualquier exportación futura debe pasar por consentimiento/política de privacidad.

## Operación sugerida

1. Revisar eventos `slow_endpoint_detected` y `web_vitals_snapshot` en logs del navegador/collector.
2. Si aumenta error rate:
   - correlacionar con `runtime_error_before_app_ready` / `unhandled_js_error`.
3. Ajustar umbral de latencia por entorno:
   - default `1200ms`.
4. Si el cambio afecta rendering, navegación, service worker, bundles o fetch de
   catálogo:
   - complementar con `npm run lighthouse:audit`.
5. Si la tendencia empeora a medida que crece el catálogo o el número de assets:
   - revisar si hay trabajo repetido sobre `product_data.json` o `assets/images/`
     y abrir un follow-up de escalabilidad aunque no haya incidente todavía.

## Qué no debe pasar

1. No crear nuevas rutas de telemetría que dupliquen `log(...)` sin una razón
   clara y documentada.
2. No capturar payloads de usuario, query strings o PII para explicar
   regresiones de rendimiento.
3. No tratar Lighthouse o Web Vitals como opcionales cuando la PR toca la ruta
   crítica del shopper.
