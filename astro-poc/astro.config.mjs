import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import partytown from '@astrojs/partytown';

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
    partytown({
      config: {
        forward: ['dataLayer.push'],
      },
    }),
  ],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
