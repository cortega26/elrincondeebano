import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import { sonarRules, unusedVarsRules, scriptsExemptionRules } from '../config/eslint-base.mjs';

export default [
  {
    ignores: ['.astro/**', 'dist/**', 'public/assets/**', 'public/data/**', 'vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs['flat/recommended'],
  {
    files: [
      'src/**/*.{js,mjs,ts,mts}',
      'scripts/**/*.{js,mjs,ts,mts}',
      // Repo-root-relative aliases: lint-staged runs this config from the
      // root, where flat-config globs resolve against the CWD.
      'astro-poc/src/**/*.{js,mjs,ts,mts}',
      'astro-poc/scripts/**/*.{js,mjs,ts,mts}',
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
      ...unusedVarsRules,
      ...sonarRules,
    },
  },
  {
    files: ['**/*.astro'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['public/service-worker.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
  },
  {
    files: ['**/astro.config.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
  },
  {
    files: ['scripts/**'],
    rules: {
      ...scriptsExemptionRules,
    },
  },
  {
    files: ['src/scripts/**', 'astro-poc/src/scripts/**'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
