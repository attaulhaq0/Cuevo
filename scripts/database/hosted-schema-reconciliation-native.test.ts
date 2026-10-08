import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { readHistoricalMigrationSources, readCanonicalMigrationSources } from './hosted-migration-plan';
import { replayPlan } from './replay-plan';
import { createOriginalPrefixReconciliationTemplate, reconciliationTemplateFingerprint, type ReconciliationTemplate } from './hosted-schema-reconciliation';
import { canonicalizeHostedSchemaCatalogue } from './hosted-schema-catalogue';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import type { HostedExecutionJournal } from './hosted-migration-execution';
import type { HostedMigrationDatabase } from './hosted-migration-database';

// These regressions exercise the real native owner/registry with controlled
// transport and an explicitly intercepted catalogue policy. Actual SQL/catalogue
// semantics, TLS and official admission have separate owner/native checks.
const originalSource='d87455114cac2d22d63d040ce5b13e6b2e74e743',originalTree='1e85393d46beb4f5356e07277a13a7ef33cc67d9',projectRef='mqxdjvsyckzocokuikmx',host='aws-0-ap-southeast-1.pooler.supabase.com';
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const files=readHistoricalMigrationSources(resolve(import.meta.dirname,'../..'),originalSource,originalTree),replay=replayPlan(files),sourceRows=[...replay.before,replay.prerequisite,...replay.remaining].map(name=>({name,version:name.slice(0,14),sha256:hash(files.find(file=>file.name===name)!.bytes)}));
const miniRows=[...['app','authorization','internal'].map(name=>({category:'schema',key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}})),...['cuevo_api','cuevo_worker'].map(name=>({category:'role',key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:false,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}}))];
const miniDigest=canonicalizeHostedSchemaCatalogue(miniRows).sha256,ca='-----BEGIN CERTIFICATE-----\ncontrolled composition CA\n-----END CERTIFICATE-----\n',certificateSha='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7',policySha='c'.repeat(64),absenceSha='d'.repeat(64),planSha='4'.repeat(64),packageSha='7'.repeat(64),baseClock=Date.parse('2026-10-08T02:00:00Z');
let root='',caPath='',clock=baseClock;
let owner:typeof import('./hosted-migration-database');
// Real node-postgres int8 decoder preserves bigint metadata as canonical text.
const int8BucketLimit=createRequire(import.meta.url)('pg').types.getTypeParser(20,'text')('49152') as string;
assert.equal(typeof int8BucketLimit,'string');
const state={client:null as ControlledClient|null,queries:[] as string[],events:[] as string[],historyCount:120,quiescent:true,foreignChain:false,tamperedBody:false,creates:0,vault:null as string|null,pendingVault:null as string|null,writeTransaction:false,commitFails:false,readbackFails:false,expireAtRead:false,loseAtRead:false,sourceDriftAtRead:false,officialCalls:0,policyCalls:[] as number[],catalogueFails:false,absenceFails:false,bucketLimit:int8BucketLimit as unknown,firstProofMs:0,officialDelayMs:0,delayOfficialCall:0,changeDuringOfficial:'',delayPolicyCall:0,policyDelayMs:0};
const expectedHistory=()=>sourceRows.slice(0,state.historyCount).map(row=>({version:row.version,name:row.name.slice(15,-4),statements:files.find(file=>file.name===row.name)!.bytes.byteLength?[new TextDecoder().decode(files.find(file=>file.name===row.name)!.bytes).trim()]:[]}));
const template=()=>createOriginalPrefixReconciliationTemplate({recoverySource:{sourceSha:originalSource,treeSha:originalTree,ciRunId:'37710000000',releaseRunId:'37710000001',runAttempt:1},stageRows:sourceRows.slice(0,123),historySha256:hash(canonicalReleaseExecutionJson(sourceRows.slice(0,120).map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),cataloguePolicySha256:policySha,catalogueSha256:miniDigest,absencePolicySha256:absenceSha,endpointSha256:'3'.repeat(64)});
const approved=(value:ReconciliationTemplate)=>({packageSha256:packageSha,runId:'37710000001',runAttempt:1,sourceSha:originalSource,treeSha:originalTree,ciRunId:'37710000000',templateSha256:hash(canonicalReleaseExecutionJson(value)),expiresAtMs:baseClock+600000});
const identity=(value:ReconciliationTemplate):HostedExecutionJournal['identity']=>({...value.originalIdentity,sourceSha:originalSource,treeSha:originalTree,ciRunId:'37710000000',approvalDigest:packageSha,planSha256:planSha});
const request=(value=template())=>({template:value,expectedApproval:approved(value),expected:{sourceSha:originalSource,treeSha:originalTree},prepared:{sha256:packageSha,canonicalJson:JSON.stringify({expiresAt:new Date(approved(value).expiresAtMs).toISOString()})},githubToken:'g'.repeat(30),providerToken:'p'.repeat(30),storageKey:'s'.repeat(30)});
const reset=async()=>{clock=baseClock;Object.assign(state,{queries:[],events:[],historyCount:120,quiescent:true,foreignChain:false,tamperedBody:false,creates:0,vault:null,pendingVault:null,writeTransaction:false,commitFails:false,readbackFails:false,expireAtRead:false,loseAtRead:false,sourceDriftAtRead:false,officialCalls:0,policyCalls:[],catalogueFails:false,absenceFails:false,bucketLimit:int8BucketLimit,firstProofMs:0,officialDelayMs:0,delayOfficialCall:0,changeDuringOfficial:'',delayPolicyCall:0,policyDelayMs:0});if(root)execFileSync('git',['-C',root,'checkout','--quiet','--','supabase/migrations'],{windowsHide:true,stdio:'ignore'});};
class ControlledClient extends EventEmitter {
 connection={stream:{encrypted:true,authorized:true,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('controlled-peer'),subjectaltname:'DNS:'+host})}};
 constructor(){super();Object.assign(state,{client:this});}
 async connect(){} async end(){this.emit('end');}
 async query(raw:string|{text:string},values:unknown[]=[]){
  const sql=typeof raw==='string'?raw:raw.text;state.queries.push(sql);
  if(sql.includes('CUEVO_SCHEMA_CATALOGUE_V1_')){if(state.catalogueFails)throw Error('private-catalogue-diagnostic-canary');return{rows:sql.includes('STRUCTURAL')?miniRows:[]};}
  if(sql.includes('CUEVO_CATALOGUE_READ_ONLY'))return{rows:[{readOnly:true,isolation:'repeatable read'}]};
  if(sql.includes('CUEVO_RECONCILIATION_BUCKET'))return{rows:[{id:'cuevo-release-operator',name:'cuevo-release-operator',public:false,type:'STANDARD',file_size_limit:state.bucketLimit,allowed_mime_types:['application/json']}]};
  if(sql.includes('CUEVO_RECONCILIATION_OBJECTS')){const value=template(),prefix='migration/v1/'+projectRef+'/'+hash(JSON.stringify(value.originalIdentity))+'/',objects=[value.ownerJson,...value.recordJson].map((bytes,index)=>({name:prefix+['owner.json','000001.record.json','000002.record.json'][index],size:String(Buffer.byteLength(bytes)),mimetype:'application/json'}));return{rows:[...objects,...(state.foreignChain?[{name:'migration/v1/'+projectRef+'/'+ 'a'.repeat(64)+'/owner.json',size:'100',mimetype:'application/json'}]:[])]};}
  if(sql.includes('CUEVO_NATIVE_QUIESCENCE'))return{rows:[{quiescent:state.quiescent}]};
  if(sql.includes('CUEVO_CONTROLLED_ABSENCE')){if(state.absenceFails)throw Error('private-absence-diagnostic-canary');return{rows:[Object.fromEntries(Array.from({length:17},(_,index)=>['marker'+index,false]))]};}
  if(sql.includes('CUEVO_TARGET_COUNTS'))return{rows:[{authUsers:0,storageObjects:3,appSchemas:['app','authorization','internal'],runtimeRoles:['cuevo_api','cuevo_worker'],schoolsPresent:true}]};
  if(sql.includes('CUEVO_TARGET_SCHOOLS'))return{rows:[{schools:0}]};
  if(sql.includes('CUEVO_INSTALLED_SCHEMA_STORAGE'))return{rows:[{available:true}]};
  if(sql.includes('CUEVO_CURRENT_PARTIAL_RECONCILIATION')){
   state.events.push('receipt-read');
   if(state.writeTransaction){if(state.expireAtRead)clock=baseClock+600000;if(state.loseAtRead)this.emit('error',Error('Controlled connection loss'));if(state.sourceDriftAtRead)await writeFile(join(root,'supabase/migrations',sourceRows[120].name),'select 999;\n');}
   if(state.readbackFails&&state.vault)throw Error('Controlled readback failure');return{rows:state.vault?[{decrypted_secret:state.vault}]:[]};
  }
  if(sql.startsWith('select vault.create_secret')){assert.equal(state.writeTransaction,true);assert.match(String(values[1]),/^cuevo_reconciliation_mqxdjvsyckzocokuikmx_[a-f0-9]{64}$/);state.creates++;state.pendingVault=String(values[0]);state.events.push('create');return{rows:[{create_secret:'controlled'}]};}
  if(sql==='BEGIN'){state.writeTransaction=true;return{rows:[]};}
  if(sql==='COMMIT'){state.events.push('commit');if(state.commitFails)throw Error('Controlled COMMIT acknowledgement loss');state.vault=state.pendingVault;state.pendingVault=null;state.writeTransaction=false;return{rows:[]};}
  if(sql==='ROLLBACK'){state.pendingVault=null;state.writeTransaction=false;return{rows:[]};}
  if(sql.includes('pg_try_advisory_lock'))return{rows:[{locked:true}]};
  if(sql.includes('pg_advisory_unlock'))return{rows:[{released:true}]};
  if(sql.includes('session_user'))return{rows:[{operator:'postgres',database:'postgres',ssl:true,serverVersion:170011}]};
  if(sql.includes("to_regclass('supabase_migrations"))return{rows:[{historyPresent:true}]};
  if(sql.includes('select version,coalesce'))return{rows:expectedHistory()};
  if(sql.startsWith('BEGIN ISOLATION')||sql.startsWith('SET LOCAL'))return{rows:[]};
  throw Error('Unexpected controlled native SQL');
 }
}
const globals=globalThis as typeof globalThis&{controlledReconciliationClient?:typeof ControlledClient;controlledReconciliationOfficial?:()=>Promise<unknown>;controlledReconciliationPolicy?:(rows:unknown,version:number,count?:number)=>unknown};
globals.controlledReconciliationClient=ControlledClient;
globals.controlledReconciliationOfficial=async()=>{state.officialCalls++;state.events.push('official');if(state.officialCalls===state.delayOfficialCall){clock+=state.officialDelayMs;if(state.changeDuringOfficial==='source')await writeFile(join(root,'supabase/migrations',sourceRows[120].name),'select 999;\n');if(state.changeDuringOfficial==='original')state.tamperedBody=true;}readCanonicalMigrationSources({repoRoot:root,sourceSha:originalSource,treeSha:originalTree});const value=template();return{expected:{executionScope:'reconcile-schema',releaseRunId:'37710000001',runAttempt:1,reconciledPrefix:reconciliationTemplateFingerprint(value),fingerprints:{migrationEndpointSha256:value.endpointSha256,migrationPlanSha256:planSha}},approval:{packageSha256:packageSha}};};
globals.controlledReconciliationPolicy=(rows,version,count=120)=>{assert.deepEqual(rows,canonicalizeHostedSchemaCatalogue(miniRows).rows);assert.equal(version,170011);assert.ok([120,123].includes(count));state.policyCalls.push(count);if(state.policyCalls.length===1)clock+=state.firstProofMs;if(state.policyCalls.length===state.delayPolicyCall)clock+=state.policyDelayMs;return{evidence:'CONTROLLED_POLICY_INTERCEPT'};};
const hooks=registerHooks({load(url,context,next){const path=url.replaceAll('\\','/');if(/\/node_modules\/pg\/(lib\/index\.js|esm\/index\.mjs)$/.test(path))return{format:'module',shortCircuit:true,source:'export const Client=globalThis.controlledReconciliationClient;export default{Client};'};if(path.endsWith('/backend-release-admission.ts'))return{format:'module',shortCircuit:true,source:'export const readBackendReleaseAdmission=globalThis.controlledReconciliationOfficial;'};if(path.endsWith('/hosted-schema-reconciliation-policy.ts'))return{format:'module',shortCircuit:true,source:`export const unknownPrefixCataloguePolicySha256='${policySha}',unknownPrefixAbsencePolicySha256='${absenceSha}',unknownPrefixAbsentMarkersSql='/* CUEVO_CONTROLLED_ABSENCE */ select false';export const verifyUnknownPrefixCataloguePolicy=globalThis.controlledReconciliationPolicy;`};return next(url,context);}});
const originalFetch=globalThis.fetch;globalThis.fetch=async(raw,options)=>{const url=new URL(String(raw)),value=template(),prefix='/storage/v1/',operation=hash(JSON.stringify(value.originalIdentity)),base='migration/v1/'+projectRef+'/'+operation+'/',paths=['owner.json','000001.record.json','000002.record.json'],texts=[value.ownerJson,...value.recordJson];assert.equal(url.origin,'https://'+projectRef+'.supabase.co');assert.equal(options?.redirect,'error');assert.equal(options?.cache,'no-store');assert.equal(options?.method,undefined);const info=url.pathname.startsWith(prefix+'object/info/'),path=url.pathname.slice((info?prefix+'object/info/cuevo-release-operator/':prefix+'object/cuevo-release-operator/').length),index=paths.findIndex(name=>base+name===path);assert.ok(index>=0);state.events.push(info?'storage-info':'storage-body');const content=info?JSON.stringify({name:path,bucket_id:'cuevo-release-operator',size:Buffer.byteLength(texts[index]),content_type:'application/json'}):state.tamperedBody?texts[index]+' ':texts[index];return new Response(content,{status:200,headers:{'content-type':'application/json'}});};
const originalNow=Date.now,mutableCrypto=createRequire(import.meta.url)('node:crypto') as typeof import('node:crypto'),originalCreateHash=mutableCrypto.createHash;
before(async()=>{
 root=await mkdtemp(join(tmpdir(),'cuevo-controlled-reconciliation-'));execFileSync('git',['clone','--shared','--no-checkout','--quiet',resolve(import.meta.dirname,'../..'),root],{windowsHide:true,stdio:'ignore'});execFileSync('git',['-C',root,'checkout','--detach','--quiet',originalSource],{windowsHide:true,stdio:'ignore'});await mkdir(join(root,'.local/hosted-release'),{recursive:true});caPath=join(root,'.local/hosted-release/controlled-ca.pem');await writeFile(caPath,ca,{mode:0o600});
 // Only the fixed fixture CA hash is intercepted. Actual CA/TLS tests run in the separate native TLS owner.
 mutableCrypto.createHash=((algorithm:string)=>{const actual=originalCreateHash(algorithm),update=actual.update.bind(actual),digest=actual.digest.bind(actual);let fixtureCa=false;actual.update=((value:Uint8Array|string,...args:unknown[])=>{if(Buffer.from(value).equals(Buffer.from(ca)))fixtureCa=true;update(value,...args as []);return actual;}) as typeof actual.update;actual.digest=((encoding:never)=>fixtureCa?certificateSha:digest(encoding)) as typeof actual.digest;return actual;}) as typeof originalCreateHash;syncBuiltinESMExports();Date.now=()=>clock;owner=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-migration-database.ts')).href);await reset();
});
after(async()=>{Date.now=originalNow;globalThis.fetch=originalFetch;mutableCrypto.createHash=originalCreateHash;syncBuiltinESMExports();hooks.deregister();await rm(root,{recursive:true,force:true});delete globals.controlledReconciliationClient;delete globals.controlledReconciliationOfficial;delete globals.controlledReconciliationPolicy;});
const database=()=>owner.createHostedMigrationDatabase({repoRoot:root,projectRef,databaseUrl:template().originalIdentity.databaseUrl,certificate:{path:caPath,sha256:certificateSha},password:'controlled-private-db-password'});
const locked=async(run:(db:HostedMigrationDatabase)=>Promise<void>)=>{const db=await database();return db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>run(db));};

