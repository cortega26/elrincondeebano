# Runbook

## WhatsApp share preview drift

- **Severity:** medium
- **Detection:** `npm run build`, `npm test`, `npm run test:e2e`, `npm run monitor:share-preview`
- **Supported public contract:** only `/`, `/<category>/`, and `/p/<sku>/` are guaranteed to produce valid WhatsApp/social previews. Legacy `/c/*` and `/pages/*.html` routes must stay canonicalized and `noindex`, but they are not supported share targets.
- **Expected behavior:** supported public routes emit matching `canonical` and `og:url`, identical HTML/OG/Twitter descriptions, and a same-origin JPG/PNG `og:image` with a deterministic `?v=` token.
- **Detailed workflow:** [`SHARE_PREVIEW`](./SHARE_PREVIEW.md)
- **Steps:**
  1. Rebuild and rerun the local gates:
     ```bash
     npm run build
     npm test
     npm run test:e2e
     npm run monitor:share-preview
     ```
  2. Inspect the live HTML for the failing supported URL:
     ```bash
     curl -s https://www.elrincondeebano.com/<path> | rg -n 'canonical|og:|twitter:|description'
     ```
  3. Inspect the referenced social image:
     ```bash
     curl -sSI 'https://www.elrincondeebano.com/assets/images/og/...'
     ```
  4. If the build is correct but the preview is stale, re-scrape in the Meta Sharing Debugger and then verify in a real WhatsApp chat.
  5. If the route is legacy-only, do not treat it as a supported preview regression unless it stopped canonicalizing to the modern route.

## Missing edge security headers

- **Severity:** medium
- **Detection:** `npm run monitor:live-contract:strict`, `npm run monitor:live-browser-contract`, or the `Live Contract Monitor` / `Post-Deploy Canary` workflows.
- **Expected behavior:** the public HTML routes at `https://www.elrincondeebano.com/` and `/pages/bebidas.html` must emit the hardening baseline documented in [`EDGE_SECURITY_HEADERS`](./EDGE_SECURITY_HEADERS.md) and must not include `rocket-loader.min.js`, `/cdn-cgi/challenge-platform/`, or script references to `cdn.jsdelivr.net`.
- **Cloudflare Insights constraint:** the only acceptable analytics surface is the external `https://static.cloudflareinsights.com/beacon.min.js` beacon. Inline Cloudflare Insights bootstrap snippets are treated as edge drift and should be removed rather than whitelisted in CSP.
- **Important constraint:** the content deploy path is GitHub Pages; fixing the issue requires Cloudflare or equivalent edge configuration, not a rebuild of `astro-poc/dist`.
- **Runner constraint:** since the 2026-03-29 incident, the scheduled `Live Contract Monitor` runs only from the allowed self-hosted runner. GitHub-hosted probes may receive Cloudflare-managed `403` challenge pages that do not reflect the public contract.
- **Probe behavior:** the live monitor retries transient edge-style failures (`403` challenge pages, `429`, `5xx`, timeout/network) before opening an incident, and the JSON report records `cf-ray`, attempt count, retry reason, and any disallowed HTML surface findings for triage.
- **Steps:**
  1. Confirm the failure with:
     ```bash
     npm run monitor:live-contract:strict
     npm run monitor:live-browser-contract
     ```
  2. Verify live headers directly:
     ```bash
     curl -sSI https://www.elrincondeebano.com/
     curl -sSI https://www.elrincondeebano.com/pages/bebidas.html
     ```
  3. Verify that the HTML is clean:
     ```bash
     curl -s https://www.elrincondeebano.com/ | rg -n "cdn\\.jsdelivr\\.net|rocket-loader\\.min\\.js|/cdn-cgi/challenge-platform/"
     curl -s https://www.elrincondeebano.com/pages/bebidas.html | rg -n "cdn\\.jsdelivr\\.net|rocket-loader\\.min\\.js|/cdn-cgi/challenge-platform/"
     ```
  4. Compare the response against [`EDGE_SECURITY_HEADERS`](./EDGE_SECURITY_HEADERS.md).
  5. Re-deploy the Worker if the repo baseline changed:
     ```bash
     npm run cloudflare:whoami
     npm run cloudflare:deploy:edge-security-headers
     ```
  6. If headers are correct but the HTML still contains injected scripts, treat it as a Cloudflare edge-injection issue, not an app-code issue:
     - disable Rocket Loader on `www.elrincondeebano.com/*`
     - exclude public storefront HTML routes from any challenge/JS-detection behavior that injects `/cdn-cgi/challenge-platform/`
     - do not weaken the CSP to accommodate those scripts
  7. Re-run `npm run monitor:live-contract:strict` and `npm run monitor:live-browser-contract`, and if doing a manual post-deploy probe, run `Post-Deploy Canary` with `require_security_headers=true`.

