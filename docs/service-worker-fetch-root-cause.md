# Service worker fetch regression RCA

## Resumen ejecutivo

- **Fecha:** 2024-05-09
- **Impacto:** la navegación dejó de responder tras el primer click y los submenús se cerraban de inmediato en páginas de categoría.
- **Usuarios afectados:** 100 % de los visitantes servidos con el Service Worker publicado en producción.
- **Síntomas visibles:** errores `FetchEvent` en consola, mensajes `Failed to convert value to 'Response'` y enlaces que aparentaban no hacer nada.

## Línea de tiempo

| Hora (CLT) | Evento                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 09:05      | QA detecta que los enlaces secundarios no abren en staging ni producción.                                  |
| 09:20      | Se observan errores de `FetchEvent` rechazado en DevTools.                                                 |
| 09:35      | Al desregistrar el Service Worker, la navegación funciona normalmente (diagnóstico confirmado).            |
| 10:15      | Se desarrolla fix que asegura respuestas válidas y patrón seguro `network-first`/`stale-while-revalidate`. |
| 11:00      | Cypress y build de producción pasan en local con el nuevo Service Worker.                                  |

## Análisis de causa raíz

- El handler `handleProductDataFetch` lanzaba `Error('Unable to fetch product data')` cuando fallaba la red y no había caché fresco. Ese `throw` burbujeaba hacia `event.respondWith`, que quedaba resuelto con una promesa rechazada.
- Al no resolverse con un objeto `Response`, el navegador abortaba la navegación, deteniendo los listeners de Bootstrap y dejando menús en estado inconsistente.
- También existían rutas (p. ej. `/pages/*.html`) que no entraban en ninguna rama del handler y devolvían `undefined`, lo que el runtime reportaba como `Failed to convert value to 'Response'`.

## Resolución

- Reemplazamos el `fetch` handler con un flujo explícito que siempre devuelve un `Response`, incluso en fallos (`Response.error()` o fallback offline). 【F:service-worker.js†L1-L153】
- Se implementó `network-first` para navegaciones con fallback a `/index.html` u `offline.html`, y `stale-while-revalidate` para assets con almacenamiento en cachés versionadas. 【F:service-worker.js†L61-L143】
- Se versionaron los cachés (`ebano-static-v6`, `ebano-dynamic-v4`, `ebano-products-v5`) para invalidar entradas corruptas. 【F:service-worker.js†L4-L19】
- Se añadió un kill-switch controlado por `localStorage` y query `?sw=on` para habilitar/deshabilitar el Service Worker en localhost sin tocar código. 【F:src/js/script.mjs†L64-L130】【F:test/registerServiceWorker.test.js†L110-L154】

## Acciones preventivas

- Nueva especificación de Cypress `Nav menu regressions` que reproduce los dos flujos (categorías y subcategorías) y falla ante errores de Service Worker en consola. 【F:cypress/e2e/nav_menu.cy.ts†L1-L35】【F:cypress/support/e2e.ts†L1-L14】
- Pruebas unitarias amplían la cobertura para garantizar que el kill-switch evite registros accidentales en localhost y que respete el flag de desactivación. 【F:test/registerServiceWorker.test.js†L92-L154】
- Documentación actualizada con instrucciones claras para invalidar cachés y forzar la adopción del nuevo Service Worker. 【F:docs/operations/RUNBOOK.md†L12-L47】【F:README.md†L86-L118】

## Seguimiento

- Monitorizar la consola de errores de la página desplegada durante 24 h posteriores al deploy.
- Ejecutar `npm run test:cypress` en cualquier cambio futuro del Service Worker o del navbar.
- Limpiar periódicamente cachés antiguas desde DevTools usando el snippet documentado en el runbook.