test('controlled native composition issues a scoped permit only after immutable receipt readback and preserves the original clock',async()=>{
 await reset();let issued:unknown,current:HostedExecutionJournal['identity']|undefined;
 const cleanup=await locked(async db=>{const value=template(),first=await db.reconcileUnknownPrefix(request(value));issued=first.permit;current=identity(value);assert.equal(first.receipt.proof.lock.key,projectRef+':HOSTED_SCHEMA_MIGRATION');assert.equal(first.receipt.originalCommitment,'UNKNOWN');assert.equal(state.creates,1);assert.ok(state.events.indexOf('official')<state.events.indexOf('create'));assert.ok(state.events.lastIndexOf('receipt-read')>state.events.indexOf('commit'));owner.assertNativeReconciliationPermit(first.permit,current);
  clock+=100;const second=await db.reconcileUnknownPrefix(request(value));assert.equal(second.receipt.recordedAtMs,first.receipt.recordedAtMs);assert.equal(second.receipt.receiptSha256,first.receipt.receiptSha256);assert.equal(state.creates,1);
  for(const change of[{stageId:'native'},{stageSha256:'0'.repeat(64)},{planSha256:'0'.repeat(64)},{sourceSha:'9'.repeat(40)},{approvalDigest:'0'.repeat(64)},{ciRunId:'99'}])assert.throws(()=>owner.assertNativeReconciliationPermit(second.permit,{...current,...change} as HostedExecutionJournal['identity']));assert.throws(()=>owner.assertNativeReconciliationPermit(structuredClone(second.permit),current!));
  await db.refreshReconciliationPermit(second.permit,current,120);state.historyCount=123;await db.refreshReconciliationPermit(second.permit,current,123);assert.ok(state.policyCalls.includes(123));clock=approved(value).expiresAtMs;assert.throws(()=>owner.assertNativeReconciliationPermit(second.permit,current!));clock=baseClock;
 });assert.equal(cleanup.kind,'RELEASED');assert.throws(()=>owner.assertNativeReconciliationPermit(issued,current!));
});

