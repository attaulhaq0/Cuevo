import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {canonicalReleaseExecutionJson} from './release-review';

import {originalWorkerExportFixture,providerWorkerExportFixture} from './backend-hosted-activation-export.fixture';
import {prepareBackendReleaseIntent}from'./backend-release-contracts';
import {validateStagingHostContract}from'./backend-staging-host-contract';

const wakeKey='d'.repeat(64),now=Date.parse('2026-10-08T12:00:00Z');
const rawHash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex'),hash=(value:unknown)=>rawHash(canonicalReleaseExecutionJson(value)),bytes=(value:unknown)=>Buffer.from(canonicalReleaseExecutionJson(value)+'\n');
async function subject(){const module=await import('./backend-hosted-activation-export-contracts') as Record<string,unknown>;assert.equal(typeof module.createOriginalWorkerActivationExecutionExport,'function');return module as unknown as typeof import('./backend-hosted-activation-export-contracts');}

function hostBearingFixture(){
 const fixture=providerWorkerExportFixture(),expected=fixture.expected,settings=(rootDirectory:string|null,framework:string|null)=>({nodeVersion:'24.x',fluid:true,functionDefaultRegions:['sin1'],autoAssignCustomDomains:false,ssoDeploymentType:'all_except_custom_domains',rootDirectory,framework}),stagingHostContract=validateStagingHostContract({version:1,purpose:'CUEVO_STAGING_HOST_CONTRACT',sourceSha:expected.releaseSha,treeSha:expected.treeSha,deploymentEnvironment:'synthetic-staging',targets:expected.targets,settings:{api:settings(null,null),web:settings('apps/web','nextjs'),supabase:{region:'ap-southeast-1',postgresEngine:'17',applicationConnection:{kind:'direct',host:`db.${expected.targets.supabase.projectRef}.supabase.co`,port:5432,database:'postgres'}}},sourceBounds:{api:{node:'24',maxDurationSeconds:60,poolMax:10,connectionTimeoutMs:3000,idleTimeoutMs:10000,statementTimeoutMs:5000},worker:{poolMax:1,connectionTimeoutMs:3000,statementTimeoutMs:5000,processingDeadlineMs:20000,claimReserveMs:15000,eventLeaseSeconds:30,invocationLeaseSeconds:60,deliveryTimeoutMs:30000,recoveryIntervalSeconds:60}},capacity:{postgres:{maxConnections:60,superuserReservedConnections:3},sessionPoolerClientCeiling:{state:'UNKNOWN',value:null}},exposure:{audience:'PRIVATE_SYNTHETIC_OPERATORS',roleScope:'FIVE_REFERENCE_ROLES',gatewayPolicy:'EXISTING_PROTECTED_PREVIEW_AND_RESERVED_ORIGIN',clientAddressPolicy:'HOSTED_VERIFICATION_PENDING',fleetProtection:'NOT_VERIFIED'}});
 const boundExpected={...expected,stagingHostContract},preparedApproval=prepareBackendReleaseIntent({...JSON.parse(fixture.preparedApproval.canonicalJson),stagingHostContract},boundExpected),identity={...JSON.parse(fixture.identityBytes.toString()),originalPackageSha256:preparedApproval.sha256},intent={...JSON.parse(fixture.intentBytes.toString()),packageSha256:preparedApproval.sha256},activation={...JSON.parse(fixture.activationBytes.toString()),packageSha256:preparedApproval.sha256},cleanup={...JSON.parse(fixture.cleanupBytes.toString()),resultSha256:hash(activation)};
 return{...fixture,expected:boundExpected,preparedApproval,identityBytes:bytes(identity),intentBytes:bytes(intent),activationBytes:bytes(activation),cleanupBytes:bytes(cleanup)};
}

