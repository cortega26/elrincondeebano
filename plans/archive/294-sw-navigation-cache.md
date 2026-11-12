# Plan 294: Caché de navegación del SW acotada — clave por ruta y fallback offline honesto

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- service-worker.js test/service-worker.runtime.test.js`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/282-cart-price-index.md` (el fallback actual sirve una home vieja cuyo índice/ tarjetas repricean el carrito; este plan cierra esa vía)
- **Category**: perf + bug
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

1. Cada navegación exitosa se guarda en la caché HTML del service worker con
   la **URL completa** como clave. La búsqueda es `GET /buscar/?q=…`: cada
   término distinto guarda otra copia completa de la página (~217 KB), igual
   que cada URL con `utm_*`/`fbclid`. Las entradas solo se purgan al cambiar
   el prefijo de caché (versión fija desde el 2026-10-18), así que la caché
   crece sin límite en cada dispositivo — para HTML estático idéntico que
   solo sirve de fallback offline. Además, offline, `/buscar/?q=nuevo` no
   encuentra `/buscar/` aunque esté cacheada.
2. Cuando una navegación falla y no hay copia fresca, el SW devuelve
   `/index.html` **sembrada en la instalación** (posiblemente de hace
   semanas). Sus tarjetas son el "catálogo vivo" para el refresco del
   carrito: los precios del carrito se recalculan con valores viejos y, al
   volver la red, se pueden enviar. Para una navegación fallida, la página
   offline dedicada (`/pages/offline.html`, ya precacheada) es la respuesta
   correcta.

## Current state

- `service-worker.js` (raíz; el build lo copia a `astro-poc/public/` — **no** edites la copia de `astro-poc/public/` a mano):
  - líneas 5-12: `CACHE_CONFIG.version = '2026-10-18-sw-hardening'` y `prefixes.{static,dynamic,products,html}` con ese sufijo.
  - líneas 19-29: `staticAssets` incluye `'/index.html'` y `'/pages/offline.html'`.
  - líneas ~265-300, navegación:
    ```js
    if (req.mode === 'navigate') {
      event.respondWith(
        (async () => {
          const htmlCache = await caches.open(CACHE_CONFIG.prefixes.html);
          try {
            const networkResponse = await fetch(req, { cache: 'no-store' });
            if (networkResponse) {
              if (!skipCache && networkResponse.ok && !isNoStoreResponse(networkResponse)) {
                const responseToCache = await addTimestamp(networkResponse.clone(), 'html');
                await htmlCache.put(req, responseToCache);
              }
              return networkResponse;
            }
          } catch (error) {
            console.warn('Navigation fetch failed, attempting cache fallback:', error);
          }
          const cached = await htmlCache.match(req);
          const canCheckFreshness =
            cached && cached.type !== 'opaque' && cached.type !== 'opaqueredirect';
          if (cached && canCheckFreshness && isCacheFresh(cached, 'html')) {
            return cached;
          }
          const fallback =
            (await caches.match('/index.html')) || (await caches.match('/pages/offline.html'));
          if (fallback) {
            return fallback;
          }
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    ```
- Guardrail `tools/guardrails/sw-cache-bump.mjs`: si `service-worker.js` cambia respecto de la base, **exige** que cambien los valores de `CACHE_CONFIG.prefixes` (si no, falla "service-worker.js changed but cache prefixes were not bumped").
- Tests: `test/service-worker.runtime.test.js` (harness `loadServiceWorkerRuntime({ fetchImpl, cachesImpl })` + `createCachesMock()`); el test `service worker fetch handles navigation fallback from cache` (línea 174) asserta hoy que el fallback es `'cached-home'` (la `/index.html` sembrada) — cambia por diseño en este plan.
- Las páginas son estáticas: la query string solo alimenta hidratación en el cliente (`hydrateCatalogSearchFromQuery` en `storefront.js`), así que la misma HTML sirve para cualquier `?q=`.

## Commands you will need