test('controlled native permit refuses stale proof and a lost lease while supplied receipt objects grant no authority',async()=>{
 await reset();await assert.rejects(locked(async db=>{const value=template(),result=await db.reconcileUnknownPrefix(request(value)),current=identity(value);clock+=30001;assert.throws(()=>owner.assertNativeReconciliationPermit(result.permit,current));clock=baseClock;assert.throws(()=>owner.assertNativeReconciliationPermit(result.receipt,current));state.client!.emit('error',Error('Controlled lease loss'));assert.throws(()=>owner.assertNativeReconciliationPermit(result.permit,current));}));
});

test('controlled native composition refuses foreign unresolved chains and source changes before a receipt write',async()=>{
 for(const mode of ['foreign','source'] as const){await reset();state.foreignChain=mode==='foreign';if(mode==='source')await writeFile(join(root,'supabase/migrations',sourceRows[120].name),'select 999;\n');await assert.rejects(locked(db=>db.reconcileUnknownPrefix(request()).then(()=>undefined)));assert.equal(state.creates,0);}
});

test('controlled native pre-write expiry and connection loss refuse creation inside the transaction',async()=>{
 for(const mode of ['expiry','loss'] as const){await reset();state.expireAtRead=mode==='expiry';state.loseAtRead=mode==='loss';await assert.rejects(locked(db=>db.reconcileUnknownPrefix(request()).then(()=>undefined)));assert.equal(state.creates,0);assert.ok(state.queries.includes('ROLLBACK'));}
});

