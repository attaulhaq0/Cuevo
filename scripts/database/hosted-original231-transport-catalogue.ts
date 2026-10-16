import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from '../verification/release-review';
import {replayPlan} from './replay-plan';
import {type MigrationSource} from './hosted-migration-plan';
import {original231TransportAppendMigration} from './original231-transport-source';
import {applySourceChildCatalogueProviderDeltas,hostedChildCatalogueSummarySchema,hostedOriginal231CatalogueReceiptSchema,parseHostedOriginal231CatalogueReceipt,summarizeSourceChildCatalogue,sourceOriginal231CatalogueReceiptSha256} from './hosted-child-catalogue-reference';
import {hostedSchemaCatalogueQuerySha256} from './hosted-schema-catalogue';

const fail=()=>Error('Original231 transport catalogue requires review; private contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>canonicalReleaseExecutionJson(a)===canonicalReleaseExecutionJson(b);
const digest=z.string().regex(/^[a-f0-9]{64}$/),date=z.iso.datetime({offset:true});
const originalHistory='46b7ac8b3a4f1bdcb1f2f0a83a5df7f1594c8ea37d841c8b1be495653df0f6ab';
const bytePrototype=Object.getPrototypeOf(Uint8Array.prototype) as object;
const byteLength=Object.getOwnPropertyDescriptor(bytePrototype,'byteLength')!.get!;
const byteOffset=Object.getOwnPropertyDescriptor(bytePrototype,'byteOffset')!.get!;
const byteBuffer=Object.getOwnPropertyDescriptor(bytePrototype,'buffer')!.get!;
function ownBytes(value:unknown):Buffer{
 if(!value||typeof value!=='object'||types.isProxy(value)||!(value instanceof Uint8Array)||![Buffer.prototype,Uint8Array.prototype].includes(Object.getPrototypeOf(value)))throw fail();
 const length=byteLength.call(value) as number,buffer=byteBuffer.call(value) as ArrayBuffer;
 if(length>2*1024*1024||types.isSharedArrayBuffer(buffer))throw fail();
 return Buffer.from(Buffer.from(buffer,byteOffset.call(value) as number,length));
}
/** Supplied source bytes only. Canonical Git/CI owners must establish provenance. */
export function selectOriginal231TransportCatalogueSources(value:unknown){
 try{
  if(!Array.isArray(value)||types.isProxy(value)||value.length!==232||Reflect.ownKeys(value).length!==233)throw fail();let total=0;
  const sources:MigrationSource[]=[];for(let index=0;index<232;index++){
   const entry=Object.getOwnPropertyDescriptor(value,String(index));if(!entry||!('value'in entry)||!entry.enumerable||!entry.value||typeof entry.value!=='object'||types.isProxy(entry.value)||![Object.prototype,null].includes(Object.getPrototypeOf(entry.value)))throw fail();
   const fields=Object.getOwnPropertyDescriptors(entry.value);if(!same(Reflect.ownKeys(fields).sort(),['bytes','name'])||Object.values(fields).some(field=>!('value'in field)||!field.enumerable)||typeof fields.name.value!=='string')throw fail();
   const bytes=ownBytes(fields.bytes.value);total+=bytes.byteLength;if(total>16*1024*1024)throw fail();sources.push({name:fields.name.value,bytes});
  }
  const replay=replayPlan(sources),names=[...replay.before,replay.prerequisite,...replay.remaining];
  if(names.length!==232||new Set(names).size!==232||new Set(names.map(name=>name.slice(0,14))).size!==232||names[231]!==original231TransportAppendMigration.name)throw fail();
  const ordered=names.map(name=>sources.find(row=>row.name===name)!),rows=ordered.map(row=>({name:row.name,version:row.name.slice(0,14),sha256:hash(row.bytes)}));
  if(!same(rows[231],original231TransportAppendMigration)||hash(canonicalReleaseExecutionJson(rows.slice(0,231).map(row=>({version:row.version,sourceReceiptSha256:row.sha256}))))!==originalHistory)throw fail();
  return{original:ordered.slice(0,231),append:{...rows[231],bytes:ordered[231].bytes},rows,originalHistorySha256:originalHistory,migrationRowsSha256:hash(canonicalReleaseExecutionJson(rows.map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))),sourceInventorySha256:hash(canonicalReleaseExecutionJson(rows.map(({name,sha256})=>({name,sha256})))),originalInventorySha256:hash(canonicalReleaseExecutionJson(rows.slice(0,231).map(({name,sha256})=>({name,sha256}))))};
 }catch{throw fail();}
}

