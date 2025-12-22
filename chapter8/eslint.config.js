import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';

export default defineConfig([
  { files: ['**/*.js'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.js'],
    plugins: { js },
    extends: ['js/recommended'],
    rules: {
      'indent': ['error', 2],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'space-before-function-paren': ['error', 'always'],
      'comma-spacing': ['error', { 'before': false, 'after': true }],
      'key-spacing': ['error', { 'beforeColon': false, 'afterColon': true }],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'space-infix-ops': 'error',
      'keyword-spacing': ['error', { 'before': true, 'after': true }]
    }
  },
]);
