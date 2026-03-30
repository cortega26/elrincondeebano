# Backlog de Remediación

Fecha base: 2026-03-11  
Fuente: `docs/audit/red-team-astro-migration-audit-20260311.md`

## Objetivo

Convertir el audit de seguridad y cierre de migración en un plan ejecutable, con orden claro, dependencias explícitas y criterios de cierre verificables.

## Estado de ejecución

Actualizado: 2026-03-11

Primer corte implementado en repo:

- `RTB-03` completado en código: el `service-worker` activo dejó de precachear `/dist/*` y ya no depende de `asset-manifest.json`.
- `RTB-04` completado en código: `offline.html` y `/pages/offline.html` se simplificaron, quedaron sin assets legacy, sin JSON-LD stale y con `noindex`.
- `RTB-05` completado en build gate: `astro-poc/scripts/validate-artifact-contract.mjs` ahora falla si el SW vuelve a referenciar contratos legacy, si offline vuelve a publicar refs prohibidas o si el sitemap reintroduce rutas de compatibilidad.
- `RTB-06` completado parcialmente en repo: `SITE_ORIGIN`, `robots`, smoke/canary y expectations Astro quedaron alineados a `https://www.elrincondeebano.com`, que es el host que en producción redirige y sirve `200` al 2026-03-11.
- `RTB-07` completado en código: `getCategoryRouteParams()` ya no emite duplicados por `slug` y `Key`.
- `RTB-09` completado en código: el sitemap postbuild dejó de indexar páginas con `noindex`, por lo que excluye compat pages/offline y publica sólo rutas primarias.
- `RTB-13` completado en código: `astro-poc/scripts/sync-data.mjs` ahora sincroniza `static/offline.html` hacia `astro-poc/public/pages/offline.html` y endurece `image_path` / `image_avif_path` a `assets/images/**`.
- `RTB-02` completado parcialmente en tests: `test/csp.policy.hardening.test.js` dejó de usar `templates/*.ejs` como superficie principal y ahora valida el output generado en `astro-poc/dist` para script surface, canonical y policy `noindex` en rutas legacy.
- `RTB-02` avanzó en live/CI: `tools/post-deploy-canary.mjs` ahora inspecciona headers de hardening en `/` y `/pages/bebidas.html`, y el workflow manual `post-deploy-canary.yml` expone `require_security_headers` para volver ese probe estricto cuando la capa edge quede lista.
- `RTB-01` avanzó en definición operativa: `tools/security-header-policy.mjs` ahora versiona el baseline exacto de headers/CSP y `docs/operations/EDGE_SECURITY_HEADERS.md` documenta el contrato edge requerido para Cloudflare delante de GitHub Pages.
- `RTB-01` avanzó en implementación repo-side: `infra/cloudflare/edge-security-headers/worker.mjs` y `wrangler.toml.example` dejan un Worker listo para aplicar el baseline en Cloudflare sin traducir la policy manualmente.
- `RTB-01` completado operativamente el 2026-03-11: el Worker `elrincondeebano-edge-security-headers` quedó desplegado en Cloudflare sobre `www.elrincondeebano.com/*` y producción ya emite el baseline completo en `/` y `/pages/bebidas.html`.
- `RTB-10` completado en documentación: `docs/audit/legacy-storefront-inventory-20260311.md` clasifica `templates/**`, `tools/build*.js`, tests EJS y `ejs` como deuda legacy con decisión explícita.
- `RTB-11` completado en repo: `templates/**`, `tools/build*.js`, `tools/copy-static.js` y los tests EJS legacy salieron de raíz y fueron archivados bajo `_archive/legacy-storefront/`; `ejs` fue retirado del package surface activo.
- `RTB-12` completado en repo: `docs/repo/STRUCTURE.md`, `docs/operations/QUALITY_GUARDRAILS.md`, `docs/INCIDENTS.md` y `AGENTS.md` ya no describen `templates/*.ejs` como superficie productiva; además el guardrail `legacy-storefront-surface.mjs` evita reintroducir esas referencias o paths en raíz.
- `RTB-14` completado en código: `astro-poc/scripts/sync-data.mjs` ahora publica `/data/product_data.json` con contrato reducido para frontend y preserva `rev` / `field_last_modified` sólo en la copia interna `astro-poc/src/data/products.json`.
- SEO social de categorías reforzado en build: `tools/sync-category-og-overrides.mjs` correlaciona imágenes manuales de `imagenes/` con `data/category_registry.json`, las publica como overrides rastreados en `assets/images/og/categories/` y `preflight` regenera los JPG usados por `og:image`/WhatsApp.
- `RTB-02` completado end-to-end el 2026-03-11: `npm run monitor:live-contract:strict` pasó contra producción después del despliegue del Worker en Cloudflare, por lo que la assurance dejó de depender de la superficie legacy.

