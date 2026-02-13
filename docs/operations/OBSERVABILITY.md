# Observabilidad mínima (Storefront)

## Objetivo

Disponer de señales operativas útiles en producción sin introducir tracking invasivo:

1. Web Vitals (`LCP`, `INP`, `CLS`)
2. tasa de errores de frontend
3. endpoints lentos (latencia en fetch crítico de catálogo)

## Implementación actual

### Inicialización

- Módulo: `src/js/modules/observability.mjs`
- Arranque: `src/js/main.js` con `initObservability({ enabled: true, slowEndpointMs: 1200 })`.
- Kill switch local: `localStorage.ebano-observability-disabled = "true"`.

### Métricas capturadas

1. Web Vitals:
   - `LCP`: último `largest-contentful-paint`.
   - `CLS`: suma de `layout-shift` sin input reciente.
   - `INP`: máximo `event.duration` con `interactionId`.
2. Error rate:
   - contador total de `error` y `unhandledrejection`.
3. Endpoints lentos:
   - `recordEndpointMetric(...)` guarda sólo llamados sobre umbral.
   - Integrado en `fetchWithRetry` (`src/js/utils/product-data.mjs`) para `product_data_fetch`.

### Salida operativa

- Eventos estructurados por `log(...)`:
  - `observability_initialized`
  - `web_vitals_snapshot`
  - `slow_endpoint_detected`
- Snapshot local:
  - `getObservabilitySnapshot()` (uso interno/test).

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
