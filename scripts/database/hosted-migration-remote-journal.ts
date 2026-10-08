import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import type { HostedExecutionJournal, HostedExecutionPorts } from './hosted-migration-execution';
import {createHostedMigrationOperatorStorage} from './hosted-migration-storage-observation';
export {observeHostedMigrationStorageProject} from './hosted-migration-storage-observation';
export type {HostedMigrationStorageProjectObservation,HostedMigrationStorageObjectObservation} from './hosted-migration-storage-observation';

const purpose = 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL';
const failure = () => Error('Remote migration journal identity, private storage or original intent requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/), ref = z.string().regex(/^[a-z]{20}$/);
const identitySchema = z.object({ projectRef: ref, sourceSha: sha, treeSha: sha, planSha256: digest, stageId: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), stageSha256: digest, databaseUrl: z.string().max(400), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/).max(30), certificateSha256: digest }).strict();
const payloadSchema = z.object({ version: z.literal(1), identity: identitySchema, state: z.enum(['INTENT', 'COMMITTED', 'REQUIRES_REVIEW']), schemaHistoryAtomic: z.literal(false), evidence: z.literal('SUPPLIED_PORT_EXECUTION_ONLY') }).strict();
const privateToken = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const inputSchema = z.object({ projectRef: ref, boundProjectRef: ref, storageKey: privateToken, providerToken: privateToken, identity: identitySchema }).strict();
type Chain = { operation: string; identity: HostedExecutionJournal['identity']; ownerBytes: string; records: { bytes: string; payload: HostedExecutionJournal }[] };
export type RemoteMigrationProjectReceipt = { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA'; projectRef: string; observedAtMs: number; sha256: string; operations: { operation: string; identity: HostedExecutionJournal['identity']; state: HostedExecutionJournal['state'] | 'OWNER_ONLY'; chainSha256: string; objects: { path: string; sha256: string; size: number }[] }[] };
export type RemoteMigrationTransitionReceipt={kind:'SYNCED';sha256:string;payload:HostedExecutionJournal}|{kind:'UNCONFIRMED'};
export type HostedMigrationRemoteJournal = Pick<HostedExecutionPorts, 'readJournal' | 'writeJournal'> & { compareAndWriteJournal(previous:HostedExecutionJournal|null,value:HostedExecutionJournal):Promise<RemoteMigrationTransitionReceipt>;inspectProject(): Promise<RemoteMigrationProjectReceipt>;readOwnedSafetyJournal():Promise<HostedExecutionJournal> };
function own(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure(); if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const output: Record<string, unknown> = Object.create(null); for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); output[key] = own(field.value, depth + 1); } return output;
}
function inputWithPermit(value:unknown){
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
  const metadata:Record<string,unknown>=Object.create(null);let reconciliationPermit:unknown,permitPresent=false;
  for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();if(key==='reconciliationPermit'){permitPresent=true;reconciliationPermit=field.value;}else Object.defineProperty(metadata,key,{value:own(field.value),enumerable:true});}
  return{metadata,permitPresent,reconciliationPermit};
}
function identity(value: unknown) { const checked = identitySchema.parse(own(value)), url = new URL(checked.databaseUrl); const direct = url.hostname === `db.${checked.projectRef}.supabase.co` && url.username === 'postgres', pooler = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${checked.projectRef}`; if (url.protocol !== 'postgresql:' || url.password || url.port !== '5432' || url.pathname !== '/postgres' || url.search !== '?sslmode=verify-full' || url.hash || url.toString() !== checked.databaseUrl || !(direct || pooler)) throw failure(); return checked; }
const json = (value: unknown) => JSON.stringify(value) + '\n';
function transition(prior: HostedExecutionJournal['state'] | undefined, next: HostedExecutionJournal['state']) { return prior === undefined ? next === 'INTENT' : prior === 'INTENT' ? next === 'COMMITTED' || next === 'REQUIRES_REVIEW' : prior === 'COMMITTED' && next === 'REQUIRES_REVIEW'; }


/** Fixed private operator Storage consumer only. Bucket creation, current
 * deployment authority, cooperative DB lock and native dual acknowledgement
 * belong to its separately reviewed caller. No generic Storage port is exposed. */
export async function createHostedMigrationRemoteJournal(value: unknown): Promise<HostedMigrationRemoteJournal> {
  let input: z.infer<typeof inputSchema>,permitPresent=false,reconciliationPermit:unknown; try { const captured=inputWithPermit(value);permitPresent=captured.permitPresent;reconciliationPermit=captured.reconciliationPermit;input = inputSchema.parse(captured.metadata); input.identity = identity(input.identity); if (input.projectRef !== input.boundProjectRef || input.projectRef !== input.identity.projectRef) throw failure(); } catch { throw failure(); }
  const projectPrefix = `migration/v1/${input.projectRef}`, operation = hash(JSON.stringify(input.identity)), ownPrefix = `${projectPrefix}/${operation}`;
  let uncertain = false, writing = false, publishedIntentSha256: string | null = null;
  // Only the native database owner's private registry can admit a permit. The
  // opaque token is never cloned or converted into caller supplied metadata.
  const requirePermit=async(safety=false)=>permitPresent?await (async()=>{const native=await import('./hosted-migration-database');return safety?native.assertNativeReconciliationSafetyRecord(reconciliationPermit,input.identity):native.assertNativeReconciliationPermit(reconciliationPermit,input.identity);})():null;
  const requirePriorOperations=async(chains:Chain[],safety=false)=>{
    const permit=await requirePermit(safety);
    const matchesOriginal=(row:Chain)=>permit!==null&&row.operation===permit.originalOperationSha256&&JSON.stringify(row.identity)===JSON.stringify(permit.originalIdentity)&&row.records.length===2&&row.records[0].payload.state==='INTENT'&&row.records[1].payload.state==='REQUIRES_REVIEW'&&hash(row.ownerBytes+row.records.map(record=>record.bytes).join(''))===permit.originalChainSha256;
    if(permit&&(permit.originalOperationSha256===operation||chains.filter(matchesOriginal).length!==1))throw failure();
    const ownedSafetyReview=(row:Chain)=>safety&&permit?.ownedSafetyIdentities?.some(identity=>JSON.stringify(identity)===JSON.stringify(row.identity))&&row.records[0]?.payload.state==='INTENT'&&row.records.at(-1)?.payload.state==='REQUIRES_REVIEW';
    if(chains.some(row=>row.operation!==operation&&row.records.at(-1)?.payload.state!=='COMMITTED'&&!matchesOriginal(row)&&!ownedSafetyReview(row)))throw failure();
  };
  const collector=createHostedMigrationOperatorStorage(input),{bucketRead}=collector;
  const inspect=async(safety=false)=>{if(uncertain&&!safety)throw failure();return collector.inspect();};
  const publish=async(path:string,bytes:string,safety=false)=>{await requirePermit(safety);await collector.publishOperatorRecord(path,bytes);await requirePermit(safety);};
  const write=async(value:unknown,comparison:{previous:HostedExecutionJournal|null}|undefined):Promise<RemoteMigrationTransitionReceipt>=>{
    if(writing)return{kind:'UNCONFIRMED'};writing=true;
    try{
      if(permitPresent){const native=await import('./hosted-migration-database');if(own(value)&&typeof value==='object'&&value!==null&&Object.getOwnPropertyDescriptor(value,'state')?.value==='REQUIRES_REVIEW'&&publishedIntentSha256!==null)native.assertNativeReconciliationSafetyRecord(reconciliationPermit,input.identity);else native.assertNativeMigrationEffectPermit(reconciliationPermit,input.identity);}
      const raw=own(value),checked=payloadSchema.parse(raw);if(JSON.stringify(identity(checked.identity))!==JSON.stringify(input.identity))throw failure();const payload=JSON.parse(JSON.stringify(raw)) as HostedExecutionJournal,payloadSha256=hash(JSON.stringify(payload)),safety=permitPresent&&payload.state==='REQUIRES_REVIEW'&&publishedIntentSha256!==null;
      let expectedPrevious:HostedExecutionJournal|null|undefined;if(comparison){expectedPrevious=comparison.previous===null?null:payloadSchema.parse(own(comparison.previous));if(expectedPrevious&&JSON.stringify(identity(expectedPrevious.identity))!==JSON.stringify(input.identity))throw failure();}
      if(uncertain&&!safety)throw failure();await requirePermit(safety);const chains=await inspect(safety);await requirePriorOperations(chains,safety);const current=chains.find(row=>row.operation===operation),previous=current?.records.at(-1);
      if(comparison&&JSON.stringify(previous?.payload??null)!==JSON.stringify(expectedPrevious))throw failure();if(safety&&(!current||hash(JSON.stringify(current.records[0]?.payload))!==publishedIntentSha256||!previous||!['INTENT','COMMITTED','REQUIRES_REVIEW'].includes(previous.payload.state)))throw failure();if(previous?.payload.state==='INTENT'&&hash(JSON.stringify(previous.payload))!==publishedIntentSha256)throw failure();if(current&&!previous)throw failure();
      if(previous&&hash(JSON.stringify(previous.payload))===payloadSha256){const after=await inspect(safety);await requirePriorOperations(after,safety);const retained=after.find(row=>row.operation===operation);if(!retained||JSON.stringify(retained)!==JSON.stringify(current)||hash(JSON.stringify(retained.records.at(-1)?.payload))!==payloadSha256||JSON.stringify(after.filter(row=>row.operation!==operation))!==JSON.stringify(chains.filter(row=>row.operation!==operation)))throw failure();return{kind:'SYNCED',sha256:payloadSha256,payload:structuredClone(retained.records.at(-1)!.payload)};}if(!transition(previous?.payload.state,payload.state))throw failure();
      const ownerBytes=json({version:1,purpose,identity:input.identity});if(!current)await publish(`${ownPrefix}/owner.json`,ownerBytes,safety);const sequence=(current?.records.length??0)+1,bytes=json({version:1,purpose,sequence,previousSha256:previous?hash(previous.bytes):null,payload,payloadSha256});if(sequence>3)throw failure();await publish(`${ownPrefix}/${String(sequence).padStart(6,'0')}.record.json`,bytes,safety);
      const after=await inspect(safety),retained=after.find(row=>row.operation===operation);await requirePriorOperations(after,safety);if(!retained||retained.ownerBytes!==ownerBytes||retained.records.length!==sequence||current&&JSON.stringify(retained.records.slice(0,-1))!==JSON.stringify(current.records)||retained.records.at(-1)?.bytes!==bytes||hash(JSON.stringify(retained.records.at(-1)?.payload))!==payloadSha256||JSON.stringify(after.filter(row=>row.operation!==operation))!==JSON.stringify(chains.filter(row=>row.operation!==operation)))throw failure();if(payload.state==='INTENT')publishedIntentSha256=payloadSha256;return{kind:'SYNCED',sha256:payloadSha256,payload:structuredClone(retained.records.at(-1)!.payload)};
    }catch{uncertain=true;return{kind:'UNCONFIRMED'};}finally{writing=false;}
  };
  try { await bucketRead(); } catch { throw failure(); }
  return {
    readJournal: async () => { try { await requirePermit();const chains = await inspect();await requirePriorOperations(chains); const current = chains.find(row => row.operation === operation); if (current && !current.records.length) throw failure(); return structuredClone(current?.records.at(-1)?.payload ?? null); } catch { uncertain = true; throw failure(); } },
    readOwnedSafetyJournal:async()=>{try{if(!permitPresent||publishedIntentSha256===null)throw failure();await requirePermit(true);const chains=await inspect(true);await requirePriorOperations(chains,true);const current=chains.find(row=>row.operation===operation),prior=current?.records.at(-1);if(!current||hash(JSON.stringify(current.records[0]?.payload))!==publishedIntentSha256||!prior)throw failure();return structuredClone(prior.payload);}catch{uncertain=true;throw failure();}},
    inspectProject: async () => { try { const chains = await inspect(), operations: RemoteMigrationProjectReceipt['operations'] = chains.map(row => ({ operation: row.operation, identity: structuredClone(row.identity), state: row.records.at(-1)?.payload.state ?? 'OWNER_ONLY', chainSha256: hash(row.ownerBytes + row.records.map(record => record.bytes).join('')), objects: [{ path: `${projectPrefix}/${row.operation}/owner.json`, sha256: hash(row.ownerBytes), size: Buffer.byteLength(row.ownerBytes) }, ...row.records.map((record, index) => ({ path: `${projectPrefix}/${row.operation}/${String(index + 1).padStart(6, '0')}.record.json`, sha256: hash(record.bytes), size: Buffer.byteLength(record.bytes) }))] })); return { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA', projectRef: input.projectRef, observedAtMs: Date.now(), sha256: hash(JSON.stringify(operations)), operations }; } catch { uncertain = true; throw failure(); } },
    compareAndWriteJournal:(previous,value)=>write(value,{previous}),
    writeJournal:async value=>{const receipt=await write(value,undefined);return receipt.kind==='SYNCED'?{kind:'SYNCED',sha256:receipt.sha256}:receipt;},
  };
}
