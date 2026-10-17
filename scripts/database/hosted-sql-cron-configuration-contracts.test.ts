import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {inactiveCronDefinitionContractFixture} from './hosted-inactive-cron-definition.fixture';
import {prepareInactiveCronDefinitionContext,preparePersistedInactiveCronAcknowledgementSelection} from './hosted-inactive-cron-definition-contracts';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

type Subject={prepareSqlCronConfigurationIntent:(value:unknown)=>Record<string,unknown>;readSqlCronConfigurationIntent:(value:unknown,expected:unknown)=>Record<string,unknown>;readSqlCronConfigurationObservation:(value:unknown,expected:unknown)=>Record<string,unknown>};
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
async function api(){let subject:Record<string,unknown>={};try{subject=await import('./hosted-sql-cron-configuration-contracts');}catch{/* Missing contract is the first regression. */}assert.equal(typeof subject.prepareSqlCronConfigurationIntent,'function');assert.equal(typeof subject.readSqlCronConfigurationIntent,'function');assert.equal(typeof subject.readSqlCronConfigurationObservation,'function');return subject as unknown as Subject;}
let cachedFixture:ReturnType<typeof prepareFixture>|undefined;
function fixture(){return structuredClone(cachedFixture??=prepareFixture());}
function prepareFixture(){
 const{now:_,...input}=inactiveCronDefinitionContractFixture();void _;const context=prepareInactiveCronDefinitionContext(input),selection=preparePersistedInactiveCronAcknowledgementSelection({context,journalPayloadSha256:'8'.repeat(64),journalChainSha256:'9'.repeat(64)}),now=1792240000000;
 return{current:{projectRef:context.identity.projectRef,sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),ciRunId:'71',releaseRunId:'72',releaseRunAttempt:1,packageSha256:'c'.repeat(64),sourceManifestSha256:'d'.repeat(64),databaseUrl:context.identity.databaseUrl,certificateSha256:context.identity.certificateSha256,installedHistorySha256:context.catalogueReference232.migrationRowsSha256},originalAcknowledgement:selection,beforeStateSha256:'e'.repeat(64),configurationOverlaySha256:'f'.repeat(64),preparedAtMs:now,expiresAtMs:now+3600000,now};
}

test('new configuration intent retains original acknowledgement and current source as separate review metadata',async()=>{
 const subject=await api(),input=fixture(),intent=subject.prepareSqlCronConfigurationIntent(input);
 assert.equal(intent.purpose,'CUEVO_SQL_CRON_CONFIGURATION_INTENT');assert.equal(intent.action,'PREPARE_INACTIVE');
 assert.deepEqual(intent.current,input.current);assert.deepEqual(intent.originalAcknowledgement,input.originalAcknowledgement);
 assert.deepEqual(intent.job,{name:'cuevo-sql-outbox-v2',schedule:'1 second',command:'CALL internal.run_sql_worker(1);',generation:'1',username:'postgres',database:'postgres',active:false});
 assert.equal(intent.effectAuthority,false);assert.equal(intent.activationAuthorized,false);assert.equal(intent.foundationAccepted,false);assert.equal(intent.nativeExecutionAuthorized,false);
 assert.deepEqual(subject.readSqlCronConfigurationIntent(intent,{current:input.current,now:input.now}),intent);
 const saved=structuredClone(intent);input.originalAcknowledgement.context.identity.sourceSha='0'.repeat(40);assert.deepEqual(intent,saved,'Caller mutation cannot replace original metadata.');
});

test('stored inactive ACK booleans and activation requests cannot become a configuration intent',async()=>{
 const subject=await api(),input=fixture();
 for(const value of[{},true,input.originalAcknowledgement,{version:3,state:'INACTIVE_DEFINITIONS_ACKNOWLEDGED',effectAuthority:true},{...input,action:'ACTIVATE'},{...input,job:{command:'SELECT 1;'}}])assert.throws(()=>subject.prepareSqlCronConfigurationIntent(value),/requires review/);
});

test('configuration intent refuses changed original custody target history and hash identities',async()=>{
 const subject=await api();
 for(const key of['projectRef','databaseUrl','certificateSha256','installedHistorySha256','releaseRunId']){
  const input=fixture();Object.assign(input.current,{[key]:key==='projectRef'?'a'.repeat(20):key==='databaseUrl'?'postgresql://foreign.example/postgres':key==='releaseRunId'?input.originalAcknowledgement.context.releaseRunId:'0'.repeat(64)});
  assert.throws(()=>subject.prepareSqlCronConfigurationIntent(input),/requires review/,key);
 }
 const edited=fixture();edited.originalAcknowledgement.journalChainSha256='0'.repeat(64);assert.throws(()=>subject.prepareSqlCronConfigurationIntent(edited),/requires review/);
});

