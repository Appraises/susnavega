'use strict';

module.exports = [
  { ignores: ['node_modules/**', 'tmp/**', 'pacote/**', 'dados/**', 'dist/**'] },
  {
    files: ['servidor/**/*.js', 'scripts/**/*.js', 'testes/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', __dirname: 'readonly', URL: 'readonly', fetch: 'readonly', structuredClone: 'readonly' }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'eqeqeq': ['error', 'always'],
      'no-unreachable': 'error',
      'no-constant-condition': 'error'
    }
  }
];
