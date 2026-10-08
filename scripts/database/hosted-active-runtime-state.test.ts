import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const sha='a'.repeat(40),tree='b'.repeat(40),project='abcdefghijklmnopqrst';
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
function saved(){const activation={status:'ACTIVATED_SIGNED_SOURCE_VERIFIED',sourceSha:sha,projectRef:project,runId:'51',runAttempt:1,packageSha256:'c'.repeat(64),runtimeSha256:'d'.repeat(64),apiDeploymentId:'dpl_fixture',edgeVersion:1,jobId:42,sourceProcessed:true,duplicateWakeDenied:true,originalCommandReplayed:true,recoveryScheduled:true,scheduledRecoveryVerified:true,configurationEvidenceObservedManual:true,sessionsClosed:true,keyOperation:'CONFIRMED',dispatchOperation:'CONFIRMED',probeEventId:'10000000-0000-4000-8000-000000000001',observedAt:'2026-10-07T12:00:00Z'};return{version:1,purpose:'CUEVO_PRIVATE_ACTIVE_RUNTIME_STATE',projectRef:project,phase:'CONFIRMED',identity:{sourceSha:sha,treeSha:tree,originalRunId:'51',originalRunAttempt:1,originalPackageSha256:'c'.repeat(64),runtimeSha256:'d'.repeat(64),apiDeploymentId:'dpl_fixture',apiUrl:'https://cuevo-fixture.vercel.app',edgeId:'edge_fixture',edgeVersion:1,activationId:'10000000-0000-4000-8000-000000000002',vaultSecretName:'cuevo_worker_10000000000040008000000000000002',endpoint:`https://${project}.supabase.co/functions/v1/cuevo-worker`,createdAt:'2026-10-07T11:59:00Z'},wakeKey:'e'.repeat(64),jobId:42,activation,cleanup:{status:activation.status,sourceSha:sha,projectRef:project,runId:'51',runAttempt:1,lockReleased:true,sessionsClosed:true,resultSha256:hash(activation),observedAt:'2026-10-07T12:00:01Z'}};}

test('installed active metadata preserves original identity and never exposes private signing material',async()=>{
 const subject=await import('./hosted-active-runtime-state');assert.equal(typeof subject.readInstalledRuntimeMetadata,'function');
 const state=saved(),publicState={...state};delete (publicState as Partial<typeof state>).wakeKey;
 const result=subject.readInstalledRuntimeMetadata([{state:publicState}],project);assert.equal(result.sourceSha,sha);assert.equal(result.originalRunId,'51');assert.equal(result.activationReceiptSha256,hash(state.activation));assert.doesNotMatch(JSON.stringify(result),new RegExp(state.wakeKey));
 for(const mode of ['phase','cleanup','source','key','unknown']){const altered=structuredClone(publicState);if(mode==='phase')altered.phase='CONFIGURED';else if(mode==='cleanup')altered.cleanup.lockReleased=false;else if(mode==='source')altered.activation.sourceSha='f'.repeat(40);else if(mode==='key')Object.assign(altered,{wakeKey:state.wakeKey});else Object.assign(altered,{verified:true});assert.throws(()=>subject.readInstalledRuntimeMetadata([{state:altered}],project));}
});

test('active state transitions retain original key and cannot fabricate terminal cleanup',async()=>{
 const subject=await import('./hosted-active-runtime-state'),state=saved();assert.equal(typeof subject.validateActiveRuntimeTransition,'function');
 const intent={...state,phase:'INTENT',jobId:null,activation:null,cleanup:null};subject.validateActiveRuntimeTransition(null,intent,project);
 assert.throws(()=>subject.validateActiveRuntimeTransition(intent,{...state,wakeKey:'f'.repeat(64)},project));
 assert.throws(()=>subject.validateActiveRuntimeTransition(intent,state,project));
 const configured={...state,phase:'CONFIGURED',cleanup:null};subject.validateActiveRuntimeTransition(intent,configured,project);subject.validateActiveRuntimeTransition(configured,state,project);
 assert.throws(()=>subject.validateActiveRuntimeTransition(state,intent,project));
});
