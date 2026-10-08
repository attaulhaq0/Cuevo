import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {createRequire,registerHooks,syncBuiltinESMExports} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {transformSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {readHistoricalMigrationSources,createCanonicalHostedMigrationPlan,canonicalHostedMigrationPlan} from './hosted-migration-plan';
import {createHostedMigrationWorkdirs} from './hosted-migration-workdirs';
import {createOriginalPrefixReconciliationTemplate,reconciliationTemplateFingerprint} from './hosted-schema-reconciliation';
import {canonicalizeHostedSchemaCatalogue} from './hosted-schema-catalogue';
import {prepareHostedOperatorStoragePolicy} from './hosted-operator-storage-policy';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

// Real executor, database/permit registry, filesystem admission, local/durable/
// remote journals and held protocol run together. Only provider/PG/CLI transport,
// official admission and catalogue policy are controlled; no hosted effects occur.
// Windows directory fsync alone is intercepted; file publication/readback stays native.
const sha='d87455114cac2d22d63d040ce5b13e6b2e74e743',tree='1e85393d46beb4f5356e07277a13a7ef33cc67d9',ref='mqxdjvsyckzocokuikmx',host='aws-0-ap-southeast-1.pooler.supabase.com',certSha='700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7',ca='-----BEGIN CERTIFICATE-----\ncontrolled executor CA\n-----END CERTIFICATE-----\n',hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const files=readHistoricalMigrationSources(resolve(import.meta.dirname,'../..'),sha,tree),mini=[...['app','authorization','internal'].map(name=>({category:'schema',key:JSON.stringify([name]),facts:{name,owner:'postgres',acl:null}})),...['cuevo_api','cuevo_worker'].map(name=>({category:'role',key:JSON.stringify([name]),facts:{name,superuser:false,inherit:false,createRole:false,createDb:false,login:false,replication:false,bypassRls:false,connectionLimit:-1,validUntil:null,config:null}}))],miniHash=canonicalizeHostedSchemaCatalogue(mini).sha256,policySha='c'.repeat(64),absenceSha='d'.repeat(64);
const baseClock=Date.parse('2026-10-08T03:00:00Z');let clock=baseClock;
let root='',input:Record<string,unknown>,template:ReturnType<typeof createOriginalPrefixReconciliationTemplate>,rows:{name:string;version:string;sha256:string}[]=[];let executor:typeof import('./hosted-migration-executor');
const state={objects:new Map<string,string>(),vault:new Map<string,string>(),pendingVault:null as [string,string]|null,historyCount:120,commands:0,cliKind:'EXITED',cleanupFail:false,events:[]as string[],policyCounts:[]as number[],catalogueFails:false,commitFails:false,readbackFails:false,officialDelayMs:0,nativeProofMs:0,officialCalls:0};
const bucket={id:'cuevo-release-operator',name:'cuevo-release-operator',public:false,type:'STANDARD',file_size_limit:49152,allowed_mime_types:['application/json']};
const id=(path:string)=>hash(path).slice(0,8)+'-'+hash(path).slice(8,12)+'-4'+hash(path).slice(13,16)+'-a'+hash(path).slice(17,20)+'-'+hash(path).slice(20,32);
const info=(path:string)=>({id:id(path),name:path,bucket_id:bucket.id,size:Buffer.byteLength(state.objects.get(path)!),content_type:'application/json',version:'controlled-version'});
const metadata=(path:string)=>({id:id(path),name:path,version:'controlled-version',size:String(Buffer.byteLength(state.objects.get(path)!)),mimetype:'application/json',createdAt:'2026-10-08T03:00:00.000000Z',updatedAt:'2026-10-08T03:00:00.000000Z'});
type AdmissionTimingEvent = { kind: 'official' | 'catalogue' | 'target' | 'provider' | 'private' | 'metadata' | 'native-metadata' | 'source'; startedAt: number; completedAt: number };
type AdmissionTiming = { events: AdmissionTimingEvent[]; pending: { deadline: number; done: () => void }[]; scheduled: boolean; activeCatalogue: number; activeStorage: number; managementDuringCatalogue: number; quiescenceDuringStorage: number; overlaps: number; postconditions: number; sourceCharged: number; sourceChecks: number; nativeMetadata: number; nativeSnapshots:number; forbiddenActivity: boolean; catalogueMs: number; finalSourceMs: number; holdStorage: boolean; heldStorage?: () => void; heldStoragePromise?: Promise<void>; failConcurrentCatalogue: boolean; nativeFailureIssued: boolean; catalogueEntered?:()=>void; catalogueGate?:Promise<void>; synchronizeStorageStart:boolean; introduceUnacknowledgedIntent:boolean; introducedIntent:boolean; heldReady:Promise<void>; heldReadyResolve:()=>void; nativeFailureReady:Promise<void>; nativeFailureResolve:()=>void; fastStorage:boolean };
let admissionTiming: AdmissionTiming | null = null;
let hostReadsPending = 0;
let schedulerPumpRuns=0;
const hostIdleWaiters=new Set<()=>void>();
function finishHostWork(){
 hostReadsPending--;if(hostReadsPending!==0)return;
 const ready=[...hostIdleWaiters];hostIdleWaiters.clear();for(const done of ready)done();
}
function transportDelay(milliseconds: number, kind: AdmissionTimingEvent['kind']) {
  const timing = admissionTiming;
  if (!timing) return Promise.resolve();
 const startedAt = clock;
  const pump = () => {
    schedulerPumpRuns++;
    timing.scheduled = false;
    if (!timing.pending.length) return;
    // Native filesystem reads keep their actual output and validation, but
    // this transport profile assigns no extra latency to their host promises.
    // Settle those reads before advancing the synthetic network deadline.
    if (hostReadsPending) { timing.scheduled = true;hostIdleWaiters.add(()=>setImmediate(pump));return; }
    const next = Math.min(...timing.pending.map(item => item.deadline));
    clock = Math.max(clock, next);
    const ready = timing.pending.filter(item => item.deadline <= clock);
    timing.pending = timing.pending.filter(item => item.deadline > clock);
    for (const item of ready) item.done();
    if (timing.pending.length && !timing.scheduled) { timing.scheduled = true; setImmediate(pump); }
  };
  return new Promise<void>(done => {
    timing.pending.push({ deadline: startedAt + milliseconds, done: () => { timing.events.push({ kind, startedAt, completedAt: clock }); done(); } });
    if (!timing.scheduled) { timing.scheduled = true; setImmediate(pump); }
  });
}
function beginAdmissionTiming(options: { catalogueMs?: number; finalSourceMs?: number; forbiddenActivity?: boolean; holdStorage?: boolean; failConcurrentCatalogue?: boolean; synchronizeStorageStart?:boolean; introduceUnacknowledgedIntent?:boolean; fastStorage?:boolean } = {}): AdmissionTiming {
  let heldReadyResolve!:()=>void,nativeFailureResolve!:()=>void;const heldReady=new Promise<void>(done=>{heldReadyResolve=done;}),nativeFailureReady=new Promise<void>(done=>{nativeFailureResolve=done;});
  const timing: AdmissionTiming = { events: [], pending: [], scheduled: false, activeCatalogue: 0, activeStorage: 0, managementDuringCatalogue: 0, quiescenceDuringStorage: 0, overlaps: 0, postconditions: 0, sourceCharged: 0, sourceChecks: 0, nativeMetadata: 0,nativeSnapshots:0, forbiddenActivity: options.forbiddenActivity ?? false, catalogueMs: options.catalogueMs ?? 10000, finalSourceMs: options.finalSourceMs ?? 5226, holdStorage: options.holdStorage ?? false, failConcurrentCatalogue: options.failConcurrentCatalogue ?? false, nativeFailureIssued: false, synchronizeStorageStart:options.synchronizeStorageStart??false, introduceUnacknowledgedIntent:options.introduceUnacknowledgedIntent??false, introducedIntent:false,heldReady,heldReadyResolve,nativeFailureReady,nativeFailureResolve,fastStorage:options.fastStorage??false };
  admissionTiming = timing;
  state.officialDelayMs = 19177;
  return timing;
}
function observeActualStageSource() {
  const timing = admissionTiming;
  if (!timing) return;
  timing.sourceChecks++;
  // Charge the real, completed stage/Git read after a new native postcondition
  // observation. This changes elapsed cost only, never its values or checks.
  if (timing.postconditions <= timing.sourceCharged) return;
  timing.sourceCharged = timing.postconditions;
  const startedAt = clock;
  clock += timing.finalSourceMs;
  timing.events.push({ kind: 'source', startedAt, completedAt: clock });
}
function history(){return rows.slice(0,state.historyCount).map(row=>({version:row.version,name:row.name.slice(15,-4),statements:files.find(file=>file.name===row.name)!.bytes.byteLength?[new TextDecoder().decode(files.find(file=>file.name===row.name)!.bytes).trim()]:[]}));}
let hostCompletionVariance=false,heldCloseIssued=false;
async function completeHostWork<T>(operation:()=>Promise<T>):Promise<T>{
 const tracked=admissionTiming!==null;if(tracked)hostReadsPending++;
 try{return await operation();}finally{if(tracked)finishHostWork();}
}
Object.assign(globalThis,{executorHostImport:completeHostWork});
class PgTransport extends EventEmitter {
 connection={stream:{encrypted:true,authorized:true,getProtocol:()=> 'TLSv1.3',getPeerCertificate:()=>({raw:Buffer.from('controlled-peer'),subjectaltname:'DNS:'+host})}};
 async connect(){}async end(){this.emit('end');}
 async query(raw:string|{text:string},values:unknown[]=[]){const sql=typeof raw==='string'?raw:raw.text;
  const timing = admissionTiming;
  if (timing && sql.includes('CUEVO_SCHEMA_CATALOGUE_V1_STRUCTURAL')) {
    timing.catalogueEntered?.();
    timing.activeCatalogue++;
    if (timing.activeStorage) timing.overlaps++;
    try {
     await transportDelay(timing.catalogueMs, 'catalogue');
     if (timing.failConcurrentCatalogue && timing.heldStorage) { timing.nativeFailureIssued = true; timing.nativeFailureResolve(); throw Error('Controlled concurrent native catalogue failure'); }
    } finally { timing.activeCatalogue--; }
  }
  if (timing && sql.includes('CUEVO_TARGET_COUNTS')) await transportDelay(2999, 'target');
  if (sql.includes('CUEVO_NATIVE_STORAGE_')) {
    if(timing)timing.nativeMetadata++;
    const combined=sql.includes('CUEVO_NATIVE_STORAGE_SNAPSHOT');if(timing&&combined)timing.nativeSnapshots++;
    if(timing?.introduceUnacknowledgedIntent&&!timing.introducedIntent&&state.events.includes('vault-create')){
     const expected=input.expected as{releaseSha:string;treeSha:string;ciRunId:string;fingerprints:{migrationPlanSha256:string}},prepared=input.preparedApproval as{sha256:string},stage=input.stage as{id:string};
     const current={...template.originalIdentity,sourceSha:expected.releaseSha,treeSha:expected.treeSha,planSha256:expected.fingerprints.migrationPlanSha256,stageId:stage.id,approvalDigest:prepared.sha256,ciRunId:expected.ciRunId},purpose='CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',prefix='migration/v1/'+ref+'/'+hash(JSON.stringify(current))+'/',payload={version:1,identity:current,state:'INTENT',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'};
     state.objects.set(prefix+'owner.json',JSON.stringify({version:1,purpose,identity:current})+'\n');state.objects.set(prefix+'000001.record.json',JSON.stringify({version:1,purpose,sequence:1,previousSha256:null,payload,payloadSha256:hash(JSON.stringify(payload))})+'\n');timing.introducedIntent=true;
    }
    if (timing?.synchronizeStorageStart && (combined?timing.nativeSnapshots%2===1:timing.nativeMetadata % 6 === 1)) {
      timing.catalogueGate = new Promise<void>(done => { timing.catalogueEntered = done; });
    }
    if(timing)await transportDelay(combined?3000:1000, 'native-metadata');
    if(combined)return{rows:[{counts:{bucketCount:'2',totalObjects:String(state.objects.size),operatorObjects:String(state.objects.size),otherObjects:'0',invalidOperatorPaths:'0'},buckets:[bucket,{id:'learner-private',name:'learner-private',public:false,type:'STANDARD',file_size_limit:524288,allowed_mime_types:['text/plain','image/png','image/jpeg','application/pdf']}].map(item=>({...item,file_size_limit:String(item.file_size_limit)})),objects:[...state.objects.keys()].sort().map(path=>({...metadata(path),bucket_id:bucket.id})),target:{authUsers:'0',storageObjects:String(state.objects.size),appSchemas:['app','authorization','internal'],runtimeRoles:['cuevo_api','cuevo_worker'],schoolsPresent:true,schools:'0'}}]};
    if (sql.includes('COUNTS')) return { rows: [{ bucketCount: 2, totalObjects: state.objects.size, operatorObjects: state.objects.size, otherObjects: 0, invalidOperatorPaths: 0 }] };
    if (sql.includes('BUCKETS')) return { rows: [bucket, { id: 'learner-private', name: 'learner-private', public: false, type: 'STANDARD', file_size_limit: 524288, allowed_mime_types: ['text/plain', 'image/png', 'image/jpeg', 'application/pdf'] }].map(item => ({ ...item, file_size_limit: String(item.file_size_limit) })) };
    if (sql.includes('OBJECTS')) return { rows: [...state.objects.keys()].sort().map(path => ({ ...metadata(path), bucket_id: bucket.id })) };
  }
  if (timing && sql.includes('CUEVO_NATIVE_QUIESCENCE')) {
    if (timing.activeStorage) timing.quiescenceDuringStorage++;
    if (timing.forbiddenActivity) return { rows: [{ quiescent: false }] };
  }
  if (timing && sql.includes('CUEVO_RECOVERY_CRON_PRESENCE')) timing.postconditions++;
  if(sql.includes('CUEVO_SCHEMA_CATALOGUE_V1_')){if(state.catalogueFails)throw Error('private-executor-catalogue-canary');return{rows:sql.includes('STRUCTURAL')?mini:[]};}if(sql.includes('CUEVO_CATALOGUE_READ_ONLY'))return{rows:[{readOnly:true,isolation:'repeatable read'}]};if(sql.includes('CUEVO_NATIVE_QUIESCENCE'))return{rows:[{quiescent:true}]};
  if(sql.includes('CUEVO_RECONCILIATION_BUCKET'))return{rows:[{...bucket,file_size_limit:createRequire(import.meta.url)('pg').types.getTypeParser(20,'text')('49152')}]};if(sql.includes('CUEVO_RECONCILIATION_OBJECTS'))return{rows:[...state.objects].map(([name,bytes])=>({name,size:String(Buffer.byteLength(bytes)),mimetype:'application/json'})).sort((a,b)=>a.name.localeCompare(b.name))};
  if(sql.includes('CUEVO_CONTROLLED_ABSENCE'))return{rows:[Object.fromEntries(Array.from({length:17},(_,index)=>['marker'+index,false]))]};if(sql.includes('CUEVO_INSTALLED_SCHEMA_STORAGE'))return{rows:[{available:true}]};if(sql.includes('CUEVO_CURRENT_PARTIAL_RECONCILIATION')&&state.readbackFails&&state.vault.has(String(values[0])))throw Error('private-executor-readback-canary');if(sql.includes('CUEVO_CURRENT_PARTIAL_RECONCILIATION')||sql.includes('CUEVO_INSTALLED_SCHEMA_STAGE_LOCK')||sql.includes('CUEVO_INSTALLED_SCHEMA_STAGE'))return{rows:state.vault.has(String(values[0]))?[{...(sql.includes('_LOCK')?{id:'controlled-vault'}:{}),decrypted_secret:state.vault.get(String(values[0]))}]:[]};
  if(sql.startsWith('select vault.create_secret')){state.pendingVault=[String(values[1]),String(values[0])];state.events.push('vault-create');return{rows:[{create_secret:'controlled'}]};}if(sql.startsWith('select vault.update_secret')){state.pendingVault=[String(values[2]),String(values[1])];return{rows:[]};}if(sql==='COMMIT'){if(state.commitFails&&state.pendingVault)throw Error('private-executor-commit-canary');if(state.pendingVault)state.vault.set(...state.pendingVault);state.pendingVault=null;return{rows:[]};}if(sql==='ROLLBACK'){state.pendingVault=null;return{rows:[]};}
  if(sql.includes('CUEVO_TARGET_COUNTS'))return{rows:[{authUsers:0,storageObjects:state.objects.size,appSchemas:['app','authorization','internal'],runtimeRoles:['cuevo_api','cuevo_worker'],schoolsPresent:true}]};if(sql.includes('CUEVO_TARGET_SCHOOLS'))return{rows:[{schools:0}]};if(sql.includes('CUEVO_STAGE_BASE'))return{rows:[{foundation:true,rls:true,privateRelations:true,privateFunctions:true,runtimeRoles:true}]};if(sql.includes('CUEVO_RECOVERY_CRON_PRESENCE'))return{rows:[{present:false}]};
  if(sql.includes('pg_try_advisory_lock')){state.events.push('lock');return{rows:[{locked:true}]};}if(sql.includes('pg_advisory_unlock')){state.events.push('unlock');return{rows:[{released:!state.cleanupFail}]};}if(sql.includes('session_user'))return{rows:[{operator:'postgres',database:'postgres',ssl:true,serverVersion:170011}]};if(sql.includes("to_regclass('supabase_migrations"))return{rows:[{historyPresent:true}]};if(sql.includes('select version,coalesce'))return{rows:history()};if(sql==='BEGIN'||sql.startsWith('BEGIN ISOLATION')||sql.startsWith('SET LOCAL'))return{rows:[]};throw Error('Unmapped controlled PG query');
 }
}
const globals=globalThis as typeof globalThis&{executorPg?:typeof PgTransport;executorOfficial?:(value:Record<string,unknown>)=>Promise<unknown>;executorProvider?:()=>Promise<unknown>;executorPrepared?:(value:unknown)=>unknown;executorProcess?:()=>Promise<unknown>;executorPolicy?:(rows:unknown,version:number,count?:number)=>unknown;executorStageFilesObserved?:()=>void};
globals.executorPg=PgTransport;globals.executorPrepared=value=>value;globals.executorOfficial=async()=>{state.officialCalls++;if(admissionTiming)await transportDelay(state.officialDelayMs,'official');else clock+=state.officialDelayMs;return({provenance:'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE',observedAt:new Date(clock).toISOString(),expected:input.expected,approval:{packageSha256:(input.preparedApproval as{sha256:string}).sha256}});};globals.executorProvider=async()=>{if(admissionTiming)await transportDelay(477,'provider');return({evidence:'OFFICIAL_SUPABASE_PROJECT_METADATA',projectRef:ref,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',observedAtMs:clock,directEndpoint:{projectRef:ref,kind:'direct',host:'db.'+ref+'.supabase.co',port:5432,database:'postgres'},sessionEndpoint:input.endpoint});};globals.executorPolicy=(_rows,version,count=120)=>{assert.equal(version,170011);state.policyCounts.push(count);clock+=state.nativeProofMs;};globals.executorProcess=async()=>({runCli:async(args:string[],env:Record<string,string>)=>{state.commands++;state.events.push('cli');assert.ok(args.includes('--skip-vault'));assert.equal(env.PGPASSWORD,'controlled-db-password');assert.equal(state.historyCount,120);const path=[...state.objects.keys()].find(path=>!path.includes(hash(JSON.stringify(template.originalIdentity)))&&path.endsWith('000001.record.json'));assert.ok(path);assert.equal(JSON.parse(state.objects.get(path)!).payload.state,'INTENT');if(state.cliKind==='UNKNOWN')return{kind:'UNKNOWN'};state.historyCount=123;return{kind:'EXITED',exitCode:0};}});
const hooks=registerHooks({load(url,context,next){const path=url.replaceAll('\\','/'),name=path.split('/').at(-1);if(/\/node_modules\/pg\/(lib\/index\.js|esm\/index\.mjs)$/.test(path))return{format:'module',shortCircuit:true,source:'export const Client=globalThis.executorPg;export default{Client};'};const replace:Record<string,string>={'backend-release-admission.ts':'export const readBackendReleaseAdmission=globalThis.executorOfficial;','backend-release-contracts.ts':'export const validatePreparedBackendReleaseIntent=globalThis.executorPrepared;','hosted-migration-native-process.ts':'export const createHostedMigrationNativeProcess=globalThis.executorProcess;','hosted-schema-reconciliation-policy.ts':`export const unknownPrefixCataloguePolicySha256='${policySha}',unknownPrefixAbsencePolicySha256='${absenceSha}',unknownPrefixAbsentMarkersSql='/* CUEVO_CONTROLLED_ABSENCE */ select false';export const verifyUnknownPrefixCataloguePolicy=globalThis.executorPolicy;`};if(name==='hosted-migration-database.ts')return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code.replace(/import\(([^)]+)\)/g,'globalThis.executorHostImport(()=>import($1))')};if(name==='hosted-migration-stage-files.ts')return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code.replace('return { evidence: "VERIFIED_GIT_AND_PHYSICAL_STAGE",','globalThis.executorStageFilesObserved?.();return { evidence: "VERIFIED_GIT_AND_PHYSICAL_STAGE",')};if(name==='hosted-migration-provider.ts')return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url),'utf8'),{loader:'ts',format:'esm'}).code.replace('async function readHostedMigrationProvider(value) {','async function readHostedMigrationProvider(value) { return globalThis.executorProvider(value);')};if(name&&replace[name])return{format:'module',shortCircuit:true,source:replace[name]};return next(url,context);}});
const fetcher=globalThis.fetch;async function observedResponse(response:Response){const timing=admissionTiming;if(!timing||!response.body)return response;const body=response.body,getReader=body.getReader.bind(body);body.getReader=(()=>{const reader=getReader(),read=reader.read.bind(reader),cancel=reader.cancel.bind(reader);reader.read=()=>completeHostWork(async()=>{const result=await read();if(hostCompletionVariance)await new Promise<void>(done=>setImmediate(done));return result;});reader.cancel=reason=>completeHostWork(()=>cancel(reason));return reader;}) as typeof body.getReader;return response;}globalThis.fetch=async(raw,options)=>{const url=new URL(String(raw)),body=options?.body?JSON.parse(String(options.body)):null;
 const timing = admissionTiming;
 const management = url.origin === 'https://api.supabase.com';
 const storageRead = !management && !(options?.method === 'POST' && url.pathname.includes('/object/cuevo-release-operator/'));
 if (timing) {
  if (management && timing.activeCatalogue) timing.managementDuringCatalogue++;
  if (storageRead) { timing.activeStorage++; if (timing.activeCatalogue) timing.overlaps++; }
  const privateBytes = url.pathname.includes('/object/info/') || url.pathname.includes('/object/cuevo-release-operator/');
  try {
   // Hold the first real Storage fetch at the cohort barrier until the real
   // native structural query starts. Host filesystem I/O does not advance the
   // synthetic network clock or complete that request ahead of its sibling.
   if (storageRead && timing.catalogueGate) {
    const signal=options?.signal;
    await new Promise<void>((done,reject)=>{
     const aborted=()=>{signal?.removeEventListener('abort',aborted);reject(Error('Controlled Storage request aborted before catalogue start'));};
     if(signal?.aborted){aborted();return;}
     signal?.addEventListener('abort',aborted,{once:true});
     void timing.catalogueGate!.then(()=>{signal?.removeEventListener('abort',aborted);done();},reject);
    });
   }
   if (timing.holdStorage && storageRead && timing.activeCatalogue) {
    timing.heldStoragePromise ??= new Promise<void>(done => { timing.heldStorage = done; timing.heldReadyResolve(); });
    await timing.heldStoragePromise;
   }
   await transportDelay(timing.fastStorage&&storageRead?0:privateBytes ? 333 : 1000, privateBytes ? 'private' : 'metadata');
  } finally { if (storageRead) timing.activeStorage--; }
 }
 if(url.origin==='https://api.supabase.com'){const sql=body.query as string;if(sql.includes('CUEVO_STORAGE_INVENTORY_COUNTS'))return observedResponse(Response.json([{bucketCount:2,totalObjects:state.objects.size,operatorObjects:state.objects.size,otherObjects:0,invalidOperatorPaths:0}]));if(sql.includes('CUEVO_STORAGE_INVENTORY_BUCKETS'))return observedResponse(Response.json([bucket,{id:'learner-private',name:'learner-private',public:false,type:'STANDARD',file_size_limit:524288,allowed_mime_types:['text/plain','image/png','image/jpeg','application/pdf']}]));if(sql.includes('CUEVO_STORAGE_INVENTORY_OBJECTS'))return observedResponse(Response.json([...state.objects.keys()].sort().map(metadata)));return observedResponse(Response.json([bucket]));}
 assert.equal(url.origin,'https://'+ref+'.supabase.co');const path=url.pathname.slice('/storage/v1/'.length);if(path==='bucket/'+bucket.id)return observedResponse(Response.json(bucket));
 if(path==='object/list/'+bucket.id){const prefix=body.prefix as string,entries=new Map<string,{name:string;id:string|null;metadata:unknown}>();for(const[key,bytes]of state.objects){if(!key.startsWith(prefix+'/'))continue;const part=key.slice(prefix.length+1),name=part.split('/')[0];entries.set(name,part.includes('/')?{name,id:null,metadata:null}:{name,id:id(key),metadata:{size:Buffer.byteLength(bytes),mimetype:'application/json'}});}return observedResponse(Response.json([...entries.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(body.offset,body.offset+body.limit)));}
 if(path.startsWith('object/info/'+bucket.id+'/')){const key=path.slice(('object/info/'+bucket.id+'/').length);return observedResponse(state.objects.has(key)?Response.json(info(key)):new Response('',{status:404}));}
 if(path.startsWith('object/'+bucket.id+'/')){const key=path.slice(('object/'+bucket.id+'/').length);if(options?.method==='POST'){assert.equal(new Headers(options.headers).get('x-upsert'),'false');if(state.objects.has(key))return new Response('',{status:409});state.objects.set(key,String(options.body));state.events.push('journal-upload');return observedResponse(Response.json({Key:key}));}return observedResponse(state.objects.has(key)?new Response(state.objects.get(key),{headers:{'content-type':'application/json'}}):new Response('',{status:404}));}throw Error('Unmapped controlled HTTP');};
const fsPromises=createRequire(import.meta.url)('node:fs/promises') as typeof import('node:fs/promises'),nativeOpen=fsPromises.open;
const nativeHostReads=new Map<string,(...args:unknown[])=>Promise<unknown>>();
function installActualReadTiming(){
 const mutable=fsPromises as unknown as Record<string,(...args:unknown[])=>Promise<unknown>>;
 for(const name of ['readFile','lstat','readdir','realpath','open','mkdir','writeFile','unlink','rename']){
  const original=mutable[name];nativeHostReads.set(name,original);
  mutable[name]=async(...args:unknown[])=>{
   const tracked=admissionTiming!==null;if(tracked)hostReadsPending++;
   try{
    const result=await original(...args);
    if(tracked&&name==='open'&&result&&typeof result==='object'){
     const handle=result as Record<string,unknown>;
     for(const method of ['stat','readFile','writeFile','sync','close'])if(typeof handle[method]==='function'){
      const read=(handle[method] as(...values:unknown[])=>Promise<unknown>).bind(handle);
      handle[method]=async(...values:unknown[])=>completeHostWork(async()=>{const answer=await read(...values);if(hostCompletionVariance&&method==='close'&&!heldCloseIssued){heldCloseIssued=true;await new Promise<void>(done=>setTimeout(done,5));}return answer;});
     }
    }
    if(tracked&&hostCompletionVariance&&name==='readFile')await new Promise<void>(done=>setImmediate(done));
    return result;
   }finally{if(tracked)finishHostWork();}
  };
 }
}
function restoreActualReadTiming(){const mutable=fsPromises as unknown as Record<string,(...args:unknown[])=>Promise<unknown>>;for(const[name,read]of nativeHostReads)mutable[name]=read;nativeHostReads.clear();}
const originalNow=Date.now,mutableCrypto=createRequire(import.meta.url)('node:crypto')as typeof import('node:crypto'),originalCreateHash=mutableCrypto.createHash;
before(async()=>{if(process.platform==='win32')fsPromises.open=(async(path:Parameters<typeof nativeOpen>[0],...args:unknown[])=>{let stat;try{stat=await fsPromises.lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(stat?.isDirectory())return{sync:async()=>{state.events.push('controlled-directory-sync');},close:async()=>{}};return nativeOpen(path,...args as [string,number?]);}) as typeof nativeOpen;mutableCrypto.createHash=((algorithm:string)=>{const result=originalCreateHash(algorithm),update=result.update.bind(result),digest=result.digest.bind(result);let fixture=false;result.update=((value:Uint8Array|string)=>{if(Buffer.from(value).equals(Buffer.from(ca)))fixture=true;update(value);return result;})as typeof result.update;result.digest=((encoding:never)=>fixture?certSha:digest(encoding))as typeof result.digest;return result;})as typeof originalCreateHash;installActualReadTiming();syncBuiltinESMExports();Date.now=()=>clock;globals.executorStageFilesObserved=observeActualStageSource;executor=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-migration-executor.ts')).href);});
after(()=>{restoreActualReadTiming();fsPromises.open=nativeOpen;Date.now=originalNow;mutableCrypto.createHash=originalCreateHash;syncBuiltinESMExports();globalThis.fetch=fetcher;hooks.deregister();delete globals.executorPg;delete globals.executorOfficial;delete globals.executorProvider;delete globals.executorPrepared;delete globals.executorProcess;delete globals.executorPolicy;delete globals.executorStageFilesObserved;delete (globalThis as unknown as {executorHostImport?:unknown}).executorHostImport;});
test('zero-cost host continuation cannot make an independent request finish before its catalogue sibling',async()=>{
 clock=baseClock;const timing=beginAdmissionTiming();
 try{
  const storage=transportDelay(1000,'metadata');
  const catalogue=completeHostWork(async()=>{await new Promise<void>(done=>setTimeout(done,5));}).then(()=>transportDelay(10000,'catalogue'));
  await Promise.all([storage,catalogue]);
  const observed=timing.events.find(event=>event.kind==='catalogue')!;
  assert.equal(observed.startedAt,baseClock,'The host callback has zero assigned model latency');
  assert.equal(observed.completedAt,baseClock+10000,'Independent request durations share their original virtual start');
 }finally{admissionTiming=null;}
});
test('the virtual scheduler waits for zero-cost host completion without polling its event loop',async()=>{
 clock=baseClock;beginAdmissionTiming();schedulerPumpRuns=0;
 let release!:()=>void;const held=new Promise<void>(done=>{release=done;}),host=completeHostWork(()=>held),request=transportDelay(1000,'metadata');
 try{
  await new Promise<void>(done=>setTimeout(done,10));
  assert.equal(clock,baseClock,'The pending host operation consumes zero virtual duration');
  assert.ok(schedulerPumpRuns<=1,'A pending host read parks one pump rather than continuously polling');
 }finally{release();await Promise.all([host,request]);admissionTiming=null;}
});
async function fixture(run:()=>Promise<void>){clock=baseClock;root=await mkdtemp(join(tmpdir(),'cuevo-reconciliation-executor-'));try{execFileSync('git',['clone','--shared','--no-checkout','--quiet',resolve(import.meta.dirname,'../..'),root],{windowsHide:true,stdio:'ignore'});execFileSync('git',['-C',root,'checkout','--detach','--quiet',sha],{windowsHide:true,stdio:'ignore'});Object.assign(state,{objects:new Map(),vault:new Map(),pendingVault:null,historyCount:120,commands:0,cliKind:'EXITED',cleanupFail:false,events:[],policyCounts:[],catalogueFails:false,commitFails:false,readbackFails:false,officialDelayMs:0,nativeProofMs:0,officialCalls:0});await mkdir(join(root,'.local/hosted-release'),{recursive:true});
 const initial=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:sha,treeSha:tree,now:clock,target:{projectRef:ref,boundProjectRef:ref,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(clock).toISOString(),authUsers:0,storageObjects:0,appSchemas:[],migrationVersions:[],dispatchDisabled:true,population:'EMPTY'}}).plan;rows=initial.migrations;
 const endpoint={projectRef:ref,kind:'session-pooler',host,port:5432,database:'postgres'},endpointSha=hash(canonicalReleaseExecutionJson(endpoint));template=createOriginalPrefixReconciliationTemplate({recoverySource:{sourceSha:sha,treeSha:tree,ciRunId:'37710000000',releaseRunId:'37710000001',runAttempt:1},stageRows:rows.slice(0,123),historySha256:hash(canonicalReleaseExecutionJson(rows.slice(0,120).map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),cataloguePolicySha256:policySha,catalogueSha256:miniHash,absencePolicySha256:absenceSha,endpointSha256:endpointSha});
 const prior={projectRef:ref,sourceSha:sha,treeSha:tree,migrations:rows.slice(0,120).map(({version,sha256})=>({version,sha256}))},plan=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:sha,treeSha:tree,now:clock,target:{projectRef:ref,boundProjectRef:ref,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(clock).toISOString(),authUsers:0,storageObjects:3,appSchemas:['app','authorization','internal'],migrationVersions:rows.slice(0,120).map(row=>row.version),dispatchDisabled:true,population:'SCHEMA_ONLY'},priorReceipt:prior,reconciliationTemplate:template}).plan,built=await createHostedMigrationWorkdirs({repoRoot:root,sourceSha:sha,treeSha:tree,plan,outputRoot:join(root,'.local/hosted-release')});
 const prefix='migration/v1/'+ref+'/'+hash(JSON.stringify(template.originalIdentity))+'/';for(const[index,bytes]of[template.ownerJson,...template.recordJson].entries())state.objects.set(prefix+['owner.json','000001.record.json','000002.record.json'][index],bytes);
 const caPath=join(root,'.local/hosted-release/ca.pem');await writeFile(caPath,ca,{mode:0o600});const manifest={version:1,purpose:'CUEVO_HOSTED_MIGRATION_TOOLCHAIN',sourceSha:sha,treeSha:tree,sourceLockSha256:hash(await readFile(join(root,'package-lock.json'))),cliVersion:'2.119.0',platform:process.platform+'-'+process.arch,cli:{shimSha256:'d'.repeat(64),binarySha256:'e'.repeat(64),sidecarSha256:'f'.repeat(64)}},manifestBytes=JSON.stringify(manifest)+'\n',toolchainManifestPath=join(root,'.local/hosted-release/toolchain.json');await writeFile(toolchainManifestPath,manifestBytes,{mode:0o600});const policy=prepareHostedOperatorStoragePolicy({sourceSha:sha,treeSha:tree,projectRef:ref}),operatorStoragePolicyPath=join(root,'.local/hosted-release/storage-policy.json');await writeFile(operatorStoragePolicyPath,policy.canonicalJson,{mode:0o600});
 const expected={repository:'attaulhaq0/Cuevo',executionScope:'reconcile-schema',releaseSha:sha,treeSha:tree,currentMainSha:sha,ciRunId:'37710000000',releaseRunId:'37710000001',runAttempt:1,targets:{supabase:{projectRef:ref}},installedSchema:plan.priorSchemaRelease,reconciledPrefix:reconciliationTemplateFingerprint(template),fingerprints:{migrationPlanSha256:canonicalHostedMigrationPlan(plan).sha256,migrationHistorySha256:plan.observedHistorySha256,migrationEndpointSha256:endpointSha,migrationToolchainSha256:hash(manifestBytes),operatorStoragePolicySha256:policy.sha256}},canonicalJson=JSON.stringify({expiresAt:new Date(clock+600000).toISOString()}),preparedApproval={status:'PREPARED_ONLY',canonicalJson,sha256:hash(canonicalJson),base64:Buffer.from(canonicalJson).toString('base64'),comment:'controlled composition'};input={repoRoot:root,endpoint,plan,stage:built.stages[0],preparedApproval,expected,certificate:{path:caPath,sha256:certSha},toolchainManifestPath,operatorStoragePolicyPath,journalStorageKey:'s'.repeat(30),githubToken:'g'.repeat(30),providerToken:'p'.repeat(30),migrationPassword:'controlled-db-password',toolchain:{}};await run();
 }finally{await rm(root,{recursive:true,force:true});}}

test('controlled complete executor composes real native permit and durable journals for exactly three pending files',async()=>{await fixture(async()=>{const original=[...state.objects],result=await executor.executeNativeHostedMigrationStage(input);assert.equal(result.status,'COMMITTED',JSON.stringify({result,events:state.events}));assert.equal(state.commands,1);assert.equal(state.historyCount,123);assert.ok(state.policyCounts.includes(123));assert.ok(state.events.indexOf('journal-upload')<state.events.indexOf('cli'));for(const[path,bytes]of original)assert.equal(state.objects.get(path),bytes);const states=[...state.objects].filter(([path])=>!original.some(([old])=>old===path)&&path.endsWith('.record.json')).map(([,bytes])=>JSON.parse(bytes).payload.state);assert.deepEqual(states,['INTENT','COMMITTED']);assert.equal(result.hostedAcceptance,false);assert.ok(state.events.includes('unlock'));const installed=JSON.parse(state.vault.get('cuevo_schema_stage_'+ref)!);assert.equal(installed.migrationCount,123);assert.equal(installed.sourceSha,sha);assert.equal(installed.treeSha,tree);assert.equal(installed.stageId,'prefix');assert.equal(installed.stageSha256,template.originalIdentity.stageSha256);assert.deepEqual(installed.migrations,rows.slice(0,123).map(({version,sha256})=>({version,sha256})));assert.equal(result.recoveryCompletion?.status,'PREFIX123_CONFIRMED');assert.equal(result.recoveryCompletion?.completedAt,new Date(clock).toISOString());assert.equal(result.recoveryCompletion?.cleanup.kind,'RELEASED');});});
test('controlled complete executor retains UNKNOWN after an uncertain CLI and refuses automatic retry',async()=>{await fixture(async()=>{state.cliKind='UNKNOWN';const original=[...state.objects],first=await executor.executeNativeHostedMigrationStage(input);assert.equal(first.status,'REQUIRES_REVIEW');assert.equal(first.protocol?.commitment,'UNKNOWN');assert.equal(state.commands,1);const count=state.objects.size;const second=await executor.executeNativeHostedMigrationStage(input);assert.equal(second.status,'REQUIRES_REVIEW');assert.equal(state.commands,1);assert.equal(state.objects.size,count);for(const[path,bytes]of original)assert.equal(state.objects.get(path),bytes);});});

test('controlled complete executor downgrades both current journals after unconfirmed lock release',async()=>{await fixture(async()=>{
 const original=[...state.objects];state.cleanupFail=true;const result=await executor.executeNativeHostedMigrationStage(input);
 assert.equal(result.status,'REQUIRES_REVIEW',JSON.stringify({result,events:state.events}));assert.equal(result.protocol?.cleanupCode,'LOCK_RELEASE_UNCONFIRMED');assert.equal(result.compositionFailure?.leaseCallbackEntered,true);assert.equal(result.compositionFailure?.native?.failurePhase,'CLEANUP');assert.equal(result.compositionFailure?.native?.partialReceipt,'CONFIRMED');assert.equal(state.commands,1);assert.equal(state.historyCount,123);
 const paths=[...state.objects.keys()].filter(path=>!original.some(([old])=>old===path)&&path.endsWith('.record.json')).sort(),states=paths.map(path=>JSON.parse(state.objects.get(path)!).payload.state);assert.deepEqual(states,['INTENT','COMMITTED','REQUIRES_REVIEW']);
 for(const[path,bytes]of original)assert.equal(state.objects.get(path),bytes);
 const {createHostedMigrationJournal}=await import('./hosted-migration-journal'),directory=(await import('node:fs/promises').then(fs=>fs.readdir(join(root,'.local/hosted-release')))).find(name=>name.startsWith('journal-'))!,identity=JSON.parse(state.objects.get(paths[0])!).payload.identity,journal=await createHostedMigrationJournal({repoRoot:root,journalRoot:join(root,'.local/hosted-release',directory),identity});assert.equal((await journal.readJournal() as {state:string}).state,'REQUIRES_REVIEW');
 const count=state.objects.size;assert.equal((await executor.executeNativeHostedMigrationStage(input)).status,'REQUIRES_REVIEW');assert.equal(state.commands,1);assert.equal(state.objects.size,count);
});});


test('single-stage reconciliation fallback preserves native held phase and unknown private receipt effects before any journal or CLI',async()=>{
 for(const mode of ['catalogue','commit','readback']as const)await fixture(async()=>{state.catalogueFails=mode==='catalogue';state.commitFails=mode==='commit';state.readbackFails=mode==='readback';const original=[...state.objects],result=await executor.executeNativeHostedMigrationStage(input),failure=result.compositionFailure;assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(result.protocol,null);assert.equal(result.compositionCode,'PREFLIGHT_UNCONFIRMED');assert.ok(failure);assert.equal(failure.phase,'RECONCILIATION');assert.equal(failure.leaseCallbackEntered,true);assert.equal(failure.native?.failurePhase,mode==='catalogue'?'CATALOGUE':mode==='commit'?'RECEIPT_PERSIST':'RECEIPT_READ');assert.equal(failure.native?.partialReceipt,mode==='catalogue'?'NOT_ATTEMPTED':'UNKNOWN');assert.equal(failure.native?.session,'CLOSED_CONFIRMED');assert.equal(failure.native?.lease,'RELEASE_UNCONFIRMED');assert.equal(state.commands,0);assert.equal(state.events.includes('journal-upload'),false);assert.equal(state.objects.size,3);for(const[path,bytes]of original)assert.equal(state.objects.get(path),bytes);assert.doesNotMatch(JSON.stringify(failure),/private-executor|controlled-db-password|postgresql|catalogue-canary|readback-canary|commit-canary/);
 });
});

test('native executor consumes the paired official observation without aging its freshly verified permit',async()=>{
 await fixture(async()=>{state.officialDelayMs=17000;state.nativeProofMs=14000;const original=[...state.objects],result=await executor.executeNativeHostedMigrationStage(input);assert.equal(result.status,'COMMITTED',JSON.stringify({result,events:state.events,officialCalls:state.officialCalls,proofs:state.policyCounts.length}));assert.equal(state.commands,1);assert.equal(state.historyCount,123);assert.equal(result.protocol?.commitment,'CONFIRMED');assert.equal(result.hostedAcceptance,false);for(const[path,text]of original)assert.equal(state.objects.get(path),text);});
});

test('full captured admission profile reaches only the original three-file effect with drained native and Storage observations', async () => {
 try{for(const variance of [false,true]){
 hostCompletionVariance=variance;heldCloseIssued=false;
 await fixture(async () => {
  const original = [...state.objects], timing = beginAdmissionTiming({synchronizeStorageStart:false});
  try {
   const result = await executor.executeNativeHostedMigrationStage(input);
   const diagnostic = JSON.stringify({ result, finalEvents: timing.events.slice(-16), managementDuringCatalogue: timing.managementDuringCatalogue, quiescenceDuringStorage: timing.quiescenceDuringStorage, overlaps: timing.overlaps, sourceChecks: timing.sourceChecks, sourceCharged: timing.sourceCharged });
   assert.equal(result.status, 'COMMITTED', diagnostic);
   assert.equal(result.protocol?.commitment, 'CONFIRMED');
   assert.equal(state.commands, 1); assert.equal(state.historyCount, 123);
   assert.ok(timing.overlaps > 0, 'The real native catalogue request and Storage comparison lane must overlap');
   assert.equal(timing.managementDuringCatalogue, 0, 'Management postgres reads cannot be catalogue siblings');
   assert.equal(timing.quiescenceDuringStorage, 0, 'Quiescence follows complete Storage request settlement');
   assert.ok(timing.nativeSnapshots>=2&&timing.nativeSnapshots%2===0, 'Actual distinct PRE/POST snapshot requests retain native metadata and target facts');
   assert.equal(timing.nativeMetadata,timing.nativeSnapshots,'One fixed native query carries each complete snapshot');
   assert.ok(timing.sourceChecks > 0 && timing.sourceCharged > 0, 'The captured synchronous cost follows an actual final source check');
   assert.equal(timing.pending.length, 0); assert.equal(timing.activeCatalogue, 0); assert.equal(timing.activeStorage, 0);
   const sourceEvents=timing.events.filter(event=>event.kind==='source'),admissions=sourceEvents.map(source=>{
    const authority=timing.events.filter(event=>event.kind==='official'&&event.completedAt<=source.completedAt).at(-1)!,provider=timing.events.filter(event=>event.kind==='provider'&&event.completedAt<=source.completedAt).at(-1)!;
    return{officialAgeMs:source.completedAt-authority.completedAt,providerAgeMs:source.completedAt-provider.completedAt,finalSourceMs:source.completedAt-source.startedAt};
   });
   assert.ok(admissions.length>0);for(const admission of admissions)assert.ok(admission.officialAgeMs<=30000&&admission.providerAgeMs<=30000);
   if(variance)assert.equal(heldCloseIssued,true,'The variance scenario must perturb an actual completed FileHandle.close');
   console.log(JSON.stringify({purpose:'CAPTURED_ADMISSION_CAPACITY_BEFORE_ASSERT',hostCompletionVariance:variance,admissions,minimumRemainingFreshnessMs:Math.min(...admissions.map(admission=>30000-admission.officialAgeMs)),sourceChecks:timing.sourceChecks,sourceCharges:sourceEvents.length,hostedAcceptance:false}));
   assert.ok(Math.min(...admissions.map(admission=>30000-admission.officialAgeMs))>=6000,'The captured profile must leave at least six seconds after actual final source verification');
   console.log(JSON.stringify({purpose:'CONTROLLED_CAPTURED_ADMISSION_PROFILE',runtime:process.version,network:'none',forcedStorageStart:false,status:result.status,commands:state.commands,historyCount:state.historyCount,overlaps:timing.overlaps,managementDuringCatalogue:timing.managementDuringCatalogue,quiescenceDuringStorage:timing.quiescenceDuringStorage,admissions,minimumRemainingFreshnessMs:Math.min(...admissions.map(admission=>30000-admission.officialAgeMs)),hostFilesystemLatency:'Actual read outputs retained; no extra modeled latency beyond recorded final-source cost',hostedAcceptance:false}));
   for (const [path, bytes] of original) assert.equal(state.objects.get(path), bytes);
   const records = [...state.objects].filter(([path]) => !original.some(([previous]) => previous === path) && path.endsWith('.record.json')).map(([, bytes]) => JSON.parse(bytes).payload.state);
   assert.deepEqual(records, ['INTENT', 'COMMITTED']);
   assert.equal(result.hostedAcceptance, false);
  } finally { admissionTiming = null; }
 });
 }}finally{hostCompletionVariance=false;}
});

test('forbidden postgres activity still refuses native admission before any current intent or migration', async () => {
 await fixture(async () => {
  const original = [...state.objects], timing = beginAdmissionTiming({ forbiddenActivity: true });
  try {
   const result = await executor.executeNativeHostedMigrationStage(input);
   assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.historyCount, 120);
   assert.equal(state.events.includes('journal-upload'), false); assert.equal(timing.pending.length, 0);
   for (const [path, bytes] of original) assert.equal(state.objects.get(path), bytes);
  } finally { admissionTiming = null; }
 });
});

