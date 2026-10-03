import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildEdgeArtifact, validateDenoLock, validateEdgeBundleOwnership } from './build-edge-artifact';

test('Edge artifact bundles the worker owner once with pinned pg and byte-preserving source provenance', async () => {
  const root = resolve('.local/edge-artifacts/cuevo-worker'); const source = 'apps/worker/src/edge.ts';
  const before = await readFile(source); const token = 'artifact-secret-must-not-appear-64-character-test-canary-only';
  const previous = process.env.CUEVO_WORKER_WAKE_KEY; process.env.CUEVO_WORKER_WAKE_KEY = token;
  try {
    const artifact = await buildEdgeArtifact();
    assert.deepEqual(await readFile(source), before);
    assert.equal(artifact.sources.find(row => row.path === source)?.sha256, createHash('sha256').update(before).digest('hex'));
    assert.equal(artifact.sources.every(row => row.path.startsWith('apps/worker/src/') || row.path === 'packages/contracts/src/analytics.ts' || row.path === 'packages/config/src/synthetic-runtime.ts'), true);
    assert.equal(artifact.sources.some(row => row.path === 'packages/contracts/src/analytics.ts'), true);
    assert.equal(artifact.sources.some(row => row.path === 'packages/config/src/synthetic-runtime.ts'), true);
    assert.deepEqual(artifact.imports, ['npm:pg@8.23.1']);
    const code = await readFile(resolve(root, 'index.ts'), 'utf8');
    assert.equal(code.includes(token), false); assert.equal(code.includes('@cuevo/'), false);
    assert.equal(code.includes('apps/worker/src/'), true);
    const importMap = JSON.parse(await readFile(resolve(root, 'deno.json'), 'utf8'));
    assert.deepEqual(importMap.imports, { pg: 'npm:pg@8.23.1' });
    assert.deepEqual(importMap.lock, { path: './deno.lock', frozen: true });
    assert.deepEqual(await readFile(resolve(root, 'deno.lock')), await readFile('apps/worker/deno.lock'));
    assert.equal(artifact.denoLockSha256, createHash('sha256').update(await readFile('apps/worker/deno.lock')).digest('hex'));
    for (const file of artifact.files) assert.equal(createHash('sha256').update(await readFile(resolve(root, file.path))).digest('hex'), file.sha256);
    assert.deepEqual((await readdir(root)).sort(), ['artifact.json', 'deno.json', 'deno.lock', 'index.ts']);
    const rebuilt = await buildEdgeArtifact(); assert.deepEqual(rebuilt, artifact);
  } finally { if (previous === undefined) delete process.env.CUEVO_WORKER_WAKE_KEY; else process.env.CUEVO_WORKER_WAKE_KEY = previous; }
});

test('Edge ownership gate admits the exact portable analytics contract with the worker and pinned external pg', () => {
  assert.doesNotThrow(() => validateEdgeBundleOwnership([
    'apps/worker/src/edge.ts', 'apps/worker/src/platform/analytics.ts', 'packages/contracts/src/analytics.ts', 'packages/config/src/synthetic-runtime.ts',
  ], ['pg']));
});

test('Edge ownership gate rejects server packages, sibling contracts, and application source', () => {
  for (const path of [
    'packages/config/src/index.ts', 'packages/contracts/src/index.ts', 'packages/contracts/src/authorization.ts',
    'apps/api/src/app.ts', 'apps/worker/test/analytics.test.ts', 'apps/worker/src/../../api/src/app.ts',
  ]) {
    assert.throws(() => validateEdgeBundleOwnership(['apps/worker/src/edge.ts', path], ['pg']));
  }
});

test('Edge ownership gate rejects unresolved contract packages and unreviewed runtime imports', () => {
  for (const imports of [[], ['pg', '@cuevo/contracts/analytics'], ['pg', 'node:crypto'], ['postgres']]) {
    assert.throws(() => validateEdgeBundleOwnership(['apps/worker/src/edge.ts'], imports));
  }
});

test('Edge Deno resolution must exactly match the approved npm versions and integrity', async () => {
  const lock = JSON.parse(await readFile('apps/worker/deno.lock', 'utf8'));
  const artifact = await buildEdgeArtifact(); validateDenoLock(lock, artifact.dependencies);
  const changed = structuredClone(lock); changed.npm['pg@8.23.1'].integrity = 'sha512-invalid';
  assert.throws(() => validateDenoLock(changed, artifact.dependencies));
  const extra = structuredClone(lock); extra.npm['unexpected@1.0.0'] = { integrity: 'sha512-invalid' };
  assert.throws(() => validateDenoLock(extra, artifact.dependencies));
  const missing = structuredClone(lock); delete missing.npm['pg-types@2.2.0'];
  assert.throws(() => validateDenoLock(missing, artifact.dependencies));
});
