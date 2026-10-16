import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {transformSync} from 'esbuild';
import {original231RecoveryPlanFixture} from './hosted-original-child-recovery.fixture';
import {prepareOriginal231TransportAppendPlan} from './hosted-original231-transport-append';
import {original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';
import {prepareInactiveCronDefinitionContext,prepareInactiveCronDefinitionIntent,prepareInactiveCronDefinitionAcknowledgedJournal,type InactiveCronDefinitionContext,type HostedMigrationStoredJournal} from './hosted-inactive-cron-definition-contracts';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const hash=(value:unknown)=>digest(canonicalReleaseExecutionJson(value));
const bucket='cuevo-release-operator',storageKey='inactive-storage-private-canary',providerToken='inactive-provider-private-canary';
let base:ReturnType<typeof original231RecoveryPlanFixture>|undefined;
let definitionBase:ReturnType<typeof makeDefinition>|undefined;
function definition(){
 return structuredClone(definitionBase??=(makeDefinition()));
}
function makeDefinition(){
 const input=structuredClone(base??=(original231RecoveryPlanFixture({sha:'f'.repeat(40),tree:'e'.repeat(40)})));
 const bytes=readFileSync(resolve(import.meta.dirname,'../../supabase/migrations/20261015110814_sql_cron_managed_transport.sql'));
 const plan=prepareOriginal231TransportAppendPlan({...input,sources:[...input.sources,{name:'20261015110814_sql_cron_managed_transport.sql',bytes}]}),old=input.original231Recovery.catalogueReference;
 const catalogueReference232={...old,purpose:'CUEVO_ORIGINAL231_TRANSPORT232_CATALOGUE_REFERENCE',appliedMigrationCount:232,migrationRowsSha256:hash(plan.migrations.map(row=>({version:row.version,sourceReceiptSha256:row.sha256}))),sourceInventorySha256:hash(plan.migrations.map(({name,sha256})=>({name,sha256}))),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,sourceOriginal231ReceiptSha256:'a'.repeat(64),effectScope:'DISABLED_TRANSPORT_DEFINITIONS_ONLY',effectAuthority:false};
 const identity={...input.original231Recovery.template.originalIdentity,sourceSha:plan.source.sha,treeSha:plan.source.tree,planSha256:plan.planSha256,stageSha256:'d'.repeat(64),approvalDigest:'c'.repeat(64),ciRunId:catalogueReference232.runId};
 const context=prepareInactiveCronDefinitionContext({plan,identity,catalogueReference232,releaseRunId:'62',releaseRunAttempt:1}),intent=prepareInactiveCronDefinitionIntent(context),now=input.now;
 const acknowledged=prepareInactiveCronDefinitionAcknowledgedJournal(context,{intentPayloadSha256:digest(JSON.stringify(intent)),beforeHistorySha256:context.original231.afterHistorySha256,afterHistorySha256:context.catalogueReference232.migrationRowsSha256,catalogueSha256:context.catalogueReference232.catalogueSummary.sha256,disabledDefinitionsFactsSha256:'9'.repeat(64),postconditionQuerySha256:original231TransportDisabledDefinitionsQuerySha256,nativeProofBeganAtMs:now,observedAtMs:now+100,cli:{kind:'EXITED',exitCode:0,exitedAtMs:now+50},installedMarkerSha256:context.original231.installedMarkerSha256,cronInstalled:false,runtimeLogin:false,dispatchEnabled:false,activeLeases:0,schoolCount:0,authUserCount:0});
 return{context,intent,acknowledged,original:input.original231Recovery.template.originalIdentity as HostedMigrationStoredJournal['identity'],versions:plan.applied.map(row=>row.version),plan,sources:[...input.sources,{name:'20261015110814_sql_cron_managed_transport.sql',bytes}]};
}
type Fixture={objects:Map<string,string>;requests:{method:string;path:string}[];context:InactiveCronDefinitionContext};
function store(f:Fixture,payloads:HostedMigrationStoredJournal[]){
 const identity=payloads[0].identity,prefix=`migration/v1/${identity.projectRef}/${digest(JSON.stringify(identity))}`;
 f.objects.set(prefix+'/owner.json',JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',identity})+'\n');
 let previousSha256:string|null=null;
 for(const[index,payload]of payloads.entries()){const bytes=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:index+1,previousSha256,payload,payloadSha256:digest(JSON.stringify(payload))})+'\n';f.objects.set(prefix+'/'+String(index+1).padStart(6,'0')+'.record.json',bytes);previousSha256=digest(bytes);}
}
const objectId=(path:string)=>{const raw=digest(path);return raw.slice(0,8)+'-'+raw.slice(8,12)+'-4'+raw.slice(13,16)+'-8'+raw.slice(17,20)+'-'+raw.slice(20,32);};
async function fixture(run:(f:Fixture)=>Promise<void>){
 const context=definition().context,f:Fixture={objects:new Map(),requests:[],context},prior=globalThis.fetch;
 globalThis.fetch=async(raw,options)=>{
  const method=options?.method??'GET',origin=`https://${context.identity.projectRef}.supabase.co/storage/v1/`;
  assert.equal(String(raw).startsWith(origin),true,'intercepted census stays in the exact Storage project');
  const path=String(raw).slice(origin.length);f.requests.push({method,path});assert.ok(method==='GET'||method==='POST'&&path===`object/list/${bucket}`,'census makes no writes or Management query');
  if(path===`bucket/${bucket}`)return Response.json({id:bucket,name:bucket,public:false,type:'STANDARD',file_size_limit:49152,allowed_mime_types:['application/json']});
  if(path===`object/list/${bucket}`){const input=JSON.parse(String(options?.body)),names=new Set([...f.objects.keys()].filter(path=>path.startsWith(input.prefix+'/')).map(path=>path.slice(input.prefix.length+1).split('/')[0]));return Response.json([...names].sort().slice(input.offset,input.offset+input.limit).map(name=>{const full=input.prefix+'/'+name,bytes=f.objects.get(full);return{name,id:bytes===undefined?null:objectId(full),metadata:bytes===undefined?null:{size:Buffer.byteLength(bytes),mimetype:'application/json'}};}));}
  if(path.startsWith(`object/info/${bucket}/`)){const name=path.slice(`object/info/${bucket}/`.length),bytes=f.objects.get(name);assert.ok(bytes);return Response.json({id:objectId(name),name,bucket_id:bucket,size:Buffer.byteLength(bytes),content_type:'application/json',version:'current-version'});}
  if(path.startsWith(`object/${bucket}/`)){const bytes=f.objects.get(path.slice(`object/${bucket}/`.length));return bytes===undefined?new Response('',{status:404}):new Response(bytes);}
  throw Error('Unexpected intercepted path');
 };
 try{await run(f);}finally{globalThis.fetch=prior;}
}
type Observation={evidence:string;projectRef:string;observedAtMs:number;completedAtMs:number;bucket:unknown;operations:{operation:string;state:string;identity:unknown;ownerBytes:string;records:{bytes:string;payload:HostedMigrationStoredJournal}[]}[];objects:{path:string;id:string;version:string|null;size:number;mimetype:string;sha256:string;bytes:string}[];effectAuthority:boolean;foundationAccepted:boolean};
const api=()=>import('./hosted-migration-storage-observation');
const observer=async()=>{const module=await api(),observe=(module as unknown as {observeHostedInactiveCronDefinitionStorageProject:(input:unknown)=>Promise<Observation>}).observeHostedInactiveCronDefinitionStorageProject;assert.equal(typeof observe,'function','explicit V3 census owner exists');return observe;};
const observeInput=(context:InactiveCronDefinitionContext)=>({projectRef:context.identity.projectRef,boundProjectRef:context.identity.projectRef,storageKey,signal:new AbortController().signal,inactiveDefinitionContext:context});