test('controlled native COMMIT and readback failures never return a usable permit or create a second receipt',async()=>{
 for(const mode of ['commit','readback'] as const){await reset();state.commitFails=mode==='commit';state.readbackFails=mode==='readback';let returned=false;await assert.rejects(locked(async db=>{await db.reconcileUnknownPrefix(request());returned=true;}));assert.equal(returned,false);assert.equal(state.creates,1);if(mode==='commit')assert.ok(state.queries.includes('ROLLBACK'));}
});

test('controlled native source drift during the transaction read refuses receipt creation',async()=>{
 await reset();state.sourceDriftAtRead=true;
 await assert.rejects(locked(db=>db.reconcileUnknownPrefix(request()).then(()=>undefined)));
 assert.equal(state.creates,0);
});

test('controlled native private original reader refuses changed bytes before any Vault mutation',async()=>{
 await reset();state.tamperedBody=true;
 await assert.rejects(locked(db=>db.reconcileUnknownPrefix(request()).then(()=>undefined)));
 assert.equal(state.creates,0);
 assert.ok(state.events.includes('storage-info'));assert.ok(state.events.includes('storage-body'));
});

test('controlled held protocol consumes the original three files once and commits only after exact123 native refresh',async()=>{
 await reset();const {prepareHeldHostedMigrationStage}=await import('./hosted-migration-execution'),value=template(),originalBytes=value.ownerJson+value.recordJson.join(''),current=identity(value),commands:{pending:string[];before:number;after:number}[]=[],writes:HostedExecutionJournal['state'][]=[];let journal:HostedExecutionJournal|null=null;
 const db=await database(),cleanup=await db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async lease=>{
  const permit=(await db.reconcileUnknownPrefix(request(value))).permit,workdir=join(root,'.local/hosted-release/controlled-prefix'),included=sourceRows.slice(0,123),stage={id:'prefix' as const,workdir,included,pending:included.slice(120),expectedBeforeVersions:included.slice(0,120).map(row=>row.version).sort(),expectedAfterVersions:included.map(row=>row.version).sort(),configSha256:value.configSha256,commandArgs:[]};
  const connection={publicRecipe:{projectRef,databaseUrl:value.originalIdentity.databaseUrl,cliTargetArgs:['--db-url',value.originalIdentity.databaseUrl],operator:'postgres' as const,endpointKind:'session-pooler' as const,provenance:'CALLER_SUPPLIED_PROVIDER_METADATA' as const,tls:'VERIFY_FULL_CONFIGURATION_ONLY' as const,certificateProvenance:'CALLER_SUPPLIED_OWNED_PATH' as const,execution:'NOT_EXECUTED' as const},privateEnvironment:{PGPASSWORD:'controlled-private-db-password',PGSSLROOTCERT:caPath}};
  const core=prepareHeldHostedMigrationStage({prepared:{projectRef,sourceSha:originalSource,treeSha:originalTree,planSha256:planSha,stage},connection,approvalDigest:packageSha,repoRoot:root,ciRunId:current.ciRunId,certificateSha256:certificateSha},{now:()=>clock,readJournal:async()=>{owner.assertNativeReconciliationPermit(permit,current);return journal;},writeJournal:async saved=>{owner.assertNativeReconciliationPermit(permit,current);journal=structuredClone(saved);writes.push(saved.state);return{kind:'SYNCED',sha256:hash(JSON.stringify(saved))};},revalidate:async()=>{await db.refreshReconciliationPermit(permit,current,state.historyCount as 120|123);return{kind:'ADMITTED',observedAtMs:clock,source:{sha:originalSource,tree:originalTree,currentMainSha:originalSource,ciRunId:current.ciRunId},project:{ref:projectRef,host,port:5432,database:'postgres',operator:'postgres'},approval:{purpose:'BACKEND_SYNTHETIC_STAGING',digest:packageSha,expiresAtMs:approved(value).expiresAtMs},artifact:{stageSha256:current.stageSha256},tls:{kind:'PEER_VERIFIED',host,certificateSha256:certificateSha},lock:{id:lease.id,key:lease.key},history:sourceRows.slice(0,state.historyCount).map(row=>({version:row.version,sourceReceiptSha256:row.sha256})),postconditions:state.historyCount===123?'SATISFIED':'NOT_CHECKED'};},runCli:async(args,environment)=>{owner.assertNativeReconciliationPermit(permit,current);assert.equal(journal?.state,'INTENT');assert.equal(environment.PGPASSWORD,'controlled-private-db-password');assert.ok(args.includes('--skip-vault'));assert.equal(state.historyCount,120);commands.push({pending:stage.pending.map(row=>row.name),before:state.historyCount,after:123});state.historyCount=123;return{kind:'EXITED',exitCode:0};}});
  await core.run(lease,()=>!db.signal.aborted);assert.equal(core.result.status,'COMMITTED');assert.equal(core.result.commitment,'CONFIRMED');assert.deepEqual(writes,['INTENT','COMMITTED']);assert.equal(commands.length,1);assert.deepEqual(commands[0].pending,sourceRows.slice(120,123).map(row=>row.name));assert.ok(state.policyCalls.includes(123));assert.equal(value.ownerJson+value.recordJson.join(''),originalBytes);assert.equal(value.originalIdentity.stageSha256,current.stageSha256);
 });assert.equal(cleanup.kind,'RELEASED');assert.equal(state.creates,1);
});