const nulls={endpoint:z.null(),vaultSecretName:z.null(),wakeId:z.null(),leaseExpiresAt:z.null(),networkRequestId:z.null(),sqlJobId:z.null(),sqlEventId:z.null(),sqlLeaseToken:z.null(),sqlClaimedAt:z.null(),sqlPhaseStartedAt:z.null(),sqlFailureStartedAt:z.null(),sqlDeadline:z.null(),sqlHintAt:z.null(),sqlOutcome:z.null(),sqlOperationSha256:z.null(),sqlRehearsalStartedAt:z.null(),sqlRehearsalAAt:z.null(),sqlRehearsalBAt:z.null(),sqlRehearsalPid:z.null(),sqlRehearsalStartTxid:z.null(),sqlRehearsalTxid:z.null()};
const denied=(name:string)=>z.object({name:z.literal(name),execute:z.literal(false)}).strict();
const factsSchema=z.object({
 eventTriggers:z.array(z.object({name:z.literal('cuevo_runtime_extension_refusal'),event:z.literal('ddl_command_start'),owner:z.literal('postgres'),enabled:z.literal('O'),tags:z.tuple([z.literal('ALTER EXTENSION'),z.literal('CREATE EXTENSION'),z.literal('DROP EXTENSION')]),function:z.literal('internal.guard_runtime_extension_management()'),functionOwner:z.literal('postgres'),functionKind:z.literal('f'),language:z.literal('plpgsql'),securityDefiner:z.literal(true),config:z.tuple([z.literal('search_path=""')]),publicExecute:z.literal(false),callerExecute:z.tuple([denied('anon'),denied('authenticated'),denied('cuevo_api'),denied('cuevo_worker'),denied('service_role')]),body:z.string().max(4096)}).strict()).length(1),
 controls:z.array(z.object({singleton:z.literal(true),state:z.literal('DISABLED'),enabled:z.literal(false),allowLocal:z.literal(false),admissionPaused:z.literal(false),transportVersion:z.literal(1),transportMode:z.literal('PG_NET_EDGE_V1'),sqlEnabled:z.literal(false),sqlPhase:z.literal('IDLE'),...nulls}).strict()).length(1),
 runtimeRoles:z.tuple([z.object({name:z.literal('cuevo_api'),login:z.literal(false)}).strict(),z.object({name:z.literal('cuevo_worker'),login:z.literal(false)}).strict()]),
 extensions:z.object({pgNetInstalled:z.literal(true),pgCronInstalled:z.literal(false),cronNamespacePresent:z.literal(false),cronJobPresent:z.literal(false),cronRunDetailsPresent:z.literal(false)}).strict(),
 processingLeases:z.object({outbox:z.literal(0),posthog:z.literal(0)}).strict(),
}).strict();
/** Fixed complementary facts in the same read-only catalogue snapshot. No Cron
 * relation is parsed or referenced, so absent Cron is an observed valid state. */
