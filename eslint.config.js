import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['.output/', '.wxt/']),
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    files: ['*.config.js', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      // Bookmark data is untrusted and never rendered as HTML.
      'svelte/no-at-html-tags': 'error',
    },
  },
);