test('controlled native Storage body deadline refuses a stalled read even when cancellation never settles',async context=>{
 await reset();const fetcher=globalThis.fetch;let cancelled=false,started!:()=>void;const bodyStarted=new Promise<void>(done=>{started=done;});
 context.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(raw,options)=>{const path=new URL(String(raw)).pathname;if(path.includes('/object/cuevo-release-operator/')){started();return new Response(new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}}));}return fetcher(raw,options);};
 const pending=locked(db=>db.reconcileUnknownPrefix(request()).then(()=>undefined)).then(()=>false,error=>error instanceof Error&&!error.message.includes('controlled-private-db-password'));
 try{const observed=await Promise.race([bodyStarted.then(()=>true),pending.then(()=>false)]);assert.equal(observed,true);await new Promise<void>(done=>setImmediate(done));context.mock.timers.tick(15000);assert.equal(await pending,true);assert.equal(cancelled,true);assert.equal(state.creates,0);}
 finally{globalThis.fetch=fetcher;context.mock.timers.reset();}
});

test('controlled native composition refuses an approval context that lengthens the actual prepared package expiry',async()=>{
 await reset();const value=template(),supplied=request(value);supplied.expectedApproval.expiresAtMs+=60000;
 await assert.rejects(locked(db=>db.reconcileUnknownPrefix(supplied).then(()=>undefined)));assert.equal(state.creates,0);
});


