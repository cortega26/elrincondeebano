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

## Comandos canónicos

Runtime: Node 22.x · Instalación determinista: `npm ci`

```bash
npm run lint && npm run typecheck
npm test
npm run build
npm run guardrails:assets
npm run test:e2e
npm run monitor:share-preview
npm run smoke:evidence
```

Auditoría de dependencias: `npm audit --omit=dev`  
Fallback sin `node` en PATH: `npx -y node@22 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`

## Matriz de comandos por agente

| Agente                  | Comando                                                                                                             | Cuándo                               | Salida esperada                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Repo Cartographer       | `node -v`                                                                                                           | Antes de cualquier trabajo           | Versión `22.x`                                     |
| Repo Cartographer       | `npm pkg get scripts`                                                                                               | Al actualizar docs/scripts           | JSON de scripts                                    |
| Docs Steward            | `npm run build`                                                                                                     | Tras cambios en storefront/datos     | Build sin errores; artefactos en `astro-poc/dist/` |
| Docs Steward            | `npm run monitor:share-preview`                                                                                     | Cambios SEO/OG o antes de release    | Previews WhatsApp válidas                          |
| Docs Steward            | `npm run lighthouse:audit`                                                                                          | Auditorías de rendimiento            | Reportes en `reports/lighthouse/`                  |
| Docs Steward            | `npm run smoke:evidence`                                                                                            | Antes de release                     | Evidencia en `reports/smoke/`                      |
| Type & Lint Guardian    | `npm run lint`                                                                                                      | Cada PR                              | Sin errores ESLint                                 |
| Type & Lint Guardian    | `npm run typecheck`                                                                                                 | PRs en `src/js/**`                   | Sin errores tsc                                    |
| Type & Lint Guardian    | `npm run format`                                                                                                    | Cada PR                              | Código formateado                                  |
| Type & Lint Guardian    | `npm run guardrails:assets`                                                                                         | PRs con cambios en imágenes/catálogo | Sin assets huérfanos nuevos                        |
| Security / Supply Chain | `npm audit --production`                                                                                            | Mensual o ante cambios de deps       | Sin vulns altas/críticas                           |
| Security / Supply Chain | `pip-audit -r admin/product_manager/requirements.lock.txt`                                                          | Cambios en tooling Python            | Sin vulns altas/críticas                           |
| Security / Supply Chain | `npm run security:secret-scan`                                                                                      | Cada PR/push                         | Sin credenciales en versión                        |
| Security / Supply Chain | `semgrep scan --config p/default --config p/secrets --metrics=off --sarif --output reports/semgrep/results.sarif .` | CI o reproducción local              | SARIF generado y subido                            |
| Test Sentinel           | `npm ci && npm test`                                                                                                | Tras modificaciones                  | Todas las pruebas pasan                            |
| Test Sentinel           | `npx stryker run`                                                                                                   | Cambios en lógica crítica            | Mutation score estable                             |
| Test Sentinel           | `npx vitest run <file>`                                                                                             | Ejecución rápida aislada             | Test pasa                                          |
| CI Guardian             | `gh workflow view <name>`                                                                                           | Revisiones periódicas                | Versiones fijadas, permisos mínimos                |
| PR/Release Manager      | `git status && git diff --stat`                                                                                     | Antes de revisión/merge              | Árbol limpio, diff ≤400 líneas                     |

## Flujos de trabajo (CI)

- **`Deploy static content to Pages`** (`.github/workflows/static.yml`) — push a `main` / `workflow_dispatch`. Permisos: `contents: read`, `pages: write`, `id-token: write`. Artefacto: `astro-poc/dist`.
- **`Optimize images`** (`.github/workflows/images.yml`) — cambios en `assets/images/originals/**`. Node 22.x; usa `npm ci` + `images:generate`, `images:rewrite`, `lint:images`. Auto-commitea solo a `refs/heads/<branch>`.
- **`Semgrep Security Scan`** (`.github/workflows/semgrep.yml`) — push/PR a `main`, cron semanal. Instala desde `tools/requirements-semgrep.txt`; escanea con `p/default` + `p/secrets`; sube SARIF.
- **`Secret Scan`** (`.github/workflows/secret-scan.yml`) — push/PR, cron semanal. Ejecuta `npm run security:secret-scan`.
- **`Continuous Integration`** (`.github/workflows/ci.yml`) — push/PR a `main` (excluye `admin/**`). Node 22.x: build, guardrails, unit tests, E2E, smoke, Lighthouse.
- **`Post-Deploy Canary`** (`.github/workflows/post-deploy-canary.yml`) — PR a `main`, `workflow_run` post-deploy. Live probe solo en runner self-hosted; modo estricto de headers en `/` y `/pages/bebidas.html`.
- **`Live Contract Monitor`** (`.github/workflows/live-contract-monitor.yml`) — cron diario. Runner self-hosted (Cloudflare puede challengear runners GitHub-hosted con `403`). Abre/actualiza issue si falla el baseline de headers.
- **`Admin Tools CI`** (`.github/workflows/admin.yml`) — cambios en `admin/**`. Python 3.12, pytest.

