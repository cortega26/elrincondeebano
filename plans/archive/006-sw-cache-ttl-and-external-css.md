# Plan 006: Extender cache TTLs del service worker y usar CSS externo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- service-worker.js astro-poc/astro.config.mjs`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Dos cambios de configuración que mejoran significativamente la experiencia de carga en visitas repetidas:

1. **PERF-08 — Cache TTLs demasiado cortos**: El service worker (`service-worker.js:13-18`) cachea HTML por solo 1 minuto y datos de productos por 2 minutos. Para un sitio estático (SSG) donde el contenido solo cambia en deploys, estos TTLs son 3-4 órdenes de magnitud demasiado cortos. La mayoría de las visitas repetidas van a la red innecesariamente. El mecanismo de invalidación (`syncStorefrontServiceWorkerVersion`) ya existe y fuerza refresh en cada deploy.

2. **PERF-07 — CSS inlineado en cada página**: `astro-poc/astro.config.mjs:8` tiene `inlineStylesheets: 'always'`. Cada página HTML recibe ~60KB de CSS inlineado (Bootstrap + global.css) que no puede ser cacheado entre navegaciones. El service worker podría servir un archivo CSS externo con cache de 30 días.

## Current state

### PERF-08: Cache TTLs

```javascript
// service-worker.js:13-18
duration: {
  html: 60 * 1000,          // 1 minuto — irrisorio para SSG
  products: 2 * 60 * 1000,  // 2 minutos — irrisorio para SSG
  static: 24 * 60 * 60 * 1000,  // 24 horas — aceptable
  dynamic: 12 * 60 * 60 * 1000, // 12 horas — aceptable
},
```

### PERF-07: CSS inline

```javascript
// astro-poc/astro.config.mjs:1-9
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'always', // ← inlinea TODO el CSS en cada página
  },
});
```

### Convenciones

- `astro.config.mjs` usa ESM (`import`/`export default`).
- `service-worker.js` se sirve desde `astro-poc/public/service-worker.js` y se versiona con `cacheVersion` en `storage-contract.ts`.
- El service worker usa la estrategia "network-first" para HTML con fallback a cache en `service-worker.js:268`.

## Commands

| Purpose | Command            | Expected on success |
| ------- | ------------------ | ------------------- |
| Build   | `npm run build`    | exit 0              |
| Tests   | `npm test`         | all pass            |
| Lint    | `npm run lint`     | exit 0              |
| E2E     | `npm run test:e2e` | all pass            |

## Scope

**In scope**:

- `service-worker.js` — líneas 13-18 (TTLs)
- `astro-poc/astro.config.mjs` — línea 8 (inlineStylesheets)

**Out of scope**:

- La estrategia de caching (network-first, cache-first) — no se modifica
- Los static assets listados en `CACHE_CONFIG.staticAssets`
- El mecanismo de version bump (`syncStorefrontServiceWorkerVersion`)
- Bootstrap CSS o global.css — no se modifican

## Git workflow

- Branch: `advisor/006-sw-cache-ttl-and-external-css`
- Commit messages: `perf: extend service worker cache TTLs for static site and use external CSS`
- No push/PR sin indicación.

## Steps

### Step 1: Extender TTLs del service worker

En `service-worker.js`, cambiar las duraciones:

```javascript
duration: {
  html: 24 * 60 * 60 * 1000,        // 1 día (antes: 1 minuto)
  products: 60 * 60 * 1000,          // 1 hora (antes: 2 minutos)
  static: 30 * 24 * 60 * 60 * 1000,  // 30 días (antes: 24 horas)
  dynamic: 24 * 60 * 60 * 1000,      // 24 horas (antes: 12 horas)
},
```

**Justificación por TTL**:

- **HTML 1 día**: El contenido solo cambia en deploys. El version bump del SW invalida el cache en cada deploy.
- **Products 1 hora**: Los datos de producto se generan en build. 1 hora cubre sesiones de compra típicas.
- **Static 30 días**: Assets versionados (imágenes, fuentes) no cambian entre builds. El SW cache version (`2026-05-01-b`) + hash en filename de imágenes ya manejan la invalidación.
- **Dynamic 24 horas**: Contenido semi-dinámico (respuestas de API que podrían cambiar).

**Verify**: `npm test` → tests de service worker pasan

### Step 2: Cambiar CSS a archivos externos

En `astro-poc/astro.config.mjs`, cambiar:

```javascript
inlineStylesheets: 'never',  // antes: 'always'
```

Esto hará que Astro emita archivos CSS externos (con hash en el filename) en lugar de inlinearlos. El service worker los cacheará con TTL `static` (30 días).

**Verify**: `npm run build` → exit 0. Verificar que `astro-poc/dist/` contiene archivos `.css` separados y que las páginas HTML los referencian con `<link rel="stylesheet">`.

### Step 3: Verificar que el build no tiene regresiones

```bash
npm run build
# Verificar que las páginas renderizan correctamente:
ls astro-poc/dist/*.html | head -5
grep -l 'link.*stylesheet' astro-poc/dist/*.html | head -5
```

**Verify**: Las páginas HTML referencian hojas de estilo externas. Los estilos se cargan correctamente.

### Step 4: Validación completa

```bash
npm run lint && npm test && npm run build && npm run test:e2e
```

**Verify**: Todo exit 0.

## Test plan

### Para service worker TTLs

Los tests existentes en `test/service-worker.runtime.test.js` y `test/swCache.test.js` deben seguir pasando. Verificar que los nuevos TTLs no rompen ninguna aserción sobre tiempos de expiración.

### Para CSS externo

1. Test de build: verificar que `astro-poc/dist/` contiene al menos un archivo `.css` con hash.
2. Test E2E (`npm run test:e2e`): verificar que las páginas se renderizan con estilos correctos.
3. Si existe `test/e2e-astro/mobile-home-visual.spec.ts`, verificar que los screenshots visuales no cambian (o actualizar snapshots si el cambio es esperado).

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run test:e2e` exits 0 (visual regression puede requerir update de snapshots)
- [ ] `service-worker.js` tiene HTML TTL ≥ 1 día, products ≥ 1 hora, static ≥ 30 días
- [ ] `astro.config.mjs` tiene `inlineStylesheets: 'never'`
- [ ] `astro-poc/dist/` contiene archivos `.css` externos con hash
- [ ] Las páginas HTML referencian CSS externo, no inline

## STOP conditions

- Si los E2E tests visuales muestran diferencias significativas de layout (FOUC — flash of unstyled content).
- Si cambiar a `inlineStylesheets: 'never'` causa que Bootstrap CSS no se cargue (verificar imports en `BaseLayout.astro`).
- Si los tests de service worker tienen aserciones duras sobre TTLs específicos.
- Si `astro-poc/public/service-worker.js` no es el archivo canónico (verificar si hay un paso de copia en el build pipeline).

## Maintenance notes

- Si se añaden páginas con contenido verdaderamente dinámico (API calls en runtime), considerar TTLs más cortos para esas URLs específicas.
- El valor `inlineStylesheets: 'never'` puede causar FOUC en conexiones muy lentas. Si esto es un problema, considerar `inlineStylesheets: 'auto'` que inlinea solo CSS crítico.
- El service worker debe actualizar su `CACHE_CONFIG.version` cuando se cambian los TTLs para forzar la invalidación de caches viejos.