test('native reconciliation diagnostics retain exact failed private phase and unknown receipt effects without exposing contents',async()=>{
 for(const mode of ['original','catalogue','absence','commit','readback']as const){await reset();state.tamperedBody=mode==='original';state.catalogueFails=mode==='catalogue';state.absenceFails=mode==='absence';state.commitFails=mode==='commit';state.readbackFails=mode==='readback';const db=await database();await assert.rejects(db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{await db.reconcileUnknownPrefix(request());}));
  const observed=db.getDiagnostics();assert.equal(observed.failurePhase,mode==='original'?'ORIGINAL_OBJECTS':mode==='catalogue'?'CATALOGUE':mode==='absence'?'ABSENCE':mode==='commit'?'RECEIPT_PERSIST':'RECEIPT_READ');assert.equal(observed.session,'CLOSED_CONFIRMED');assert.equal(observed.lease,'RELEASE_UNCONFIRMED');assert.equal(observed.partialReceipt,['commit','readback'].includes(mode)?'UNKNOWN':'NOT_ATTEMPTED');assert.equal(state.creates,['commit','readback'].includes(mode)?1:0);const attempted=state.creates;await assert.rejects(db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{throw Error('No native retry');}));assert.equal(state.creates,attempted);assert.doesNotMatch(JSON.stringify(observed),/private|controlled|postgresql|700723|originalOperation|storage/);assert.throws(()=>owner.assertNativeReconciliationPermit(observed,identity(template())));
 }
});