## Playbooks

### Añadir un test nuevo

1. **Lógica compleja/DOM/Async** → `.spec.js` en `test/` con Vitest.
2. **Scripts simples/Legacy** → `.test.js` con `node:test`.
3. **TypeScript** → `.mts` en `src/`; soportado nativamente por Vitest.
4. Ejecutar `npm test`; adjuntar logs en el PR.

### Actualizar una dependencia

1. `npm pkg get dependencies["<paquete>"]` — versión actual.
2. Patch/minor: `npm install <paquete>@latest --save`; verificar `package-lock.json`.
3. Correr `npm audit --production`, `npm test`, `npm run build`; documentar resultados.
4. Major: preparar RFC (alcance, breaking changes, plan de validación) antes del PR.

### Depurar fallos de CI

1. Identificar workflow fallido (`gh workflow run list`) y revisar logs.
2. Reproducir localmente con `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`.
3. Si falla SARIF, ejecutar sanitizador `jq` y verificar esquema `2.1.0`.
4. Documentar hallazgos con pasos reproducibles en el PR.

### Ejecutar smoke manual guiado

1. `npm run build`.
2. Levantar preview: `npx serve astro-poc/dist -l 4174`.
3. `npm run smoke:manual` — imprime checklist.
4. Completar con [`SMOKE_TEST`](./SMOKE_TEST.md); adjuntar evidencia en el PR.

### Gestionar planes de ejecución

1. **Cambio pequeño** — plan efímero en la descripción del PR.
2. **Trabajo complejo** — crear `docs/audit/plan-YYYYMMDD-<slug>.md` con objetivo, pasos `[ ]`/`[x]`, decisiones y deuda técnica.
3. Versionar el plan junto al código.
4. Al cerrar, mover a `docs/audit/completed/` y referenciar el SHA del merge.

### Auditoría del repositorio

1. Crear rama `audit/mega-YYYYMMDD`.
2. Levantar baseline: `lint`, `test`, `build`, `monitor:share-preview`, `test:e2e`.
3. Si hay rojo, volver a verde antes de mejoras.
4. Ejecutar por etapas con evidencia en `docs/audit/`.
5. PRs ≤400 líneas netas; rollback explícito en cada etapa.

## Nota de esquema de datos (price/discount)

- `price`: entero en CLP, representa el precio base del producto.
- `discount`: entero en CLP, representa un descuento absoluto que se resta a `price` para calcular el precio final mostrado.

## Nota de esquema de datos (size)

**Unidades base por categoría**

- `ml`: Aguas, Bebidas, Cervezas, Jugos, Piscos, Vinos, Espumantes, Energeticaseisotonicas.
- `g`: Carnesyembutidos, Chocolates, Despensa, Lacteos, SnacksDulces, SnacksSalados.
- `unit`: Juegos, Llaveros, Mascotas, Limpiezayaseo.

**Schema mínimo**

| Name           | Type   | Default | Required | Description                                          |
| -------------- | ------ | ------- | -------- | ---------------------------------------------------- |
| `size_value`   | number | `null`  | ✅       | Cantidad numérica en la unidad base de la categoría. |
| `size_unit`    | string | `null`  | ✅       | Unidad normalizada (`g`, `ml`, `unit`).              |
| `size_display` | string | `null`  | ❌       | Etiqueta opcional para mostrar el formato original.  |

**Regla de display**

- Si existe `size_display`, mostrarla tal cual.
- Si no existe, renderizar `${size_value} ${size_unit}` desde los campos normalizados.

## Nota operativa de stock

- `stock` debe mantenerse explícito en cada producto (`true` o `false`) al actualizar `data/product_data.json`.
- Usa `stock: false` para productos sin disponibilidad temporal: el catálogo los marca
  como **AGOTADO** y aplica escala de grises; además, los filtros del frontend los
  ocultan.
- Evita borrar productos por falta de stock; conserva el registro para reactivarlo cuando vuelva disponibilidad.
