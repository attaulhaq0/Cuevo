import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {z} from 'zod';
import {planHostedMigrations,type MigrationSource} from './hosted-migration-plan';
import {hostedMigrationPlanningTargetSchema} from './hosted-migration-plan-contracts';
import {original231RecoveryPlanContextSchema} from './hosted-original-child-recovery';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {original231TransportAppendMigration} from './original231-transport-source';
import {original231TransportPlanRowSchema as rowSchema,original231TransportPlanBodySchema as bodySchema,finalizeOriginal231TransportAppendPlan,type Original231TransportAppendPlan} from './original231-transport-plan-contracts';

export {original231TransportAppendMigration} from './original231-transport-source';
export {readOriginal231TransportAppendPlan,type Original231TransportAppendPlan} from './original231-transport-plan-contracts';
const sha=z.string().regex(/^[a-f0-9]{40}$/),sourceSchema=z.object({sha,tree:sha}).strict();
const metadataSchema=z.object({source:sourceSchema,target:hostedMigrationPlanningTargetSchema,priorReceipt:z.unknown(),original231Recovery:original231RecoveryPlanContextSchema,now:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict();
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
const fail=()=>Error('Current original231 transport append requires review; private contents withheld.');
const typedArrayPrototype=Object.getPrototypeOf(Uint8Array.prototype);
const intrinsicByteLength=Object.getOwnPropertyDescriptor(typedArrayPrototype,'byteLength')!.get!;
const intrinsicBuffer=Object.getOwnPropertyDescriptor(typedArrayPrototype,'buffer')!.get!;

function record(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))throw fail();
 const prototype=Object.getPrototypeOf(value),descriptors=Object.getOwnPropertyDescriptors(value);
 if(prototype!==Object.prototype&&prototype!==null||Reflect.ownKeys(value).some(k=>typeof k!=='string')||!same(Object.keys(descriptors).sort(),[...keys].sort())||Object.values(descriptors).some(d=>!('value'in d)||!d.enumerable))throw fail();
 return Object.fromEntries(Object.entries(descriptors).map(([k,d])=>[k,d.value]));
}
function snapshotSources(value:unknown):MigrationSource[]{
 if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype)throw fail();
 const descriptors=Object.getOwnPropertyDescriptors(value) as Record<string,PropertyDescriptor>,count=descriptors.length?.value;
 if(count!==232||Reflect.ownKeys(value).some(k=>typeof k!=='string')||Object.keys(descriptors).length!==count+1)throw fail();
 const bounded:{name:string;bytes:Uint8Array}[]=[];let total=0;
 for(let index=0;index<count;index++){
  const entry=descriptors[String(index)];if(!entry||!('value'in entry))throw fail();
  const row=record(entry.value,['name','bytes']),bytes=row.bytes;
  if(typeof row.name!=='string'||!(bytes instanceof Uint8Array)||types.isProxy(bytes))throw fail();
  const prototype=Object.getPrototypeOf(bytes),size=Reflect.apply(intrinsicByteLength,bytes,[]) as number;
  if(prototype!==Buffer.prototype&&prototype!==Uint8Array.prototype||size>2*1024*1024||types.isSharedArrayBuffer(Reflect.apply(intrinsicBuffer,bytes,[])))throw fail();
  total+=size;if(total>16*1024*1024)throw fail();
  bounded.push({name:row.name,bytes});
 }
 // Match canonical Git acquisition bounds before inspecting or copying any
 // byte slots. Intrinsic getters cannot invoke supplied size/buffer accessors.
 const sources:MigrationSource[]=bounded.map(({name,bytes})=>{
  const byteDescriptors=Object.getOwnPropertyDescriptors(bytes);
  if(Reflect.ownKeys(bytes).some(k=>typeof k!=='string')||Object.entries(byteDescriptors).some(([k,d])=>!/^\d+$/.test(k)||!('value'in d)))throw fail();
  return{name,bytes:Buffer.from(bytes)};
 });
 if(new Set(sources.map(s=>s.name)).size!==count)throw fail();return sources;
}

/** Planning-only finite source descriptor. Filtering the original prefix here
 * does not admit the old V1 operation against a current232 source tree. */
export function prepareOriginal231TransportAppendPlan(value:unknown):Original231TransportAppendPlan{
 try{
  const input=record(value,['sources','source','target','priorReceipt','original231Recovery','now']),sources=snapshotSources(input.sources);
  const metadata=metadataSchema.parse(JSON.parse(canonicalReleaseExecutionJson({source:input.source,target:input.target,priorReceipt:input.priorReceipt,original231Recovery:input.original231Recovery,now:input.now})));
  const selected=sources.filter(s=>s.name===original231TransportAppendMigration.name);
  if(selected.length!==1||hash(selected[0].bytes)!==original231TransportAppendMigration.sha256)throw fail();
  const originalSources=sources.filter(s=>s.name!==original231TransportAppendMigration.name);
  const originalPlan=planHostedMigrations({...metadata,sources:originalSources});
  if(originalPlan.applied.length!==231||originalPlan.pending.length||!originalPlan.original231Recovery||!originalPlan.priorSchemaRelease||originalPlan.priorSchemaRelease.migrationCount!==124||originalPlan.priorCompletedRelease)throw fail();
  const migrations=z.array(rowSchema).parse([...originalPlan.migrations,{...original231TransportAppendMigration}]),before=originalPlan.applied.map(r=>r.version).sort();
  const body=bodySchema.parse({version:2,purpose:'CUEVO_CURRENT_ORIGINAL231_TRANSPORT_APPEND_PLAN',provenance:'CALLER_SUPPLIED_PLANNING_INPUT',effectScope:'TRANSPORT_DEFINITIONS_ONLY',effectAuthority:false,execution:'NOT_EXECUTED',source:metadata.source,target:metadata.target,plannedAtMs:metadata.now,projectRef:originalPlan.projectRef,original231Recovery:originalPlan.original231Recovery,priorSchemaRelease:originalPlan.priorSchemaRelease,originalAcknowledgement:'UNKNOWN',originalSQLPending:0,migrations,applied:originalPlan.applied,pending:[migrations[231]],stage:{id:'remaining',included:migrations,pending:[migrations[231]],expectedBeforeVersions:before,expectedAfterVersions:migrations.map(r=>r.version).sort()},sourceSetSha256:hash(JSON.stringify(migrations)),observedHistorySha256:hash(JSON.stringify(before))});
  return finalizeOriginal231TransportAppendPlan(body);
 }catch{throw fail();}
}