Pendiente fuera de este corte:

- No quedan ítems P0/P1 abiertos dentro de este backlog. El seguimiento restante es sólo operativo: vigilar que el Worker y los probes live sigan en verde tras futuros deploys/cambios de edge.

## Veredicto operativo

Estado actual:

1. El storefront Astro está en producción y funcional.
2. La migración no está cerrada del todo.
3. El trabajo prioritario no es “buscar más bugs”, sino corregir:
   - hardening perdido en el path Astro real
   - residuos legacy activos en SW/offline
   - autoridad pública fragmentada de rutas/host/canonical/sitemap
   - falsa confianza por docs/tests todavía centrados en EJS

## Orden de ejecución recomendado

### Fase 0. Preparación

Objetivo: empezar mañana sin ambigüedad.

- Crear rama de trabajo:
  - `audit/rt-remediation-20260311`
- Confirmar baseline local:
  - `npm ci`
  - `(cd astro-poc && npm ci)`
  - `npm run build`
  - `npm test`
  - `npm run typecheck`
- Revisar diff base:
  - `git status`
  - `git diff --stat`

Salida esperada:

- baseline verde
- árbol limpio antes de tocar remediaciones

---

### Fase 1. Hardening real del storefront Astro

Objetivo: restaurar defensas del navegador sobre la salida realmente desplegada.

#### RTB-01. Definir política de headers para producción

- Prioridad: P0
- Riesgo que reduce: `RT-01`
- Tipo: seguridad
- Dependencia: ninguna

Trabajo:

- Definir el set mínimo de headers para el sitio público:
  - `Content-Security-Policy`
  - `frame-ancestors` o `X-Frame-Options`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `Permissions-Policy`
- Alinear host canónico que usará la política.
- Decidir si la implementación vive en Cloudflare/edge o en una capa de serving controlada por workflow.

Criterio de terminado:

- `curl -I https://www.elrincondeebano.com/` devuelve el set mínimo acordado.
- `curl -I https://www.elrincondeebano.com/pages/bebidas.html` devuelve el mismo baseline.
- El audit deja de depender del viejo `src/js/csp.js` como protección real.

Verificación:

- `curl -I https://www.elrincondeebano.com/`
- `curl -I https://www.elrincondeebano.com/pages/bebidas.html`

#### RTB-02. Reemplazar assurance legacy de CSP por checks del output Astro

- Prioridad: P0
- Riesgo que reduce: `RT-01`, `RT-04`
- Tipo: test/CI
- Dependencia: RTB-01 parcial

Trabajo:

- Reemplazar o complementar `test/csp.policy.hardening.test.js`.
- Dejar de testear `templates/*.ejs` como fuente principal de seguridad.
- Añadir chequeo sobre:
  - `astro-poc/dist/*.html`
  - headers reales o preview contract

Criterio de terminado:

- Existe un test o gate que falle si el storefront Astro vuelve a salir sin hardening esperado.
- El test ya no usa `templates/index.ejs` y `templates/category.ejs` como superficie principal.

Verificación:

- `npm test`
- si aplica: `npm run test:e2e`

---

### Fase 2. Limpieza crítica de SW y offline fallback

Objetivo: cortar acoplamiento real con el contrato viejo `build/dist`.

#### RTB-03. Remover referencias muertas `/dist/*` del service worker

