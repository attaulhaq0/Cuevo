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
test('pending confirmation public metadata admits only the independently bound configured or confirmed pair',async()=>{const subject=await import('./hosted-active-runtime-state');assert.equal(typeof subject.readPendingRuntimeConfirmationMetadata,'function');const state=saved(),confirmed=Object.fromEntries(Object.entries(state).filter(([key])=>key!=='wakeKey')),configured={...confirmed,phase:'CONFIGURED',cleanup:null},binding={configuredPublicStateSha256:hash(configured),confirmedPublicStateSha256:hash(confirmed)};const result=subject.readPendingRuntimeConfirmationMetadata([{state:configured}],binding,project);assert.equal(result.observedPhase,'CONFIGURED');assert.equal(result.observedPublicStateSha256,binding.configuredPublicStateSha256);assert.throws(()=>subject.readInstalledRuntimeMetadata([{state:configured}],project));assert.throws(()=>subject.readPendingRuntimeConfirmationMetadata([{state:{...configured,identity:{...state.identity,activationId:'10000000-0000-4000-8000-000000000004'}}}],binding,project));assert.throws(()=>subject.readPendingRuntimeConfirmationMetadata([{state:configured},{state:configured}],binding,project));assert.doesNotMatch(subject.activeRuntimeConfirmationPublicQuery(project),/select\s+decrypted_secret\s/i);});

function originalConfirmation(state:ReturnType<typeof saved>&{runtimeConfig?:unknown}){
 return{identity:structuredClone(state.identity),wakeKeySha256:createHash('sha256').update(state.wakeKey).digest('hex'),runtimeConfigSha256:hash(state.runtimeConfig??null),activation:structuredClone(state.activation),cleanup:structuredClone(state.cleanup)};
}
async function confirmationSubject(){
 const subject=await import('./hosted-active-runtime-state') as Record<string,unknown>;
 assert.equal(typeof subject.validateActiveRuntimeConfirmationCandidate,'function');
 return subject.validateActiveRuntimeConfirmationCandidate as (state:unknown,original:unknown,projectRef:string)=>import('./hosted-active-runtime-state').ActiveRuntimeState;
}

test('confirmation candidate retains the exact configured original without granting installed-runtime metadata',async()=>{
 const validate=await confirmationSubject(),subject=await import('./hosted-active-runtime-state'),confirmed=saved(),original=originalConfirmation(confirmed),configured={...confirmed,phase:'CONFIGURED',cleanup:null},before=canonicalReleaseExecutionJson(configured),originalBefore=canonicalReleaseExecutionJson(original);
 const candidate=validate(configured,original,project);
 assert.deepEqual(candidate,configured);assert.equal(candidate.phase,'CONFIGURED');assert.equal(candidate.cleanup,null);
 assert.equal(canonicalReleaseExecutionJson(configured),before);assert.equal(canonicalReleaseExecutionJson(original),originalBefore);
 assert.throws(()=>subject.readInstalledRuntimeMetadata([{state:Object.fromEntries(Object.entries(candidate).filter(([key])=>!['wakeKey','runtimeConfig'].includes(key)))}],project));
});

test('confirmation candidate accepts only the exact already-confirmed original for read-only reconciliation',async()=>{
 const validate=await confirmationSubject(),confirmed=saved(),original=originalConfirmation(confirmed);
 assert.deepEqual(validate(confirmed,original,project),confirmed);
 const changed=structuredClone(confirmed);changed.cleanup.observedAt='2026-10-07T12:00:02Z';
 assert.throws(()=>validate(changed,original,project));
});

test('confirmation candidate refuses changed original identity or supplied identity evidence',async()=>{
 const validate=await confirmationSubject(),confirmed=saved(),original=originalConfirmation(confirmed),configured={...confirmed,phase:'CONFIGURED',cleanup:null};
 const changes={sourceSha:'f'.repeat(40),treeSha:'f'.repeat(40),originalRunId:'52',originalRunAttempt:2,originalPackageSha256:'f'.repeat(64),runtimeSha256:'f'.repeat(64),apiDeploymentId:'dpl_other',apiUrl:'https://cuevo-other.vercel.app',edgeId:'edge_other',edgeVersion:2,activationId:'10000000-0000-4000-8000-000000000003',vaultSecretName:'cuevo_worker_10000000000040008000000000000003',endpoint:'https://bcdefghijklmnopqrstu.supabase.co/functions/v1/cuevo-worker',createdAt:'2026-10-07T11:58:00Z'};
 for(const[key,value]of Object.entries(changes)){
  const state=structuredClone(configured);Object.assign(state.identity,{[key]:value});assert.throws(()=>validate(state,original,project),key);
  const evidence=structuredClone(original);Object.assign(evidence.identity,{[key]:value});assert.throws(()=>validate(configured,evidence,project),'original '+key);
 }
 assert.throws(()=>validate(configured,original,'bcdefghijklmnopqrstu'));
});

