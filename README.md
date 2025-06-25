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

## Despliegue

El sitio puede hospedarse en cualquier servidor estático. Solo es necesario colocar los archivos resultantes en el servidor y asegurarse de servir `service-worker.js` en la raíz.