- Prioridad: P0
- Riesgo que reduce: `RT-02`
- Tipo: seguridad/resiliencia/migración
- Dependencia: ninguna

Trabajo:

- Revisar `service-worker.js`.
- Eliminar precache de assets legacy inexistentes:
  - `/dist/js/script.min.js`
  - `/dist/css/style.min.css`
  - `/dist/css/style.category.min.css`
  - `/dist/css/critical.min.css`
- Sustituir por assets reales de `astro-poc/dist`, idealmente generados desde artefactos reales y no hardcodeados.

Criterio de terminado:

- Ninguna URL en `CACHE_CONFIG.staticAssets` responde `404` en producción o preview.
- El SW precache representa el contrato real del build Astro.

Verificación:

- `npm run build`
- chequeo local de existencia de assets referenciados
- `curl -I https://www.elrincondeebano.com/service-worker.js`

#### RTB-04. Rehacer o simplificar `offline.html`

- Prioridad: P0
- Riesgo que reduce: `RT-02`, `RT-03`
- Tipo: migración/SEO/resiliencia
- Dependencia: RTB-03 recomendable

Trabajo:

- Revisar:
  - `static/offline.html`
  - `astro-poc/public/pages/offline.html`
- Eliminar:
  - preload a `/dist/css/critical.min.css`
  - JSON-LD stale o inventarial no necesario
  - URL `http://www.elrincondeebano.com/`
- Decidir si el offline fallback:
  - se regenera desde Astro
  - o se mantiene como archivo estático mínimo y desacoplado

Criterio de terminado:

- `offline.html` y `/pages/offline.html` no referencian assets legacy ni host incorrecto.
- El offline fallback no publica structured data innecesaria.

Verificación:

- `npm run build`
- inspección de `astro-poc/dist/offline.html`
- inspección de `astro-poc/dist/pages/offline.html`

#### RTB-05. Añadir gate para URLs del precache y offline fallback

- Prioridad: P1
- Riesgo que reduce: `RT-02`
- Tipo: CI
- Dependencia: RTB-03, RTB-04

Trabajo:

- Añadir test/script que:
  - parsee el precache del SW
  - valide que cada asset exista en `astro-poc/dist`
  - falle si encuentra `/dist/*` cuando el contrato ya no lo permite
- Añadir chequeo dedicado para offline pages.

Criterio de terminado:

- CI falla si el SW vuelve a precachear rutas inexistentes.
- CI falla si el offline fallback vuelve a usar contratos legacy retirados.

Verificación:

- `npm test` o nuevo script dedicado
- integrar en `.github/workflows/ci.yml` o guardrails

---

### Fase 3. Autoridad única de rutas, canonical y host

Objetivo: pasar de “migrado y compatible” a “públicamente coherente”.

#### RTB-06. Fijar host canónico real

- Prioridad: P0
- Riesgo que reduce: `RT-03`
- Tipo: SEO/integridad de deploy
- Dependencia: ninguna

Trabajo:

- Elegir si el host oficial será:
  - `https://www.elrincondeebano.com`
  - o `https://elrincondeebano.com`
- Alinear:
  - `astro-poc/src/lib/seo.ts`
  - sitemap
  - smoke evidence
  - canary/live monitor
  - docs operativas

Criterio de terminado:

- El host servido en producción coincide con `SITE_ORIGIN`.
- Canonical y sitemap apuntan al mismo host que responde `200`.

Verificación:

- `curl -I https://elrincondeebano.com/`
- `curl -I https://www.elrincondeebano.com/`
- revisar `<link rel="canonical">`
- revisar `sitemap.xml`

#### RTB-07. Reducir duplicación de rutas modernas

- Prioridad: P1
- Riesgo que reduce: `RT-03`
- Tipo: migración/SEO
- Dependencia: RTB-06

Trabajo:

- Revisar `getCategoryRouteParams()` en `astro-poc/src/lib/catalog.ts`.
- Eliminar la publicación dual de:
  - `/c/<slug>/`
  - `/c/<Key>/`
- Mantener un solo shape moderno público.

