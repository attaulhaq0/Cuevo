import assert from 'node:assert/strict';
import { test } from 'node:test';
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
