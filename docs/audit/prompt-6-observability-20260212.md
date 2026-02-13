# Prompt 6 - Observabilidad (2026-02-12)

## Auditoría de tooling existente

1. `src/js/modules/analytics.mjs`: tracking opt-in con consentimiento y sampling, pero orientado a eventos de negocio, no a SRE/performance.
2. No se detectó integración activa con Sentry u otro APM/RUM externo para errores frontend.
3. Existe medición puntual de performance por consola (`logPerformanceMetrics`) y auditorías Lighthouse (`npm run lighthouse:audit`), pero no una capa homogénea de señales operativas runtime.

## Qué medimos ahora (mínimo viable)

1. Web Vitals:
   - `LCP`, `INP`, `CLS`.
2. Tasa de errores frontend:
   - conteo de `window.error` y `window.unhandledrejection`.
3. Endpoints lentos:
   - latencia de fetch de catálogo (`product_data_fetch`).

## Implementación aplicada

1. Nuevo módulo `src/js/modules/observability.mjs`:
   - `initObservability(...)`
   - `recordEndpointMetric(...)`
   - `getObservabilitySnapshot()`
   - `__resetObservabilityForTest()`
2. Integración en startup:
   - `src/js/main.js` inicializa observabilidad con umbral de `1200ms`.
3. Integración en fetch crítico:
   - `src/js/utils/product-data.mjs` reporta latencia de `fetchWithRetry` para detección de endpoints lentos.
4. Kill switch local:
   - `localStorage.ebano-observability-disabled = "true"`.
5. Documentación operativa:
   - `docs/operations/OBSERVABILITY.md`.

## Privacidad y legal básico

1. No se capturan payloads de usuario ni datos sensibles.
2. Se registra sólo `path` (sin query), método, status y duración para endpoints.
3. Sin envío automático a terceros desde esta capa.
4. Retención en memoria acotada (máximo 50 endpoints lentos).

## Tests agregados

1. `test/observability.metrics.test.js`:
   - captura de endpoints lentos y sanitización de URL.
   - conteo de errores runtime/rejections.
   - captura de Web Vitals cuando `PerformanceObserver` está disponible.
2. Registrado en `test/run-all.js`.

## Riesgos restantes

1. No existe backend collector dedicado para centralizar snapshots/series temporales.
2. `web_vitals_snapshot` depende de soporte de `PerformanceObserver` del browser.
3. Falta dashboard operativo formal (señal existe, visualización no).
