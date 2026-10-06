import { defineConfig } from '@playwright/test';
import config from './playwright.production.config';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
export default defineConfig({ ...config, testMatch: ['school-account-admission.spec.ts', 'school-account-recovery.spec.ts', 'account-admission-inert.spec.ts'], reporter: [['list'], ['json', { outputFile: resolve(root, '.local/customer-readiness/account-browser-results.json') }], ['html', { open: 'never', outputFolder: resolve(root, '.local/verification/playwright-accounts') }]] });
