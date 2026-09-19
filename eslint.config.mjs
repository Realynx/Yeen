import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const qualityRules = {
  complexity: ['error', 15],
  'no-duplicate-imports': 'error',
};

export default defineConfig([
  globalIgnores([
    '.git/**',
    'apps/**',
    'artifacts/**',
    'deploy/**',
    'node_modules/**',
    'private/**/node_modules/**',
    'private/**/prebuilt/**',
    '**/coverage/**',
    '**/dist/**',
  ]),
  {
    files: [
      'eslint.config.mjs',
      'scripts/**/*.{js,mjs,cjs}',
      'deployment/**/*.{js,mjs,cjs}',
      'private/yeen-downloader-addon/scripts/**/*.{js,mjs,cjs}',
    ],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
    },
    rules: qualityRules,
  },
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'private/yeen-downloader-addon/src/**/*.{ts,tsx}',
    ],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: qualityRules,
  },
]);