test('host-bearing original execution preserves the exact approved tuple package raw receipts and journal clocks',async()=>{
 const api=await subject(),fixture=hostBearingFixture(),journal=Buffer.from(fixture.journalBytes),proof=api.createOriginalWorkerActivationExecutionExport(fixture);
 assert.deepEqual(proof.envelope.originalExpected.stagingHostContract,fixture.expected.stagingHostContract);assert.equal(proof.envelope.originalPreparedApproval.sha256,fixture.preparedApproval.sha256);assert.equal(proof.originalIdentityFileSha256,rawHash(fixture.identityBytes));assert.equal(proof.envelope.originalFiles.activationSha256,rawHash(fixture.activationBytes));assert.deepEqual(fixture.journalBytes,journal);assert.equal(proof.envelope.exportedAt,new Date(fixture.now).toISOString());assert.deepEqual(api.validateOriginalWorkerActivationExecutionExport(proof.envelope,fixture.now),proof);
 for(const patch of[{sourceSha:'f'.repeat(40)},{targets:{...fixture.expected.stagingHostContract.targets,web:{...fixture.expected.stagingHostContract.targets.web,projectId:'prj_Other'}}},{privateToken:'PRIVATE injected'},{capacity:{...fixture.expected.stagingHostContract.capacity,sessionPoolerClientCeiling:{state:'UNKNOWN',value:0}}},{settings:{...fixture.expected.stagingHostContract.settings,api:{...fixture.expected.stagingHostContract.settings.api,fluid:false}}}])assert.throws(()=>api.validateOriginalWorkerActivationExecutionExport({...proof.envelope,originalExpected:{...proof.envelope.originalExpected,stagingHostContract:{...fixture.expected.stagingHostContract,...patch}}},fixture.now));
});

test('legacy host omission preserves exact original canonical export bytes and hashes',async()=>{
 const api=await subject();for(const[fixture,expectedHash]of[[originalWorkerExportFixture(),'99e283e0d298bda188ce870cad72a39fe47dc37ba1c5baa19bc3578048ce316f'],[providerWorkerExportFixture(),'db5e305681db51239afc5ed5c99aa25016224b7789538d524ab3a96ad736e019']]as const){const proof=api.createOriginalWorkerActivationExecutionExport(fixture);assert.equal(hash(proof.envelope),expectedHash);assert.equal(Object.hasOwn(proof.envelope.originalExpected,'stagingHostContract'),false);assert.equal(Object.hasOwn(JSON.parse(proof.envelope.originalPreparedApproval.canonicalJson),'stagingHostContract'),false);}
});

test('original export preserves exact raw file and canonical receipt hashes while excluding private configuration and key',async()=>{
 const api=await subject(),fixture=originalWorkerExportFixture(),before=Buffer.from(fixture.journalBytes),result=api.createOriginalWorkerActivationExecutionExport(fixture);
 assert.equal(result.effectAuthority,false);assert.equal(result.originalIdentityFileSha256,rawHash(fixture.identityBytes));assert.equal(result.envelope.originalFiles.activationSha256,rawHash(fixture.activationBytes));assert.equal(result.originalActivationSha256,hash(JSON.parse(fixture.activationBytes.toString('utf8'))));assert.notEqual(result.originalActivationSha256,result.envelope.originalFiles.activationSha256);assert.equal(result.originalWakeKeySha256,rawHash(wakeKey));assert.equal(result.originalRuntimeConfigurationSha256,hash(fixture.runtimeConfig));assert.deepEqual(fixture.journalBytes,before);
 const text=canonicalReleaseExecutionJson(result);assert.equal(text.includes(wakeKey),false);assert.equal(text.includes(fixture.runtimeConfig.privateCanary),false);assert.equal(text.includes(Buffer.from(fixture.runtimeConfig.privateCanary).toString('base64')),false);assert.deepEqual(api.validateOriginalWorkerActivationExecutionExport(result.envelope,now),result);
 const states=api.originalWorkerActivationPublicStates(result);assert.equal(states.configured.phase,'CONFIGURED');assert.equal(states.configured.cleanup,null);assert.equal(states.confirmed.phase,'CONFIRMED');assert.deepEqual(states.confirmed.cleanup,result.envelope.originalCleanup);assert.equal(hash(states.configured),result.configuredPublicStateSha256);assert.equal(hash(states.confirmed),result.confirmedPublicStateSha256);
});