test('confirmation candidate binds the original signing key private configuration job and complete execution result',async()=>{
 const validate=await confirmationSubject(),confirmed={...saved(),runtimeConfig:{api:{private:'original'},edge:{private:'original'}}},original=originalConfirmation(confirmed),configured={...confirmed,phase:'CONFIGURED',cleanup:null};
 assert.deepEqual(validate(configured,original,project),configured);
 for(const change of ['key','key-hash','configuration','configuration-hash','job','activation-clock','activation-proof','activation-extra','missing-activation']){
  const state=structuredClone(configured),evidence=structuredClone(original);
  if(change==='key')state.wakeKey='f'.repeat(64);
  else if(change==='key-hash')evidence.wakeKeySha256='f'.repeat(64);
  else if(change==='configuration')state.runtimeConfig.api.private='different';
  else if(change==='configuration-hash')evidence.runtimeConfigSha256='f'.repeat(64);
  else if(change==='job')state.jobId=43;
  else if(change==='activation-clock')state.activation.observedAt='2026-10-07T12:00:01Z';
  else if(change==='activation-proof')state.activation.sourceProcessed=false;
  else if(change==='activation-extra')Object.assign(state.activation,{freshConfirmation:true});
  else Object.assign(state,{activation:null});
  assert.throws(()=>validate(state,evidence,project),change);
 }
});

test('confirmation candidate rejects fabricated cleanup and invalid original terminal relationships',async()=>{
 const validate=await confirmationSubject();
 for(const change of ['hash','lock','sessions','early-cleanup','early-activation','source','run','attempt','package','runtime','api','edge','job','endpoint','vault-name','api-url']){
  const confirmed=saved();
  if(change==='hash')confirmed.cleanup.resultSha256='f'.repeat(64);
  else if(change==='lock')confirmed.cleanup.lockReleased=false;
  else if(change==='sessions')confirmed.cleanup.sessionsClosed=false;
  else if(change==='early-cleanup')confirmed.cleanup.observedAt='2026-10-07T11:59:59Z';
  else if(change==='early-activation')confirmed.activation.observedAt='2026-10-07T11:58:59Z';
  else if(change==='source')confirmed.activation.sourceSha='f'.repeat(40);
  else if(change==='run')confirmed.activation.runId='52';
  else if(change==='attempt')confirmed.activation.runAttempt=2;
  else if(change==='package')confirmed.activation.packageSha256='f'.repeat(64);
  else if(change==='runtime')confirmed.activation.runtimeSha256='f'.repeat(64);
  else if(change==='api')confirmed.activation.apiDeploymentId='dpl_other';
  else if(change==='edge')confirmed.activation.edgeVersion=2;
  else if(change==='job')confirmed.jobId=43;
  else if(change==='endpoint')confirmed.identity.endpoint='https://bcdefghijklmnopqrstu.supabase.co/functions/v1/cuevo-worker';
  else if(change==='vault-name')confirmed.identity.vaultSecretName='cuevo_worker_10000000000040008000000000000003';
  else confirmed.identity.apiUrl='https://foreign.invalid';
  if(!['hash','lock','sessions'].includes(change))confirmed.cleanup.resultSha256=hash(confirmed.activation);
  const original=originalConfirmation(confirmed);
  assert.throws(()=>validate({...confirmed,phase:'CONFIGURED',cleanup:null},original,project),change);
  assert.throws(()=>validate(confirmed,original,project),'confirmed '+change);
 }
});

test('confirmation candidate refuses missing duplicate malformed unknown or non-confirmable state and original evidence',async()=>{
 const validate=await confirmationSubject(),confirmed=saved(),original=originalConfirmation(confirmed),configured={...confirmed,phase:'CONFIGURED',cleanup:null};
 for(const state of [null,[],[configured,configured],{...configured,phase:'INTENT'},{...configured,phase:'REQUIRES_REVIEW'},{...configured,phase:'CONFIGURED',cleanup:confirmed.cleanup},{...configured,verified:true},{...configured,identity:{...configured.identity,verified:true}},{...configured,wakeKey:'malformed'}])assert.throws(()=>validate(state,original,project));
 for(const evidence of [null,[],[original,original],{...original,verified:true},{...original,wakeKey:confirmed.wakeKey},{...original,cleanup:null},{...original,identity:{...original.identity,verified:true}},{...original,cleanup:{...original.cleanup,verified:true}},{...original,wakeKeySha256:'malformed'},{...original,runtimeConfigSha256:'malformed'}])assert.throws(()=>validate(configured,evidence,project));
});
