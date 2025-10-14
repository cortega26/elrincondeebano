# El Rincón de Ébano

Sitio web estático de catálogo para un mini‑market en español. El proyecto genera páginas HTML y assets optimizados a partir de
plantillas EJS, datos JSON y utilidades de Node.js para ofrecer navegación rápida, soporte offline y procesos automatizados de
mantenimiento.

## Tabla de contenidos

- [Características clave](#características-clave)
- [Arquitectura y stack](#arquitectura-y-stack)
- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Scripts disponibles](#scripts-disponibles)
- [Ejecución local](#ejecución-local)
- [Build y entrega](#build-y-entrega)
- [Pruebas](#pruebas)
- [Calidad de código](#calidad-de-código)
- [Auditorías y mantenimiento](#auditorías-y-mantenimiento)
- [CI/CD](#cicd)
- [Despliegue](#despliegue)
- [Seguridad](#seguridad)
- [Roadmap y limitaciones](#roadmap-y-limitaciones)
- [Contribuir](#contribuir)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Licencia](#licencia)

## Características clave

- Generación automática de páginas de categorías con plantillas EJS y datos centralizados.
- Service Worker con caché inteligente para navegación offline y actualizaciones controladas.
- Carrito de compras en el navegador con manejo de ofertas y estado persistente.
- Imágenes responsivas optimizadas (AVIF, WebP y fallback) administradas por scripts y GitHub Actions.
- Tipografías auto‑hospedadas y hints de precarga para mejorar métricas de rendimiento.
- Auditorías Lighthouse repetibles mediante script dedicado y reportes versionados.
- Offcanvas del carrito tratado como diálogo accesible con gestión de enfoque y tabulación segura.
- Filtros de catálogo con debounce e inyección diferida para mantener la interactividad por debajo de los presupuestos de INP.

## Arquitectura y stack

```
Frontend estático (HTML/CSS/JS) ─┐
                                 ├─► Build Node.js (esbuild + scripts propios) ─► pages/, dist/, sitemap.xml
Catálogo JSON + plantillas EJS ──┘
```

- **Tipo de proyecto:** aplicación web estática.
- **Lenguajes:** JavaScript (CommonJS/ESM en herramientas y módulos de navegador), HTML, CSS y EJS.
- **Herramientas principales:** Node.js, esbuild, Sharp, Lighthouse, GitHub Actions.
- **Datos:** `data/product_data.json` alimenta el catálogo; herramientas Python en `admin/` y `admin-panel/` lo mantienen.
- **Service Worker:** `service-worker.js` gestiona precarga de assets, notificaciones y política de caché.

## Requisitos previos

| Herramienta | Versión | Notas |
| --- | --- | --- |
| Node.js | 18.x | Alineado con `actions/setup-node@v4` en los workflows.
| npm | 10.x | Se instala con Node 18; usar `npm ci` para instalaciones deterministas.
| Navegador Chromium | Opcional | Necesario solo para `npm run lighthouse:audit` (Lighthouse requiere Chrome).

## Instalación

```bash
node -v        # verifica que sea >= 18
npm ci         # instala dependencias usando package-lock.json
```

`npm ci` limpia `node_modules/` y garantiza versiones reproducibles tal como en CI.

## Configuración

Las herramientas aceptan variables de entorno para personalizar su comportamiento. No expongas valores sensibles en commits.

| Variable | Descripción | Formato |
| --- | --- | --- |
| `SKIP_IMAGE_OPT` | Omite la optimización de imágenes cuando vale `1`. | `SKIP_IMAGE_OPT=1`
| `FULL_REGEN` | Fuerza regeneración completa de variantes de imágenes. | `FULL_REGEN=1`
| `CLEAN_ORPHANS` | Elimina variantes huérfanas durante la regeneración de imágenes. | `CLEAN_ORPHANS=1`
| `LH_SKIP_BUILD` | Reutiliza el último build antes de lanzar Lighthouse. | `LH_SKIP_BUILD=1`
| `PRUNE_KEEP` | Cantidad de respaldos que conserva `npm run prune:backups`. | `PRUNE_KEEP=<número entero>`
| `USERPROFILE` / `HOME` | Se usan como base para derivar rutas predeterminadas del catálogo cuando faltan parámetros. | `<ruta_local_redactada>`

## Scripts disponibles

| Script | Qué hace | Cuándo usarlo |
| --- | --- | --- |
| `npm run build` | Ejecuta la canalización completa: empaqueta JS/CSS, construye índice y páginas, inyecta datos estructurados, sitemap y resource hints. | Antes de publicar o validar cambios en producción estática.
| `npm run fonts` | Descarga y almacena las tipografías auto‑hospedadas en `assets/fonts/`. | Primera vez o tras actualizar fuentes.
| `npm run icons` | Genera iconos y manifest a partir de los assets fuente. | Cuando cambian las imágenes base del sitio o el manifest.
| `npm run images:generate` | Construye assets responsivos desde las fuentes en `assets/img/originals/`. | Preparar un nuevo set de imágenes antes de servirlas.
| `npm run images:variants` | Regenera variantes intermedias usando Sharp y un manifiesto incremental. | Mantenimiento intensivo de imágenes o migraciones de formato.
| `npm run images:rewrite` | Actualiza referencias en HTML/CSS para apuntar a las variantes optimizadas. | Después de generar nuevas imágenes o cambiar tamaños soportados.
| `npm run lint:images` | Valida consistencia de rutas, tamaños y manifiesto de imágenes. | Antes de commitear cambios en assets responsivos.
| `npm run prune:backups` | Limpia respaldos antiguos del catálogo conservando los más recientes. | Operaciones periódicas de mantenimiento del inventario.
| `npm test` | Ejecuta todas las pruebas unitarias basadas en `node:test` para utilidades de frontend y Service Worker. | Tras cambios en código fuente o scripts que afectan comportamiento.
| `npm run test:cypress` | Ejecuta Cypress en modo headless con `cypress/e2e/nav_menu.cy.ts` para asegurar que los menús principales no regresionen. | Antes de fusionar cambios en navegación, listeners globales o plantillas del navbar.
| `npm run check:css-order` | Verifica que los entrypoints HTML carguen `critical → Bootstrap → site` sin `media=print` ni cambios de orden. | Siempre que se modifiquen plantillas o el `<head>`.
| `npm run test:e2e` | Lanza Playwright (incluye `tests/navbar-dropdown.spec.ts`) contra Home y dos categorías para detectar parpadeos del navbar/cart y validar que el primer click deja los menús abiertos. | Después de tocar estilos globales o la navegación.
| `npm run lighthouse:audit` | Genera reportes Lighthouse (escritorio/móvil) y los guarda en `reports/lighthouse/`. | Auditorías de rendimiento previas a release. |
| `npm run snapshot -- --tag <etiqueta>` | Toma una captura del sitio en ejecución y la etiqueta con un identificador para su trazabilidad. | Documentar estados visuales relevantes o generar evidencia previa a un release. |

## Ejecución local

1. Instala dependencias con `npm ci`.
2. Ejecuta `npm run build` para generar `pages/`, `dist/`, `sitemap.xml` y datos derivados.
3. Sirve la carpeta raíz con un servidor estático (por ejemplo, `npx http-server .`) y accede a `http://localhost:8080`.
4. El Service Worker cachea `dist/`, `pages/` y `/data/product_data.json`; usa modo incógnito para probar la actualización de versión.

### Service Worker en producción y localhost

- El registro automático solo ocurre en hosts distintos de `localhost`. Para probar el Service Worker en local, ejecuta antes de recargar:
  ```js
  localStorage.setItem('ebano-sw-enable-local', 'true');
  ```
  También puedes anexar `?sw=on` a la URL.
- Kill-switch temporal: `localStorage.setItem('ebano-sw-disabled', 'true')` seguido de una recarga forzada. Elimina la clave o ponla en `false` para revertir.
- Invalida cachés antiguas ejecutando en consola:
  ```js
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  ```
- La versión activa del Service Worker utiliza los cachés `ebano-static-v6`, `ebano-dynamic-v4` y `ebano-products-v5`.

## Build y entrega

- `npm run build` produce HTML en `pages/`, bundles y assets en `dist/`, actualiza `index.html`, `sitemap.xml` y `robots.txt`.
- `npm run icons` y `npm run fonts` se integran con el build cuando los assets requeridos faltan.
- Para un chequeo rápido posterior al build puedes ejecutar `npm run lighthouse:audit` (acepta `LH_SKIP_BUILD=1`).
- Los artefactos generados se despliegan tal cual en GitHub Pages mediante el workflow `Deploy static content to Pages`.

### Snapshots etiquetados

El script `tools/snapshot-site.mjs` automatiza la toma de capturas del sitio en ejecución (sirve la carpeta raíz con tu servidor estático favorito). Guarda los archivos dentro de `reports/snapshots/` y mantiene un `manifest.json` ordenado por fecha más reciente. Los parámetros disponibles son:

| Parámetro | Tipo | Requerido | Predeterminado | Descripción |
| --- | --- | --- | --- | --- |
| `--tag` | string | Sí | N/A | Identificador humano legible que se sanitiza antes de usarse en los nombres de archivo. |
| `--url` | string | No | `http://127.0.0.1:8080/` | URL que se abrirá en Chromium para capturar el snapshot (debe estar sirviendo el sitio). |
| `--outdir` | string | No | `reports/snapshots` | Carpeta donde se guardarán la captura y el `manifest.json`. |
| `--replace-last` | boolean | No | `false` | Elimina el snapshot más reciente (y su archivo) antes de capturar una nueva etiqueta. |

Ejemplo:

```bash
npm run snapshot -- --tag staging -- --url http://localhost:4173/
```

Cada ejecución añade una entrada al manifiesto con el tag, URL, nombre de archivo relativo y la hora de captura, lo que facilita referenciar visualmente los estados del sitio.

## Pruebas

```bash
npm test
npm run check:css-order
npm run test:e2e
npm run test:cypress
```

La suite de `node:test` cubre utilidades de generación de IDs, Service Worker, lógica de carrito, fetch de productos, registros estructurados y
comportamiento del índice. Los nuevos chequeos aseguran el orden determinista de CSS y que navbar/cart no parpadeen (Playwright bajo viewport móvil, ver `tests/`). La suite Cypress documenta y previene las regresiones CAT-01/SUB-01 del menú principal y puede automatizarse vía `./.git-bisect-test.sh`.

## Calidad de código

- Linter: ejecuta `npx eslint .` (configurado por `.eslintrc.json`).
- Formato: no hay configuración de Prettier; mantén consistencia manualmente.
- Scripts adicionales verifican imágenes (`npm run lint:images`) y la política de robots (`test/robots.test.js`).

## Auditorías y mantenimiento

- **Fuentes auto‑hospedadas:** `npm run fonts` descarga y guarda las tipografías en `assets/fonts/`.
- **Imágenes responsivas:** usa `npm run images:generate`, `npm run images:rewrite` y `npm run lint:images`; puedes forzar regeneración con `FULL_REGEN=1` y limpieza con `CLEAN_ORPHANS=1`.
- **Backups del catálogo:** `npm run prune:backups` conserva los últimos respaldos según `PRUNE_KEEP`.
- **Lighthouse:** `npm run lighthouse:audit` lanza Chrome, ejecuta auditorías de escritorio y móvil, y guarda reportes con timestamp en `reports/lighthouse/`.
- **Scoreboard del audit:** sigue el avance en `docs/audit/e2e-frontend-audit.md#audit-scoreboard` para saber qué pendientes y regresiones están resueltos.

## CI/CD

| Workflow | Archivo | Validaciones |
| --- | --- | --- |
| Deploy static content to Pages | `.github/workflows/static.yml` | Publica el repositorio completo en GitHub Pages tras cada push a `main` o ejecución manual.
| Optimize images | `.github/workflows/images.yml` | Ejecuta `npm ci`, genera/re‑escribe variantes optimizadas, aplica lint y commitea los cambios.
| Codacy Security Scan | `.github/workflows/codacy.yml` | Corre Codacy Analysis CLI (ESLint), fragmenta y sanea SARIF y sube reportes a GitHub Code Scanning.

Los workflows fijan Node 18 y usan `npm ci`, alineado con los requisitos locales. Mantén el lockfile actualizado para aprovechar las cachés de Actions.

## Despliegue

El sitio es estático y puede hospedarse en cualquier servidor que respete rutas relativas. En GitHub Pages se publica mediante el
workflow descrito arriba; asegúrate de incluir `service-worker.js` y `data/product_data.json` en la raíz del artefacto desplegado.

## Seguridad

- Para reportar vulnerabilidades abre un issue etiquetado como `security` o contacta a los mantenedores a través de los canales
habituales del repositorio.
- El workflow de Codacy genera SARIF sanitizado antes de subirlo; evita publicar secretos en logs o commits.
- No compartas rutas locales o credenciales al documentar nuevas integraciones (usa marcadores como `<ruta_local_redactada>`).

## Roadmap y limitaciones

- **Missing:** documento público de roadmap; utiliza el tablero de issues para priorizar nuevas funcionalidades.
- El catálogo se apoya en herramientas Python ubicadas en `admin/` y `admin-panel/`; cualquier cambio en el esquema debe mantener compatibilidad con los scripts de Node.js (`tools/`).
- Las pruebas no reportan cobertura automática; considera integrar `c8` si necesitas métricas formales.

## Contribuir

1. Crea una rama siguiendo el esquema `tipo/slug` (por ejemplo, `docs/actualizar-readme`).
2. Ejecuta `npm ci`, `npm run build`, `npm test` y `npx eslint .` antes de abrir un PR.
3. Incluye en el PR evidencia de los comandos anteriores y cualquier auditoría relevante (`npm run lighthouse:audit` cuando aplique).
4. Actualiza `README.md`, `RUNBOOK.md` y `docs/` si cambias comportamientos o configuraciones.
5. Usa mensajes de commit en formato Conventional Commits.

## Estructura del repositorio

- `assets/` – CSS, imágenes fuente (`img/originals/`) y fuentes auto‑hospedadas.
- `data/` – Catálogo JSON consumido por el frontend y herramientas.
- `dist/` – Bundles minificados generados por la canalización de build.
- `pages/` – Páginas HTML estáticas generadas desde `templates/`.
- `src/` – Módulos JavaScript fuente utilizados en el navegador.
- `templates/` – Plantillas EJS para las páginas.
- `tools/` – Scripts de construcción, optimización y auditoría escritos en Node.js.
- `test/` – Suite de pruebas automatizadas con `node:test`.
- `docs/` – Documentación técnica complementaria (p. ej., `docs/api/utils.md`).

## Licencia

El `package.json` declara licencia ISC, pero el repositorio no incluye actualmente un archivo `LICENSE`. Añade uno antes de publicar la documentación final o distribuir el código.
