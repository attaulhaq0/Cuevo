import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import { hostedOperatorStorageHeaders } from './hosted-operator-storage-policy';
import { canonicalHostedMigrationPlan, verifyCompletedMigrationPrefix, readHistoricalMigrationSources, verifyPriorSchemaPrefix, type HostedMigrationPlanV1, readCanonicalMigrationSources } from './hosted-migration-plan';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';
import { createHostedMigrationRemoteJournal } from './hosted-migration-remote-journal';
import type { HostedExecutionJournal } from './hosted-migration-execution';
import {deriveHostedMigrationBatches} from './hosted-migration-batches';
import type {HostedMigrationBatchStage} from './hosted-migration-batches';
import {assertNativeReconciliationPermit} from './hosted-migration-database';

const bucket='cuevo-release-operator',failure=()=>Error('Hosted operator Storage inventory, source or metadata requires review; contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),ref=z.string().regex(/^[a-z]{20}$/),version=z.string().regex(/^[0-9]{14}$/);
const token=z.string().min(20).max(4096).regex(/^[\x21-\x7e]+$/).refine(v=>!v.startsWith('sb_publishable_'));
const identity=z.object({projectRef:ref,sourceSha:sha,treeSha:sha,planSha256:digest,stageId:z.enum(['prefix','native','pre-observability','remaining']),stageSha256:digest,databaseUrl:z.string().max(400),approvalDigest:digest,ciRunId:z.string().regex(/^[1-9][0-9]*$/).max(30),certificateSha256:digest}).strict();
const schema=z.object({repoRoot:z.string(),sourceSha:sha,treeSha:sha,projectRef:ref,boundProjectRef:ref,providerToken:token,storageKey:token,identity,expectedVersions:z.array(version).max(1000),plan:z.unknown().optional(),batchStage:z.unknown().optional(),batchIndex:z.number().int().positive().optional()}).strict();
const count=z.union([z.number().int().nonnegative().max(1000),z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v=>Number(v)<=1000)]).transform(Number);
const countsSchema=z.object({bucketCount:count,totalObjects:count,operatorObjects:count,otherObjects:count,invalidOperatorPaths:count}).strict();
const bucketSchema=z.object({id:z.string().max(100),name:z.string().max(100),public:z.boolean(),type:z.string().max(30),file_size_limit:z.number().int().positive(),allowed_mime_types:z.array(z.string().max(100)).max(10)}).strict();
const objectSchema=z.object({id:z.uuid(),name:z.string().max(200),version:z.string().min(1).max(100),size:z.string().regex(/^[1-9][0-9]*$/).refine(v=>Number(v)<=49152),mimetype:z.literal('application/json'),createdAt:z.string().min(1).max(100),updatedAt:z.string().min(1).max(100)}).strict();
export type HostedOperatorStorageInventory={evidence:'VERIFIED_INITIAL_OPERATOR_STORAGE_INVENTORY';projectRef:string;sourceSha:string;treeSha:string;approvalDigest:string;ciRunId:string;planSha256:string;stageId:HostedExecutionJournal['identity']['stageId'];stageSha256:string;expectedVersionsSha256:string;observedAtMs:number;startedAtMs:number;bytesVerificationStartedAtMs:number;bytesVerifiedAtMs:number;countsVerifiedAtMs:number;completedAtMs:number;totalStorageObjects:number;verifiedOperatorObjects:number;applicationStorageObjects:0;bucketMetadataSha256:string;objectSetSha256:string;remoteProjectSha256:string;operations:{operation:string;state:'INTENT'|'COMMITTED'|'REQUIRES_REVIEW'|'OWNER_ONLY';identity:HostedExecutionJournal['identity'];identitySha256:string;chainSha256:string;objectCount:number}[]};
function own(value:unknown,depth=0):unknown{
 if(depth>12)throw failure();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 if(Array.isArray(value)){if(value.length>1000||Reflect.ownKeys(value).length!==value.length+1)throw failure();for(let i=0;i<value.length;i++){const field=Object.getOwnPropertyDescriptor(value,String(i));if(!field||!('value'in field)||!field.enumerable)throw failure();}}
 const output:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();Object.defineProperty(output,key,{value:own(field.value,depth+1),enumerable:true});}return output;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Every bounded read settles before refusal; no sibling remains behind a returned result. */
