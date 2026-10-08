import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {z} from 'zod';
import {hostedOperatorStorageHeaders} from './hosted-operator-storage-policy';
import {createHostedMigrationRemoteJournal} from './hosted-migration-remote-journal';
import {assertNativeReconciliationPermit} from './hosted-migration-database';
import {schema,countsSchema,bucketSchema,objectSchema,own,same,validTimestamp,sourcePolicy,type HostedOperatorStorageInventory} from './hosted-operator-storage-observation';
export {nativeHostedOperatorStorageCountsSchema,nativeHostedOperatorStorageBucketsSchema,nativeHostedOperatorStorageObjectsSchema,nativeHostedOperatorStorageBucketPolicy,prepareNativeHostedOperatorStorageInventory} from './hosted-operator-storage-observation';
export type {HostedOperatorStorageInventory,NativeHostedOperatorStorageSnapshot} from './hosted-operator-storage-observation';
const bucket='cuevo-release-operator',failure=()=>Error('Hosted operator Storage inventory, source or metadata requires review; contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
async function readWave<const T extends readonly unknown[]>(requests:{[K in keyof T]:Promise<T[K]>}):Promise<T>{const results=await Promise.allSettled(requests);if(results.some(result=>result.status==='rejected'))throw failure();return results.map(result=>{if(result.status!=='fulfilled')throw failure();return result.value;}) as unknown as T;}
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
