import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '**/.next/**', '**/dist/**', '**/storybook-static/**', '.local/**', 'coverage/**', 'test-results/**', 'playwright-report/**', '**/next-env.d.ts', '**/.storybook/**'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx,mjs}'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', fetch: 'readonly', AbortController: 'readonly', URL: 'readonly', window: 'readonly', document: 'readonly', navigator: 'readonly' } }, rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }
);
