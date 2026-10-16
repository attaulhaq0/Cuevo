import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {inactiveCronDefinitionContractFixture as fixture} from './hosted-inactive-cron-definition.fixture';
import {original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';
import {parseHostedExecutionJournal} from './hosted-migration-journal-contracts';

const payloadHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const api=()=>import('./hosted-inactive-cron-definition-contracts');

test('persisted ACK selection keeps old context while a fresh same-source admission stays separate',async()=>{
 const subject=await api(),{now:_,...input}=fixture();void _;const original=subject.prepareInactiveCronDefinitionContext(input),current=subject.prepareInactiveCronDefinitionContext({...input,releaseRunId:'64',identity:{...input.identity,approvalDigest:'e'.repeat(64)}});
 assert.equal(typeof subject.preparePersistedInactiveCronAcknowledgementSelection,'function');
 const selection=subject.preparePersistedInactiveCronAcknowledgementSelection({context:original,journalPayloadSha256:'a'.repeat(64),journalChainSha256:'b'.repeat(64)});
 const rebound=subject.readPersistedInactiveCronAcknowledgementSelection(selection,current);
 assert.deepEqual(rebound.context,original);assert.notEqual(current.identity.approvalDigest,original.identity.approvalDigest);assert.equal(selection.effectAuthority,false);
 assert.throws(()=>subject.readPersistedInactiveCronAcknowledgementSelection({...selection,effectAuthority:true},current));
 const different=structuredClone(current);different.identity.sourceSha='0'.repeat(40);assert.throws(()=>subject.readPersistedInactiveCronAcknowledgementSelection(selection,different));
});

test('rebound native metadata retains old journal and rejects current identity or persisted payload drift',async()=>{
 const subject=await api(),{now:_,...input}=fixture();void _;const original=subject.prepareInactiveCronDefinitionContext(input),current=subject.prepareInactiveCronDefinitionContext({...input,releaseRunId:'64',identity:{...input.identity,approvalDigest:'e'.repeat(64)}}),intent=subject.prepareInactiveCronDefinitionIntent(original),now=Date.now();
 const journal=subject.prepareInactiveCronDefinitionAcknowledgedJournal(original,{intentPayloadSha256:payloadHash(intent),beforeHistorySha256:original.original231.afterHistorySha256,afterHistorySha256:original.catalogueReference232.migrationRowsSha256,catalogueSha256:original.catalogueReference232.catalogueSummary.sha256,disabledDefinitionsFactsSha256:'9'.repeat(64),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,nativeProofBeganAtMs:now-200,observedAtMs:now-100,cli:{kind:'EXITED',exitCode:0,exitedAtMs:now-150},installedMarkerSha256:original.original231.installedMarkerSha256,cronInstalled:false,runtimeLogin:false,dispatchEnabled:false,activeLeases:0,schoolCount:0,authUserCount:0}),selection=subject.preparePersistedInactiveCronAcknowledgementSelection({context:original,journalPayloadSha256:payloadHash(journal),journalChainSha256:'8'.repeat(64)}),receipt={version:2,purpose:'CUEVO_NATIVE_INACTIVE_CRON_DEFINITION_ACKNOWLEDGEMENT',evidence:'NATIVE_DATABASE_OWNED_DISABLED_DEFINITION_ACKNOWLEDGEMENT',context:original,journal,durable:{localPayloadSha256:payloadHash(journal),remotePayloadSha256:payloadHash(journal),localChainSha256:'8'.repeat(64),remoteChainSha256:'8'.repeat(64),acknowledgedAtMs:now-50},currentNativeProofBeganAtMs:now-40,currentObservedAtMs:now-10,packageExpiresAtMs:now+30000,effectScope:'SQL_CRON_CONFIGURATION_ONLY',effectAuthority:false,foundationAccepted:false,activationAuthorized:false,readAdmission:{purpose:'CUEVO_CURRENT_PERSISTED_INACTIVE_ACK_READ_ADMISSION',currentContext:current,selection,effectAuthority:false,activationAuthorized:false}},expected={originalContext:original,currentContext:current,now,expiresAtMs:now+30000};
 const accepted=subject.readNativeReboundInactiveCronDefinitionAcknowledgementMetadata(receipt,expected);assert.deepEqual(accepted.journal,journal);assert.equal(accepted.context.identity.approvalDigest,original.identity.approvalDigest);assert.equal(accepted.readAdmission.currentContext.identity.approvalDigest,current.identity.approvalDigest);
 for(const patch of[{version:1},{readAdmission:{...receipt.readAdmission,currentContext:original}},{durable:{...receipt.durable,localPayloadSha256:'0'.repeat(64)}},{activationAuthorized:true}])assert.throws(()=>subject.readNativeReboundInactiveCronDefinitionAcknowledgementMetadata({...receipt,...patch},expected));
});

test('inactive definition context retains original231 uncertainty and accepts only the exact232 source binding',async()=>{
 const subject=await api(),input=fixture(),{now:_,...value}=input;void _;const context=subject.prepareInactiveCronDefinitionContext(value);
 assert.equal(context.effectAuthority,false);assert.equal(context.foundationAccepted,false);assert.equal(context.original231.confirmedBatchCount,2);assert.equal(context.original231.thirdBatchConfirmation,'NOT_CONFIRMED');assert.equal(context.original231.originalStageCommitment,'UNKNOWN');
 assert.equal(context.append.sha256,'b4e4692ae0bced49d5510d5079603055ccf48f7d4ba8e26f7a5251a3c6cf3b40');assert.equal(context.original231.installedMarkerSha256,input.plan.original231Recovery.template.installedMarkerSha256);
 assert.deepEqual(subject.readInactiveCronDefinitionContext(context),context);
 for(const mode of['plan','source','run','rows','inventory','query','original']){
  const changed=fixture();
  if(mode==='plan')changed.identity.planSha256='0'.repeat(64);
  if(mode==='source')changed.catalogueReference232.sourceSha='0'.repeat(40);
  if(mode==='run')changed.identity.ciRunId='63';
  if(mode==='rows')changed.catalogueReference232.migrationRowsSha256='0'.repeat(64);
  if(mode==='inventory')changed.catalogueReference232.sourceInventorySha256='0'.repeat(64);
  if(mode==='query')changed.catalogueReference232.postconditionQuerySha256='0'.repeat(64);
  if(mode==='original')changed.plan.original231Recovery.template.thirdBatchReceipt={} as never;
  const{now:_,...value}=changed;void _;assert.throws(()=>subject.prepareInactiveCronDefinitionContext(value),/requires review/,mode);
 }
});

test('v3 acknowledgement describes disabled definitions only and cannot be parsed as a V1 full-stage commit',async()=>{
 const subject=await api(),{now,...input}=fixture(),context=subject.prepareInactiveCronDefinitionContext(input),intent=subject.prepareInactiveCronDefinitionIntent(context);
 const proof={intentPayloadSha256:payloadHash(intent),beforeHistorySha256:context.original231.afterHistorySha256,afterHistorySha256:context.catalogueReference232.migrationRowsSha256,catalogueSha256:context.catalogueReference232.catalogueSummary.sha256,disabledDefinitionsFactsSha256:'9'.repeat(64),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,nativeProofBeganAtMs:now,observedAtMs:now+100,cli:{kind:'EXITED',exitCode:0,exitedAtMs:now+50},installedMarkerSha256:context.original231.installedMarkerSha256,cronInstalled:false,runtimeLogin:false,dispatchEnabled:false,activeLeases:0,schoolCount:0,authUserCount:0};
 const acknowledged=subject.prepareInactiveCronDefinitionAcknowledgedJournal(context,proof);
 assert.equal(acknowledged.state,'INACTIVE_DEFINITIONS_ACKNOWLEDGED');assert.equal(acknowledged.foundationAccepted,false);assert.equal(acknowledged.effectAuthority,false);assert.equal(subject.canAppendInactiveCronDefinitionJournal(intent,acknowledged),true);
 assert.throws(()=>parseHostedExecutionJournal(acknowledged));assert.deepEqual(subject.parseInactiveCronDefinitionJournal(acknowledged,context),acknowledged);
 for(const mode of['intent','history','marker','cron','login','dispatch','school','auth','clock','exit','authority']){
  const changed=structuredClone(acknowledged);
  if(mode==='intent')changed.acknowledgement!.intentPayloadSha256='0'.repeat(64);
  if(mode==='history')changed.acknowledgement!.afterHistorySha256='0'.repeat(64);
  if(mode==='marker')changed.acknowledgement!.installedMarkerSha256='0'.repeat(64);
  if(mode==='cron')Object.assign(changed.acknowledgement!,{cronInstalled:true});
  if(mode==='login')Object.assign(changed.acknowledgement!,{runtimeLogin:true});
  if(mode==='dispatch')Object.assign(changed.acknowledgement!,{dispatchEnabled:true});
  if(mode==='school')Object.assign(changed.acknowledgement!,{schoolCount:1});
  if(mode==='auth')Object.assign(changed.acknowledgement!,{authUserCount:1});
  if(mode==='clock')changed.acknowledgement!.observedAtMs=now-1;
  if(mode==='exit')Object.assign(changed.acknowledgement!.cli,{exitCode:1});
  if(mode==='authority')Object.assign(changed,{effectAuthority:true});
  assert.throws(()=>subject.parseInactiveCronDefinitionJournal(changed,context),/requires review/,mode);
 }
 assert.equal(subject.canAppendInactiveCronDefinitionJournal(null,acknowledged),false);
 assert.equal(subject.canAppendInactiveCronDefinitionJournal(intent,{version:1,identity:context.identity,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'}),false);
});

test('inactive journal JSON validators reject proxies and accessors without executing caller code',async()=>{
 const subject=await api(),{now:_,...input}=fixture();void _;const context=subject.prepareInactiveCronDefinitionContext(input),intent=subject.prepareInactiveCronDefinitionIntent(context);let reads=0;
 const trapped=Object.defineProperty({...intent},'context',{enumerable:true,get(){reads++;throw Error('must not run');}});
 assert.throws(()=>subject.parseInactiveCronDefinitionJournal(trapped),/requires review/);assert.equal(reads,0);
 assert.throws(()=>subject.parseInactiveCronDefinitionJournal(new Proxy(intent,{get(){reads++;throw Error('must not run');}})),/requires review/);assert.equal(reads,0);
 assert.equal(Object.hasOwn(subject,'registerNativeAcknowledgement'),false);
});
