import {createHash} from 'node:crypto';
import {z} from 'zod';
import {hostedMigrationPlanningTargetSchema} from './hosted-migration-plan-contracts';
import {original231RecoveryPlanContextSchema,validateOriginal231RecoveryPlanContext} from './hosted-original-child-recovery';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {original231TransportAppendMigration} from './original231-transport-source';
const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),version=z.string().regex(/^[0-9]{14}$/);
const sourceSchema=z.object({sha,tree:sha}).strict(),appliedSchema=z.object({version,sha256:digest}).strict();
export const original231TransportPlanRowSchema=z.object({name:z.string().regex(/^[0-9]{14}_[a-z0-9_]+[.]sql$/),version,sha256:digest}).strict();
const rowSchema=original231TransportPlanRowSchema;
export const original231TransportPlanBodySchema=z.object({
 version:z.literal(2),purpose:z.literal('CUEVO_CURRENT_ORIGINAL231_TRANSPORT_APPEND_PLAN'),provenance:z.literal('CALLER_SUPPLIED_PLANNING_INPUT'),effectScope:z.literal('TRANSPORT_DEFINITIONS_ONLY'),effectAuthority:z.literal(false),execution:z.literal('NOT_EXECUTED'),
 source:sourceSchema,target:hostedMigrationPlanningTargetSchema,plannedAtMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),projectRef:z.string().regex(/^[a-z]{20}$/),
 original231Recovery:original231RecoveryPlanContextSchema,priorSchemaRelease:z.object({sourceSha:sha,treeSha:sha,migrationCount:z.literal(124)}).strict(),originalAcknowledgement:z.literal('UNKNOWN'),originalSQLPending:z.literal(0),
 migrations:z.array(rowSchema).length(232),applied:z.array(appliedSchema).length(231),pending:z.array(rowSchema).length(1),
 stage:z.object({id:z.literal('remaining'),included:z.array(rowSchema).length(232),pending:z.array(rowSchema).length(1),expectedBeforeVersions:z.array(version).length(231),expectedAfterVersions:z.array(version).length(232)}).strict(),
 sourceSetSha256:digest,observedHistorySha256:digest,
}).strict();
const bodySchema=original231TransportPlanBodySchema,planSchema=bodySchema.extend({planSha256:digest}).strict();
export type Original231TransportAppendPlan=z.infer<typeof planSchema>;
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
const fail=()=>Error('Current original231 transport append requires review; private contents withheld.');
function verifyBody(body:z.infer<typeof bodySchema>){
 const prefix=body.migrations.slice(0,231),append=body.migrations[231],original=validateOriginal231RecoveryPlanContext(body.original231Recovery,prefix,body.source),target=body.target;
 const expectedApplied=prefix.map(({version,sha256})=>({version,sha256})),before=expectedApplied.map(r=>r.version).sort(),after=body.migrations.map(r=>r.version).sort();
 const observedAt=Date.parse(target.observedAt);
 if(!same(append,original231TransportAppendMigration)||new Set(body.migrations.map(r=>r.version)).size!==232||body.migrations.some(r=>r.name.slice(0,14)!==r.version)||
  !same(body.applied,expectedApplied)||!same(body.pending,[append])||!same(body.stage.included,body.migrations)||!same(body.stage.pending,[append])||!same(body.stage.expectedBeforeVersions,before)||!same(body.stage.expectedAfterVersions,after)||
  !same(body.priorSchemaRelease,{sourceSha:original.installedMarker.sourceSha,treeSha:original.installedMarker.treeSha,migrationCount:124})||body.projectRef!==target.projectRef||target.projectRef!==target.boundProjectRef||target.projectRef!==original.template.originalIdentity.projectRef||target.projectName.toLowerCase()!=='cuevo'||target.population!=='SCHEMA_ONLY'||target.authUsers!==0||!same([...target.appSchemas].sort(),['app','authorization','internal'])||!same([...target.migrationVersions].sort(),before)||
  !Number.isFinite(observedAt)||observedAt>body.plannedAtMs||body.plannedAtMs-observedAt>86400000||body.sourceSetSha256!==hash(JSON.stringify(body.migrations))||body.observedHistorySha256!==hash(JSON.stringify(before)))throw fail();
}
/** Finite supplied planning metadata, never native or SQL authority. */
export function finalizeOriginal231TransportAppendPlan(value:unknown):Original231TransportAppendPlan{
 try{const body=bodySchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));verifyBody(body);return{...body,planSha256:hash(canonicalReleaseExecutionJson(body))};}catch{throw fail();}
}
/** Supplied descriptor validation only, never native prefix/effect admission. */
export function readOriginal231TransportAppendPlan(value:unknown):Original231TransportAppendPlan{
 try{const plan=planSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),{planSha256,...body}=plan;verifyBody(body);if(planSha256!==hash(canonicalReleaseExecutionJson(body)))throw fail();return plan;}catch{throw fail();}
}
