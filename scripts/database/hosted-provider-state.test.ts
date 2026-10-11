import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalReleaseReviewJson } from '../verification/release-review';
import type { ProviderDeploymentOperation, ProviderDeploymentState } from './hosted-provider-state';

const identity = { sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), apiArtifactSha256: 'c'.repeat(64), edgeArtifactSha256: 'd'.repeat(64), denoLockSha256: 'e'.repeat(64), runtimeSha256: 'f'.repeat(64), teamId: 'team_Cuevo', projectId: 'prj_Api', originalRunId: '51', originalRunAttempt: 1, originalPackageSha256: '1'.repeat(64) };
const operation = (): ProviderDeploymentOperation => ({ identity, phases: [{ name: 'API_ENVIRONMENT', state: 'INTENT', receipt: null }] });
const state = () => ({ version: 1, purpose: 'CUEVO_PRIVATE_PROVIDER_DEPLOYMENT_STATE', projectRef: 'mqxdjvsyckzocokuikmx', operations: [operation()] });

test('private provider history retains original identity and refuses backward or skipped phase transitions', async () => {
  const { validateProviderDeploymentTransition } = await import('./hosted-provider-state');
  const before = state();
  const confirmed = structuredClone(before) as ProviderDeploymentState;
  confirmed.operations[0].phases[0] = { name: 'API_ENVIRONMENT', state: 'CONFIRMED', receipt: { kind: 'API_ENVIRONMENT', keysSha256: '2'.repeat(64), valuesSha256: '3'.repeat(64), variables: [{ key: 'NODE_ENV', id: 'env_original', valueSha256: '4'.repeat(64) }] } };
  assert.doesNotThrow(() => validateProviderDeploymentTransition(before, confirmed, before.projectRef));
  assert.throws(() => validateProviderDeploymentTransition(confirmed, before, before.projectRef));
  for (const change of ['identity', 'skip', 'erase', 'new-operation']) {
    const next = structuredClone(before) as ProviderDeploymentState;
    if (change === 'identity') next.operations[0].identity.originalRunId = '52';
    if (change === 'skip') next.operations[0].phases.push({ name: 'EDGE_SECRETS', state: 'INTENT', receipt: null });
    if (change === 'erase') next.operations = [];
    if (change === 'new-operation') next.operations.push({ ...operation(), identity: { ...identity, sourceSha: '2'.repeat(40) } });
    assert.throws(() => validateProviderDeploymentTransition(before, next, before.projectRef));
  }
});

test('private provider state rejects extra secret fields and unconfirmed receipts', async () => {
  const { providerDeploymentStateSchema } = await import('./hosted-provider-state');
  assert.throws(() => providerDeploymentStateSchema.parse({ ...state(), password: 'must-never-be-public' }));
  const next = state() as ProviderDeploymentState;
  next.operations[0].phases[0].receipt = { kind: 'API_ENVIRONMENT', keysSha256: '2'.repeat(64), valuesSha256: '3'.repeat(64), variables: [{ key: 'NODE_ENV', id: 'env_original', valueSha256: '4'.repeat(64) }] };
  assert.throws(() => providerDeploymentStateSchema.parse(next));
});

