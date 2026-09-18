import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://www.elrincondeebano.com',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      // Forzar todos los scripts como archivos externos (no inline).
      // Necesario para CSP: los scripts inline requieren 'unsafe-inline' o nonce.
      assetsInlineLimit: 0,
    },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'es',
        locales: {
          es: 'es-CL',
        },
      },
      serialize(item) {
        // Excluir rutas duplicadas que tienen canonical a otra URL principal:
        // - /c/[category]/ → canonical a /[category]/
        // - /pages/[slug].html/ → canonical a /[slug]/
        const pathname = new URL(item.url).pathname;
        if (pathname.startsWith('/c/') || pathname.startsWith('/pages/')) {
          return null;
        }
        return item;
      },
    }),
  ],
  // Plan 187: viewport (not hover) prefetch — hover on link-dense
  // home/category pages fired speculative fetches per link hovered, while
  // content-only pages paid for targets they never need. Viewport keeps the
  // benefit where it matters with a fraction of the requests.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