export const original231TransportDisabledDefinitionsSql=`/* CUEVO_ORIGINAL231_TRANSPORT_DISABLED_DEFINITIONS_V1 */
select jsonb_build_object(
 'eventTriggers',coalesce((select jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'owner',pg_get_userbyid(e.evtowner),'enabled',e.evtenabled::text,'tags',(select jsonb_agg(tag order by tag)from unnest(e.evttags)tag),'function',e.evtfoid::regprocedure::text,'functionOwner',pg_get_userbyid(p.proowner),'functionKind',p.prokind::text,'language',l.lanname,'securityDefiner',p.prosecdef,'config',p.proconfig,'publicExecute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where a.grantee=0 and a.privilege_type='EXECUTE'),'callerExecute',(select jsonb_agg(jsonb_build_object('name',r.rolname,'execute',has_function_privilege(r.oid,p.oid,'EXECUTE'))order by r.rolname)from pg_roles r where r.rolname in('anon','authenticated','cuevo_api','cuevo_worker','service_role')),'body',p.prosrc)order by e.evtname)from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid join pg_language l on l.oid=p.prolang where e.evtname='cuevo_runtime_extension_refusal' or e.evtfoid=to_regprocedure('internal.guard_runtime_extension_management()')),'[]'::jsonb),
 'controls',coalesce((select jsonb_agg(jsonb_build_object('singleton',singleton,'state',state,'enabled',enabled,'allowLocal',allow_local,'admissionPaused',admission_paused,'endpoint',endpoint,'vaultSecretName',vault_secret_name,'wakeId',wake_id,'leaseExpiresAt',lease_expires_at,'networkRequestId',network_request_id,'transportVersion',transport_version,'transportMode',transport_mode,'sqlEnabled',sql_enabled,'sqlJobId',sql_job_id,'sqlPhase',sql_phase,'sqlEventId',sql_event_id,'sqlLeaseToken',sql_lease_token,'sqlClaimedAt',sql_claimed_at,'sqlPhaseStartedAt',sql_phase_started_at,'sqlFailureStartedAt',sql_failure_started_at,'sqlDeadline',sql_deadline,'sqlHintAt',sql_hint_at,'sqlOutcome',sql_outcome,'sqlOperationSha256',sql_operation_sha256,'sqlRehearsalStartedAt',sql_rehearsal_started_at,'sqlRehearsalAAt',sql_rehearsal_a_at,'sqlRehearsalBAt',sql_rehearsal_b_at,'sqlRehearsalPid',sql_rehearsal_pid,'sqlRehearsalStartTxid',sql_rehearsal_start_txid,'sqlRehearsalTxid',sql_rehearsal_txid)order by singleton)from internal.worker_dispatch_control),'[]'::jsonb),
 'runtimeRoles',coalesce((select jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin)order by rolname)from pg_roles where rolname in('cuevo_api','cuevo_worker')),'[]'::jsonb),
 'extensions',jsonb_build_object('pgNetInstalled',exists(select 1 from pg_extension where extname='pg_net'),'pgCronInstalled',exists(select 1 from pg_extension where extname='pg_cron'),'cronNamespacePresent',to_regnamespace('cron')is not null,'cronJobPresent',to_regclass('cron.job')is not null,'cronRunDetailsPresent',to_regclass('cron.job_run_details')is not null),
 'processingLeases',jsonb_build_object('outbox',(select count(*)from internal.outbox_events where state='PROCESSING'),'posthog',(select count(*)from internal.posthog_delivery where state='PROCESSING'))
)as facts`;
export const original231TransportDisabledDefinitionsQuerySha256=hash(original231TransportDisabledDefinitionsSql);
/** Validation of supplied metadata only. This cannot issue a native capability,
 * acknowledge DDL, accept the foundation, or prove scheduled execution. */
