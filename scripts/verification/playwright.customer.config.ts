import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');

/** Critical journeys on exact installed engines; the full role matrix runs separately once. */
export default defineConfig({
  testDir: resolve(root, 'tests/e2e'),
  testMatch: ['customer-experience.spec.ts', 'foundation.spec.ts', 'hydration-diagnostics.spec.ts', 'learning-lifecycle.spec.ts', 'rubric-truth.spec.ts'],
  timeout: 30000, fullyParallel: false, workers: 1,
  reporter: [['list'], ['json', { outputFile: resolve(root, '.local/customer-readiness/compatibility-results.json') }], ['html', { open: 'never', outputFolder: resolve(root, '.local/customer-readiness/browser-compatibility') }]],
  use: { baseURL: 'http://localhost:3000', trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'customer-chromium', use: { browserName: 'chromium' } },
    { name: 'customer-firefox', use: { browserName: 'firefox' } },
    { name: 'customer-webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'node --import tsx scripts/verification/production-runtime.ts', cwd: root, url: 'http://localhost:3000', reuseExistingServer: false, timeout: 30000, gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 } },
});
