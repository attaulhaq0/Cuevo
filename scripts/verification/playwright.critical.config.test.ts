import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
test('routine browser config discovers the explicit critical suite once on Chromium with isolated production runtime', async () => {
  let subject: Record<string, unknown> = {};
  try { subject = await import(pathToFileURL(resolve(import.meta.dirname, 'playwright.critical.config.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.ok(subject.default, 'critical browser config exists');
  const config = subject.default as { testMatch: string[]; retries: number; workers: number; projects: { name: string; use: { browserName: string } }[]; webServer: { reuseExistingServer: boolean; command: string; cwd: string; gracefulShutdown: { signal: string; timeout: number } } };
  const { routineBrowserFiles } = await import('./verification-profiles');
  assert.deepEqual(config.testMatch, routineBrowserFiles); assert.equal(config.retries, 0); assert.equal(config.workers, 1);
  assert.deepEqual(config.projects, [{ name: 'critical-chromium', use: { browserName: 'chromium' } }]);
  assert.equal(config.webServer.reuseExistingServer, false); assert.equal(config.webServer.command, 'node --import tsx scripts/verification/production-runtime.ts'); assert.equal(config.webServer.cwd, resolve(import.meta.dirname, '../..'));
  assert.deepEqual(config.webServer.gracefulShutdown, { signal: 'SIGTERM', timeout: 10000 });
});