async function readWave<const T extends readonly unknown[]>(requests:{[K in keyof T]:Promise<T[K]>}):Promise<T>{
 const results=await Promise.allSettled(requests);if(results.some(result=>result.status==='rejected'))throw failure();
 return results.map(result=>{if(result.status!=='fulfilled')throw failure();return result.value;}) as unknown as T;
}
function validTimestamp(value:string){if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$/.test(value))return false;const date=new Date(value);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,19)===value.slice(0,19);}
function sourcePolicy(input:z.infer<typeof schema>){
 const loaded=readCanonicalMigrationSources(input),replay=replayPlan(loaded.sources),names=[...replay.before,replay.prerequisite,...replay.remaining],all=names.map(n=>n.slice(0,14)),stop=replay.remaining.indexOf(posthogIntelligenceMigration);
 const supplied=input.plan===undefined?undefined:JSON.parse(canonicalHostedMigrationPlan(input.plan as HostedMigrationPlanV1).json) as HostedMigrationPlanV1;
 if(supplied&&(supplied.source.sha!==input.sourceSha||supplied.source.tree!==input.treeSha||supplied.projectRef!==input.projectRef||canonicalHostedMigrationPlan(supplied).sha256!==input.identity.planSha256||!(supplied.priorSchemaRelease?verifyPriorSchemaPrefix(input.repoRoot,supplied):verifyCompletedMigrationPrefix(input.repoRoot,supplied))))throw failure();
 const boundaries=[0,replay.before.length,replay.before.length+1,replay.before.length+1+stop,all.length].map(n=>Math.max(n,supplied?.applied.length??0));if(stop<0||new Set(input.expectedVersions).size!==input.expectedVersions.length||!boundaries.includes(input.expectedVersions.length)&&!input.batchStage||!same([...input.expectedVersions].sort(),all.slice(0,input.expectedVersions.length).sort()))throw failure();
 const stageIndex=['prefix','native','pre-observability','remaining'].indexOf(input.identity.stageId);if(input.batchStage){if(!supplied||!input.batchIndex)throw failure();const parent=input.batchStage as HostedMigrationBatchStage,completedSource=supplied.priorCompletedRelease&&parent.expectedBeforeVersions.length===supplied.priorCompletedRelease.migrationCount?readHistoricalMigrationSources(input.repoRoot,supplied.priorCompletedRelease.sourceSha,supplied.priorCompletedRelease.treeSha):undefined,derived=deriveHostedMigrationBatches({sources:loaded.sources,stage:parent,...(completedSource?{completedSource}:{}),...(supplied.reconciliationTemplate?{reconciliationTemplate:supplied.reconciliationTemplate}:{})}),child=derived.batches[input.batchIndex-1];if(!child||parent.id!==input.identity.stageId||derived.stageSha256!==input.identity.stageSha256||![child.expectedBeforeVersions,child.expectedAfterVersions].some(versions=>same(versions,[...input.expectedVersions].sort())))throw failure();}else if(![boundaries[stageIndex],boundaries[stageIndex+1]].includes(input.expectedVersions.length)||input.batchIndex)throw failure();
 const original=loaded.sources.find(s=>s.name==='20261001091554_private_asset_implementation.sql'),tightened=loaded.sources.find(s=>s.name==='20261001094217_private_asset_semantic_integrity.sql');
 if(!original||!tightened||hash(original.bytes)!=='5f9cef3b0f4e94decb55142a9adebf0452d9102d7139c4691f6bad1dd0a34f14'||hash(tightened.bytes)!=='a924f633d282b61bff17b50f646e288d05b59287c6fb560a3b665194e7ea0068')throw failure();
 const expected=[{id:bucket,name:bucket,public:false,type:'STANDARD',file_size_limit:49152,allowed_mime_types:['application/json']}];
 if(input.expectedVersions.includes('20261001091554'))expected.push({id:'learner-private',name:'learner-private',public:false,type:'STANDARD',file_size_limit:input.expectedVersions.includes('20261001094217')?524288:2097152,allowed_mime_types:['text/plain','image/png','image/jpeg','application/pdf']});
 return expected.sort((a,b)=>a.id.localeCompare(b.id));
}
/** Read-only exact initial operator-object inventory. Caller retains current
 * source/approval/DB-lease authority; this receipt is not private ACL proof. */
