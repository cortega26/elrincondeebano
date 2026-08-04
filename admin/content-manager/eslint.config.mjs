import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

// Content Manager workspace lint config (plan 084): the root ESLint config
// ignores admin/content-manager/**; this is the workspace's own zero-warning
// config, mirroring the astro-poc pattern (tseslint recommended + sonarjs
// as warnings so complexity never blocks mechanically).
// Globs are repo-root-relative so the config resolves identically from any
// CWD (eslint resolves flat-config globs against the current directory).
export default [
  {
    ignores: [
      'admin/content-manager/dist/**',
      'admin/content-manager/reports/**',
      'admin/content-manager/coverage/**',
      'admin/content-manager/playwright-report/**',
      'admin/content-manager/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'admin/content-manager/src/**/*.{js,mjs,ts,mts,tsx}',
      'admin/content-manager/scripts/**/*.{js,mjs,ts,mts}',
    ],
    plugins: {
      sonarjs,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
        },
      ],
      complexity: ['warn', 10],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 4],
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
    },
  },
];