test('a held concurrent Storage comparison cannot publish an intent or launch a migration before settlement', async () => {
 await fixture(async () => {
  const original = [...state.objects], timing = beginAdmissionTiming({ holdStorage: true,synchronizeStorageStart:true });
  let settled = false;
  const pending = executor.executeNativeHostedMigrationStage(input).then(result => { settled = true; return result; });
  try {
   await Promise.race([timing.heldReady,pending.then(()=>{throw Error('Executor settled before the Storage hold began');})]);
   assert.ok(timing.heldStorage, 'The actual Storage lane must be in flight alongside catalogue work');
   assert.equal(settled, false); assert.equal(state.commands, 0); assert.equal(state.events.includes('journal-upload'), false);
   assert.equal(timing.managementDuringCatalogue, 0); assert.equal(timing.quiescenceDuringStorage, 0);
   timing.holdStorage = false; timing.heldStorage();
   const result = await pending;
   assert.equal(result.status, 'COMMITTED', JSON.stringify(result));
   assert.equal(state.commands, 1); assert.equal(timing.activeStorage, 0); assert.equal(timing.pending.length, 0);
   for (const [path, bytes] of original) assert.equal(state.objects.get(path), bytes);
  } finally {
   timing.holdStorage = false; timing.heldStorage?.(); await pending;
   admissionTiming = null;
  }
 });
});

