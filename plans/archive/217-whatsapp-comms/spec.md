# Plan 217 — Módulo privado de mensajes de WhatsApp

- Status: DONE — 2026-10-11
- Decisión: [ADR 0011](../../../docs/adr/0011-private-whatsapp-comms-module.md)
- Runbook: [`docs/operations/COMMS.md`](../../../docs/operations/COMMS.md)

## Objetivo

Reducir el tiempo de preparar promociones para el grupo del edificio y de
responder preguntas frecuentes, reutilizando el catálogo real, sin servicios
nuevos y sin exponer datos de vecinos.

## Clasificación de funciones

| Función                                                                                                    | Clasificación               | Motivo                                             |
| ---------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| Biblioteca de plantillas (CRUD, duplicar, archivar, buscar, favoritos, variables, vista previa)            | MVP                         | Ahorro principal                                   |
| Fotos reales del catálogo + imagen propia + JPEG/PNG + Web Share/copiar/descargar                          | MVP                         | Requisito multimedia                               |
| Destinos (contacto validado, grupo, número pegado) y `wa.me`                                               | MVP                         | Handoff honesto                                    |
| Generador de promoción desde producto (precio, oferta y URL `/p/<sku>/`) + check de stock manual           | MVP                         | Bajo costo y alto ahorro                           |
| Mensajes contextuales (abrimos, últimos pedidos, repuesto, confirmado, listo, no disponible + alternativa) | MVP (plantillas de ejemplo) | Costo cero                                         |
| Historial con estados honestos + aviso de repetición a 7 días                                              | MVP                         | Evita duplicar promociones                         |
| Respaldo versionado export/import                                                                          | MVP                         | Recuperación                                       |
| Atajos (`/` buscar, Enter usa la primera, `g w` abre Mensajes)                                             | MVP                         | Rapidez                                            |
| Acceso móvil / PWA                                                                                         | Siguiente iteración         | Requiere acceso autenticado fuera de loopback      |
| Recordatorios/calendario                                                                                   | Siguiente iteración         | Valor bajo hasta medir el uso                      |
| Cloud API / Groups API / webhooks entrantes                                                                | Descartada                  | No aplica al grupo existente; costo y riesgo altos |

## Criterios de aceptación

Cubiertos por `test/contract/comms.test.ts` (lógica pura, paridad del SKU con
el storefront), `test/integration/commsApi.test.ts` (persistencia, 409, 422,
archivo corrupto, Host no loopback, solo lectura, `git check-ignore`) y
`test/e2e/comms.spec.ts` (handoff con `window.open` y `navigator.share`
espiados, ventana bloqueada, sin Web Share, repetición, móvil 390px).
