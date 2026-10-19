const js = require('@eslint/js');
const {
  sonarRules,
  unusedVarsRules,
  jsUnusedVarsRules,
  complexityTrioRules,
} = require('./config/eslint-base.mjs');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = [
  {
    ignores: [
      '.backup/**',
      '.tmp/**',
      '.pytest_cache/**',
      '.ruff_cache/**',
      '.stryker-tmp/**',
      '.venv/**',
      '**/.venv/**',
      '_products/**',
      '_archive/**',
      'assets/**',
      '**/build/**',
      '**/dist/**',
      'coverage/**',
      'node_modules/**',
      'astro-poc/**',
      'admin/content-manager/**',
      'pages/**',
      'reports/**',
      'templates/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,tsx}'],
    plugins: {
      sonarjs,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        after: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        test: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      ...jsUnusedVarsRules,
      ...sonarRules,
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['test/**', '**/*.test.*', '**/*.spec.*'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: ['tools/**', 'scripts/**'],
    rules: {
      ...complexityTrioRules,
    },
  },
  {
    // Plan 244: logger-migration ratchet — migrated tools must not print bare
    // console.* (tools/utils/logger.mjs emits one JSON line per call with
    // LOG_LEVEL filtering + redaction). Plan 255 extended it to all tools.
    // Exclusions:
    // - tools/utils/logger.mjs: the logger sink itself.
    // - tools/utils/stage-runner.mjs: plan-206 human stage labels + pass-through
    //   child output (injectable console.log default).
    // - tools/live-contract-monitor.mjs: the JSON report payload must stay on
    //   console.log because test/live-contract-monitor.test.js captures it
    //   through a mocked console.log (plan 255 payload exception).
    files: ['tools/**/*.{js,mjs}'],
    ignores: [
      'tools/utils/logger.mjs',
      'tools/utils/stage-runner.mjs',
      'tools/live-contract-monitor.mjs',
    ],
    rules: {
      'no-console': 'error',
    },
  },
  {
    // Legacy runtime (pre-Astro storefront server): pre-existing structural
    // warnings predate the strict limits; kept in the lint surface (errors
    // still block) but the complexity trio stays warn-free-of-fail here.
    files: ['server/**'],
    rules: {
      ...complexityTrioRules,
    },
  },
  {
    files: ['**/*.{ts,mts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      ...unusedVarsRules,
    },
  },
];