test('the complete admission still refuses an expired observation or absolute package expiry before effects', async () => {
 for (const mode of ['observation', 'package'] as const) await fixture(async () => {
  const original = [...state.objects], timing = beginAdmissionTiming({ finalSourceMs: mode === 'observation' ? 30001 : 600001 });
  try {
   const result = await executor.executeNativeHostedMigrationStage(input);
   assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.historyCount, 120);
   assert.equal(state.events.includes('journal-upload'), false); assert.equal(timing.pending.length, 0);
   for (const [path, bytes] of original) assert.equal(state.objects.get(path), bytes);
  } finally { admissionTiming = null; }
 });
});

test('a failed native lane waits for its held Storage sibling and cannot publish current effect authority', async () => {
 await fixture(async () => {
  const original = [...state.objects], timing = beginAdmissionTiming({ holdStorage: true, failConcurrentCatalogue: true,synchronizeStorageStart:true });
  let settled = false;
  const pending = executor.executeNativeHostedMigrationStage(input).then(result => { settled = true; return result; });
  try {
   await Promise.race([timing.nativeFailureReady,pending.then(()=>{throw Error('Executor settled before concurrent native failure');})]);
   assert.ok(timing.heldStorage && timing.nativeFailureIssued, 'Native failure is issued while actual Storage reads remain held');
   assert.equal(settled, false); assert.equal(state.commands, 0); assert.equal(state.events.includes('journal-upload'), false);
   assert.equal(timing.quiescenceDuringStorage, 0);
   timing.holdStorage = false; timing.heldStorage();
   const result = await pending;
   assert.equal(result.status, 'REQUIRES_REVIEW'); assert.equal(state.commands, 0); assert.equal(state.historyCount, 120);
   assert.equal(state.events.includes('journal-upload'), false); assert.equal(timing.activeStorage, 0); assert.equal(timing.pending.length, 0);
   for (const [path, bytes] of original) assert.equal(state.objects.get(path), bytes);
  } finally {
   timing.holdStorage = false; timing.heldStorage?.(); await pending;
   admissionTiming = null;
  }
 });
});