| Purpose    | Command                                              | Provenance | Expected on success |
| ---------- | ---------------------------------------------------- | ---------- | ------------------- |
| Install    | `HUSKY=0 npm ci`                                     | declared   | exit 0              |
| SW tests   | `npx vitest run test/service-worker.runtime.test.js` | declared   | verde               |
| Suite raíz | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`            | declared   | verde               |
| Guardrails | `npm run guardrails`                                 | declared   | exit 0              |
| Build      | `npm run build`                                      | declared   | exit 0              |
| E2E        | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`           | declared   | verde               |

## Scope

**In scope**: `service-worker.js` (raíz), `test/service-worker.runtime.test.js`.

**Out of scope**: `astro-poc/public/service-worker.js` (lo sincroniza el build — inclúyelo en el commit solo si el build lo regenera y el guard de árbol lo exige); estrategia de imágenes/estáticos; `sw-registration.js`.

## Git workflow

- Branch: `advisor/294-sw-navigation-cache`.
- Commit: `fix(sw): key navigations by path and fall back to the offline page (plan 294)`.

## Steps

### Step 0: Baseline

Confirma el plan 282 (`grep -n "cart-price-index" astro-poc/src/layouts/BaseLayout.astro`). Install, SW tests, suite raíz, guardrails.

### Step 1: Clave por ruta

Dentro de la rama de navegación, calcula una sola vez
`const navKey = new Request(new URL(req.url).origin + new URL(req.url).pathname);`
y úsala en `htmlCache.put(navKey, …)` y `htmlCache.match(navKey)` (la petición de red sigue usando `req` completa).
Tests nuevos: (a) dos navegaciones exitosas a `/buscar/?q=a` y `/buscar/?q=b` → la caché HTML del mock tiene **una** entrada (`/buscar/`);
(b) offline, una navegación a `/buscar/?q=c` con `/buscar/` cacheada y fresca devuelve esa copia.

**Verify**: SW tests verdes (los nuevos rojos antes del cambio — demuéstralo).

### Step 2: Fallback offline primero

Cambia el fallback a
`(await caches.match('/pages/offline.html')) || (await caches.match('/index.html'))`.
Actualiza el test de la línea 174: siembra ambas (`'/index.html'` → `'cached-home'`, `'/pages/offline.html'` → `'offline-page'`) y asserta `'offline-page'`; añade un caso donde solo existe `/index.html` → `'cached-home'` (compatibilidad).

**Verify**: SW tests verdes.

### Step 3: Bump de prefijos

Cambia `CACHE_CONFIG.version` y los 4 `prefixes` al sufijo `'<YYYY-MM-DD>-sw-nav-key'` (fecha de ejecución). `npm run build` (sincroniza la copia pública).

**Verify**: `npm run guardrails` exit 0 (incluye `sw-cache-bump`); `node tools/ci/catalog-build-tree-check.mjs` exit 0 tras el build (si reporta `astro-poc/public/service-worker.js`, commitéalo: es la copia sincronizada, byte-idéntica a la raíz — verifica con `cmp`).

### Step 4: Regresión

Suite raíz, build, E2E completo (incluye los specs de offline/SW si existen).

## Test plan

- 2 tests de clave por ruta, 2 de fallback; el test de la línea 174 se actualiza por diseño (documentado).

## Done criteria

- [ ] `grep -n "htmlCache.put(req" service-worker.js` → sin match
- [ ] El fallback consulta `/pages/offline.html` antes que `/index.html`
- [ ] Prefijos bumpeados; guardrails exit 0; `cmp service-worker.js astro-poc/public/service-worker.js` → idénticos tras build
- [ ] SW tests, suite raíz, build, E2E verdes
- [ ] `git diff --name-only main...HEAD` ⊆ In scope (+ copia pública sincronizada); fila 294 en `plans/README.md`

## STOP conditions

- Algún E2E de offline asserta que una navegación fallida muestra la home (reporta: decisión de UX).
- El guard `sw-cache-bump` sigue fallando tras el bump.
- Las páginas dependen de la query string en el servidor (no debería: sitio estático).

## Maintenance notes

- Si alguna vez una página varía por query en el servidor, esa ruta debe excluirse de la clave por ruta.
- Cada cambio de `service-worker.js` exige bump de prefijos (guard); el bump purga las cachés de los clientes en el siguiente `activate`.