export async function readHostedOperatorStorageInventory(value:unknown):Promise<HostedOperatorStorageInventory>{
 try{
  let permit:unknown;const supplied:Record<string,unknown>=Object.create(null);if(!value||typeof value!=='object'||types.isProxy(value))throw failure();for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();if(key==='reconciliationPermit')permit=field.value;else Object.defineProperty(supplied,key,{value:field.value,enumerable:true});}
  const startedAtMs=Date.now();if(!Number.isSafeInteger(startedAtMs)||startedAtMs<0)throw failure();const input=schema.parse(own(supplied));if(input.projectRef!==input.boundProjectRef||input.projectRef!==input.identity.projectRef||input.sourceSha!==input.identity.sourceSha||input.treeSha!==input.identity.treeSha)throw failure();if(input.batchStage||permit!==undefined){const native=assertNativeReconciliationPermit(permit,input.identity);if(!native)throw failure();}
  const expectedBuckets=sourcePolicy(input),pattern='^migration/v1/'+input.projectRef+'/[a-f0-9]{64}/(owner[.]json|00000[1-3][.]record[.]json)$',pathPattern=new RegExp(pattern);
  const request=async(url:string,headers:Record<string,string>,method:'GET'|'POST',body?:string):Promise<Uint8Array>=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
   try{const response=await fetch(url,{method,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body}),cache:'no-store',redirect:'error',signal:controller.signal});if(!response.ok||response.redirected||response.url&&response.url!==url||!response.body)throw failure();const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>65536))throw failure();reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;while(true){const part=await new Promise<ReadableStreamReadResult<Uint8Array>>((done,reject)=>{const abort=()=>{controller.signal.removeEventListener('abort',abort);reject(failure());};if(controller.signal.aborted)return abort();controller.signal.addEventListener('abort',abort,{once:true});void reader!.read().then(p=>{controller.signal.removeEventListener('abort',abort);done(p);},()=>{controller.signal.removeEventListener('abort',abort);reject(failure());});});if(controller.signal.aborted)throw failure();if(part.done)break;size+=part.value.byteLength;if(size>65536)throw failure();chunks.push(part.value);}return Buffer.concat(chunks);}finally{clearTimeout(timer);controller.abort();if(reader){void reader.cancel().catch(()=>undefined);try{reader.releaseLock();}catch{/* Pending transport cleanup retains ownership. */}}}
  };
  const decode=(b:Uint8Array)=>new TextDecoder('utf8',{fatal:true}).decode(b);
  const management=async(query:string)=>JSON.parse(decode(await request('https://api.supabase.com/v1/projects/'+input.projectRef+'/database/query',{Authorization:'Bearer '+input.providerToken},'POST',JSON.stringify({query})))) as unknown;
  const storage=async(path:string)=>request('https://'+input.projectRef+'.supabase.co/storage/v1/'+path,hostedOperatorStorageHeaders(input.storageKey),'GET');
  const countsQuery="/* CUEVO_STORAGE_INVENTORY_COUNTS */ select (select count(*) from storage.buckets) as \"bucketCount\",(select count(*) from storage.objects) as \"totalObjects\",(select count(*) from storage.objects where bucket_id='cuevo-release-operator') as \"operatorObjects\",(select count(*) from storage.objects where bucket_id is distinct from 'cuevo-release-operator') as \"otherObjects\",(select count(*) from storage.objects where bucket_id='cuevo-release-operator' and(name is null or name !~ '"+pattern+"')) as \"invalidOperatorPaths\"";
  const readCounts=async()=>z.array(countsSchema).length(1).parse(await management(countsQuery))[0];
  const readBuckets=async()=>z.array(bucketSchema).max(3).parse(await management('/* CUEVO_STORAGE_INVENTORY_BUCKETS */ select id,name,public,type::text as type,file_size_limit,allowed_mime_types from storage.buckets order by id limit 3'));
  const readPage=async(offset:number)=>z.array(objectSchema).max(100).parse(await management("/* CUEVO_STORAGE_INVENTORY_OBJECTS */ select id::text as id,name,version,metadata->>'size' as size,metadata->>'mimetype' as mimetype,to_char(created_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as \"createdAt\",to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as \"updatedAt\" from storage.objects where bucket_id='cuevo-release-operator' and name ~ '"+pattern+"' order by name limit 100 offset "+offset));
  const snapshot=async()=>{
   // Independent metadata reads share one request wave; later pages retain
   // their strict sequential cursor/count and two-snapshot comparison.
   const[counts,buckets,firstPage]=await readWave([readCounts(),readBuckets(),readPage(0)]);
   if(counts.bucketCount!==expectedBuckets.length||counts.totalObjects!==counts.operatorObjects||counts.otherObjects!==0||counts.invalidOperatorPaths!==0||!same(buckets,expectedBuckets))throw failure();
   const rows:z.infer<typeof objectSchema>[]=[];let prior='';const ids=new Set<string>();for(let offset=0;offset<=1000;offset+=100){const page=offset===0?firstPage:await readPage(offset);for(const row of page){if(!pathPattern.test(row.name)||row.name<=prior||ids.has(row.id)||!validTimestamp(row.createdAt)||!validTimestamp(row.updatedAt))throw failure();prior=row.name;ids.add(row.id);rows.push(row);}if(rows.length>1000)throw failure();if(page.length<100){if(rows.length!==counts.totalObjects)throw failure();return{counts,buckets,rows};}}throw failure();
  };
  // Both independently validated metadata owners finish before any project
  // chain inspection. The original byte clock covers this whole read wave.
  const bytesVerificationStartedAtMs=Date.now(),[before,remote]=await readWave([snapshot(),createHostedMigrationRemoteJournal({projectRef:input.projectRef,boundProjectRef:input.boundProjectRef,identity:input.identity,providerToken:input.providerToken,storageKey:input.storageKey,...(permit!==undefined?{reconciliationPermit:permit}:{})})]);
  const project=await remote.inspectProject();
  const verified=project.operations.flatMap(o=>o.objects).sort((a,b)=>a.path.localeCompare(b.path));if(verified.length!==before.rows.length||new Set(verified.map(o=>o.path)).size!==verified.length)throw failure();
  const verifyObject=async(row:z.infer<typeof objectSchema>,index:number)=>{
   const actual=verified[index];if(!actual||actual.path!==row.name||actual.size!==Number(row.size))throw failure();
   const[infoBytes,bytes]=await readWave([storage('object/info/'+bucket+'/'+row.name),storage('object/'+bucket+'/'+row.name)]);
   const info=z.object({id:z.string(),name:z.string(),bucket_id:z.literal(bucket),size:z.number().int().positive().max(49152),content_type:z.literal('application/json'),version:z.string().min(1).optional()}).parse(JSON.parse(decode(infoBytes)));
   if(info.id!==row.id||info.name!==row.name||info.size!==Number(row.size)||info.version!==undefined&&info.version!==row.version)throw failure();
   if(bytes.length!==actual.size||hash(bytes)!==actual.sha256)throw failure();
  };
  // Four admitted objects per wave, each with independent INFO/body reads:
  // at most eight requests, with every result verified before the next wave.
  for(let offset=0;offset<before.rows.length;offset+=4){
   await readWave(before.rows.slice(offset,offset+4).map((row,index)=>verifyObject(row,offset+index)));
  }
  const[after,confirmed,finalCounts]=await readWave([snapshot(),remote.inspectProject(),readCounts()]);if(!same(before,after)||!same(project.operations,confirmed.operations)||project.sha256!==confirmed.sha256||!same(after.counts,finalCounts))throw failure();const bytesVerifiedAtMs=confirmed.observedAtMs;if(!Number.isSafeInteger(bytesVerifiedAtMs)||bytesVerifiedAtMs<bytesVerificationStartedAtMs||bytesVerificationStartedAtMs<startedAtMs||bytesVerifiedAtMs>Date.now())throw failure();sourcePolicy(input);const sourceConfirmedCounts=await readCounts();if(!same(finalCounts,sourceConfirmedCounts))throw failure();const countsVerifiedAtMs=Date.now(),completedAtMs=countsVerifiedAtMs;if(!Number.isSafeInteger(completedAtMs)||completedAtMs<bytesVerifiedAtMs)throw failure();
  return{evidence:'VERIFIED_INITIAL_OPERATOR_STORAGE_INVENTORY',projectRef:input.projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,approvalDigest:input.identity.approvalDigest,ciRunId:input.identity.ciRunId,planSha256:input.identity.planSha256,stageId:input.identity.stageId,stageSha256:input.identity.stageSha256,expectedVersionsSha256:hash(JSON.stringify([...input.expectedVersions].sort())),observedAtMs:Math.min(bytesVerificationStartedAtMs,countsVerifiedAtMs),startedAtMs,bytesVerificationStartedAtMs,bytesVerifiedAtMs,countsVerifiedAtMs,completedAtMs,totalStorageObjects:before.counts.totalObjects,verifiedOperatorObjects:verified.length,applicationStorageObjects:0,bucketMetadataSha256:hash(JSON.stringify(before.buckets)),objectSetSha256:hash(JSON.stringify(before.rows)),remoteProjectSha256:project.sha256,operations:project.operations.map(o=>({operation:o.operation,state:o.state,identity:o.identity,identitySha256:hash(JSON.stringify(o.identity)),chainSha256:o.chainSha256,objectCount:o.objects.length}))};
 }catch{throw failure();}
}