Criterio de terminado:

- El build no emite variantes duplicadas por case o por key/slug para una misma categoría.

Verificación:

- `npm run build`
- listar `astro-poc/dist/c/**`
- revisar `sitemap.xml`

#### RTB-08. Definir política final para rutas legacy compatibles

- Prioridad: P1
- Riesgo que reduce: `RT-03`
- Tipo: migración/producto/SEO
- Dependencia: RTB-06

Trabajo:

- Tomar decisión explícita para:
  - `/pages/*.html`
  - `/bebidas.html`
  - `/vinos.html`
  - `/offline.html`
- Opciones:
  - seguir sirviéndolas 200 pero con `noindex`
  - redirigir al canon moderno
  - conservar sólo un subconjunto crítico

Criterio de terminado:

- Existe política documentada por familia de rutas legacy.
- El sitemap ya no las trata como rutas primarias si no lo son.

Verificación:

- `curl -I` sobre rutas legacy
- revisión de `sitemap.xml`
- smoke sobre bookmarks legacy si se mantienen

#### RTB-09. Reescribir la generación del sitemap para excluir duplicados y low-trust pages

- Prioridad: P1
- Riesgo que reduce: `RT-03`
- Tipo: SEO/migración
- Dependencia: RTB-06, RTB-07, RTB-08

Trabajo:

- Revisar `astro-poc/scripts/postbuild-sitemap.mjs`.
- Dejar de indexar por “todo HTML encontrado”.
- Excluir:
  - offline pages
  - duplicados por case
  - compat pages no primarias

Criterio de terminado:

- Sitemap contiene sólo URLs primarias e indexables.

Verificación:

- `npm run build`
- inspección de `astro-poc/dist/sitemap.xml`

---

### Fase 4. Cierre documental y de assurance del legado EJS

Objetivo: que el repo deje de decir una cosa y validar otra.

#### RTB-10. Inventariar qué partes del pipeline EJS siguen siendo activas, útiles o sólo deuda

- Prioridad: P1
- Riesgo que reduce: `RT-04`
- Tipo: mantenimiento/gobernanza
- Dependencia: ninguna

Trabajo:

- Clasificar:
  - `templates/*.ejs`
  - `tools/build.js`
  - `tools/build-pages.js`
  - `tools/build-index.js`
  - `tools/copy-static.js`
  - tests EJS relacionados
- Etiquetas:
  - retirar
  - archivar
  - mantener temporalmente con guardrails

Criterio de terminado:

- Existe tabla de clasificación y decisión.
- No quedan ambigüedades de ownership.

Verificación:

- diff documental + listado de referencias cruzadas

#### RTB-11. Archivar o retirar el pipeline EJS de `main`

- Prioridad: P2
- Riesgo que reduce: `RT-04`
- Tipo: limpieza estructural
- Dependencia: RTB-10

Trabajo:

- Mover a `_archive/` o eliminar de `main` aquello que ya no deba condicionar el storefront activo.
- Reducir dependencia activa de `ejs` si ya no aplica.

Criterio de terminado:

- El storefront activo y su CI no dependen de artefactos EJS retirados.
- `README.md` y `docs/` dejan de describir EJS como stack vigente del storefront público.

Verificación:

- `rg -n "templates/|\\.ejs|tools/build\\.js|tools/build-pages\\.js|tools/build-index\\.js"`
- `npm run build`
- `npm test`

#### RTB-12. Limpiar docs y tests que hoy generan falsa confianza

- Prioridad: P1
- Riesgo que reduce: `RT-04`
- Tipo: documentación/test
- Dependencia: RTB-10

Trabajo:

- Actualizar:
  - `README.md`
  - docs de release/runbook
  - tests que todavía hablan del output viejo como si fuera vigente
- Alinear claims con realidad:
  - host canónico
  - estrategia de cache
  - salida deployable
  - superficie realmente protegida

Criterio de terminado:

- La documentación operativa describe el storefront Astro real.
- Los tests de assurance apuntan al output Astro real.

Verificación:

- revisión manual
- `npm test`

---

