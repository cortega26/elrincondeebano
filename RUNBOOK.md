# Runbook

## Product data fetch failures
- **Severity:** warning
- **Logs:** `fetch_products_failure` with a `correlationId`.
- **Steps:**
  1. Verify network connectivity to `/data/product_data.json`.
  2. Check recent deployments for schema changes.
  3. Retry after backoff; persistent failures escalate to infrastructure.
  4. Remember that only the first catalog batch is inlined in `#product-data`; the rest streams from `/data/product_data.json`. Confirm the JSON endpoint is cached by the service worker (`ebano-products-*` cache) for offline support.

## Service worker operations
- **Cache versions activos:** `ebano-static-v6`, `ebano-dynamic-v4`, `ebano-products-v5`.
- **Invalidar cachés antiguas:**
  1. Abre DevTools → Application → Service Workers.
  2. Ejecuta en la consola:
     ```js
     navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
     caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
     ```
  3. Recarga forzando (`Ctrl+Shift+R`) para que el nuevo SW tome control.
- **Kill-switch temporal:** establece `localStorage.setItem('ebano-sw-disabled', 'true')` y recarga. Para reactivar, elimina la clave o ponla en `false` y vuelve a cargar.
- **Pruebas locales del SW:** por seguridad, el registro se desactiva en `localhost`. Habilítalo con `localStorage.setItem('ebano-sw-enable-local', 'true')` o agrega `?sw=on` a la URL antes de recargar.