test('explicit V3 census keeps inactive acknowledgement separate and preserves the unresolved original operation',async()=>{
 const observe=await observer(),d=definition();await fixture(async f=>{
  store(f,[d.intent,d.acknowledged]);store(f,[{version:1,identity:d.original,state:'INTENT',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'}]);
  const result=await observe(observeInput(d.context));assert.equal(result.evidence,'READ_ONLY_INACTIVE_CRON_DEFINITION_STORAGE_COMPARISON');assert.equal(result.effectAuthority,false);assert.equal(result.foundationAccepted,false);assert.equal(result.objects.length,5);assert.deepEqual(result.operations.map(row=>row.state).sort(),['INACTIVE_DEFINITIONS_ACKNOWLEDGED','INTENT']);
  const current=result.operations.find(row=>row.state==='INACTIVE_DEFINITIONS_ACKNOWLEDGED')!;assert.equal(current.records[1].payload.version,3);assert.equal(d.context.original231.originalStageCommitment,'UNKNOWN');assert.equal(d.context.original231.thirdBatchConfirmation,'NOT_CONFIRMED');
  for(const object of result.objects){assert.equal(object.bytes,f.objects.get(object.path));assert.equal(object.size,Buffer.byteLength(object.bytes));assert.equal(object.sha256,digest(object.bytes));}
  await assert.rejects((await api()).observeHostedMigrationStorageProject({projectRef:d.context.identity.projectRef,boundProjectRef:d.context.identity.projectRef,storageKey,signal:new AbortController().signal}));
 });
});

test('V3 census refuses a foreign context and any cross-purpose or broken immutable chain',async()=>{
 const observe=await observer(),d=definition();for(const mode of['foreign','payload-hash','sequence','previous','transition','owner','extra']as const)await fixture(async f=>{
  store(f,[d.intent,d.acknowledged]);const prefix=`migration/v1/${d.context.identity.projectRef}/${digest(JSON.stringify(d.context.identity))}`,path=prefix+'/000002.record.json',raw=JSON.parse(f.objects.get(path)!);
  if(mode==='foreign'){const changed=structuredClone(d.context);changed.targetSha256='1'.repeat(64);const{contextSha256:_,...body}=changed;void _;changed.contextSha256=hash(body);const intent=prepareInactiveCronDefinitionIntent(changed);f.objects.clear();store(f,[intent]);}
  if(mode==='payload-hash')raw.payloadSha256='0'.repeat(64);
  if(mode==='sequence')raw.sequence=3;
  if(mode==='previous')raw.previousSha256='0'.repeat(64);
  if(mode==='transition'){raw.payload={version:1,identity:d.context.identity,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'};raw.payloadSha256=digest(JSON.stringify(raw.payload));}
  if(mode==='owner')f.objects.set(prefix+'/owner.json',JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',identity:d.original})+'\n');
  if(mode==='extra')f.objects.set(prefix+'/000004.record.json','{}\n');
  if(!['foreign','owner','extra'].includes(mode))f.objects.set(path,JSON.stringify(raw)+'\n');
  await assert.rejects(observe(observeInput(d.context)),mode);
 });
});

test('V3 census rejects caller code and credential/scope mismatch before transport',async()=>{
 const observe=await observer(),d=definition();await fixture(async f=>{let reads=0;const input=observeInput(d.context),getter=Object.defineProperty({...input},'inactiveDefinitionContext',{enumerable:true,get(){reads++;throw Error('must not run');}});
  for(const changed of[getter,new Proxy(input,{get(){reads++;throw Error('must not run');}}),{...input,boundProjectRef:'z'.repeat(20)},{...input,providerToken},{...input,inactiveDefinitionContext:{...d.context,effectAuthority:true}}])await assert.rejects(observe(changed));assert.equal(reads,0);assert.equal(f.requests.length,0);
 });
});

test('native V3 metadata comparison binds exact Storage objects without minting full-stage authority',async()=>{
 const observe=await observer(),inventory=await import('./hosted-operator-storage-observation'),prepare=(inventory as unknown as {prepareNativeHostedInactiveCronDefinitionStorageInventory:(value:unknown)=>{evidence:string;effectAuthority:boolean;foundationAccepted:boolean;operations:{state:string}[];totalStorageObjects:number}}).prepareNativeHostedInactiveCronDefinitionStorageInventory;assert.equal(typeof prepare,'function');const d=definition();
 await fixture(async f=>{store(f,[d.intent,d.acknowledged]);const storage=await observe(observeInput(d.context)),buckets=[{id:bucket,name:bucket,public:false,type:'STANDARD',file_size_limit:49152,allowed_mime_types:['application/json']}],rows=storage.objects.map(row=>({id:row.id,name:row.path,version:row.version!,bucket_id:bucket,size:String(row.size),mimetype:'application/json',createdAt:'2026-10-15T12:00:00.000000Z',updatedAt:'2026-10-15T12:00:00.000000Z'})),counts={bucketCount:1,totalObjects:3,operatorObjects:3,otherObjects:0,invalidOperatorPaths:0},before={observedAtMs:storage.observedAtMs,counts,buckets,rows},after={...before,observedAtMs:storage.completedAtMs},input={identity:d.context.identity,expectedVersions:d.versions,before,after,storage,expectedBuckets:buckets,inactiveDefinitionContext:d.context};
  const result=prepare(input);assert.equal(result.evidence,'VERIFIED_INACTIVE_CRON_DEFINITION_OPERATOR_STORAGE_INVENTORY');assert.equal(result.effectAuthority,false);assert.equal(result.foundationAccepted,false);assert.equal(result.totalStorageObjects,3);assert.equal(result.operations[0].state,'INACTIVE_DEFINITIONS_ACKNOWLEDGED');
  for(const mode of['identity','id','version','clock','bytes','extra','context']as const){const changed=structuredClone(input);if(mode==='identity')changed.identity.stageSha256='0'.repeat(64);if(mode==='id')changed.storage.objects[0].id='foreign';if(mode==='version')changed.storage.objects[0].version='foreign';if(mode==='clock')changed.after.observedAtMs=storage.observedAtMs-1;if(mode==='bytes')changed.storage.operations[0].ownerBytes+=' ';if(mode==='extra')changed.before.counts.otherObjects=1;if(mode==='context')changed.inactiveDefinitionContext.targetSha256='0'.repeat(64);assert.throws(()=>prepare(changed),mode);}
  const{inactiveDefinitionContext:_,...legacy}=input;void _;assert.throws(()=>inventory.prepareNativeHostedOperatorStorageInventory(legacy));
 });
});

test('inactive-definition bucket policy requires the retained source232 owner rather than a supplied handle',async()=>{
 const inventory=await import('./hosted-operator-storage-observation'),policy=(inventory as unknown as {nativeHostedInactiveCronDefinitionStorageBucketPolicy:(input:unknown,operation:object)=>unknown}).nativeHostedInactiveCronDefinitionStorageBucketPolicy;assert.equal(typeof policy,'function');const d=definition(),input={repoRoot:resolve(import.meta.dirname,'../..'),sourceSha:d.context.identity.sourceSha,treeSha:d.context.identity.treeSha,projectRef:d.context.identity.projectRef,boundProjectRef:d.context.identity.projectRef,identity:d.context.identity,expectedVersions:d.versions,plan:d.plan,inactiveDefinitionContext:d.context};
 assert.throws(()=>policy(input,Object.freeze({})),'caller metadata cannot stand in for the retained source operation');
});

test('controlled source-policy seam retains both private buckets at only the exact231 and232 boundaries',async()=>{
 const d=definition(),operation=Object.freeze({}),input={repoRoot:resolve(import.meta.dirname,'../..'),sourceSha:d.context.identity.sourceSha,treeSha:d.context.identity.treeSha,projectRef:d.context.identity.projectRef,boundProjectRef:d.context.identity.projectRef,identity:d.context.identity,expectedVersions:d.versions,plan:d.plan,inactiveDefinitionContext:d.context},suffix='?inactive-storage-source-policy';let calls=0,changedSource=false,changedRows=false;
 Object.assign(globalThis,{inactiveStorageSourcePolicyFixture:(value:unknown,expected:unknown)=>{assert.equal(value,operation);assert.deepEqual(expected,{repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan:input.plan});calls++;const sources=structuredClone(d.sources),rows=structuredClone(d.plan.migrations);if(changedSource)sources.find(row=>row.name==='20261001094217_private_asset_semantic_integrity.sql')!.bytes=new TextEncoder().encode('changed SQL');if(changedRows)rows[231].sha256='0'.repeat(64);return{sources,rows};}});
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/hosted-operator-storage-observation.ts'+suffix))return{format:'module',shortCircuit:true,source:transformSync(readFileSync(new URL(url.split('?')[0]),'utf8').replace("from './hosted-migration-plan'","from './hosted-migration-plan.ts"+suffix+"'"),{loader:'ts',format:'esm'}).code};if(url.endsWith('/hosted-migration-plan.ts'+suffix))return{format:'module',shortCircuit:true,source:"export * from './hosted-migration-plan.ts';export const readCanonicalOriginal231TransportAppendOperation=(...input)=>globalThis.inactiveStorageSourcePolicyFixture(...input);"};return next(url,context);}});
 try{
  const subject=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-operator-storage-observation.ts')).href+suffix) as unknown as {nativeHostedInactiveCronDefinitionStorageBucketPolicy:(input:unknown,operation:object)=>unknown},expected=[{id:bucket,name:bucket,public:false,type:'STANDARD',file_size_limit:49152,allowed_mime_types:['application/json']},{id:'learner-private',name:'learner-private',public:false,type:'STANDARD',file_size_limit:524288,allowed_mime_types:['text/plain','image/png','image/jpeg','application/pdf']}];
  assert.deepEqual(subject.nativeHostedInactiveCronDefinitionStorageBucketPolicy(input,operation),expected);assert.deepEqual(subject.nativeHostedInactiveCronDefinitionStorageBucketPolicy({...input,expectedVersions:d.plan.stage.expectedAfterVersions},operation),expected);assert.equal(calls,2,'each invocation rechecks the current source owner');
  for(const versions of[input.expectedVersions.slice(0,-1),[...input.expectedVersions,input.expectedVersions[0]]])assert.throws(()=>subject.nativeHostedInactiveCronDefinitionStorageBucketPolicy({...input,expectedVersions:versions},operation));assert.equal(calls,2);
  changedSource=true;assert.throws(()=>subject.nativeHostedInactiveCronDefinitionStorageBucketPolicy(input,operation));changedSource=false;changedRows=true;assert.throws(()=>subject.nativeHostedInactiveCronDefinitionStorageBucketPolicy(input,operation));
 }finally{hook.deregister();delete (globalThis as unknown as Record<string,unknown>).inactiveStorageSourcePolicyFixture;}
});