test('native reconciliation diagnostics confirm only actual original receipt readback and keep getter observation read-only',async()=>{
 await reset();const db=await database();await db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{const result=await db.reconcileUnknownPrefix(request()),before=state.queries.length,observed=db.getDiagnostics();assert.equal(observed.partialReceipt,'CONFIRMED');assert.equal(observed.failurePhase,null);assert.equal(observed.lease,'HELD');assert.equal(Object.isFrozen(observed),true);assert.equal(state.queries.length,before);owner.assertNativeReconciliationPermit(result.permit,identity(template()));});const done=db.getDiagnostics();assert.equal(done.partialReceipt,'CONFIRMED');assert.equal(done.session,'CLOSED_CONFIRMED');assert.equal(done.lease,'RELEASED');assert.equal(done.failurePhase,null);assert.equal(state.creates,1);
});


test('native diagnostics distinguish an exactly reread stored receipt from a new receipt attempt',async()=>{
 await reset();const first=await database();await first.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{await first.reconcileUnknownPrefix(request());});assert.equal(state.creates,1);const original=state.vault,second=await database();assert.equal(second.getDiagnostics().partialReceipt,'NOT_ATTEMPTED');await second.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{await second.reconcileUnknownPrefix(request());assert.equal(second.getDiagnostics().partialReceipt,'CONFIRMED');});assert.equal(state.creates,1);assert.equal(state.vault,original);assert.equal(second.getDiagnostics().lease,'RELEASED');assert.equal(second.getDiagnostics().failurePhase,null);
});


