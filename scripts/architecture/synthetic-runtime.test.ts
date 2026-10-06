import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkArchitecture } from './rules';

test('portable synthetic runtime export is explicit for server and Edge while browser config stays forbidden', () => {
  const target = { path: 'packages/config/src/synthetic-runtime.ts', content: 'export const check = 1;' };
  const file = (path: string) => ({ path, content: "import { check } from '@cuevo/config/synthetic-runtime';" });
  assert.deepEqual(checkArchitecture([file('apps/worker/src/edge.ts'), target], { navigation: false }), []);
  assert.ok(checkArchitecture([file('apps/web/shared/api/client.ts'), target], { navigation: false }).some(issue => issue.rule === 'browser-server'));
  assert.ok(checkArchitecture([{ path: 'apps/worker/src/edge.ts', content: "import data from '@cuevo/config/private';" }, { path: 'packages/config/src/private.ts', content: '' }], { navigation: false }).some(issue => issue.rule === 'unresolved-import'));
});

test('the exact hosted API entrypoint may compose createApp but cannot create a second source folder', () => {
  const app = { path: 'apps/api/src/app.ts', content: 'export const createApp = 1;' };
  assert.deepEqual(checkArchitecture([{ path: 'apps/api/src/serverless.ts', content: "import { createApp } from './app';" }, app], { navigation: false }), []);
  assert.ok(checkArchitecture([{ path: 'apps/api/src/hosted/api.ts', content: '' }], { navigation: false }).some(issue => issue.rule === 'layout'));
});