### Fase 5. Hardening adicional del contrato de contenido

Objetivo: reducir riesgo futuro desde el pipeline de datos compartidos.

#### RTB-13. Endurecer contrato de imágenes del catálogo

- Prioridad: P2
- Riesgo que reduce: near-miss del audit
- Tipo: hardening preventivo
- Dependencia: ninguna

Trabajo:

- En `astro-poc/scripts/sync-data.mjs`, endurecer validación para `image_path` y `image_avif_path`.
- Definir si se permiten:
  - sólo rutas locales `assets/images/...`
  - o allowlist explícita de orígenes externos

Criterio de terminado:

- El build falla si una imagen rompe el contrato acordado.

Verificación:

- `npm run build`
- tests de contrato de datos

#### RTB-14. Revisar exposición pública de metadata operacional en `product_data.json`

- Prioridad: P3
- Riesgo que reduce: higiene/contract surface
- Tipo: contrato público
- Dependencia: ninguna

Trabajo:

- Revisar si el payload público necesita exponer:
  - `field_last_modified`
  - `rev`
  - `by`
- Si no es necesario, publicar una versión reducida para frontend.

Criterio de terminado:

- Queda definido el contrato público mínimo de `/data/product_data.json`.

Verificación:

- `curl https://www.elrincondeebano.com/data/product_data.json`
- tests del frontend que consumen ese payload

## Sprint recomendado para mañana

Si el objetivo es avanzar con el máximo impacto y el menor contexto cambiante, mañana debería atacarse esto, en este orden:

1. `RTB-06` Fijar host canónico real.
2. `RTB-03` Limpiar precache legacy del SW.
3. `RTB-04` Rehacer/simplificar `offline.html`.
4. `RTB-09` Ajustar sitemap para excluir duplicados y offline pages.
5. `RTB-02` Sustituir assurance legacy de CSP por checks del output Astro.

Motivo:

- eso reduce primero riesgo real en producción
- corta el acoplamiento legacy más dañino
- deja una base coherente antes de entrar al archivo/retirada total de EJS

## Dependencias resumidas

- RTB-01 -> RTB-02
- RTB-06 -> RTB-07, RTB-08, RTB-09
- RTB-03 + RTB-04 -> RTB-05
- RTB-10 -> RTB-11, RTB-12

## Definición de cierre de la migración

La migración sólo debería considerarse cerrada cuando se cumpla todo esto:

1. `astro-poc/dist` sigue siendo la única autoridad de deploy.
2. El host canónico, el host servido y el sitemap coinciden.
3. El sitemap contiene sólo rutas primarias e indexables.
4. El SW y offline fallback ya no referencian contratos legacy retirados.
5. La suite de assurance principal valida Astro output, no EJS legacy.
6. El pipeline EJS residual ya está archivado o explícitamente fuera del path activo.

## Comandos de verificación por bloque

Baseline:

```bash
npm run build
npm test
npm run typecheck
```

Host/canonical/sitemap:

```bash
curl -I https://elrincondeebano.com/
curl -I https://www.elrincondeebano.com/
curl -sS https://www.elrincondeebano.com/ | rg 'canonical'
curl -sS https://www.elrincondeebano.com/sitemap.xml
```

SW/offline:

```bash
curl -I https://www.elrincondeebano.com/service-worker.js
curl -I https://www.elrincondeebano.com/offline.html
curl -I https://www.elrincondeebano.com/pages/offline.html
```

Headers:

```bash
curl -I https://www.elrincondeebano.com/
curl -I https://www.elrincondeebano.com/pages/bebidas.html
```

## Estado sugerido para tracking

Usar estos estados para cada item:

- `todo`
- `in_progress`
- `blocked`
- `done`

## Lista corta de arranque

Backlog mínimo de alto impacto:

1. Restaurar hardening del storefront Astro real.
2. Limpiar SW/offline de referencias legacy `/dist/*`.
3. Unificar host/canonical/sitemap/rutas primarias.
4. Mover assurance de seguridad desde EJS legacy a Astro output.
5. Archivar o retirar el pipeline EJS residual de `main`.
