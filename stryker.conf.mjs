// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/js/script.mjs',
    'src/js/modules/**/*.mjs',
    '!src/js/utils/logger.ts', // Skip logger for now to keep it fast
  ],
  vitest: {
    configFile: 'vitest.config.mts',
  },
};
export default config;
