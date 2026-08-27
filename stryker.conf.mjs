// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  ignorePatterns: [
    '.claude',
    '.tmp',
    'reports',
    'coverage',
    'astro-poc/dist',
    '.stryker-tmp',
    '.codegraph',
    '.git',
  ],
  mutate: [
    'astro-poc/src/scripts/storefront/cart-view.js',
    'astro-poc/src/scripts/storefront/order-submit.js',
    'astro-poc/src/scripts/storefront/storefront-state.ts',
  ],
  vitest: {
    configFile: 'vitest.config.mts',
  },
};
export default config;
