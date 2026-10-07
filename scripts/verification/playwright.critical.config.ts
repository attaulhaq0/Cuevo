import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { routineBrowserFiles } from './verification-profiles';
import { browserVerificationMetadata } from './browser-runtime-scope';
const root = resolve(import.meta.dirname, '../..');
export default defineConfig({
  metadata: browserVerificationMetadata(), forbidOnly:true,
  testDir: resolve(root, 'tests/e2e'), testMatch: routineBrowserFiles, timeout: 30000, fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: resolve(root, '.local/customer-readiness/critical-browser-results.json') }], ['html', { open: 'never', outputFolder: resolve(root, '.local/customer-readiness/critical-browser') }]],
  use: { baseURL: 'http://localhost:3000', trace: 'off', screenshot: 'only-on-failure' }, projects: [{ name: 'critical-chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'node --import tsx scripts/verification/production-runtime.ts', cwd: root, url: 'http://localhost:3000', reuseExistingServer: false, timeout: 30000, gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
});
