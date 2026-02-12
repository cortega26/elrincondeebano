const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      '.backup/**',
      '.pytest_cache/**',
      '.ruff_cache/**',
      '.stryker-tmp/**',
      '.venv/**',
      '_products/**',
      '_archive/**',
      'assets/**',
      '**/build/**',
      'coverage/**',
      'node_modules/**',
      'pages/**',
      'reports/**',
      'templates/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
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
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
];
