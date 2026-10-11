import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import { replayPlan, posthogIntelligenceMigration } from './replay-plan';
import { verifyReconciledPrefix } from './hosted-schema-reconciliation';
import {canonicalHostedMigrationPlan,readCanonicalMigrationOperation,verifyCompletedMigrationPrefix,type CanonicalMigrationOperation,type HostedMigrationPlanV1,type MigrationSource} from './hosted-migration-plan';
import {originalChildRecoveryPlanContextSchema,validateOriginalChildRecoveryPlanContext} from './hosted-original-child-recovery';

const failure=()=>Error('Hosted migration batch source or stage requires review; contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/),version=z.string().regex(/^[0-9]{14}$/);
const row=z.object({name:z.string().regex(/^[0-9]{14}_[a-z0-9_]+[.]sql$/),version,sha256:digest}).strict();
const stageSchema=z.object({id:z.enum(['prefix','native','pre-observability','remaining']),workdir:z.string().min(1).max(4096),included:z.array(row).min(1).max(1000),pending:z.array(row).max(1000),expectedBeforeVersions:z.array(version).max(1000),expectedAfterVersions:z.array(version).max(1000),configSha256:digest,commandArgs:z.array(z.string().max(4096)).max(20),materialization:z.literal('SQL_FILES').optional()}).strict();
export type HostedMigrationBatchStage=z.infer<typeof stageSchema>;
type SuppliedBatchStage=Omit<HostedMigrationBatchStage,'materialization'>&{materialization?:'SQL_FILES'|'METADATA_ONLY'};
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sortedVersions=(rows:{version:string}[])=>rows.map(row=>row.version).sort();
function snapshot(value:unknown,depth=0):unknown{
 if(depth>12)throw failure();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value))throw failure();
 if(types.isUint8Array(value)){if(value.byteLength>2*1024*1024||Reflect.ownKeys(value).some(key=>typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)))throw failure();return Uint8Array.prototype.slice.call(value);}
 if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 if(Array.isArray(value)&&(value.length>1000||Reflect.ownKeys(value).length!==value.length+1))throw failure();
 const out:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();Object.defineProperty(out,key,{value:snapshot(field.value,depth+1),enumerable:true});}return out;
}
export type HostedMigrationBatch={index:number;pending:z.infer<typeof row>[];cumulativeIncluded:z.infer<typeof row>[];expectedBeforeVersions:string[];expectedAfterVersions:string[];sha256:string};
type DerivedRow=z.infer<typeof row>;
/** Only the two source-owning entrypoints below provide these private rows. */
function deriveStage(input:{stage:HostedMigrationBatchStage;reconciliationTemplate?:unknown;originalChildRecovery?:z.infer<typeof originalChildRecoveryPlanContextSchema>},rows:DerivedRow[],boundaries:number[],completed?:DerivedRow[]){
  const stage=input.stage,ids=['prefix','native','pre-observability','remaining'],index=ids.indexOf(stage.id),start=index?boundaries[index-1]:0,end=boundaries[index];
  const before=stage.expectedBeforeVersions.length,after=stage.included.length;
  const childRecovery=input.originalChildRecovery?validateOriginalChildRecoveryPlanContext(input.originalChildRecovery,rows,{sha:input.originalChildRecovery.catalogueReference.sourceSha,tree:input.originalChildRecovery.catalogueReference.treeSha}):undefined,childBoundary=!!childRecovery&&stage.id==='pre-observability'&&before===144&&after===180;
  if(childRecovery&&(completed||input.reconciliationTemplate||!childBoundary&&before!==144&&before!==180||stage.id==='pre-observability'&&!childBoundary))throw failure();
  let completedBoundary=false;if(completed){if(completed.length!==before||!same(completed,rows.slice(0,before)))throw failure();completedBoundary=true;}
  if(!same(stage.included,rows.slice(0,after))||!same(stage.expectedBeforeVersions,sortedVersions(rows.slice(0,before)))||!same(stage.expectedAfterVersions,sortedVersions(rows.slice(0,after)))||after!==Math.max(before,end)||before<start||before>rows.length||!same(stage.pending,rows.slice(before,after))||stage.configSha256!=='cc91534b07b96e61b993f179225a9929b65e965d19a5a02e242c79126166b4ff')throw failure();
  const narrow=stage.id==='prefix'&&before===120&&after===123;
  if(narrow){if(input.reconciliationTemplate===undefined)throw failure();const prefix=verifyReconciledPrefix(input.reconciliationTemplate,rows);if(!same(prefix.applied,rows.slice(0,before))||!same(prefix.pendingSuffix,stage.pending))throw failure();}
  else if(input.reconciliationTemplate!==undefined||before!==0&&!boundaries.includes(before)&&!completedBoundary&&!childRecovery)throw failure();
  if(before<end&&before!==start&&!narrow&&!completedBoundary&&!childBoundary)throw failure();
  const args=stage.commandArgs,project=args[4];if(!/^[a-z]{20}$/.test(project??'')||!same(args,['db','push','--linked','--project-ref',project,'--include-all','--skip-vault','--workdir',stage.workdir,'--yes','--output-format','json']))throw failure();
  const stageSha256=hash(JSON.stringify({included:stage.included,configSha256:stage.configSha256})),sourceSetSha256=hash(JSON.stringify(rows));
  const batches:HostedMigrationBatch[]=[];let cursor=before;
  for(let offset=0;offset<stage.pending.length;offset+=20){const pending=stage.pending.slice(offset,offset+20),next=cursor+pending.length,body={index:batches.length+1,pending,cumulativeIncluded:rows.slice(0,next),expectedBeforeVersions:sortedVersions(rows.slice(0,cursor)),expectedAfterVersions:sortedVersions(rows.slice(0,next))};batches.push({...body,sha256:hash(JSON.stringify({stageId:stage.id,stageSha256,...body}))});cursor=next;}
  return {version:1 as const,evidence:'SUPPLIED_SOURCE_BATCH_METADATA_ONLY' as const,maxPendingPerBatch:20 as const,stageId:stage.id,stageSha256,sourceSetSha256,included:stage.included,pending:stage.pending,expectedBeforeVersions:stage.expectedBeforeVersions,expectedAfterVersions:stage.expectedAfterVersions,batches};
}
/** Pure bounded metadata. Supplied SQL bytes, history and template are never native source, receipt or execution authority. */
export function deriveHostedMigrationBatches(value:{sources:MigrationSource[];stage:SuppliedBatchStage;reconciliationTemplate?:unknown;completedSource?:MigrationSource[];originalChildRecovery?:unknown}){
 try{
  const sourceSchema=z.array(z.object({name:z.string(),bytes:z.instanceof(Uint8Array)}).strict()).min(1).max(1000);
  const input=z.object({sources:sourceSchema,stage:stageSchema,reconciliationTemplate:z.unknown().optional(),completedSource:sourceSchema.optional(),originalChildRecovery:originalChildRecoveryPlanContextSchema.optional()}).strict().parse(snapshot(value)),stage=input.stage;
  if([input.sources,input.completedSource??[]].some(sources=>sources.reduce((total,source)=>total+source.bytes.byteLength,0)>16*1024*1024))throw failure();
  const replay=replayPlan(input.sources),ordered=[...replay.before,replay.prerequisite,...replay.remaining],observability=replay.remaining.indexOf(posthogIntelligenceMigration);
  if(observability<0||ordered.length!==input.sources.length)throw failure();
  const rows=ordered.map(name=>({name,version:name.slice(0,14),sha256:hash(input.sources.find(source=>source.name===name)!.bytes)}));
  const boundaries=[replay.before.length,replay.before.length+1,replay.before.length+1+observability,rows.length];let completed:DerivedRow[]|undefined;
  if(input.completedSource){
   const original=replayPlan(input.completedSource),names=[...original.before,original.prerequisite,...original.remaining];completed=names.map(name=>({name,version:name.slice(0,14),sha256:hash(input.completedSource!.find(source=>source.name===name)!.bytes)}));if(names.length!==input.completedSource.length)throw failure();
  }
  return deriveStage({...input,stage},rows,boundaries,completed);
 }catch{throw failure();}
}

