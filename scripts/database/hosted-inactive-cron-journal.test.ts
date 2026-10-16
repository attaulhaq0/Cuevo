import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {inactiveCronDefinitionContractFixture} from './hosted-inactive-cron-definition.fixture';
import {prepareInactiveCronDefinitionContext,prepareInactiveCronDefinitionIntent,prepareInactiveCronDefinitionAcknowledgedJournal,type InactiveCronDefinitionJournal} from './hosted-inactive-cron-definition-contracts';
import {original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type State={token:object;live:boolean;local:InactiveCronDefinitionJournal|null;remote:InactiveCronDefinitionJournal|null;identity:unknown;events:string[];mode:string;publication:object|null;context:unknown};
let state:State;
const chainHash='8'.repeat(64);
Object.assign(globalThis,{inactiveJournalNativeGuard:(token:unknown,identity:unknown,payload?:unknown,safety=false)=>{
 if(token!==state.token||hash(identity)!==hash(state.identity)||!safety&&!state.live)throw Error('Controlled unavailable native permit');
 if(payload&&hash((payload as InactiveCronDefinitionJournal).context)!==hash(state.context))throw Error('Controlled foreign context');state.events.push(safety?'safety':'native');return{originalOperationSha256:'a'.repeat(64),originalIdentity:state.identity,originalChainSha256:'b'.repeat(64),receiptSha256:'c'.repeat(64)};
}});
Object.assign(globalThis,{inactiveJournalLocal:async()=>({
 readJournal:async()=>{state.events.push('local-read');return structuredClone(state.local);},
 writeJournal:async(payload:InactiveCronDefinitionJournal)=>{state.events.push('local-write:'+payload.state);state.local=structuredClone(payload);return{kind:'SYNCED',sha256:hash(payload)};},
 readInactiveDefinitionAcknowledgement:async()=>{state.events.push('local-ack');return{journal:structuredClone(state.local),payloadSha256:hash(state.local),chainSha256:chainHash};},
})});
Object.assign(globalThis,{inactiveJournalRemote:async()=>({
 readJournal:async()=>{state.events.push('remote-read');return structuredClone(state.remote);},
 readOwnedSafetyJournal:async()=>structuredClone(state.remote),
 compareAndWriteJournal:async(prior:InactiveCronDefinitionJournal|null,payload:InactiveCronDefinitionJournal)=>{
  state.events.push('remote-write:'+payload.state);if(hash(prior)!==hash(state.remote))return{kind:'UNCONFIRMED'};
  state.remote=structuredClone(payload);if(state.mode==='terminal-failure'&&payload.state==='INACTIVE_DEFINITIONS_ACKNOWLEDGED')return{kind:'UNCONFIRMED'};
  state.publication=Object.freeze({});return{kind:'SYNCED',sha256:hash(payload),payload:structuredClone(payload),publication:state.publication};
 },
 inspectProject:async()=>{state.events.push('remote-census');if(state.mode==='late-expiry')state.live=false;return{evidence:'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA',projectRef:'mqxdjvsyckzocokuikmx',observedAtMs:Date.now(),sha256:'7'.repeat(64),operations:[{operation:hash(state.identity),identity:state.identity,state:state.remote?.state,chainSha256:state.mode==='chain-drift'?'0'.repeat(64):chainHash,objects:[{path:'owner.json',sha256:'1'.repeat(64),size:100},{path:'000001.record.json',sha256:'2'.repeat(64),size:100},{path:'000002.record.json',sha256:'3'.repeat(64),size:100}]}]};},
})});
registerHooks({load(url,context,next){
 if(url.endsWith('/hosted-migration-database.ts'))return{format:'module',shortCircuit:true,source:`
 export const assertNativeOriginal231TransportAppendPermit=(token,identity)=>globalThis.inactiveJournalNativeGuard(token,identity);
 export const assertNativeOriginal231TransportAppendSafetyRecord=(token,identity)=>globalThis.inactiveJournalNativeGuard(token,identity,undefined,true);
 export const assertNativeOriginal231TransportAppendJournalPermit=(token,identity,payload)=>globalThis.inactiveJournalNativeGuard(token,identity,payload);
 export const readNativeInactiveCronJournalPublicationAcknowledgement=(ticket,identity,payload)=>globalThis.inactiveJournalNativeGuard(globalThis.inactiveJournalToken,identity,payload);
 `};
 if(url.endsWith('/hosted-migration-journal.ts'))return{format:'module',shortCircuit:true,source:'export const createHostedMigrationJournal=globalThis.inactiveJournalLocal; export const createHostedInactiveCronDefinitionJournal=globalThis.inactiveJournalLocal;'};
 if(url.endsWith('/hosted-migration-remote-journal.ts'))return{format:'module',shortCircuit:true,source:'export const createHostedMigrationRemoteJournal=globalThis.inactiveJournalRemote; export const createHostedInactiveCronDefinitionRemoteJournal=globalThis.inactiveJournalRemote;'};
 return next(url,context);
}});
async function fixture(run:(input:Record<string,unknown>,intent:InactiveCronDefinitionJournal,terminal:InactiveCronDefinitionJournal)=>Promise<void>){
 const{now:_,...prepared}=inactiveCronDefinitionContractFixture();void _;const context=prepareInactiveCronDefinitionContext(prepared),intent=prepareInactiveCronDefinitionIntent(context),now=Date.now(),terminal=prepareInactiveCronDefinitionAcknowledgedJournal(context,{intentPayloadSha256:hash(intent),beforeHistorySha256:context.original231.afterHistorySha256,afterHistorySha256:context.catalogueReference232.migrationRowsSha256,catalogueSha256:context.catalogueReference232.catalogueSummary.sha256,disabledDefinitionsFactsSha256:'9'.repeat(64),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,nativeProofBeganAtMs:now-20,observedAtMs:now-10,cli:{kind:'EXITED',exitCode:0,exitedAtMs:now-15},installedMarkerSha256:context.original231.installedMarkerSha256,cronInstalled:false,runtimeLogin:false,dispatchEnabled:false,activeLeases:0,schoolCount:0,authUserCount:0}),repoRoot=await mkdtemp(join(tmpdir(),'cuevo-inactive-journal-'));
 try{await mkdir(join(repoRoot,'.local','hosted-release'),{recursive:true});state={token:Object.freeze({}),live:true,local:null,remote:null,identity:context.identity,context,events:[],mode:'',publication:null};Object.assign(globalThis,{inactiveJournalToken:state.token});await run({repoRoot,journalRoot:join(repoRoot,'.local','hosted-release','journal-inactive-definition'),projectRef:context.identity.projectRef,boundProjectRef:context.identity.projectRef,identity:context.identity,storageKey:'controlled-private-storage-token',providerToken:'controlled-private-provider-token',reconciliationPermit:state.token,inactiveDefinitionContext:context},intent,terminal);}finally{assert.ok(resolve(repoRoot).startsWith(resolve(tmpdir())+sep));await rm(repoRoot,{recursive:true,force:true});}
}

test('inactive dual journals acknowledge only after actual matching terminal payloads and chain readbacks',async()=>{
 const{createHostedInactiveCronDefinitionDurableJournal}=await import('./hosted-migration-durable-journal');assert.equal(typeof createHostedInactiveCronDefinitionDurableJournal,'function');
 await fixture(async(input,intent,terminal)=>{const journal=await createHostedInactiveCronDefinitionDurableJournal(input);assert.equal((await journal.writeJournal(intent)).kind,'SYNCED');assert.equal((await journal.writeJournal(terminal)).kind,'SYNCED');const receipt=await journal.readInactiveDefinitionAcknowledgement();assert.deepEqual(receipt.journal,terminal);assert.equal(receipt.localPayloadSha256,hash(terminal));assert.equal(receipt.remotePayloadSha256,hash(terminal));assert.equal(receipt.localChainSha256,receipt.remoteChainSha256);assert.ok(state.events.includes('remote-census'));assert.equal(state.events.filter(event=>event==='local-ack').length,2);assert.equal(receipt.journal.foundationAccepted,false);});
});
test('matching supplied SYNCED cannot overcome a failed terminal publication, late expiry or chain drift',async()=>{
 const{createHostedInactiveCronDefinitionDurableJournal}=await import('./hosted-migration-durable-journal');
 for(const mode of['terminal-failure','late-expiry','chain-drift'])await fixture(async(input,intent,terminal)=>{const journal=await createHostedInactiveCronDefinitionDurableJournal(input);assert.equal((await journal.writeJournal(intent)).kind,'SYNCED');state.mode=mode;const result=await journal.writeJournal(terminal);if(mode==='terminal-failure')assert.equal(result.kind,'UNCONFIRMED');else assert.equal(result.kind,'SYNCED');await assert.rejects(journal.readInactiveDefinitionAcknowledgement(),/require(?:s)? review/,mode);const writes=state.events.filter(event=>event.startsWith('remote-write:')).length;assert.equal((await journal.writeJournal(terminal)).kind,'UNCONFIRMED');assert.equal(state.events.filter(event=>event.startsWith('remote-write:')).length,writes);});
});
test('native-token absence and V1 payloads cannot enter the dedicated inactive-definition writer',async()=>{
 const{createHostedInactiveCronDefinitionDurableJournal}=await import('./hosted-migration-durable-journal');
 await fixture(async(input,intent)=>{await assert.rejects(createHostedInactiveCronDefinitionDurableJournal({...input,reconciliationPermit:{}}),/require(?:s)? review/);const journal=await createHostedInactiveCronDefinitionDurableJournal(input);assert.equal((await journal.writeJournal({version:1,identity:intent.identity,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'} as never)).kind,'UNCONFIRMED');assert.equal(state.local,null);assert.equal(state.remote,null);});
});