test('original prepared package remains historical and must be valid at both execution and cleanup clocks',async()=>{
 const api=await subject(),fixture=originalWorkerExportFixture();assert.doesNotThrow(()=>api.createOriginalWorkerActivationExecutionExport(fixture));
 for(const field of ['source','run','attempt','package','cleanup-expired','execution-early','future','unknown-clock']){
  const input=originalWorkerExportFixture();
  if(field==='source')input.expected.releaseSha='f'.repeat(40);else if(field==='run')input.expected.releaseRunId='52';else if(field==='attempt')input.expected.runAttempt=2;else if(field==='package')input.preparedApproval.sha256='f'.repeat(64);else if(field==='unknown-clock')input.expected.now=NaN;else{const parsed=JSON.parse((field==='execution-early'?input.activationBytes:input.cleanupBytes).toString('utf8'));parsed.observedAt=field==='cleanup-expired'?'2026-10-07T13:00:00Z':field==='execution-early'?'2026-10-07T11:58:59Z':'2099-01-01T00:00:00Z';if(field==='execution-early')input.activationBytes=bytes(parsed);else input.cleanupBytes=bytes(parsed);}
  assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(input),field);
 }
});

test('only the exact successful frozen execution prefix is exported and later observation bytes do not advance it',async()=>{
 const api=await subject(),fixture=originalWorkerExportFixture(),expectedPrefix=fixture.journalBytes.toString('utf8');fixture.journalBytes=Buffer.concat([fixture.journalBytes,Buffer.from(canonicalReleaseExecutionJson({phase:'CONFIRMATION_OBSERVED',at:'2026-10-07T12:02:00Z',provisional:true})+'\n')]);const result=api.createOriginalWorkerActivationExecutionExport(fixture);assert.equal(result.envelope.originalJournalPrefix,expectedPrefix);assert.equal(result.originalJournalPrefixSha256,rawHash(expectedPrefix));
 for(const field of ['missing','duplicate','order','review','key','job','event','unknown','early-clock','newline','large']){
  const input=originalWorkerExportFixture(),rows=input.journalBytes.toString('utf8').trimEnd().split('\n').map(row=>JSON.parse(row));
  if(field==='missing')rows.splice(2,1);else if(field==='duplicate')rows.splice(3,0,rows[3]);else if(field==='order')[rows[4],rows[5]]=[rows[5],rows[4]];else if(field==='review')rows.at(-1).status='REQUIRES_REVIEW';else if(field==='key')rows[3].keySha256='f'.repeat(64);else if(field==='job')rows[13].jobId=43;else if(field==='event')rows[10].eventId='10000000-0000-4000-8000-000000000099';else if(field==='unknown')rows[2].private='PRIVATE leaked';else if(field==='early-clock')rows[5].at='2026-10-07T11:00:00Z';else if(field==='large')rows[2].padding='x'.repeat(65536);
  input.journalBytes=Buffer.from(rows.map(row=>canonicalReleaseExecutionJson(row)).join('\n')+(field==='newline'?'':'\n'));assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(input),field);
 }
});

test('original export refuses malformed raw files and every changed original state receipt or digest',async()=>{
 const api=await subject();
 for(const field of ['identity','intent','activation','cleanup','raw','bom','utf8','extra','hash']){
  const input=originalWorkerExportFixture();if(field==='raw')input.identityBytes=Buffer.from(input.identityBytes.toString('utf8').trimEnd());else if(field==='bom')input.intentBytes=Buffer.concat([Buffer.from([239,187,191]),input.intentBytes]);else if(field==='utf8')input.intentBytes=Buffer.from([255]);else{
   const key=field==='identity'?'identityBytes':field==='intent'?'intentBytes':field==='cleanup'?'cleanupBytes':'activationBytes',value=JSON.parse(input[key].toString('utf8'));if(field==='identity')value.createdAt='2026-10-07T12:03:00Z';else if(field==='intent')value.originalKey+=':changed';else if(field==='activation')value.sourceProcessed=false;else if(field==='cleanup')value.lockReleased=false;else value.private='PRIVATE leaked';input[key]=bytes(value);
  }assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(input),field);
 }
 const result=api.createOriginalWorkerActivationExecutionExport(originalWorkerExportFixture());for(const field of ['identitySha256','intentSha256','activationSha256','cleanupSha256','journalPrefixSha256'])assert.throws(()=>api.validateOriginalWorkerActivationExecutionExport({...result.envelope,originalFiles:{...result.envelope.originalFiles,[field]:'f'.repeat(64)}},now));
});