/** Reuses original immutable replay only; current source and stage still validate on every call. */
export function deriveCanonicalHostedMigrationBatches(value:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;stage:SuppliedBatchStage},operation:CanonicalMigrationOperation){
 try{
  const input=z.object({repoRoot:z.string(),sourceSha:z.string().regex(/^[a-f0-9]{40}$/),treeSha:z.string().regex(/^[a-f0-9]{40}$/),plan:z.unknown(),stage:stageSchema}).strict().parse(snapshot(value)),plan=JSON.parse(canonicalHostedMigrationPlan(input.plan as HostedMigrationPlanV1).json)as HostedMigrationPlanV1,loaded=readCanonicalMigrationOperation(operation,{repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan});
  if(input.stage.commandArgs[4]!==plan.projectRef)throw failure();let completed:DerivedRow[]|undefined;
  if(plan.priorCompletedRelease&&input.stage.expectedBeforeVersions.length===plan.priorCompletedRelease.migrationCount){if(!verifyCompletedMigrationPrefix(input.repoRoot,plan,operation))throw failure();completed=loaded.rows.slice(0,plan.priorCompletedRelease.migrationCount);}
  return deriveStage({stage:input.stage,...(plan.reconciliationTemplate?{reconciliationTemplate:plan.reconciliationTemplate}:{}),...(plan.originalChildRecovery?{originalChildRecovery:plan.originalChildRecovery}:{})},loaded.rows,loaded.boundaries,completed);
 }catch{throw failure();}
}
