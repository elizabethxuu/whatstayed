import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ['.next/**', 'node_modules/**', '.data/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // Browser test scripts are plain Node (CommonJS) driving Playwright.
  { files: ['tests/e2e/**/*.js'], rules: { '@typescript-eslint/no-require-imports': 'off', '@typescript-eslint/no-unused-vars': 'off' } },
];

export default config;