## Product data fetch failures

- **Severity:** warning
- **Logs:** `fetch_products_failure` with a `correlationId`.
- **Expected behavior when `/data/product_data.json` fails:**
  - If the service worker has cached `product_data.json`, the UI renders the **last cached full
    catalog** without blocking the user (no error state).
  - If the cache is unavailable but inline catalog data exists, the UI renders the inline subset,
    marks it as partial, logs `fetch_products_network_fallback_inline`, and **hides missing
    items** (no placeholders).
  - If neither cached nor inline data is available, the UI shows the error component with
    the message:
    `Error al cargar los productos. Por favor, verifique su conexión a internet e inténtelo de nuevo.`
    plus a **"Intentar nuevamente"** button, and logs `fetch_products_failure`.
- **Steps:**
  1. Verify network connectivity to `/data/product_data.json`.
  2. Check recent deployments for schema changes.
  3. Confirm the service worker cache contains `product_data.json` in the `ebano-products-v*`
     cache. If missing or stale, invalidate the cache (see steps below).
  4. Retry after backoff; persistent failures escalate to infrastructure.
  5. Remember that only the first catalog batch is inlined in `#product-data`; the rest streams
     from `/data/product_data.json`. Confirm the JSON endpoint is cached by the service worker
     (`ebano-products-v*`).

**Recovery steps aligned to UX policy**

1. **If users see the error message + retry button:** restore the JSON endpoint, then instruct a
   hard refresh. The retry action in the UI calls `initApp` to re-fetch the catalog.
2. **If users see a partial catalog (missing items hidden):** ensure the service worker cache is
   refreshed (bump `CACHE_CONFIG.prefixes.products` or invalidate `ebano-products-v*` in DevTools).
3. **If users keep seeing stale data:** bump `ebano-products-v*` in `service-worker.js`, rebuild,
   and redeploy so the last cached version updates on next load.

## Data freshness

- **Source of truth:** `data/product_data.json` (and `last_updated` field).
- **Expected cadence:** refresh the catalog whenever pricing, stock, or availability changes, and
  perform a scheduled review at least weekly even if no changes are detected.
- **Operational note:** if `last_updated` is stale beyond the expected cadence, treat it as a
  potential data pipeline issue and verify the content manager export before release.

## Service worker operations

- **Cache versions activos:** `ebano-static-v6`, `ebano-dynamic-v4`, `ebano-products-v5`.
- **Cuándo y cómo bump de versiones de caché (prefijos en `service-worker.js`):**
  - `ebano-static-v*`: bump cuando cambian assets estáticos precacheados o su lista
    (`CACHE_CONFIG.staticAssets`, CSS/JS compilados, íconos, offline page).
  - `ebano-dynamic-v*`: bump cuando cambia la estrategia de caché dinámica o endpoints
    cacheados fuera del precache.
  - `ebano-products-v*`: bump cuando cambia el esquema de `product_data.json`, la lógica de
    invalidación del SW, o cuando se requiere forzar recarga completa del catálogo.
  - **Regla práctica:** cada release que cambie el SW o assets precacheados debe incrementar el
    prefijo correspondiente para evitar contenido obsoleto.
  - **Ejemplos rápidos:**
    - Cambios de datos (precios, stock, nuevos productos) → `ebano-products`.
    - Cambios de CSS/JS (estilos, scripts, bundles) → `ebano-static`.
    - Ajustes de estrategia runtime o nuevos endpoints → `ebano-dynamic`.
