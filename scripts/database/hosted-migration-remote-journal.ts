import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import {parseHostedExecutionJournal,snapshotHostedMigrationMetadata, type HostedExecutionJournal, type HostedExecutionPorts} from './hosted-migration-journal-contracts';
import {canAppendStoredHostedMigrationJournal,parseInactiveCronDefinitionJournal,readInactiveCronDefinitionContext,inactiveCronDefinitionContextSchema,type HostedMigrationStoredJournal,type InactiveCronDefinitionJournal} from './hosted-inactive-cron-definition-contracts';
import type {NativeJournalPublication,NativeInactiveCronPermitFacts} from './hosted-migration-database';
import {createHostedMigrationOperatorStorage,createHostedInactiveCronDefinitionOperatorStorage} from './hosted-migration-storage-observation';
export {observeHostedMigrationStorageProject} from './hosted-migration-storage-observation';
export type {HostedMigrationStorageProjectObservation,HostedMigrationStorageObjectObservation} from './hosted-migration-storage-observation';

const purpose = 'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL';
const failure = () => Error('Remote migration journal identity, private storage or original intent requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), sha = z.string().regex(/^[a-f0-9]{40}$/), ref = z.string().regex(/^[a-z]{20}$/);
const identitySchema = z.object({ projectRef: ref, sourceSha: sha, treeSha: sha, planSha256: digest, stageId: z.enum(['prefix', 'native', 'pre-observability', 'remaining']), stageSha256: digest, databaseUrl: z.string().max(400), approvalDigest: digest, ciRunId: z.string().regex(/^[1-9][0-9]*$/).max(30), certificateSha256: digest }).strict();
const privateToken = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const inputSchema = z.object({ projectRef: ref, boundProjectRef: ref, storageKey: privateToken, providerToken: privateToken, identity: identitySchema }).strict();
type Chain = { operation: string; identity: HostedExecutionJournal['identity']; ownerBytes: string; records: { bytes: string; payload: HostedMigrationStoredJournal }[] };
export type RemoteMigrationProjectReceipt = { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA'; projectRef: string; observedAtMs: number; sha256: string; operations: { operation: string; identity: HostedExecutionJournal['identity']; state: HostedExecutionJournal['state'] | 'OWNER_ONLY'; chainSha256: string; objects: { path: string; sha256: string; size: number }[] }[] };
export type RemoteMigrationTransitionReceipt={kind:'SYNCED';sha256:string;payload:HostedExecutionJournal;publication?:NativeJournalPublication}|{kind:'UNCONFIRMED'};
export type HostedMigrationRemoteJournal = Pick<HostedExecutionPorts, 'readJournal' | 'writeJournal'> & { compareAndWriteJournal(previous:HostedExecutionJournal|null,value:HostedExecutionJournal):Promise<RemoteMigrationTransitionReceipt>;inspectProject(): Promise<RemoteMigrationProjectReceipt>;readOwnedSafetyJournal():Promise<HostedExecutionJournal> };
export type InactiveCronRemoteTransitionReceipt={kind:'SYNCED';sha256:string;payload:InactiveCronDefinitionJournal;publication?:NativeJournalPublication}|{kind:'UNCONFIRMED'};
export type HostedInactiveCronDefinitionRemoteJournal={
 readJournal():Promise<InactiveCronDefinitionJournal|null>;
 writeJournal(value:InactiveCronDefinitionJournal):Promise<{kind:'SYNCED';sha256:string}|{kind:'UNCONFIRMED'}>;
 compareAndWriteJournal(previous:InactiveCronDefinitionJournal|null,value:InactiveCronDefinitionJournal):Promise<InactiveCronRemoteTransitionReceipt>;
 readOwnedSafetyJournal():Promise<InactiveCronDefinitionJournal>;
 inspectProject():Promise<Omit<RemoteMigrationProjectReceipt,'operations'>&{operations:(Omit<RemoteMigrationProjectReceipt['operations'][number],'state'>&{state:HostedMigrationStoredJournal['state']|'OWNER_ONLY'})[]}>;
};
function own(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure(); if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const output: Record<string, unknown> = Object.create(null); for (const key of Reflect.ownKeys(value)) { const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); output[key] = own(field.value, depth + 1); } return output;
}
function inputWithPermit(value:unknown,inactive=false){
  if(!value||typeof value!=='object'||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
  const metadata:Record<string,unknown>=Object.create(null);let reconciliationPermit:unknown,permitPresent=false;
  for(const key of Reflect.ownKeys(value)){const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();if(key==='reconciliationPermit'){permitPresent=true;reconciliationPermit=field.value;}else Object.defineProperty(metadata,key,{value:inactive?snapshotHostedMigrationMetadata(field.value):own(field.value),enumerable:true});}
  return{metadata,permitPresent,reconciliationPermit};
}
function identity(value: unknown) { const checked = identitySchema.parse(own(value)), url = new URL(checked.databaseUrl); const direct = url.hostname === `db.${checked.projectRef}.supabase.co` && url.username === 'postgres', pooler = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `postgres.${checked.projectRef}`; if (url.protocol !== 'postgresql:' || url.password || url.port !== '5432' || url.pathname !== '/postgres' || url.search !== '?sslmode=verify-full' || url.hash || url.toString() !== checked.databaseUrl || !(direct || pooler)) throw failure(); return checked; }
const json = (value: unknown) => JSON.stringify(value) + '\n';


/** Fixed private operator Storage consumer only. Bucket creation, current
 * deployment authority, cooperative DB lock and native dual acknowledgement
 * belong to its separately reviewed caller. No generic Storage port is exposed. */
async function createRemoteJournal(value: unknown,inactive:boolean) {
  let input: z.infer<typeof inputSchema>,permitPresent=false,reconciliationPermit:unknown,definitionContext:ReturnType<typeof readInactiveCronDefinitionContext>|null=null;
  try { const captured=inputWithPermit(value,inactive);permitPresent=captured.permitPresent;reconciliationPermit=captured.reconciliationPermit;
    if(inactive){const metadata=inputSchema.extend({inactiveDefinitionContext:inactiveCronDefinitionContextSchema}).strict().parse(captured.metadata),{inactiveDefinitionContext,...base}=metadata;definitionContext=readInactiveCronDefinitionContext(inactiveDefinitionContext);input=base;if(!permitPresent||JSON.stringify(input.identity)!==JSON.stringify(definitionContext.identity))throw failure();}else input=inputSchema.parse(captured.metadata);
    input.identity = identity(input.identity); if (input.projectRef !== input.boundProjectRef || input.projectRef !== input.identity.projectRef) throw failure(); } catch { throw failure(); }
  const capture=(metadata:unknown)=>inactive?snapshotHostedMigrationMetadata(metadata):own(metadata);
  const decode=(metadata:unknown):HostedMigrationStoredJournal=>inactive?parseInactiveCronDefinitionJournal(metadata,definitionContext):parseHostedExecutionJournal(metadata);
  const projectPrefix = `migration/v1/${input.projectRef}`, operation = hash(JSON.stringify(input.identity)), ownPrefix = `${projectPrefix}/${operation}`;
  let uncertain = false, writing = false, publishedIntentSha256: string | null = null;
  // Only the native database owner's private registry can admit a permit. The
  // opaque token is never cloned or converted into caller supplied metadata.
  const requirePermit=async(safety=false)=>permitPresent?await (async()=>{const native=await import('./hosted-migration-database');return inactive?(safety?native.assertNativeOriginal231TransportAppendSafetyRecord(reconciliationPermit,input.identity):native.assertNativeOriginal231TransportAppendPermit(reconciliationPermit,input.identity)):(safety?native.assertNativeReconciliationSafetyRecord(reconciliationPermit,input.identity):native.assertNativeReconciliationPermit(reconciliationPermit,input.identity));})():null;
  const comparePriorOperations=(chains:Chain[],permit:Awaited<ReturnType<typeof requirePermit>>,safety=false)=>{
    const matchesOriginal=(row:Chain)=>permit!==null&&row.operation===permit.originalOperationSha256&&JSON.stringify(row.identity)===JSON.stringify(permit.originalIdentity)&&row.records.length===2&&row.records[0].payload.state==='INTENT'&&row.records[1].payload.state==='REQUIRES_REVIEW'&&hash(row.ownerBytes+row.records.map(record=>record.bytes).join(''))===permit.originalChainSha256;
    if(permit&&(permit.originalOperationSha256===operation||chains.filter(matchesOriginal).length!==1))throw failure();
    const ownedSafetyReview=(row:Chain)=>safety&&permit?.ownedSafetyIdentities?.some(identity=>JSON.stringify(identity)===JSON.stringify(row.identity))&&row.records[0]?.payload.state==='INTENT'&&row.records.at(-1)?.payload.state==='REQUIRES_REVIEW';
    const selectedChildReview=(row:Chain)=>permit?.selectedOriginalChild&&row.operation===permit.selectedOriginalChild.operationSha256&&JSON.stringify(row.identity)===JSON.stringify(permit.selectedOriginalChild.identity)&&row.records.length===2&&row.records[0].payload.state==='INTENT'&&row.records[1].payload.state==='REQUIRES_REVIEW'&&hash(row.ownerBytes+row.records.map(record=>record.bytes).join(''))===permit.selectedOriginalChild.chainSha256;
    const selectedNative180Review=(row:Chain)=>permit?.selectedOriginalNative180&&row.operation===permit.selectedOriginalNative180.operationSha256&&JSON.stringify(row.identity)===JSON.stringify(permit.selectedOriginalNative180.identity)&&row.records.length===2&&row.records[0].payload.state==='INTENT'&&row.records[1].payload.state==='REQUIRES_REVIEW'&&hash(row.ownerBytes+row.records.map(record=>record.bytes).join(''))===permit.selectedOriginalNative180.chainSha256;
    const selectedOriginal231Review=(row:Chain)=>permit?.selectedOriginal231&&row.operation===permit.selectedOriginal231.operationSha256&&JSON.stringify(row.identity)===JSON.stringify(permit.selectedOriginal231.identity)&&row.records.length===2&&row.records[0].payload.state==='INTENT'&&row.records[1].payload.state==='REQUIRES_REVIEW'&&hash(row.ownerBytes+row.records.map(record=>record.bytes).join(''))===permit.selectedOriginal231.chainSha256;
    const selectedPrefix=inactive?(permit as NativeInactiveCronPermitFacts|null)?.selectedOriginalPrefix:undefined,selectedPrefixReview=(row:Chain)=>selectedPrefix&&row.operation===selectedPrefix.operationSha256&&JSON.stringify(row.identity)===JSON.stringify(selectedPrefix.identity)&&row.records.length===2&&row.records[0].payload.state==='INTENT'&&row.records[1].payload.state==='REQUIRES_REVIEW'&&hash(row.ownerBytes+row.records.map(record=>record.bytes).join(''))===selectedPrefix.chainSha256;
    if(inactive&&(!selectedPrefix||chains.filter(selectedPrefixReview).length!==1))throw failure();
    if(chains.some(row=>row.operation!==operation&&row.records.at(-1)?.payload.state!=='COMMITTED'&&!matchesOriginal(row)&&!ownedSafetyReview(row)&&!selectedChildReview(row)&&!selectedNative180Review(row)&&!selectedOriginal231Review(row)&&!selectedPrefixReview(row)))throw failure();
  };
  const requirePriorOperations=async(chains:Chain[],safety=false)=>comparePriorOperations(chains,await requirePermit(safety),safety);
  const admitSelectedOriginalIntent=(chains:Chain[],permit:Awaited<ReturnType<typeof requirePermit>>)=>{
    const selected=permit?.selectedOriginalIntent;if(!selected||JSON.stringify(selected.identity)!==JSON.stringify(input.identity))return;
    const current=chains.find(row=>row.operation===operation),first=current?.records[0];
    if(current?.records.at(-1)?.payload.state==='COMMITTED')return;
    if(JSON.stringify(selected.identity)!==JSON.stringify(input.identity)||!current||current.records.length!==1||!first||first.payload.state!=='INTENT'||hash(current.ownerBytes)!==selected.ownerSha256||hash(first.bytes)!==selected.record1Sha256||hash(JSON.stringify(first.payload))!==selected.payloadSha256)throw failure();
    publishedIntentSha256=selected.payloadSha256;
  };
  const collector=inactive?createHostedInactiveCronDefinitionOperatorStorage({...input,inactiveDefinitionContext:definitionContext}):createHostedMigrationOperatorStorage(input),{bucketRead}=collector;
  const inspect=async(safety=false)=>{if(uncertain&&!safety)throw failure();return collector.inspect();};
  const publish=async(path:string,bytes:string,safety=false)=>{await requirePermit(safety);await collector.publishOperatorRecord(path,bytes);await requirePermit(safety);};
  const write=async(value:unknown,comparison:{previous:HostedMigrationStoredJournal|null}|undefined):Promise<{kind:'SYNCED';sha256:string;payload:HostedMigrationStoredJournal;publication?:NativeJournalPublication}|{kind:'UNCONFIRMED'}>=>{
    if(writing)return{kind:'UNCONFIRMED'};writing=true;
    try{
      const raw=capture(value);
      if(permitPresent){const native=await import('./hosted-migration-database'),safety=typeof raw==='object'&&raw!==null&&Object.getOwnPropertyDescriptor(raw,'state')?.value==='REQUIRES_REVIEW'&&publishedIntentSha256!==null;if(inactive){if(safety)native.assertNativeOriginal231TransportAppendSafetyRecord(reconciliationPermit,input.identity);else native.assertNativeOriginal231TransportAppendJournalPermit(reconciliationPermit,input.identity,raw);}else{if(safety)native.assertNativeReconciliationSafetyRecord(reconciliationPermit,input.identity);else native.assertNativeMigrationEffectPermit(reconciliationPermit,input.identity);}}
      const checked=decode(raw);if(JSON.stringify(identity(checked.identity))!==JSON.stringify(input.identity))throw failure();const payload=JSON.parse(JSON.stringify(raw)) as HostedMigrationStoredJournal,payloadSha256=hash(JSON.stringify(payload)),safety=permitPresent&&payload.state==='REQUIRES_REVIEW'&&publishedIntentSha256!==null;
      let expectedPrevious:HostedMigrationStoredJournal|null|undefined;if(comparison){expectedPrevious=comparison.previous===null?null:decode(capture(comparison.previous));if(expectedPrevious&&JSON.stringify(identity(expectedPrevious.identity))!==JSON.stringify(input.identity))throw failure();}
      if(uncertain&&!safety)throw failure();const beforePermit=await requirePermit(safety),chains=await inspect(safety);comparePriorOperations(chains,beforePermit,safety);if(!safety&&publishedIntentSha256===null)admitSelectedOriginalIntent(chains,beforePermit);const beforeObjects=collector.objects(),beforeBucket=collector.bucket(),current=chains.find(row=>row.operation===operation),previous=current?.records.at(-1);
      if(comparison&&JSON.stringify(previous?.payload??null)!==JSON.stringify(expectedPrevious))throw failure();if(safety&&(!current||hash(JSON.stringify(current.records[0]?.payload))!==publishedIntentSha256||!previous||!(inactive?['INTENT','INACTIVE_DEFINITIONS_ACKNOWLEDGED','REQUIRES_REVIEW']:['INTENT','COMMITTED','REQUIRES_REVIEW']).includes(previous.payload.state)))throw failure();if(previous?.payload.state==='INTENT'&&hash(JSON.stringify(previous.payload))!==publishedIntentSha256)throw failure();if(current&&!previous)throw failure();
      if(previous&&hash(JSON.stringify(previous.payload))===payloadSha256){const after=await inspect(safety);await requirePriorOperations(after,safety);const retained=after.find(row=>row.operation===operation);if(!retained||JSON.stringify(retained)!==JSON.stringify(current)||hash(JSON.stringify(retained.records.at(-1)?.payload))!==payloadSha256||JSON.stringify(after.filter(row=>row.operation!==operation))!==JSON.stringify(chains.filter(row=>row.operation!==operation)))throw failure();return{kind:'SYNCED',sha256:payloadSha256,payload:structuredClone(retained.records.at(-1)!.payload)};}if(!canAppendStoredHostedMigrationJournal(previous?.payload??null,payload))throw failure();
      const ownerBytes=json({version:1,purpose,identity:input.identity}),sequence=(current?.records.length??0)+1,bytes=json({version:1,purpose,sequence,previousSha256:previous?hash(previous.bytes):null,payload,payloadSha256});if(sequence>3)throw failure();
      const owner=current?null:collector.prepareOperatorRecord(`${ownPrefix}/owner.json`,ownerBytes),record=collector.prepareOperatorRecord(`${ownPrefix}/${String(sequence).padStart(6,'0')}.record.json`,bytes),native=permitPresent&&!safety?await import('./hosted-migration-database'):null;
      const publication=native?(inactive?await native.prepareNativeInactiveCronJournalPublication(reconciliationPermit,input.identity,payload as InactiveCronDefinitionJournal):await native.prepareNativeJournalPublication(reconciliationPermit,input.identity,payload as HostedExecutionJournal)):undefined,acknowledgements:ReturnType<typeof collector.objects>=[];
      if(publication&&native){
        if(owner){native.assertNativeJournalPublicationPost(publication,input.identity,owner.path,owner.sha256);await owner.postOperatorRecord();acknowledgements.push(await owner.readOperatorRecordAcknowledgement());}
        native.assertNativeJournalPublicationPost(publication,input.identity,record.path,record.sha256);await record.postOperatorRecord();acknowledgements.push(await record.readOperatorRecordAcknowledgement());
      }else{if(!current)await publish(`${ownPrefix}/owner.json`,ownerBytes,safety);await publish(record.path,bytes,safety);}
      const after=await inspect(safety),retained=after.find(row=>row.operation===operation);comparePriorOperations(after,beforePermit,safety);
      const afterObjects=collector.objects();if(JSON.stringify(beforeBucket)!==JSON.stringify(collector.bucket())||[...beforeObjects,...acknowledgements].some(object=>JSON.stringify(afterObjects.find(row=>row.path===object.path))!==JSON.stringify(object)))throw failure();
      if(!retained||retained.ownerBytes!==ownerBytes||retained.records.length!==sequence||current&&JSON.stringify(retained.records.slice(0,-1))!==JSON.stringify(current.records)||retained.records.at(-1)?.bytes!==bytes||hash(JSON.stringify(retained.records.at(-1)?.payload))!==payloadSha256||JSON.stringify(after.filter(row=>row.operation!==operation))!==JSON.stringify(chains.filter(row=>row.operation!==operation)))throw failure();
      if(publication&&native)comparePriorOperations(after,inactive?native.readNativeInactiveCronJournalPublicationAcknowledgement(publication,input.identity,payload as InactiveCronDefinitionJournal):native.readNativeJournalPublicationAcknowledgement(publication,input.identity,payload as HostedExecutionJournal),safety);else await requirePriorOperations(after,safety);
      if(payload.state==='INTENT')publishedIntentSha256=payloadSha256;return{kind:'SYNCED',sha256:payloadSha256,payload:structuredClone(retained.records.at(-1)!.payload),...(publication?{publication}:{})};
    }catch{uncertain=true;return{kind:'UNCONFIRMED'};}finally{writing=false;}
  };
  try { await bucketRead(); } catch { throw failure(); }
  return {
    readJournal: async () => { try { await requirePermit();const chains = await inspect(),permit=await requirePermit();comparePriorOperations(chains,permit);if(publishedIntentSha256===null)admitSelectedOriginalIntent(chains,permit); const current = chains.find(row => row.operation === operation); if (current && !current.records.length) throw failure(); return structuredClone(current?.records.at(-1)?.payload ?? null); } catch { uncertain = true; throw failure(); } },
    readOwnedSafetyJournal:async()=>{try{if(!permitPresent||publishedIntentSha256===null)throw failure();await requirePermit(true);const chains=await inspect(true);await requirePriorOperations(chains,true);const current=chains.find(row=>row.operation===operation),prior=current?.records.at(-1);if(!current||hash(JSON.stringify(current.records[0]?.payload))!==publishedIntentSha256||!prior)throw failure();return structuredClone(prior.payload);}catch{uncertain=true;throw failure();}},
    inspectProject: async () => { try { const chains = await inspect(), operations = chains.map(row => ({ operation: row.operation, identity: structuredClone(row.identity), state: row.records.at(-1)?.payload.state ?? 'OWNER_ONLY', chainSha256: hash(row.ownerBytes + row.records.map(record => record.bytes).join('')), objects: [{ path: `${projectPrefix}/${row.operation}/owner.json`, sha256: hash(row.ownerBytes), size: Buffer.byteLength(row.ownerBytes) }, ...row.records.map((record, index) => ({ path: `${projectPrefix}/${row.operation}/${String(index + 1).padStart(6, '0')}.record.json`, sha256: hash(record.bytes), size: Buffer.byteLength(record.bytes) }))] })); return { evidence: 'VERIFIED_OPERATOR_STORAGE_BYTES_AND_METADATA' as const, projectRef: input.projectRef, observedAtMs: Date.now(), sha256: hash(JSON.stringify(operations)), operations }; } catch { uncertain = true; throw failure(); } },
    compareAndWriteJournal:(previous:HostedMigrationStoredJournal|null,value:HostedMigrationStoredJournal)=>write(value,{previous}),
    writeJournal:async (value:HostedMigrationStoredJournal)=>{const receipt=await write(value,undefined);return receipt.kind==='SYNCED'?{kind:'SYNCED',sha256:receipt.sha256}:receipt;},
  };
}
/** Legacy own-operation V1/V2 decoder remains unchanged. */
export function createHostedMigrationRemoteJournal(value:unknown):Promise<HostedMigrationRemoteJournal>{return createRemoteJournal(value,false) as Promise<HostedMigrationRemoteJournal>;}
/** Explicit V3 storage publication still requires the real native append
 * permit; source metadata and Storage credentials cannot grant SQL authority. */
export function createHostedInactiveCronDefinitionRemoteJournal(value:unknown):Promise<HostedInactiveCronDefinitionRemoteJournal>{return createRemoteJournal(value,true) as Promise<HostedInactiveCronDefinitionRemoteJournal>;}
