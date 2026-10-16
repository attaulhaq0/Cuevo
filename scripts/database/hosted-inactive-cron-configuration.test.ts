import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {inactiveCronDefinitionContractFixture} from './hosted-inactive-cron-definition.fixture';
import {prepareInactiveCronDefinitionContext,prepareInactiveCronDefinitionIntent,prepareInactiveCronDefinitionAcknowledgedJournal,preparePersistedInactiveCronAcknowledgementSelection,type NativeInactiveCronDefinitionAcknowledgementMetadata,type NativeReboundInactiveCronDefinitionAcknowledgementMetadata} from './hosted-inactive-cron-definition-contracts';
import {original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const native=new WeakMap<object,{context:string;receipt:NativeInactiveCronDefinitionAcknowledgementMetadata;live:boolean}>();
const reboundNative=new WeakMap<object,{original:string;current:string;receipt:NativeReboundInactiveCronDefinitionAcknowledgementMetadata;live:boolean}>();
let nativeReads=0;
Object.assign(globalThis,{inactiveConfigNativeRead:async(token:unknown,context:unknown)=>{
 nativeReads++;const row=token&&typeof token==='object'?native.get(token):undefined;
 if(!row||!row.live||row.context!==JSON.stringify(context))throw Error('Controlled native acknowledgement unavailable');
 return structuredClone(row.receipt);
}});
Object.assign(globalThis,{inactiveConfigReboundNativeRead:async(token:unknown,expected:{originalContext:unknown;currentContext:unknown})=>{const row=token&&typeof token==='object'?reboundNative.get(token):undefined;if(!row||!row.live||row.original!==JSON.stringify(expected.originalContext)||row.current!==JSON.stringify(expected.currentContext))throw Error('Controlled read-only native token unavailable');return structuredClone(row.receipt);}});
registerHooks({load(url,context,next){if(url.endsWith('/hosted-migration-database.ts'))return{format:'module',shortCircuit:true,source:'export const readNativeInactiveCronDefinitionAcknowledgement=(token,context)=>globalThis.inactiveConfigNativeRead(token,context);export const readNativeReboundInactiveCronDefinitionAcknowledgement=(token,expected)=>globalThis.inactiveConfigReboundNativeRead(token,expected);'};return next(url,context);}});
async function fixture(){
 const{now:_,...input}=inactiveCronDefinitionContractFixture();void _;const context=prepareInactiveCronDefinitionContext(input),intent=prepareInactiveCronDefinitionIntent(context),now=Date.now();
 const journal=prepareInactiveCronDefinitionAcknowledgedJournal(context,{intentPayloadSha256:hash(intent),beforeHistorySha256:context.original231.afterHistorySha256,afterHistorySha256:context.catalogueReference232.migrationRowsSha256,catalogueSha256:context.catalogueReference232.catalogueSummary.sha256,disabledDefinitionsFactsSha256:'9'.repeat(64),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,nativeProofBeganAtMs:now-20,observedAtMs:now-10,cli:{kind:'EXITED',exitCode:0,exitedAtMs:now-15},installedMarkerSha256:context.original231.installedMarkerSha256,cronInstalled:false,runtimeLogin:false,dispatchEnabled:false,activeLeases:0,schoolCount:0,authUserCount:0});
 const receipt={version:1 as const,purpose:'CUEVO_NATIVE_INACTIVE_CRON_DEFINITION_ACKNOWLEDGEMENT' as const,evidence:'NATIVE_DATABASE_OWNED_DISABLED_DEFINITION_ACKNOWLEDGEMENT' as const,context,journal:journal as NativeInactiveCronDefinitionAcknowledgementMetadata['journal'],durable:{localPayloadSha256:hash(journal),remotePayloadSha256:hash(journal),localChainSha256:'8'.repeat(64),remoteChainSha256:'8'.repeat(64),acknowledgedAtMs:now-5},currentNativeProofBeganAtMs:now-4,currentObservedAtMs:now-3,packageExpiresAtMs:now+30000,effectScope:'SQL_CRON_CONFIGURATION_ONLY' as const,effectAuthority:false as const,foundationAccepted:false as const,activationAuthorized:false as const},token=Object.freeze({});
 native.set(token,{context:JSON.stringify(context),receipt,live:true});return{token,context,receipt};
}
const api=()=>import('./hosted-inactive-cron-configuration');

test('rebound configuration consumes only a fresh read token and keeps the original identity separate',async()=>{
 const subject=await api(),input=await fixture(),{now:_,...currentInput}=inactiveCronDefinitionContractFixture();void _;const currentContext=prepareInactiveCronDefinitionContext({...currentInput,releaseRunId:'64',identity:{...currentInput.identity,approvalDigest:'e'.repeat(64)}}),selection=preparePersistedInactiveCronAcknowledgementSelection({context:input.context,journalPayloadSha256:input.receipt.durable.localPayloadSha256,journalChainSha256:input.receipt.durable.localChainSha256}),receipt={...input.receipt,version:2 as const,readAdmission:{purpose:'CUEVO_CURRENT_PERSISTED_INACTIVE_ACK_READ_ADMISSION' as const,currentContext,selection,effectAuthority:false as const,activationAuthorized:false as const}},token=Object.freeze({});
 reboundNative.set(token,{original:JSON.stringify(input.context),current:JSON.stringify(currentContext),receipt,live:true});const result=await subject.admitReboundInactiveCronDefinitionConfiguration({acknowledgement:token,originalContext:input.context,currentContext});assert.deepEqual(result.originalIdentity,input.context.identity);assert.deepEqual(result.currentIdentity,currentContext.identity);assert.equal(result.configurationExecution,'NOT_EXECUTED');assert.equal(result.activationAuthorized,false);
 await assert.rejects(subject.admitInactiveCronDefinitionConfiguration({acknowledgement:token,context:input.context}));
 for(const value of[{},true,input.receipt,receipt,input.token])await assert.rejects(subject.admitReboundInactiveCronDefinitionConfiguration({acknowledgement:value,originalContext:input.context,currentContext}));
 const saved=reboundNative.get(token)!;saved.live=false;await assert.rejects(subject.admitReboundInactiveCronDefinitionConfiguration({acknowledgement:token,originalContext:input.context,currentContext}));saved.live=true;saved.receipt={...receipt,packageExpiresAtMs:Date.now()-1};await assert.rejects(subject.admitReboundInactiveCronDefinitionConfiguration({acknowledgement:token,originalContext:input.context,currentContext}));
});
test('configuration admission consumes the native token and remains read-only and activation-unaccepted',async()=>{
 const subject=await api(),input=await fixture(),before=nativeReads,result=await subject.admitInactiveCronDefinitionConfiguration({acknowledgement:input.token,context:input.context});
 assert.equal(nativeReads,before+1);assert.equal(result.effectScope,'SQL_CRON_CONFIGURATION_ONLY');assert.equal(result.effectAuthority,false);assert.equal(result.foundationAccepted,false);assert.equal(result.activationAuthorized,false);assert.equal(result.configurationExecution,'NOT_EXECUTED');assert.equal(result.contextSha256,input.context.contextSha256);
 assert.equal('run'in result,false);assert.equal('token'in result,false);assert.equal('register'in subject,false);
});
test('JSON, booleans, foreign tokens, expired acknowledgements and durable drift cannot admit configuration',async()=>{
 const subject=await api(),input=await fixture();
 for(const token of[{},true,input.receipt,JSON.parse(JSON.stringify(input.token))])await assert.rejects(subject.admitInactiveCronDefinitionConfiguration({acknowledgement:token,context:input.context}),/requires review/);
 const stored=native.get(input.token)!;
 for(const mode of['inactive','expired','stale','chain','payload','context','activation']){
  stored.live=true;stored.receipt=structuredClone(input.receipt);
  if(mode==='inactive')stored.live=false;
  if(mode==='expired')stored.receipt.packageExpiresAtMs=Date.now()-1;
  if(mode==='stale')stored.receipt.currentNativeProofBeganAtMs=Date.now()-30001;
  if(mode==='chain')stored.receipt.durable.remoteChainSha256='0'.repeat(64);
  if(mode==='payload')stored.receipt.durable.remotePayloadSha256='0'.repeat(64);
  if(mode==='context')stored.receipt.context.contextSha256='0'.repeat(64);
  if(mode==='activation')Object.assign(stored.receipt,{activationAuthorized:true});
  await assert.rejects(subject.admitInactiveCronDefinitionConfiguration({acknowledgement:input.token,context:input.context}),/requires review/,mode);
 }
});
test('configuration input rejects caller getters and proxies before any native read',async()=>{
 const subject=await api(),input=await fixture(),before=nativeReads;let calls=0;
 const metadata=Object.defineProperty({context:input.context},'acknowledgement',{enumerable:true,get(){calls++;return input.token;}});
 await assert.rejects(subject.admitInactiveCronDefinitionConfiguration(metadata),/requires review/);
 await assert.rejects(subject.admitInactiveCronDefinitionConfiguration(new Proxy({acknowledgement:input.token,context:input.context},{ownKeys(){calls++;throw Error('must not run');}})),/requires review/);
 assert.equal(calls,0);assert.equal(nativeReads,before);
});