- **Paso a paso: bump y verificación**
  1. Edita `service-worker.js` y actualiza el prefijo correspondiente en
     `CACHE_CONFIG.prefixes` (incremento de versión).
  2. Ejecuta `npm run build` para regenerar `astro-poc/dist`.
  3. Publica los cambios (commit + deploy).
  4. En un navegador limpio o incógnito, visita el sitio y abre DevTools →
     Application → Service Workers.
  5. Verifica que el SW activo muestre el nuevo prefijo y que los caches nuevos
     existan en Cache Storage.
  6. Recarga con hard refresh (`Ctrl+Shift+R`) y confirma que los assets/JSON
     se sirven desde los nuevos caches.
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
- **Fetch en HTTP (solo localhost):** la app exige HTTPS por defecto. Para permitir HTTP en `localhost`, usa `localStorage.setItem('ebano-allow-http-local', 'true')`, agrega `?http=on`, o define `window.__ALLOW_LOCALHOST_HTTP__ = true` en consola.

## Content Manager (modo offline)

- **Ruta:** `admin/product_manager/` (aplicación Tkinter).
- **Fuente de verdad:** `data/product_data.json` versionado en Git. No existe API remota por defecto.
- **Configuración:** `sync.enabled` se mantiene en `false` y `sync.api_base` vacío (`admin/product_manager/content_manager.py:44-69`).
- **Ejecución:** abre la app → realiza ediciones → guarda. Los cambios quedan en el archivo del repo y se suben vía commit/push.
- **Sincronización remota opcional:** habilítala sólo si hay un backend disponible. Crea un override (`config.json`) con `sync.enabled: true` y `sync.api_base` apuntando al endpoint. Mientras no haya backend, deja esos valores en blanco para evitar colas pendientes.
- **Campos normalizados obligatorios (size):**
  - Completa siempre `size_value` y `size_unit` en cada producto.
  - Usa unidades normalizadas (`g`, `ml`, `unit`) y convierte el input original:
    - `1Kg` → `size_value: 1000`, `size_unit: "g"`.
    - `1 L` → `size_value: 1000`, `size_unit: "ml"`.
  - Si el producto es por unidades (p. ej. Llaveros), registra el conteo en `size_value`
    y usa `size_unit: "unit"`.
  - `size_display` es opcional; úsalo para conservar el string original si ayuda a ventas.

## Nota de esquema de datos (price/discount)

- `price`: entero en CLP, representa el precio base del producto.
- `discount`: entero en CLP, representa un descuento absoluto que se resta a `price` para calcular el precio final mostrado.

## Nota de esquema de datos (size)

**Unidades base por categoría**

- `ml`: Aguas, Bebidas, Cervezas, Jugos, Piscos, Vinos, Espumantes, Energeticaseisotonicas.
- `g`: Carnesyembutidos, Chocolates, Despensa, Lacteos, SnacksDulces, SnacksSalados.
- `unit`: Juegos, Llaveros, Mascotas, Limpiezayaseo.

**Schema mínimo**

| Name | Type | Default | Required | Description |
| ---- | ---- | ------- | -------- | ----------- |
| `size_value` | number | `null` | ✅ | Cantidad numérica en la unidad base de la categoría. |
| `size_unit` | string | `null` | ✅ | Unidad normalizada (`g`, `ml`, `unit`). |
| `size_display` | string | `null` | ❌ | Etiqueta opcional para mostrar el formato original. |

**Regla de display**

- Si existe `size_display`, mostrarla tal cual.
- Si no existe, renderizar `${size_value} ${size_unit}` desde los campos normalizados.


## Nota operativa de stock

- `stock` debe mantenerse explícito en cada producto (`true` o `false`) al actualizar `data/product_data.json`.
- Usa `stock: false` para productos sin disponibilidad temporal: el catálogo los marca
  como **AGOTADO** y aplica escala de grises; además, los filtros del frontend los
  ocultan.
- Evita borrar productos por falta de stock; conserva el registro para reactivarlo cuando vuelva disponibilidad.