test('version two retains legacy receipt bytes while distinguishing later exact operations on retained source artifacts',async()=>{
 const subject=await import('./hosted-provider-state'),before=state() as ProviderDeploymentState;before.operations[0].phases=[{name:'API_ENVIRONMENT',state:'CONFIRMED',receipt:{kind:'API_ENVIRONMENT',keysSha256:'2'.repeat(64),valuesSha256:'3'.repeat(64),variables:[{key:'NODE_ENV',id:'env_original',valueSha256:'4'.repeat(64)}]}},{name:'API_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'API_DEPLOYMENT',deploymentId:'dpl_old',url:'https://cuevo-old.vercel.app'}},{name:'EDGE_SECRETS',state:'CONFIRMED',receipt:{kind:'EDGE_SECRETS',valuesSha256:'5'.repeat(64),variables:[{name:'NODE_ENV',valueSha256:'4'.repeat(64)}]}},{name:'EDGE_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'EDGE_DEPLOYMENT',id:'edge_old',version:1}}];const priorHash=subject.providerStateSha256(before.operations[0]),after={...before,version:2,operations:[before.operations[0],{...operation(),identity:{...identity,originalRunId:'52',releaseGeneration:'2',operationSha256:'8'.repeat(64)}}]};assert.doesNotThrow(()=>subject.validateProviderDeploymentTransition(before,after,before.projectRef));assert.equal(subject.providerStateSha256(subject.providerDeploymentStateSchema.parse(after).operations[0]),priorHash);assert.throws(()=>subject.providerDeploymentStateSchema.parse({...after,version:1}));assert.throws(()=>subject.providerDeploymentStateSchema.parse({...after,operations:[...after.operations,{...operation(),identity:{...after.operations[1].identity,originalRunId:'53'}}]}));assert.throws(()=>subject.validateProviderDeploymentTransition(after,before,before.projectRef));
});

test('an adopted API receipt preserves original provider creation time and cannot later restamp it',async()=>{
 const subject=await import('./hosted-provider-state'),before=state() as ProviderDeploymentState;before.operations[0].phases=[{name:'API_ENVIRONMENT',state:'CONFIRMED',receipt:{kind:'API_ENVIRONMENT',keysSha256:'2'.repeat(64),valuesSha256:'3'.repeat(64),variables:[{key:'NODE_ENV',id:'env_original',valueSha256:'4'.repeat(64)}]}},{name:'API_DEPLOYMENT',state:'INTENT',receipt:null}];
 const after=structuredClone(before);after.operations[0].phases[1]={name:'API_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'API_DEPLOYMENT',deploymentId:'dpl_original',url:'https://cuevo-original.vercel.app',createdAtMs:1791496800000}};assert.doesNotThrow(()=>subject.validateProviderDeploymentTransition(before,after,before.projectRef));
 const changed=structuredClone(after);Object.assign(changed.operations[0].phases[1].receipt!,{createdAtMs:1791496800001});assert.throws(()=>subject.validateProviderDeploymentTransition(after,changed,before.projectRef));
 const legacy=structuredClone(after);delete (legacy.operations[0].phases[1].receipt as unknown as Record<string,unknown>).createdAtMs;assert.doesNotThrow(()=>subject.providerDeploymentStateSchema.parse(legacy));assert.throws(()=>subject.validateProviderDeploymentTransition(after,legacy,before.projectRef));
 for(const time of [-1,1.5,Number.MAX_SAFE_INTEGER+1]){const invalid=structuredClone(after);Object.assign(invalid.operations[0].phases[1].receipt!,{createdAtMs:time});assert.throws(()=>subject.providerDeploymentStateSchema.parse(invalid));}
});

test('current Edge receipt binds prepared version and exact provider content digests',async()=>{const subject=await import('./hosted-provider-state'),legacy=state() as ProviderDeploymentState;legacy.operations[0].phases=[{name:'API_ENVIRONMENT',state:'CONFIRMED',receipt:{kind:'API_ENVIRONMENT',keysSha256:'2'.repeat(64),valuesSha256:'3'.repeat(64),variables:[{key:'NODE_ENV',id:'env',valueSha256:'4'.repeat(64)}]}},{name:'API_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'API_DEPLOYMENT',deploymentId:'dpl_X',url:'https://x.vercel.app'}},{name:'EDGE_SECRETS',state:'CONFIRMED',receipt:{kind:'EDGE_SECRETS',valuesSha256:'5'.repeat(64),variables:[{name:'CUEVO_WORKER_WAKE_KEY',valueSha256:'6'.repeat(64)}]}},{name:'EDGE_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'EDGE_DEPLOYMENT',id:'edge',version:1,artifactVersion:2,rawEszipSha256:'7'.repeat(64),ezbrSha256:'8'.repeat(64),rawByteSize:32,entrypoint:'edge/index.ts'} as never}];assert.doesNotThrow(()=>subject.providerDeploymentStateSchema.parse(legacy));const changed=structuredClone(legacy);(changed.operations[0].phases[3].receipt as unknown as {rawByteSize:unknown}).rawByteSize=null;assert.throws(()=>subject.providerDeploymentStateSchema.parse(changed));});

test('new provider operation accepts only an exact staging host contract digest',async()=>{
 const subject=await import('./hosted-provider-state'),contractSha256='9'.repeat(64),next=structuredClone(state());
 Object.assign(next.operations[0].identity,{stagingHostContractSha256:contractSha256});
 const admitted=subject.validateProviderDeploymentTransition(null,next,next.projectRef);
 assert.equal(admitted.operations[0].identity.stagingHostContractSha256,contractSha256);
 for(const value of ['', '9'.repeat(63), '9'.repeat(65), 'G'.repeat(64), 'A'.repeat(64), null, 9, {sha256:contractSha256}]){
  const malformed=structuredClone(next);Object.assign(malformed.operations[0].identity,{stagingHostContractSha256:value});
  assert.throws(()=>subject.providerDeploymentStateSchema.parse(malformed));
 }
});

test('staging host identity stays immutable while historical omission preserves original bytes and hash',async()=>{
 const subject=await import('./hosted-provider-state'),historical=structuredClone(state()),originalBytes=canonicalReleaseReviewJson(historical),originalHash='07df2edeb6b630d6c464875debe06858af28a827b09e32a1611856759ec2254a';
 const parsed=subject.providerDeploymentStateSchema.parse(historical);
 assert.equal(canonicalReleaseReviewJson(parsed),originalBytes);
 assert.equal(subject.providerStateSha256(parsed),originalHash);
 assert.equal(Object.hasOwn(parsed.operations[0].identity,'stagingHostContractSha256'),false);
 assert.deepEqual(subject.validateProviderDeploymentTransition(null,historical,historical.projectRef),historical);
 const backfilled=structuredClone(historical);Object.assign(backfilled.operations[0].identity,{stagingHostContractSha256:'9'.repeat(64)});
 assert.doesNotThrow(()=>subject.providerDeploymentStateSchema.parse(backfilled));
 assert.throws(()=>subject.validateProviderDeploymentTransition(historical,backfilled,historical.projectRef),/identity is immutable/);
 const bound=subject.validateProviderDeploymentTransition(null,backfilled,historical.projectRef),confirmed=structuredClone(bound);
 confirmed.operations[0].phases[0]={name:'API_ENVIRONMENT',state:'CONFIRMED',receipt:{kind:'API_ENVIRONMENT',keysSha256:'2'.repeat(64),valuesSha256:'3'.repeat(64),variables:[{key:'NODE_ENV',id:'env_original',valueSha256:'4'.repeat(64)}]}};
 assert.equal(subject.validateProviderDeploymentTransition(bound,confirmed,historical.projectRef).operations[0].identity.stagingHostContractSha256,'9'.repeat(64));
 for(const change of ['replace','remove']){
  const rewritten=structuredClone(confirmed);if(change==='replace')rewritten.operations[0].identity.stagingHostContractSha256='8'.repeat(64);else delete rewritten.operations[0].identity.stagingHostContractSha256;
  assert.doesNotThrow(()=>subject.providerDeploymentStateSchema.parse(rewritten));
  assert.throws(()=>subject.validateProviderDeploymentTransition(confirmed,rewritten,historical.projectRef),/identity is immutable/);
 }
});

test('a later provider operation binds its own staging host digest without backfilling earlier history',async()=>{
 const subject=await import('./hosted-provider-state'),before=state() as ProviderDeploymentState;
 before.operations[0].phases=[{name:'API_ENVIRONMENT',state:'CONFIRMED',receipt:{kind:'API_ENVIRONMENT',keysSha256:'2'.repeat(64),valuesSha256:'3'.repeat(64),variables:[{key:'NODE_ENV',id:'env_original',valueSha256:'4'.repeat(64)}]}},{name:'API_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'API_DEPLOYMENT',deploymentId:'dpl_old',url:'https://cuevo-old.vercel.app'}},{name:'EDGE_SECRETS',state:'CONFIRMED',receipt:{kind:'EDGE_SECRETS',valuesSha256:'5'.repeat(64),variables:[{name:'NODE_ENV',valueSha256:'4'.repeat(64)}]}},{name:'EDGE_DEPLOYMENT',state:'CONFIRMED',receipt:{kind:'EDGE_DEPLOYMENT',id:'edge_old',version:1}}];
 const originalBytes=canonicalReleaseReviewJson(before.operations[0]),originalHash=subject.providerStateSha256(before.operations[0]);
 const later={...operation(),identity:{...identity,sourceSha:'2'.repeat(40),originalRunId:'52',stagingHostContractSha256:'9'.repeat(64)}},after=subject.validateProviderDeploymentTransition(before,{...before,operations:[before.operations[0],later]},before.projectRef);
 assert.equal(after.version,1);assert.equal(after.operations.length,2);
 assert.equal(canonicalReleaseReviewJson(after.operations[0]),originalBytes);assert.equal(subject.providerStateSha256(after.operations[0]),originalHash);
 assert.equal(Object.hasOwn(after.operations[0].identity,'stagingHostContractSha256'),false);
 assert.equal(after.operations[1].identity.stagingHostContractSha256,'9'.repeat(64));
});
