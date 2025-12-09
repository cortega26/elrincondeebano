import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        environmentOptions: {
            jsdom: {
                url: 'https://localhost/',
            }
        },
        include: ['test/**/*.spec.{js,mjs,ts}'],
        exclude: ['test/run-all.js', 'node_modules'],
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
});
