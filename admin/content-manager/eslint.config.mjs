import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import { sonarRules, unusedVarsRules } from '../../config/eslint-base.mjs';

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
      // Workspace-relative (npm run lint inside admin/content-manager/).
      'src/**/*.{js,mjs,ts,mts,tsx}',
      'scripts/**/*.{js,mjs,ts,mts}',
      // Repo-root-relative aliases (lint-staged and root CWDs).
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
      ...unusedVarsRules,
      ...sonarRules,
    },
  },
];
