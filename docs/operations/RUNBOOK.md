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

## Content Manager (modo offline)

- **Ruta:** `admin/product_manager/` (aplicación Tkinter).
- **Fuente de verdad:** `data/product_data.json` versionado en Git. No existe API remota por defecto.
- **Configuración:** `sync.enabled` se mantiene en `false` y `sync.api_base` vacío (`admin/product_manager/content_manager.py:44-69`).
- **Ejecución:** abre la app → realiza ediciones → guarda. Los cambios quedan en el archivo del repo y se suben vía commit/push.
- **Sincronización remota opcional:** habilítala sólo si hay un backend disponible. Crea un override (`config.json`) con `sync.enabled: true` y `sync.api_base` apuntando al endpoint. Mientras no haya backend, deja esos valores en blanco para evitar colas pendientes.

## Nota de esquema de datos (price/discount)

- `price`: entero en CLP, representa el precio base del producto.
- `discount`: entero en CLP, representa un descuento absoluto que se resta a `price` para calcular el precio final mostrado.

## Nota operativa de stock

- `stock` debe mantenerse explícito en cada producto (`true` o `false`) al actualizar `data/product_data.json`.
- Usa `stock: false` para productos sin disponibilidad temporal: el catálogo los marca
  como **AGOTADO** y aplica escala de grises; además, los filtros del frontend los
  ocultan.
- Evita borrar productos por falta de stock; conserva el registro para reactivarlo cuando vuelva disponibilidad.
