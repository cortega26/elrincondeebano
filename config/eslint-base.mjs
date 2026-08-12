// Plan 122: shared ESLint rule objects for the three configs (root,
// astro-poc, admin/content-manager) — tune repo-wide lint policy in ONE
// place. Per-package `files:`/globals blocks stay in each config.
export const sonarRules = {
  complexity: ['warn', 10],
  'max-depth': ['warn', 4],
  'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
  'max-params': ['warn', 4],
  'sonarjs/cognitive-complexity': ['warn', 15],
  'sonarjs/no-identical-functions': 'warn',
  'sonarjs/no-duplicate-string': 'warn',
};

// Plain-JS variant (no @typescript-eslint plugin required) for the root
// config's non-TS blocks.
export const jsUnusedVarsRules = {
  'no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrors: 'none',
      varsIgnorePattern: '^_',
    },
  ],
};

export const unusedVarsRules = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrors: 'none',
      varsIgnorePattern: '^_',
    },
  ],
};

// 3-rule complexity exemption (tools/server blocks in the root config).
export const complexityTrioRules = {
  complexity: 'off',
  'max-lines-per-function': 'off',
  'sonarjs/cognitive-complexity': 'off',
};

// The scripts/** complexity exemption block shared by root and astro-poc.
export const scriptsExemptionRules = {
  complexity: 'off',
  'max-lines-per-function': 'off',
  'sonarjs/cognitive-complexity': 'off',
  'sonarjs/no-duplicate-string': 'off',
};
