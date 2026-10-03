import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

test('workspace API launch reads the same source-locked pack without assuming repository cwd', () => {
  const script = `const {loadRuntimeLockedPack}=await import("./src/modules/curriculum/packs.ts"); const pack=await loadRuntimeLockedPack("synthetic-primary-v1"); console.log(JSON.stringify({id:pack.pack.packId,version:pack.pack.version}));`;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: resolve('apps/api'), encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  assert.equal(child.status, 0, 'Workspace runtime must locate its approved pack before native source validation.');
  assert.equal(JSON.parse(child.stdout).version, 'synthetic-1');
});

test('bundled worker fixture spool is artifact-owned instead of escaping into drive root', async () => {
  const artifact = resolve('.local/runtime-artifacts/worker/analytics-path-probe.mjs');
  await build({ entryPoints: ['apps/worker/src/platform/analytics-path.ts'], outfile: artifact, bundle: true, platform: 'node', format: 'esm', define: { CUEVO_ANALYTICS_DIRECTORY_URL: JSON.stringify('../../analytics/') } });
  const script = `const {analyticsFixtureDirectory}=await import(${JSON.stringify(pathToFileURL(artifact).href)}); console.log(JSON.stringify({path:analyticsFixtureDirectory()}));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: resolve('apps/web'), encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0);
  assert.equal(resolve(JSON.parse(child.stdout).path), resolve('.local/analytics'));
});
