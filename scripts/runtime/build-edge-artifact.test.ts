import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';


import {registerHooks} from 'node:module';
import {createPreparedEdgeFixture} from '../verification/prepared-edge-artifact.fixture';
let outputMismatch=false;let captured:{sources:{path:string;sha256:string}[];sourceSha:string;treeSha:string;sourceLockSha256:string;denoLockSha256:string}|undefined;
registerHooks({load(url,context,next){if(url.endsWith('/edge-bundle-preparation.ts'))return{format:'module',shortCircuit:true,source:'export async function prepareEdgeBundle(input){globalThis.currentEdgeBuildInput=input;return globalThis.currentEdgeBuildFixture(input);}'};return next(url,context);}});
Object.assign(globalThis,{currentEdgeBuildFixture:(input:{sourceSha:string;treeSha:string;sourceLockSha256:string;denoLockSha256:string;sources:{path:string;sha256:string}[]})=>{captured=input as typeof captured;const value=createPreparedEdgeFixture({sourceSha:input.sourceSha,treeSha:input.treeSha,sourceLockSha256:input.sourceLockSha256,denoLockSha256:input.denoLockSha256,sources:input.sources});return{manifest:value.manifest,ezbr:outputMismatch?Buffer.from('changed'):value.ezbr};}});
const {buildEdgeArtifact,validateDenoLock,validateEdgeBundleOwnership}=await import('./build-edge-artifact');
test('Edge builder publishes only the exact current prepared payload from immutable worker source',async()=>{const root=resolve('.local/edge-artifacts/cuevo-worker'),source='apps/worker/src/edge.ts',before=await readFile(source),token='artifact-secret-must-not-appear-64-character-test-canary-only',old=process.env.CUEVO_WORKER_WAKE_KEY;process.env.CUEVO_WORKER_WAKE_KEY=token;try{const artifact=await buildEdgeArtifact();assert.equal(artifact.schemaVersion,2);assert.deepEqual(artifact.imports,['pg']);assert.equal(artifact.entrypoint,'edge/index.ts');assert.equal(captured?.sources.some(row=>row.path===source),true);assert.deepEqual(await readFile(source),before);assert.deepEqual((await readdir(root)).sort(),['artifact.json','worker.ezbr']);assert.equal(JSON.stringify(artifact).includes(token),false);for(const file of artifact.files)assert.equal(createHash('sha256').update(await readFile(resolve(root,file.path))).digest('hex'),file.sha256);}finally{if(old===undefined)delete process.env.CUEVO_WORKER_WAKE_KEY;else process.env.CUEVO_WORKER_WAKE_KEY=old;}});
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
  const dependencies = Object.entries(lock.npm as Record<string,{integrity:string}>).map(([key,row])=>({path:"node_modules/"+key.split("_")[0].slice(0,key.split("_")[0].lastIndexOf("@")),version:key.split("_")[0].slice(key.split("_")[0].lastIndexOf("@")+1),integrity:row.integrity})); validateDenoLock(lock, dependencies);
  const changed = structuredClone(lock); changed.npm['pg@8.23.1'].integrity = 'sha512-invalid';
  assert.throws(() => validateDenoLock(changed, dependencies));
  const extra = structuredClone(lock); extra.npm['unexpected@1.0.0'] = { integrity: 'sha512-invalid' };
  assert.throws(() => validateDenoLock(extra, dependencies));
  const missing = structuredClone(lock); delete missing.npm['pg-types@2.2.0'];
  assert.throws(() => validateDenoLock(missing, dependencies));
});

test('mismatched prepared bytes cannot replace the current published Edge artifact',async()=>{const path=resolve('.local/edge-artifacts/cuevo-worker/artifact.json'),before=await readFile(path);outputMismatch=true;try{await assert.rejects(buildEdgeArtifact(),/requires review|encoding required/);assert.deepEqual(await readFile(path),before);}finally{outputMismatch=false;}});
