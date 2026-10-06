import { defineConfig } from '@playwright/test';
import config from './playwright.production.config';
export default defineConfig({ ...config, testIgnore: ['**/school-account-admission.spec.ts', '**/school-account-recovery.spec.ts', '**/account-admission-inert.spec.ts'] });