test('real pg bigint bucket metadata reaches native original receipt admission with strict canonical limit',async()=>{
 await reset();assert.equal(state.bucketLimit,'49152');const db=await database();await db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{await db.reconcileUnknownPrefix(request());});assert.equal(state.creates,1);assert.equal(db.getDiagnostics().partialReceipt,'CONFIRMED');assert.ok(state.events.includes('storage-info'));assert.ok(state.events.includes('storage-body'));
});


test('native recovery bucket accepts only exact canonical bigint text and refuses altered or missing limits before private reads',async()=>{
 await reset();for(const limit of ['049152','49152.0','+49152','49152 ','49151','49153',49152,null]as unknown[]){state.bucketLimit=limit;const db=await database(),reads=state.events.filter(event=>event.startsWith('storage-')).length;await assert.rejects(db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{await db.reconcileUnknownPrefix(request());}));assert.equal(db.getDiagnostics().failurePhase,'ORIGINAL_OBJECTS');assert.equal(state.creates,0);assert.equal(state.events.filter(event=>event.startsWith('storage-')).length,reads);}
});


test('fresh reconciliation receipt observes original native proof again after a slow second official read',async()=>{
 await reset();state.firstProofMs=14000;state.officialDelayMs=20000;state.delayOfficialCall=2;const db=await database();await db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{const result=await db.reconcileUnknownPrefix(request());assert.equal(state.officialCalls,2);assert.ok(state.policyCalls.length>=3,'fresh proof is rerun after authority and after readback');assert.equal(result.receipt.proof.observedAtMs,baseClock+34000);assert.equal(result.receipt.recordedAtMs,baseClock+34000);assert.equal(state.creates,1);owner.assertNativeReconciliationPermit(result.permit,identity(template()));});
});


test('authority-first receipt and refresh still deny expiry changed source changed private bytes and slow actual observations',async()=>{
 for(const mode of ['expiry','source','original','native-slow']as const){await reset();state.delayOfficialCall=2;state.officialDelayMs=mode==='expiry'?600000:20000;state.changeDuringOfficial=mode==='source'?'source':mode==='original'?'original':'';if(mode==='native-slow'){state.delayPolicyCall=2;state.policyDelayMs=30001;}const db=await database();await assert.rejects(db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{await db.reconcileUnknownPrefix(request());}));assert.equal(state.creates,0,mode);}
 await reset();const db=await database();await db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{const value=template(),result=await db.reconcileUnknownPrefix(request(value)),stored=state.vault;state.firstProofMs=0;state.delayOfficialCall=state.officialCalls+1;state.officialDelayMs=31000;const before=clock;await db.refreshReconciliationPermit(result.permit,identity(value),120);assert.equal(clock,before+31000);owner.assertNativeReconciliationPermit(result.permit,identity(value));assert.equal(state.vault,stored,'refresh never reprices stored proof');assert.equal(state.creates,1);});
});


test('reconciliation refresh rejects expired authority source private-byte changes and slow post-authority native proof',async()=>{
 for(const mode of ['expiry','source','original','native-slow']as const){await reset();const db=await database();let old:string|null=null;await assert.rejects(db.withLock(projectRef+':HOSTED_SCHEMA_MIGRATION',async()=>{const value=template(),result=await db.reconcileUnknownPrefix(request(value));old=state.vault;state.delayOfficialCall=state.officialCalls+1;state.officialDelayMs=mode==='expiry'?600000:31000;state.changeDuringOfficial=mode==='source'?'source':mode==='original'?'original':'';if(mode==='native-slow'){state.delayPolicyCall=state.policyCalls.length+1;state.policyDelayMs=30001;}await db.refreshReconciliationPermit(result.permit,identity(value),120);assert.equal(state.vault,old);}));assert.equal(state.creates,1,mode);assert.equal(state.vault,old,mode+' never replaces the original receipt');}
});