export function readOriginal231TransportDisabledDefinitions(value:unknown,sourceBytes:unknown){
 try{const bytes=ownBytes(sourceBytes);if(hash(bytes)!==original231TransportAppendMigration.sha256)throw fail();const source=new TextDecoder('utf8',{fatal:true}).decode(bytes),guard=source.split('$guard$');if(guard.length!==3)throw fail();const facts=factsSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));if(facts.eventTriggers[0].body!==guard[1])throw fail();
  return{version:1 as const,purpose:'CUEVO_ORIGINAL231_TRANSPORT_DISABLED_DEFINITION_FACTS' as const,evidence:'SUPPLIED_DISABLED_DEFINITION_METADATA_ONLY' as const,execution:'NOT_EXECUTED' as const,effectAuthority:false as const,foundationAccepted:false as const,querySha256:original231TransportDisabledDefinitionsQuerySha256,eventTriggerBodySha256:hash(guard[1]),factsSha256:hash(canonicalReleaseExecutionJson(facts)),facts};
 }catch{throw fail();}
}
export function deriveSourceOriginal231TransportCatalogueBaseline(catalogue:unknown,facts:unknown,sourceBytes:unknown){try{return{scratch232:summarizeSourceChildCatalogue(catalogue),provider232:summarizeSourceChildCatalogue(applySourceChildCatalogueProviderDeltas(catalogue).rows),disabledDefinitions:readOriginal231TransportDisabledDefinitions(facts,sourceBytes)};}catch{throw fail();}}
const receiptSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_SOURCE_ORIGINAL231_TRANSPORT232_CATALOGUE'),evidence:z.literal('SOURCE_REFERENCE_ONLY'),original231Receipt:hostedOriginal231CatalogueReceiptSchema,sourceOriginal231ReceiptSha256:digest,migrationCount:z.literal(232),append:z.object({name:z.literal(original231TransportAppendMigration.name),version:z.literal(original231TransportAppendMigration.version),sha256:z.literal(original231TransportAppendMigration.sha256)}).strict(),migrationRowsSha256:digest,sourceInventorySha256:digest,genericQuerySha256:digest,postconditionQuerySha256:digest,producerSha256:digest,scratch232:hostedChildCatalogueSummarySchema,catalogueSummary:hostedChildCatalogueSummarySchema,disabledDefinitions:z.unknown(),capturedAt:date,hostedAcceptance:z.literal(false),effectAuthority:z.literal(false),foundationAccepted:z.literal(false),execution:z.literal('NOT_EXECUTED')}).strict();
const expectedSchema=z.object({sourceSha:z.string().regex(/^[a-f0-9]{40}$/),treeSha:z.string().regex(/^[a-f0-9]{40}$/),runId:z.string().regex(/^[1-9][0-9]*$/),runAttempt:z.number().int().positive().safe()}).strict();
/** Authenticated CI metadata describes definitions only, never native admission. */
export const original231TransportCatalogueReferenceSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_ORIGINAL231_TRANSPORT232_CATALOGUE_REFERENCE'),repository:z.literal('attaulhaq0/Cuevo'),sourceSha:expectedSchema.shape.sourceSha,treeSha:expectedSchema.shape.treeSha,baselineSourceSha:z.literal('239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37'),baselineTreeSha:z.literal('a58fa0bef6f6c0ea9cc57d12156b6c3464ac5559'),appliedMigrationCount:z.literal(232),migrationRowsSha256:digest,sourceInventorySha256:digest,querySha256:digest,postconditionQuerySha256:z.literal(original231TransportDisabledDefinitionsQuerySha256),policySha256:digest,artifactSha256:digest,artifactId:z.string().regex(/^[1-9][0-9]*$/),runId:expectedSchema.shape.runId,runAttempt:expectedSchema.shape.runAttempt,createdAt:date,catalogueSummary:hostedChildCatalogueSummarySchema,receiptSha256:digest,sourceOriginal231ReceiptSha256:digest,producerJobId:z.string().regex(/^[1-9][0-9]*$/),effectScope:z.literal('DISABLED_TRANSPORT_DEFINITIONS_ONLY'),effectAuthority:z.literal(false)}).strict();
/** Genuine later CI must bind this source-only receipt and both fixed queries.
 * Reusing an old231 receipt does not establish the new232 catalogue. */
export function parseHostedOriginal231TransportCatalogueReceipt(value:unknown,sources:unknown,expected:unknown){
 try{const json=canonicalReleaseExecutionJson(value);if(Buffer.byteLength(json)>49152)throw fail();const receipt=receiptSchema.parse(JSON.parse(json)),selected=selectOriginal231TransportCatalogueSources(sources),old=parseHostedOriginal231CatalogueReceipt(receipt.original231Receipt),binding=expectedSchema.parse(JSON.parse(canonicalReleaseExecutionJson(expected))),definition=z.object({facts:z.unknown()}).passthrough().parse(receipt.disabledDefinitions),actual=readOriginal231TransportDisabledDefinitions(definition.facts,selected.append.bytes);
  if(!same({sourceSha:old.sourceSha,treeSha:old.treeSha,runId:old.runId,runAttempt:old.runAttempt},binding)||receipt.sourceOriginal231ReceiptSha256!==sourceOriginal231CatalogueReceiptSha256(old)||receipt.migrationRowsSha256!==selected.migrationRowsSha256||receipt.sourceInventorySha256!==selected.sourceInventorySha256||old.sourceInventorySha256!==selected.originalInventorySha256||receipt.genericQuerySha256!==hostedSchemaCatalogueQuerySha256||receipt.postconditionQuerySha256!==original231TransportDisabledDefinitionsQuerySha256||!same(receipt.disabledDefinitions,actual)||Date.parse(old.capturedAt)>Date.parse(receipt.capturedAt)||Date.parse(receipt.capturedAt)>Date.parse(old.cleanupCompletedAt))throw fail();return{...receipt,original231Receipt:old,disabledDefinitions:actual};
 }catch{throw fail();}
}
