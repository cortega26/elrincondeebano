import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  publicDir: false,
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
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: '127.0.0.1',
    // Plan 124: dev loop — `npm run admin:dev` (API :3000, tsx --watch) +
    // `npm run admin:dev:web` (vite :5173, HMR) proxies API calls.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
