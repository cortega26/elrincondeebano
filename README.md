# El Rincón de Ébano

Sitio web estático de un mini‑market online. Incluye un catálogo de productos organizado por categorías y utiliza Service Workers para navegación offline.

## Características

- Aplicación 100% en español.
- Uso de Service Worker para cacheo inteligente y notificaciones de actualización.
- Componentes reutilizables (navbar y footer) cargados dinámicamente.
- Sistema de carrito de compras en el navegador.
- Tipografías "Inter" y "Playfair Display" servidas desde Google Fonts junto a los íconos de Bootstrap.
- Filtros y ordenamiento de productos directamente en el navegador.
- Plantillas EJS para generar las páginas de forma consistente.

## Requisitos

- Node.js 18 o superior.

## Instalación y construcción

```bash
npm install      # instala las dependencias
npm run build    # compila CSS/JS y genera las páginas estáticas
```

Los archivos generados se encuentran en la carpeta `pages/` y en `assets/`.
El script `build-pages.js` toma las plantillas EJS de `templates/` y crea las páginas de cada categoría, evitando repetir código HTML.

## Imágenes responsivas

Las imágenes fuente se colocan en `assets/img/originals`. Un flujo de GitHub Actions genera variantes optimizadas en `assets/img/variants` utilizando AVIF, WebP y un formato de respaldo. Para reescribir las referencias en HTML y CSS usa:

```bash
npm run images:rewrite
npm run lint:images
```

Para saltar esta fase establece la variable `SKIP_IMAGE_OPT=1`.

## Responsive product images via Cloudflare

Las miniaturas de productos se sirven mediante `/cdn-cgi/image` con `fit=cover`, `format=auto` y `quality=82` a un ancho fijo de 200 px.
Se usa un `srcset` basado en DPR con variantes `1x` y `2x` para pantallas de alta densidad.
El Service Worker omite las solicitudes a `/cdn-cgi/image/` para que Cloudflare maneje la caché.
Esto elimina la advertencia de Lighthouse sobre "imagen más grande que el tamaño mostrado" y reduce las transformaciones en el plan gratuito de Cloudflare.

## Pruebas

```bash
npm test
```

Se ejecutan pruebas unitarias para utilidades de generación de IDs y el Service Worker.

## Estructura del proyecto

- `assets/` – Archivos estáticos (CSS, JS, imágenes, fuentes).
- `pages/` – Páginas HTML generadas a partir de plantillas.
- `templates/` – Plantillas EJS para las páginas de categorías.
- `build.js` – Tareas de empaquetado con esbuild.
- `build-pages.js` – Script para generar las páginas desde las plantillas.

## Código fuente y herramientas

- `src/js/` – Módulos de frontend sin empaquetar. Coloca aquí cualquier módulo nuevo.
- `assets/js/` – Directorio de salida del build con los bundles minificados.
- `tools/` – Scripts de Node.js para tareas de construcción y mantenimiento.

Los colaboradores deben ubicar los módulos de frontend nuevos en `src/js/` y los scripts de construcción en `tools/`.

## Despliegue

El sitio puede hospedarse en cualquier servidor estático. Solo es necesario colocar los archivos resultantes en el servidor y asegurarse de servir `service-worker.js` en la raíz.
