import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import type { HostedExecutionJournal } from './hosted-migration-execution';
import { hostedOperatorStorageHeaders } from './hosted-operator-storage-policy';

const purpose = 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL', bucket = 'cuevo-release-operator';
const failure = () => Error('Remote migration journal identity, private storage or original intent requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/), ref = z.string().regex(/^[a-z]{20}$/);
const identitySchema = z.object({ projectRef: ref, sourceSha: sha, treeSha: sha, planSha256: digest, stageId: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), stageSha256: digest, databaseUrl: z.string().max(400), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/).max(30), certificateSha256: digest }).strict();
const payloadSchema = z.object({ version: z.literal(1), identity: identitySchema, state: z.enum(['INTENT', 'COMMITTED', 'REQUIRES_REVIEW']), schemaHistoryAtomic: z.literal(false), evidence: z.literal('SUPPLIED_PORT_EXECUTION_ONLY') }).strict();
const ownerSchema = z.object({ version: z.literal(1), purpose: z.literal(purpose), identity: identitySchema }).strict();
const recordSchema = z.object({ version: z.literal(1), purpose: z.literal(purpose), sequence: z.number().int().min(1).max(3), previousSha256: digest.nullable(), payload: payloadSchema, payloadSha256: digest }).strict();
const privateToken = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const bucketSchema = z.object({ id: z.literal(bucket), name: z.literal(bucket), public: z.literal(false), type: z.literal('STANDARD'), file_size_limit: z.literal(49152), allowed_mime_types: z.array(z.literal('application/json')).length(1) });
const storageBucketSchema = bucketSchema.extend({ type: z.literal('STANDARD').optional() });
const bucketMetadataQuery = "select id,name,public,type::text as type,file_size_limit,allowed_mime_types from storage.buckets where id='cuevo-release-operator'";
const entrySchema = z.object({ name: z.string().min(1).max(100), id: z.string().min(1).nullable(), metadata: z.object({ size: z.number().int().min(1).max(49152), mimetype: z.literal('application/json') }).passthrough().nullable() }).passthrough();
const infoSchema = z.object({ id: z.string().min(1), name: z.string(), bucket_id: z.literal(bucket), size: z.number().int().min(1).max(49152), content_type: z.literal('application/json') });
export type Chain = { operation: string; identity: HostedExecutionJournal['identity']; ownerBytes: string; records: { bytes: string; payload: HostedExecutionJournal }[] };
export type HostedMigrationStorageObjectObservation={path:string;id:string;version:string|null;size:number;mimetype:'application/json';sha256:string;bytes:string};
export type HostedMigrationStorageProjectObservation={evidence:'READ_ONLY_STORAGE_PROJECT_COMPARISON';projectRef:string;observedAtMs:number;completedAtMs:number;bucket:z.infer<typeof storageBucketSchema>;operations:(RemoteMigrationProjectReceipt['operations'][number]&{ownerBytes:string;records:{bytes:string;payload:HostedExecutionJournal}[]})[];objects:HostedMigrationStorageObjectObservation[]};
export type RemoteMigrationProjectReceipt = { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA'; projectRef: string; observedAtMs: number; sha256: string; operations: { operation: string; identity: HostedExecutionJournal['identity']; state: HostedExecutionJournal['state'] | 'OWNER_ONLY'; chainSha256: string; objects: { path: string; sha256: string; size: number }[] }[] };
function own(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure(); if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const output: Record<string, unknown> = Object.create(null); for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); output[key] = own(field.value, depth + 1); } return output;
}
function identity(value: unknown) { const checked = identitySchema.parse(own(value)), url = new URL(checked.databaseUrl); const direct = url.hostname === `db.${checked.projectRef}.supabase.co` && url.username === 'postgres', pooler = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${checked.projectRef}`; if (url.protocol !== 'postgresql:' || url.password || url.port !== '5432' || url.pathname !== '/postgres' || url.search !== '?sslmode=verify-full' || url.hash || url.toString() !== checked.databaseUrl || !(direct || pooler)) throw failure(); return checked; }
const json = (value: unknown) => JSON.stringify(value) + '\n';
function transition(prior: HostedExecutionJournal['state'] | undefined, next: HostedExecutionJournal['state']) { return prior === undefined ? next === 'INTENT' : prior === 'INTENT' ? next === 'COMMITTED' || next === 'REQUIRES_REVIEW' : prior === 'COMMITTED' && next === 'REQUIRES_REVIEW'; }
function decode(bytes: Uint8Array) { return new TextDecoder('utf8', { fatal: true }).decode(bytes); }


type FixedCollectorInput={projectRef:string;storageKey:string;providerToken?:string;signal?:AbortSignal};
function createFixedRemoteCollector(input:FixedCollectorInput,mode:'STORAGE_ONLY'|'MANAGEMENT_AND_STORAGE'){
  const origin=`https://${input.projectRef}.supabase.co/storage/v1`,projectPrefix=`migration/v1/${input.projectRef}`;
  const observedObjects=new Map<string,HostedMigrationStorageObjectObservation>();
  const transport = async (path: string, method: 'GET' | 'POST', body?: string, upload = false, missing = false, management = false): Promise<{ status: number; bytes: Uint8Array }> => {
    if(input.signal?.aborted)throw failure();const controller = new AbortController(),abort=()=>controller.abort(),timer = setTimeout(() => controller.abort(), 15000);input.signal?.addEventListener('abort',abort,{once:true}); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined,result:{status:number;bytes:Uint8Array}|undefined,failed=false;
    try {
      const url = management ? `https://api.supabase.com/v1/projects/${input.projectRef}/database/query` : `${origin}/${path}`, response = await fetch(url, { method, headers: { ...(management ? { Authorization: 'Bearer ' + input.providerToken } : hostedOperatorStorageHeaders(input.storageKey)), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(upload ? { 'x-upsert': 'false', 'Cache-Control': 'no-store' } : {}) }, ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', signal: controller.signal });
      if (response.redirected || response.url && response.url !== url || response.status === 404 && !missing || !response.ok && !(upload && response.status === 409) && !(missing && response.status === 404)) throw failure();
      if (response.status === 404 || response.status === 409) { void response.body?.cancel().catch(() => undefined); result={status:response.status,bytes:new Uint8Array()};return result; }
      const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 65536) || !response.body) throw failure();
      reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }; if (controller.signal.aborted) return abort(); controller.signal.addEventListener('abort', abort, { once: true }); void reader!.read().then(part => { controller.signal.removeEventListener('abort', abort); done(part); }, () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }); }); if (controller.signal.aborted) throw failure(); if (part.done) break; size += part.value.byteLength; if (size > 65536) throw failure(); chunks.push(part.value); }
      result={status:response.status,bytes:Buffer.concat(chunks)};
    } catch { failed=true; } finally { clearTimeout(timer);input.signal?.removeEventListener('abort',abort); controller.abort(); if (reader) { const cancelled=reader.cancel().then(()=>true,()=>false);if(mode==='STORAGE_ONLY'){let cancellationTimer:ReturnType<typeof setTimeout>|undefined;try{const cancellationConfirmed=await Promise.race([cancelled,new Promise<false>(done=>{cancellationTimer=setTimeout(()=>done(false),15000);})]);if(!cancellationConfirmed)failed=true;}finally{if(cancellationTimer)clearTimeout(cancellationTimer);}}else void cancelled;try { reader.releaseLock(); } catch { /* Cancelled transport retains its pending read cleanup. */ } } }
    if(failed||!result)throw failure();return result;
  };
  // Only private reads share this fixed cap. Uploads retain their original
  // serialized write owner and each active request retains its own deadline.
  let activeReads=0;const queuedReads:(()=>void)[]=[];
  const request = async (...args:Parameters<typeof transport>):ReturnType<typeof transport> => {
    if(input.signal?.aborted)throw failure();if(args[3]===true)return transport(...args);
    if(activeReads>=8)await new Promise<void>(done=>queuedReads.push(done));else activeReads++;
    try{return await transport(...args);}finally{const next=queuedReads.shift();if(next)next();else activeReads--;}
  };
  const readWave=async<T extends readonly unknown[]>(reads:{[K in keyof T]:Promise<T[K]>}):Promise<T>=>{const settled=await Promise.allSettled(reads);if(settled.some(row=>row.status==='rejected'))throw failure();return settled.map(row=>{if(row.status!=='fulfilled')throw failure();return row.value;}) as unknown as T;};
  const bucketRead = async () => {
    if(mode==='STORAGE_ONLY')return storageBucketSchema.parse(JSON.parse(decode((await request(`bucket/${bucket}`,'GET')).bytes)));
    const [managed,stored]=await readWave([request('', 'POST', JSON.stringify({ query: bucketMetadataQuery }), false, false, true),request(`bucket/${bucket}`, 'GET')]);const metadata=z.array(bucketSchema).length(1).parse(JSON.parse(decode(managed.bytes)))[0],storage=storageBucketSchema.parse(JSON.parse(decode(stored.bytes)));const comparable=(value:typeof storage)=>({id:value.id,name:value.name,public:value.public,file_size_limit:value.file_size_limit,allowed_mime_types:value.allowed_mime_types});if(JSON.stringify(comparable(storage))!==JSON.stringify(comparable(metadata)))throw failure();return storage;
  };
  const list = async (prefix: string) => {
    const entries: z.infer<typeof entrySchema>[] = []; const seen = new Set<string>(); let prior = '';
    for (let offset = 0; offset <= 1000; offset += 100) {
      const received = z.array(entrySchema).max(100).parse(JSON.parse(decode((await request(`object/list/${bucket}`, 'POST', JSON.stringify({ prefix, offset, limit: 100, sortBy: { column: 'name', order: 'asc' } }))).bytes)));
      for (const row of received) { if (seen.has(row.name) || row.name <= prior || row.name.includes('/') || row.name.includes('\\')) throw failure(); entries.push(row); seen.add(row.name); prior = row.name; }
      if (entries.length > 1000) throw failure(); if (received.length < 100) return entries;
    }
    throw failure();
  };
  const download = async (path: string, listed?: z.infer<typeof entrySchema>): Promise<string | null> => {
    const readBody=()=>request(`object/${bucket}/${path}`, 'GET', undefined, false, !listed),readInfo=()=>request(`object/info/${bucket}/${path}`, 'GET');
    const [read,info]=listed?await readWave([readBody(),readInfo()]):await (async()=>{const read=await readBody();return read.status===404?[read,null] as const:[read,await readInfo()] as const;})();
    if(read.status===404)return null;if(read.bytes.length>49152||!info)throw failure();
    const rawInfo=JSON.parse(decode(info.bytes)),metadata=infoSchema.parse(rawInfo),version=mode==='STORAGE_ONLY'?z.string().min(1).max(100).nullable().parse(rawInfo.version??null):null;if(metadata.name!==path||metadata.size!==read.bytes.length||listed&&(listed.id!==metadata.id||listed.metadata?.size!==metadata.size))throw failure();const bytes=decode(read.bytes);observedObjects.set(path,{path,id:metadata.id,version,size:metadata.size,mimetype:'application/json',sha256:hash(read.bytes),bytes});return bytes;
  };
  const chain = async (name: string): Promise<Chain> => {
    if (!/^[a-f0-9]{64}$/.test(name)) throw failure(); const prefix = `${projectPrefix}/${name}`, entries = await list(prefix), names = entries.map(row => row.name); const expected = ['owner.json', ...names.filter(name => /^00000[1-3]\.record\.json$/.test(name))].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected) || entries.some(row => row.id === null || row.metadata === null) || names.length > 4) throw failure();
    const downloaded=await readWave(entries.map(row=>download(`${prefix}/${row.name}`,row))),ownerBytes=downloaded[entries.findIndex(row=>row.name==='owner.json')];if(ownerBytes===null||ownerBytes===undefined)throw failure();const owner=ownerSchema.parse(own(JSON.parse(ownerBytes))),checked=identity(owner.identity);if(checked.projectRef!==input.projectRef||hash(JSON.stringify(checked))!==name||ownerBytes!==json({version:1,purpose,identity:checked}))throw failure();
    const records: Chain['records'] = []; let previous: string | null = null;
    const recordEntries=entries.filter(row=>row.name!=='owner.json');for(const[index,row]of recordEntries.entries())if(row.name!==String(index+1).padStart(6,'0')+'.record.json')throw failure();
    for (const [index, row] of recordEntries.entries()) { if (row.name !== String(index + 1).padStart(6, '0') + '.record.json') throw failure(); const bytes = downloaded[entries.findIndex(entry=>entry.name===row.name)]; if (bytes === null||bytes===undefined) throw failure(); const raw = JSON.parse(bytes), record = recordSchema.parse(own(raw)), checkedIdentity = identity(record.payload.identity); if (record.sequence !== index + 1 || record.previousSha256 !== previous || JSON.stringify(checkedIdentity) !== JSON.stringify(checked) || record.payloadSha256 !== hash(JSON.stringify(raw.payload)) || !transition(records.at(-1)?.payload.state, record.payload.state) || bytes !== json(raw)) throw failure(); records.push({ bytes, payload: raw.payload as HostedExecutionJournal }); previous = hash(bytes); }
    if (!sameEntries(entries, await list(prefix))) throw failure(); return { operation: name, identity: checked, ownerBytes, records };
  };
  function sameEntries(left: z.infer<typeof entrySchema>[], right: z.infer<typeof entrySchema>[]) { return JSON.stringify(left.map(row => ({ name: row.name, id: row.id, metadata: row.metadata }))) === JSON.stringify(right.map(row => ({ name: row.name, id: row.id, metadata: row.metadata }))); }
  let lastBucket:z.infer<typeof storageBucketSchema>|null=null;const inspect = async () => { const[entries,beforeBucket]=await readWave([list(projectPrefix),bucketRead()]); if (entries.some(row => row.id !== null || row.metadata !== null || !/^[a-f0-9]{64}$/.test(row.name))) throw failure(); const chains: Chain[] = [];for(let start=0;start<entries.length;start+=4)chains.push(...await readWave(entries.slice(start,start+4).map(row=>chain(row.name))));const[after,afterBucket]=await readWave([list(projectPrefix),bucketRead()]);if(JSON.stringify(beforeBucket)!==JSON.stringify(afterBucket))throw failure();lastBucket=afterBucket;if (!sameEntries(entries,after)) throw failure(); return chains; };
  const publishExactOperatorObject=async(current:HostedExecutionJournal['identity'],path:string,bytes:string)=>{if(mode!=='MANAGEMENT_AND_STORAGE')throw failure();const checked=identity(current),prefix=`migration/v1/${input.projectRef}/${hash(JSON.stringify(checked))}/`;if(checked.projectRef!==input.projectRef||!path.startsWith(prefix)||!['owner.json','000001.record.json','000002.record.json','000003.record.json'].includes(path.slice(prefix.length))||Buffer.byteLength(bytes)>49152||bytes.includes(input.storageKey)||input.providerToken&&bytes.includes(input.providerToken))throw failure();await request(`object/${bucket}/${path}`,'POST',bytes,true);const[read,info]=await readWave([request(`object/${bucket}/${path}`,'GET'),request(`object/info/${bucket}/${path}`,'GET')]);const metadata=infoSchema.parse(JSON.parse(decode(info.bytes)));if(metadata.name!==path||metadata.size!==Buffer.byteLength(bytes)||decode(read.bytes)!==bytes)throw failure();};
  return{bucketRead,inspect,publishExactOperatorObject,bucket:()=>lastBucket,objects:()=>[...observedObjects.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}

/** Fixed internal effect-wrapper reader. It exposes neither request flags nor
 * SQL/path callbacks; writes remain confined to its captured original identity. */
export function createHostedMigrationOperatorStorage(value:unknown){
  const input=z.object({projectRef:ref,boundProjectRef:ref,storageKey:privateToken,providerToken:privateToken,identity:identitySchema}).strict().parse(own(value));const current=identity(input.identity);if(input.projectRef!==input.boundProjectRef||current.projectRef!==input.projectRef)throw failure();const reader=createFixedRemoteCollector(input,'MANAGEMENT_AND_STORAGE');return{bucketRead:reader.bucketRead,inspect:reader.inspect,publishOperatorRecord:(path:string,bytes:string)=>reader.publishExactOperatorObject(current,path,bytes)};
}
/** Fixed comparison reads only. It never accepts a provider token, SQL,
 * callback or permit and never supplies effect authority. */
export async function observeHostedMigrationStorageProject(value:unknown):Promise<HostedMigrationStorageProjectObservation>{
 try{
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();const supplied:Record<string,unknown>=Object.create(null);let signal:AbortSignal|undefined;
  for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();if(key==='signal'){if(!(field.value instanceof AbortSignal)||types.isProxy(field.value))throw failure();Reflect.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!.call(field.value);signal=field.value;}else supplied[key]=field.value;}
  const input=z.object({projectRef:ref,boundProjectRef:ref,storageKey:privateToken}).strict().parse(own(supplied));if(input.projectRef!==input.boundProjectRef||!signal||signal.aborted)throw failure();const observedAtMs=Date.now(),collector=createFixedRemoteCollector({...input,signal},'STORAGE_ONLY'),before=await collector.inspect(),beforeBucket=collector.bucket(),beforeObjects=collector.objects(),after=await collector.inspect(),afterBucket=collector.bucket(),objects=collector.objects(),completedAtMs=Date.now();
  if(!beforeBucket||!afterBucket||signal.aborted||!Number.isSafeInteger(observedAtMs)||!Number.isSafeInteger(completedAtMs)||completedAtMs<observedAtMs||JSON.stringify(beforeBucket)!==JSON.stringify(afterBucket)||JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(beforeObjects)!==JSON.stringify(objects))throw failure();
  const projectPrefix=`migration/v1/${input.projectRef}`,operations=after.map(row=>({operation:row.operation,identity:structuredClone(row.identity),state:row.records.at(-1)?.payload.state??'OWNER_ONLY' as const,chainSha256:hash(row.ownerBytes+row.records.map(record=>record.bytes).join('')),ownerBytes:row.ownerBytes,records:structuredClone(row.records),objects:[{path:`${projectPrefix}/${row.operation}/owner.json`,sha256:hash(row.ownerBytes),size:Buffer.byteLength(row.ownerBytes)},...row.records.map((record,index)=>({path:`${projectPrefix}/${row.operation}/${String(index+1).padStart(6,'0')}.record.json`,sha256:hash(record.bytes),size:Buffer.byteLength(record.bytes)}))]}));
  if(objects.length!==operations.reduce((count,row)=>count+row.objects.length,0))throw failure();return{evidence:'READ_ONLY_STORAGE_PROJECT_COMPARISON',projectRef:input.projectRef,observedAtMs,completedAtMs,bucket:afterBucket,operations,objects};
 }catch{throw failure();}
}
