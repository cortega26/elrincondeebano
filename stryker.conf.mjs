// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'astro-poc/src/lib/**/*.ts',
    'astro-poc/src/scripts/storefront/**/*.{js,ts}',
    '!astro-poc/src/lib/data-schemas.ts', // Zod schema contracts — keep fast
  ],
  vitest: {
    configFile: 'vitest.config.mts',
  },
};
export default config;
