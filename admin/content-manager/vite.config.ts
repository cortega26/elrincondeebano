import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `admin:dev` passes the API port it actually started; standalone `dev:web`
// keeps the documented default.
const apiPort = process.env.ADMIN_API_PORT || '3000';

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  // Plan 251: manifest PWA. El default de publicDir se resolvería bajo el root
  // (src/web/public); se fija explícito a admin/content-manager/public.
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@web': path.resolve(__dirname, 'src/web'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    // Plan 092: no public sourcemaps — they shipped the full sources to any
    // localhost caller. Dev debugging uses the vite dev server when needed.
    sourcemap: false,
    target: 'es2024',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/web/index.html'),
      output: {
        // Plan 241: vendor estable (react + router) fuera del código de la app,
        // para aprovechar la caché entre despliegues. Vite 8 usa rolldown, que
        // solo acepta manualChunks como función.
        manualChunks(id: string): string | undefined {
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    // Deterministic port: the docs, the `admin:dev` banner and the API proxy
    // all assume 5173. A silent fallback to 5174 would make those wrong.
    strictPort: true,
    host: '127.0.0.1',
    // Plan 124: dev loop — `npm run admin:dev` starts the API (:3000, tsx
    // --watch) and this Vite server (:5173, HMR), which proxies API calls.
    proxy: {
      '/api/v1': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
      // Product/media images live in the repo-root assets/ tree, which Vite
      // does not serve. The API does (with containment checks), so proxy them.
      '/assets': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
