const js = require('@eslint/js');
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
      'pages/**',
      'reports/**',
      'templates/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
    plugins: {
      sonarjs,
    },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        after: 'readonly',
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
      'no-unused-vars': [
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
      complexity: 'off',
      'max-lines-per-function': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  {
    files: ['**/*.{ts,mts}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
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
    },
  },
];