test('strict original expected prepared and producer allowlists refuse private unknown values instead of copying them',async()=>{
 const api=await subject();for(const field of ['expected','prepared','activation','recovery','intent','identity','cleanup']){
  const input=originalWorkerExportFixture();if(field==='expected')Object.assign(input.expected,{providerToken:'PRIVATE injected'});else if(field==='prepared')Object.assign(input.preparedApproval,{runtime:'PRIVATE injected'});else{const key=field==='intent'?'intentBytes':field==='identity'?'identityBytes':field==='cleanup'?'cleanupBytes':'activationBytes',value=JSON.parse(input[key].toString('utf8'));if(field==='recovery')value.recovery.provider='PRIVATE injected';else value.provider='PRIVATE injected';input[key]=bytes(value);}assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(input),field);
 }
 const result=api.createOriginalWorkerActivationExecutionExport(originalWorkerExportFixture());assert.throws(()=>api.validateOriginalWorkerActivationExecutionExport({...result.envelope,provider:'PRIVATE injected'},now));assert.throws(()=>api.validateOriginalWorkerActivationExecutionExport({...result.envelope,originalJournalPrefix:result.envelope.originalJournalPrefix+'x'.repeat(256*1024)},now));assert.throws(()=>api.validateOriginalWorkerActivationExecutionExport(new Proxy(result.envelope,{}),now));
 const extraInput={...originalWorkerExportFixture(),extra:'PRIVATE injected'};assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(extraInput));
});

test('original export refuses impossible snapshot clocks and execution journal terminal time after cleanup',async()=>{
 const api=await subject(),input=originalWorkerExportFixture();input.expected.now=Date.parse('2099-01-01T00:00:00Z');assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(input));
 const changed=originalWorkerExportFixture(),rows=changed.journalBytes.toString('utf8').trimEnd().split('\n').map(row=>JSON.parse(row));rows.at(-1).at='2026-10-07T12:01:02Z';changed.journalBytes=Buffer.from(rows.map(row=>canonicalReleaseExecutionJson(row)+'\n').join(''));assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(changed));
});

test('frozen original prefix remains usable when a bounded later journal grows without granting suffix authority',async()=>{
 const api=await subject(),fixture=originalWorkerExportFixture(),prefix=fixture.journalBytes.toString('utf8');fixture.journalBytes=Buffer.concat([fixture.journalBytes,Buffer.from('untrusted late bytes\n'.repeat(5000))]);assert.equal(api.createOriginalWorkerActivationExecutionExport(fixture).envelope.originalJournalPrefix,prefix);
 const large=originalWorkerExportFixture();large.journalBytes=Buffer.alloc(1024*1024+1,32);assert.throws(()=>api.createOriginalWorkerActivationExecutionExport(large));
});

test('provider original export retains distinct raw configuration bytes and exact false-manual proof without rewriting legacy export',async()=>{const api=await subject(),input=providerWorkerExportFixture(),proof=api.createOriginalWorkerActivationExecutionExport(input);assert.equal(proof.envelope.version,2);assert.equal(proof.envelope.originalActivation.configurationEvidenceObservedManual,false);assert.equal(proof.envelope.originalConfigurationBytesBase64,input.configurationBytes.toString('base64'));assert.equal(proof.envelope.originalIntent.configurationEvidenceSha256,rawHash(input.configurationBytes));assert.deepEqual(api.validateOriginalWorkerActivationExecutionExport(proof.envelope,now),proof);for(const patch of[{version:1},{originalConfigurationBytesBase64:undefined},{originalActivation:{...proof.envelope.originalActivation,configurationEvidenceObservedManual:true}},{originalIntent:{...proof.envelope.originalIntent,configurationEvidenceSha256:proof.envelope.originalActivation.configurationObservation!.sha256}}])assert.throws(()=>api.validateOriginalWorkerActivationExecutionExport({...proof.envelope,...patch},now));const legacy=api.createOriginalWorkerActivationExecutionExport(originalWorkerExportFixture());assert.equal(legacy.envelope.version,1);assert.equal('originalConfigurationBytesBase64'in legacy.envelope,false);});

test('new original configuration optional input cannot execute a supplied getter',async()=>{const api=await subject(),input=originalWorkerExportFixture();let reads=0;assert.throws(()=>api.createOriginalWorkerActivationExecutionExport({...input,get configurationBytes(){reads++;return Buffer.from('{}');}}));assert.equal(reads,0);});
