import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@server': path.resolve(__dirname, 'src/server'),
      '@web': path.resolve(__dirname, 'src/web'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/web/app/main.tsx',
        'src/web/app/ErrorBoundary.tsx',
        'src/web/app/RouteErrorPage.tsx',
      ],
      thresholds: {
        lines: 40,
        branches: 25,
        // Plan 231 ratchet: module-level floors (achieved − 5; measured
        // lines 97.25 / functions 93.55 on 2026-10-18). Raise with the PR
        // that keeps it green.
        'src/shared/comms.ts': {
          lines: 92,
          functions: 88,
        },
      },
      reporter: ['text', 'text-summary', 'json', 'html'],
    },
  },
});
