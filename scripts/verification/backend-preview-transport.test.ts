import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { BackendReleaseExpected, PreparedBackendReleaseIntent } from './backend-release-contracts';

const secret='url-specific-transport-private-canary',origin='https://immutable-api.vercel.app';
let made=0,admitted=0;let last:Record<string,unknown>|undefined;
Object.assign(globalThis,{backendPreviewFixture:{create:async(value:Record<string,unknown>,ports:{admit:()=>Promise<void>})=>{made++;last=value;await ports.admit();return{status:'CONFIRMED'};},headers:async(value:{url:string})=>{assert.equal(new URL(value.url).origin,origin);return{'x-vercel-protection-bypass':secret};}}});
registerHooks({load(url,context,next){const name=url.split('/').at(-1);if(name==='protected-preview.ts')return{format:'module',shortCircuit:true,source:'export const createProtectedPreview=globalThis.backendPreviewFixture.create;export const protectedPreviewHeaders=globalThis.backendPreviewFixture.headers;'};if(name==='backend-preview-transport.ts')return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code};return next(url,context);}});
const expected={repository:'owner/repo',releaseSha:'a'.repeat(40),treeSha:'b'.repeat(40),releaseRunId:'31',runAttempt:1,targets:{api:{teamId:'team_current',projectId:'prj_current'}},fingerprints:{apiArtifactSha256:'d'.repeat(64)}}as BackendReleaseExpected;
const prepared={sha256:'c'.repeat(64),canonicalJson:JSON.stringify({expiresAt:new Date(Date.now()+3600000).toISOString()})}as PreparedBackendReleaseIntent;
const input={repoRoot:resolve(import.meta.dirname,'../..'),expected,prepared,apiDeployment:{id:'dpl_current',url:origin}};
test('backend transport binds the original API source/package and forwards only the immutable-origin header',async()=>{
 const owner=await import(pathToFileURL(resolve(import.meta.dirname,'backend-preview-transport.ts')).href).catch(()=>({}));assert.equal(typeof owner.createBackendPreviewTransport,'function');
 await owner.createBackendPreviewTransport({...input,vercelToken:'private-vercel-token-canary'},async()=>{admitted++;});assert.equal(made,1);assert.equal(admitted,1);assert.equal((last?.binding as {packageSha256:string}).packageSha256,prepared.sha256);
 assert.deepEqual(await owner.backendPreviewHeaders({...input,url:origin+'/v1/assets/test/download'}),{'x-vercel-protection-bypass':secret});
 for(const url of ['https://api.vercel.com/v9/projects/current','https://project.supabase.co/auth/v1/token','https://other.vercel.app/v1/me','https://immutable-api.vercel.app.attacker.invalid/v1/me'])assert.deepEqual(await owner.backendPreviewHeaders({...input,url}),{});
 assert.equal(JSON.stringify(last).includes(secret),false);
});

test('retained runtime preview keeps executor approval and exact component provenance separate',async()=>{
 const owner=await import('./backend-preview-transport'),componentSha='e'.repeat(40),componentTree='f'.repeat(40),current={current:{sourceSha:componentSha,treeSha:componentTree,executorSourceSha:expected.releaseSha,executorTreeSha:expected.treeSha,apiArtifactSha256:expected.fingerprints.apiArtifactSha256,apiDeploymentId:input.apiDeployment.id,apiUrl:input.apiDeployment.url}};
 await owner.createBackendPreviewTransport({...input,expected:{...expected,currentRuntime:current} as BackendReleaseExpected,vercelToken:'private-vercel-token-canary'},async()=>{});
 const result=last!.binding as {releaseSha:string;packageSha256:string;componentSource?:{sourceSha:string;treeSha:string}};assert.equal(result.releaseSha,expected.releaseSha);assert.equal(result.packageSha256,prepared.sha256);assert.deepEqual(result.componentSource,{sourceSha:componentSha,treeSha:componentTree});
 for(const field of ['executorSourceSha','executorTreeSha','apiArtifactSha256','apiDeploymentId']){const changed={current:{...current.current,[field]:'wrong'}};await assert.rejects(owner.createBackendPreviewTransport({...input,expected:{...expected,currentRuntime:changed} as BackendReleaseExpected,vercelToken:'private-vercel-token-canary'},async()=>{}),field);}
});