test('fast Storage completion does not depend on a forced catalogue start order', async () => {
 await fixture(async () => {
  const original=[...state.objects],timing=beginAdmissionTiming({synchronizeStorageStart:false,fastStorage:true});
  try{
   const result=await executor.executeNativeHostedMigrationStage(input);
   assert.equal(result.status,'COMMITTED',JSON.stringify({result,finalEvents:timing.events.slice(-12)}));
   assert.equal(state.commands,1);assert.equal(state.historyCount,123);assert.equal(timing.managementDuringCatalogue,0);assert.equal(timing.quiescenceDuringStorage,0);
   assert.equal(timing.pending.length,0);assert.equal(timing.activeStorage,0);
   for(const[path,bytes]of original)assert.equal(state.objects.get(path),bytes);
  }finally{admissionTiming=null;}
 });
});

test('an unacknowledged current INTENT introduced during native observation cannot authorize the original CLI', async () => {
 await fixture(async()=>{
  const original=[...state.objects],timing=beginAdmissionTiming({introduceUnacknowledgedIntent:true});
  try{
   const result=await executor.executeNativeHostedMigrationStage(input);
   assert.equal(timing.introducedIntent,true,'The current source changed after receipt publication and before effect admission');
   assert.equal(result.status,'REQUIRES_REVIEW');assert.equal(state.commands,0);assert.equal(state.historyCount,120);assert.equal(state.events.includes('journal-upload'),false);
   const newRecords=[...state.objects].filter(([path])=>!original.some(([prior])=>prior===path)&&path.endsWith('.record.json'));
   assert.equal(newRecords.length,1);assert.equal(JSON.parse(newRecords[0][1]).payload.state,'INTENT');
   assert.equal(timing.pending.length,0);assert.equal(timing.activeStorage,0);
   for(const[path,bytes]of original)assert.equal(state.objects.get(path),bytes);
  }finally{admissionTiming=null;}
 });
});