test('configuration lifetime is current bounded review metadata without renewing original clocks',async()=>{
 const subject=await api();
 for(const mode of['future','expired','reversed','overlong','unsafe']){
  const input=fixture();if(mode==='future')input.preparedAtMs=input.now+1;if(mode==='expired')input.expiresAtMs=input.now;if(mode==='reversed')input.expiresAtMs=input.preparedAtMs-1;if(mode==='overlong')input.expiresAtMs=input.preparedAtMs+3600001;if(mode==='unsafe')input.now=Number.MAX_SAFE_INTEGER+1;
  assert.throws(()=>subject.prepareSqlCronConfigurationIntent(input),/requires review/,mode);
 }
 const input=fixture(),intent=subject.prepareSqlCronConfigurationIntent(input);assert.throws(()=>subject.readSqlCronConfigurationIntent(intent,{current:input.current,now:input.expiresAtMs}),/requires review/);
});

test('intent decoding compares the immutable body fixed job and exact current approval binding',async()=>{
 const subject=await api(),input=fixture(),intent=subject.prepareSqlCronConfigurationIntent(input);
 for(const patch of[{intentSha256:'0'.repeat(64)},{action:'OBSERVE_ORIGINAL'},{effectAuthority:true},{activationAuthorized:true},{nativeExecutionAuthorized:true},{job:{name:'cuevo-sql-outbox-v2',schedule:'1 second',command:'CALL internal.run_sql_worker(9007199254740993);',generation:'9007199254740993',username:'postgres',database:'postgres',active:false}}])assert.throws(()=>subject.readSqlCronConfigurationIntent({...intent,...patch},{current:input.current,now:input.now}),/requires review/);
 assert.throws(()=>subject.readSqlCronConfigurationIntent(intent,{current:{...input.current,sourceSha:'0'.repeat(40)},now:input.now}),/requires review/);
});

test('configuration descriptors and revoked proxies are refused without executing caller machinery',async()=>{
 const subject=await api(),input=fixture();let reads=0;const getter=Object.defineProperty({...input},'originalAcknowledgement',{enumerable:true,get(){reads++;throw Error('private');}}),proxy=new Proxy(input,{ownKeys(){reads++;throw Error('private');}}),revoked=Proxy.revocable(input,{});revoked.revoke();
 for(const value of[getter,proxy,revoked.proxy,Object.assign(Object.create(input),{}),Object.defineProperty({...input},Symbol('private'),{value:true,enumerable:true})])assert.throws(()=>subject.prepareSqlCronConfigurationIntent(value),/requires review/);
 assert.equal(reads,0);
});

test('an unknown configuration observation retains original intent without inventing preparation custody',async()=>{
 const subject=await api(),input=fixture(),intent=subject.prepareSqlCronConfigurationIntent(input),observation={version:1,purpose:'CUEVO_SQL_CRON_CONFIGURATION_OBSERVATION',evidence:'SUPPLIED_READ_ONLY_CONFIGURATION_OBSERVATION',intentSha256:intent.intentSha256,action:'OBSERVE_ORIGINAL',observedAtMs:input.now+5,stage:'UNKNOWN',attemptCount:1,commitment:'UNKNOWN',ownedJob:null,durableReceipt:null,effectAuthority:false,nativeExecutionAuthorized:false,authenticCustodyCreated:false,activationAuthorized:false,foundationAccepted:false};
 const receipt=subject.readSqlCronConfigurationObservation(observation,{intent,current:input.current,now:input.now+10});assert.equal(receipt.stage,'UNKNOWN');assert.equal(receipt.authenticCustodyCreated,false);assert.equal(receipt.durableReceipt,null);
 const prepared={...observation,stage:'PREPARED_INACTIVE',commitment:'OBSERVED',ownedJob:{jobId:'9007199254740993',generation:'1',active:false,jobSha256:hash(intent.job)},durableReceipt:{localPayloadSha256:'1'.repeat(64),remotePayloadSha256:'1'.repeat(64),localChainSha256:'2'.repeat(64),remoteChainSha256:'2'.repeat(64)}};
 assert.deepEqual(subject.readSqlCronConfigurationObservation(prepared,{intent,current:input.current,now:input.now+10}),prepared);
 for(const patch of[{stage:'ACTIVATED'},{nativeExecutionAuthorized:true},{authenticCustodyCreated:true},{intentSha256:'0'.repeat(64)},{attemptCount:2},{ownedJob:{...prepared.ownedJob,jobId:'9223372036854775808'}},{ownedJob:{...prepared.ownedJob,active:true}},{durableReceipt:{...prepared.durableReceipt,remotePayloadSha256:'0'.repeat(64)}}])assert.throws(()=>subject.readSqlCronConfigurationObservation({...prepared,...patch},{intent,current:input.current,now:input.now+10}),/requires review/);
});
