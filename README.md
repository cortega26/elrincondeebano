# El Rincón de Ébano

Sitio web estático de un mini‑market online. Incluye un catálogo de productos organizado por categorías y utiliza Service Workers para navegación offline.

## Características

- Aplicación 100% en español.
- Uso de Service Worker para cacheo inteligente y notificaciones de actualización.
- Componentes reutilizables (navbar y footer) cargados dinámicamente.
- Sistema de carrito de compras en el navegador.
- Tipografías "Inter" y "Playfair Display" auto‑hospedadas (WOFF2) con fallbacks métricos para evitar reflow.
- Analítica web servida íntegramente mediante Cloudflare Web Analytics, sin dependencias de Google.
- Filtros y ordenamiento de productos directamente en el navegador.
- Plantillas EJS para generar las páginas de forma consistente.

## Requisitos

- Node.js 18 o superior.

## Instalación y construcción

```bash
npm install      # instala las dependencias
npm run build    # compila CSS/JS y genera las páginas estáticas
```

Los archivos generados se encuentran en las carpetas `pages/` y `dist/`.
El script `tools/build-pages.js` toma las plantillas EJS de `templates/` y crea las páginas de cada categoría, evitando repetir código HTML.

## Imágenes responsivas

Las imágenes fuente se colocan en `assets/images/originals`. Un flujo de GitHub Actions genera variantes optimizadas en `assets/images/variants` utilizando AVIF, WebP y un formato de respaldo. Para reescribir las referencias en HTML y CSS usa:

```bash
npm run images:rewrite
npm run lint:images
```

Para convertir archivos manualmente a WebP usa los scripts de Python en `scripts/`.

Para saltar esta fase establece la variable `SKIP_IMAGE_OPT=1`.

## Responsive product images via Cloudflare

Las miniaturas de productos se sirven mediante `/cdn-cgi/image` con `fit=cover`, `format=auto` y `quality=82`.
Se definen tres anchos (200w, 400w y 800w) con `srcset` y `sizes="(max-width: 640px) 200px, 400px"` para evitar descargas innecesarias en móviles.
El Service Worker omite las solicitudes a `/cdn-cgi/image/` para que Cloudflare maneje la caché.
Esto corrige la advertencia de Lighthouse sobre "imagen más grande que el tamaño mostrado" y mantiene bajo el número de transformaciones en el plan gratuito.

### Utilidades de JavaScript

Helpers internos permiten componer URLs de Cloudflare y registrar eventos estructurados.

```js
import { cfimg, CFIMG_THUMB } from './src/js/utils/cfimg.mjs';

const url = cfimg('assets/images/banana.jpg', CFIMG_THUMB);
// /cdn-cgi/image/fit=cover,quality=82,format=auto/assets/images/banana.jpg

import { createCorrelationId, log } from './src/js/utils/logger.mjs';

const id = createCorrelationId();
log('info', 'Producto cargado', { id });
```

Consulta la [referencia completa](docs/api/utils.md) para más detalles.

## Pruebas

```bash
npm test
```

Se ejecutan pruebas unitarias para utilidades de generación de IDs y el Service Worker.

## Auditoría Lighthouse

El repositorio incluye un flujo automatizado para generar reportes de Lighthouse en formatos HTML y JSON.

```bash
npm install           # asegura que Chrome y Lighthouse estén disponibles
npm run lighthouse:audit
```

El script compila el sitio con la canalización existente, levanta un servidor estático temporal y ejecuta las auditorías con los presets de escritorio y móvil. Los reportes generados se guardan en `reports/lighthouse/` con marcas de tiempo para cada ejecución.

Consejos:
- Establece `LH_SKIP_BUILD=1` para omitir la compilación si ya ejecutaste `npm run build`.
- El servidor interno solo acepta métodos `GET/HEAD` y bloquea recorridos de ruta (..). Se sirven cabeceras seguras como `X-Content-Type-Options: nosniff`.
- Los tipos de contenido se resuelven en función de la extensión del archivo para resultados consistentes.

### Fuentes auto‑hospedadas

Para descargar (una sola vez) las fuentes locales:

```bash
npm run fonts
```

Las fuentes se almacenan en `assets/fonts` y se empaquetan a través del build. Esto reduce jank y dependencia externa.

## Gestor de productos

Las herramientas de administración escritas en Python guardan el catálogo en un archivo JSON. Por omisión el repositorio utiliza `C:\Users\corte\OneDrive\Tienda Ebano\data`, pero también acepta rutas absolutas. Cuando se proporciona una ruta absoluta, el archivo y sus copias de seguridad se crean directamente en el directorio indicado sin generar subcarpetas adicionales.

`ProductService` mantiene un caché en memoria respaldado por una copia defensiva por llamada para `get_all_products()`. Esto garantiza que las listas retornadas puedan modificarse en pruebas o scripts sin alterar el estado interno del servicio.

> Nota de validación: El catálogo JSON puede guardarse como una lista de productos o como un objeto con metadatos (`version`, `last_updated`) y una clave `products`. Durante la reparación del archivo, las entradas corruptas se omiten, se conservan solo los productos válidos y el archivo se reescribe con un nuevo bloque de metadatos.

## Estructura del proyecto

- `assets/` – Archivos estáticos (CSS, imágenes, fuentes).
- `dist/` – Directorio de salida del build con los bundles minificados.
- `pages/` – Páginas HTML generadas a partir de plantillas.
- `templates/` – Plantillas EJS para las páginas de categorías.
- `tools/` – Scripts de Node.js para construcción y mantenimiento.

## Código fuente y herramientas

- `src/js/` – Módulos de frontend sin empaquetar. Coloca aquí cualquier módulo nuevo.
- `dist/` – Salida de los bundles minificados.
- `tools/` – Scripts de Node.js para tareas de construcción y mantenimiento.

Los colaboradores deben ubicar los módulos de frontend nuevos en `src/js/` y los scripts de construcción en `tools/`.

## Despliegue

El sitio puede hospedarse en cualquier servidor estático. Solo es necesario colocar los archivos resultantes en el servidor y asegurarse de servir `service-worker.js` en la raíz.
