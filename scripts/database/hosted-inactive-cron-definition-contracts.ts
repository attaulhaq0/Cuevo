import {createHash} from 'node:crypto';
import {z} from 'zod';
import {hostedExecutionIdentitySchema,parseHostedExecutionJournal,snapshotHostedMigrationMetadata,type HostedExecutionJournal} from './hosted-migration-journal-contracts';
import {original231RecoveryFingerprint,original231RecoveryFingerprintSchema} from './hosted-original-child-recovery';
import {readOriginal231TransportAppendPlan} from './original231-transport-plan-contracts';
import {original231TransportAppendMigration} from './original231-transport-source';
import {original231TransportCatalogueReferenceSchema,original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().nonnegative().safe(),id=z.string().regex(/^[1-9][0-9]*$/).max(30);
const fail=()=>Error('Inactive Cron definition acknowledgement requires review; private contents withheld.');
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const payloadHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(left:unknown,right:unknown)=>canonicalReleaseExecutionJson(left)===canonicalReleaseExecutionJson(right);
const supplied=(value:unknown)=>snapshotHostedMigrationMetadata(value);
const appendSchema=z.object({name:z.literal(original231TransportAppendMigration.name),version:z.literal(original231TransportAppendMigration.version),sha256:z.literal(original231TransportAppendMigration.sha256)}).strict();
const contextBodySchema=z.object({
 version:z.literal(1),purpose:z.literal('CUEVO_INACTIVE_CRON_DEFINITION_CONTEXT'),identity:hostedExecutionIdentitySchema,
 releaseRunId:id,releaseRunAttempt:z.number().int().positive().safe(),append:appendSchema,
 original231:original231RecoveryFingerprintSchema,originalCatalogueReferenceSha256:digest,
 catalogueReference232:original231TransportCatalogueReferenceSchema,targetSha256:digest,
 effectScope:z.literal('DISABLED_TRANSPORT_DEFINITIONS_ONLY'),effectAuthority:z.literal(false),foundationAccepted:z.literal(false),
}).strict();
export const inactiveCronDefinitionContextSchema=contextBodySchema.extend({contextSha256:digest}).strict();
export type InactiveCronDefinitionContext=z.infer<typeof inactiveCronDefinitionContextSchema>;
function checkContext(context:InactiveCronDefinitionContext){
 const{contextSha256,...body}=context,i=context.identity,r=context.catalogueReference232;
 if(contextSha256!==hash(body)||i.stageId!=='remaining'||r.sourceSha!==i.sourceSha||r.treeSha!==i.treeSha||r.runId!==i.ciRunId||context.releaseRunId===r.runId||context.releaseRunId==='38150995125'||r.sourceSha===r.baselineSourceSha)throw fail();
}
/** Caller-supplied source/plan metadata. Neither this context nor its digest is
 * an operator approval, native acknowledgement or configuration capability. */
export function prepareInactiveCronDefinitionContext(value:unknown):InactiveCronDefinitionContext{
 try{
  const input=z.object({plan:z.unknown(),identity:hostedExecutionIdentitySchema,catalogueReference232:original231TransportCatalogueReferenceSchema,releaseRunId:id,releaseRunAttempt:z.number().int().positive().safe()}).strict().parse(supplied(value));
  const plan=readOriginal231TransportAppendPlan(input.plan),i=input.identity,r=input.catalogueReference232,old=plan.original231Recovery.template.originalIdentity;
  if(i.planSha256!==plan.planSha256||i.sourceSha!==plan.source.sha||i.treeSha!==plan.source.tree||i.projectRef!==plan.projectRef||i.databaseUrl!==old.databaseUrl||i.certificateSha256!==old.certificateSha256||i.stageSha256===old.stageSha256||
   r.migrationRowsSha256!==hash(plan.migrations.map(row=>({version:row.version,sourceReceiptSha256:row.sha256})))||r.sourceInventorySha256!==hash(plan.migrations.map(({name,sha256})=>({name,sha256}))))throw fail();
  const body=contextBodySchema.parse({version:1,purpose:'CUEVO_INACTIVE_CRON_DEFINITION_CONTEXT',identity:i,releaseRunId:input.releaseRunId,releaseRunAttempt:input.releaseRunAttempt,append:{...original231TransportAppendMigration},original231:original231RecoveryFingerprint(plan.original231Recovery.template),originalCatalogueReferenceSha256:hash(plan.original231Recovery.catalogueReference),catalogueReference232:r,targetSha256:hash(plan.target),effectScope:'DISABLED_TRANSPORT_DEFINITIONS_ONLY',effectAuthority:false,foundationAccepted:false});
  return readInactiveCronDefinitionContext({...body,contextSha256:hash(body)});
 }catch{throw fail();}
}
/** Exact supplied metadata decoding, never registration in the native owner. */
export function readInactiveCronDefinitionContext(value:unknown):InactiveCronDefinitionContext{
 try{const context=inactiveCronDefinitionContextSchema.parse(supplied(value));checkContext(context);return context;}catch{throw fail();}
}
const persistedSelectionBodySchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_PERSISTED_INACTIVE_CRON_ACK_SELECTION'),context:inactiveCronDefinitionContextSchema,journalPayloadSha256:digest,journalChainSha256:digest,effectAuthority:z.literal(false),foundationAccepted:z.literal(false),activationAuthorized:z.literal(false)}).strict();
export const persistedInactiveCronAcknowledgementSelectionSchema=persistedSelectionBodySchema.extend({selectionSha256:digest}).strict();
export type PersistedInactiveCronAcknowledgementSelection=z.infer<typeof persistedInactiveCronAcknowledgementSelectionSchema>;
/** A saved selector is metadata only. Native ownership requires independent
 * current approved admission and both actual durable source-owned stores. */
export function preparePersistedInactiveCronAcknowledgementSelection(value:unknown):PersistedInactiveCronAcknowledgementSelection{
 const input=z.object({context:inactiveCronDefinitionContextSchema,journalPayloadSha256:digest,journalChainSha256:digest}).strict().parse(supplied(value)),body=persistedSelectionBodySchema.parse({version:1,purpose:'CUEVO_PERSISTED_INACTIVE_CRON_ACK_SELECTION',...input,effectAuthority:false,foundationAccepted:false,activationAuthorized:false});
 return readPersistedInactiveCronAcknowledgementSelection({...body,selectionSha256:hash(body)});
}
export function readPersistedInactiveCronAcknowledgementSelection(value:unknown,currentContext?:unknown):PersistedInactiveCronAcknowledgementSelection{
 try{
  const selection=persistedInactiveCronAcknowledgementSelectionSchema.parse(supplied(value)),{selectionSha256,...body}=selection,original=readInactiveCronDefinitionContext(selection.context);if(selectionSha256!==hash(body))throw fail();
  if(currentContext!==undefined){const current=readInactiveCronDefinitionContext(currentContext);
   for(const key of ['projectRef','sourceSha','treeSha','planSha256','stageSha256','databaseUrl','certificateSha256','ciRunId']as const)if(original.identity[key]!==current.identity[key])throw fail();
   for(const key of ['append','original231','originalCatalogueReferenceSha256','catalogueReference232','targetSha256']as const)if(!same(original[key],current[key]))throw fail();
  }
  return selection;
 }catch{throw fail();}
}
const acknowledgementSchema=z.object({
 intentPayloadSha256:digest,beforeHistorySha256:digest,afterHistorySha256:digest,catalogueSha256:digest,
 disabledDefinitionsFactsSha256:digest,postconditionQuerySha256:z.literal(original231TransportDisabledDefinitionsQuerySha256),
 nativeProofBeganAtMs:time,observedAtMs:time,cli:z.object({kind:z.literal('EXITED'),exitCode:z.literal(0),exitedAtMs:time}).strict(),
 installedMarkerSha256:digest,cronInstalled:z.literal(false),runtimeLogin:z.literal(false),dispatchEnabled:z.literal(false),activeLeases:z.literal(0),schoolCount:z.literal(0),authUserCount:z.literal(0),
}).strict();
export type InactiveCronDefinitionJournalEvidence=z.infer<typeof acknowledgementSchema>;
const journalCommonSchema=z.object({version:z.literal(3),purpose:z.literal('CUEVO_ORIGINAL231_INACTIVE_CRON_DEFINITION_JOURNAL'),identity:hostedExecutionIdentitySchema,context:inactiveCronDefinitionContextSchema,schemaHistoryAtomic:z.literal(false),evidence:z.literal('SUPPLIED_PORT_EXECUTION_ONLY'),effectAuthority:z.literal(false),foundationAccepted:z.literal(false)}).strict();
export const inactiveCronDefinitionJournalSchema=z.discriminatedUnion('state',[
 journalCommonSchema.extend({state:z.literal('INTENT'),acknowledgement:z.null()}).strict(),
 journalCommonSchema.extend({state:z.literal('INACTIVE_DEFINITIONS_ACKNOWLEDGED'),acknowledgement:acknowledgementSchema}).strict(),
 journalCommonSchema.extend({state:z.literal('REQUIRES_REVIEW'),acknowledgement:acknowledgementSchema.nullable()}).strict(),
]);
export type InactiveCronDefinitionJournal=z.infer<typeof inactiveCronDefinitionJournalSchema>;
export type HostedMigrationStoredJournal=HostedExecutionJournal|InactiveCronDefinitionJournal;
function intentFor(context:InactiveCronDefinitionContext):InactiveCronDefinitionJournal{
 return journalCommonSchema.extend({state:z.literal('INTENT'),acknowledgement:z.null()}).strict().parse({version:3,purpose:'CUEVO_ORIGINAL231_INACTIVE_CRON_DEFINITION_JOURNAL',identity:context.identity,context,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',effectAuthority:false,foundationAccepted:false,state:'INTENT',acknowledgement:null});
}
/** One distinct current intent; original V1 journals remain immutable. */
export function prepareInactiveCronDefinitionIntent(value:unknown):InactiveCronDefinitionJournal{
 try{return intentFor(readInactiveCronDefinitionContext(value));}catch{throw fail();}
}
/** A supplied terminal payload is not an acknowledged journal publication. The
 * native owner must separately read both durable stores before minting a token. */
export function prepareInactiveCronDefinitionAcknowledgedJournal(context:unknown,evidence:unknown):InactiveCronDefinitionJournal{
 const intent=prepareInactiveCronDefinitionIntent(context);
 return parseInactiveCronDefinitionJournal({...intent,state:'INACTIVE_DEFINITIONS_ACKNOWLEDGED',acknowledgement:supplied(evidence)},intent.context);
}
export function parseInactiveCronDefinitionJournal(value:unknown,expectedContext?:unknown):InactiveCronDefinitionJournal{
 try{
  const journal=inactiveCronDefinitionJournalSchema.parse(supplied(value)),context=readInactiveCronDefinitionContext(journal.context),proof=journal.acknowledgement;
  if(!same(journal.identity,context.identity)||expectedContext!==undefined&&!same(context,readInactiveCronDefinitionContext(expectedContext)))throw fail();
  if(proof&&(proof.intentPayloadSha256!==payloadHash(intentFor(context))||proof.beforeHistorySha256!==context.original231.afterHistorySha256||proof.afterHistorySha256!==context.catalogueReference232.migrationRowsSha256||proof.catalogueSha256!==context.catalogueReference232.catalogueSummary.sha256||proof.installedMarkerSha256!==context.original231.installedMarkerSha256||proof.nativeProofBeganAtMs>proof.cli.exitedAtMs||proof.cli.exitedAtMs>proof.observedAtMs||Date.parse(context.catalogueReference232.createdAt)>proof.nativeProofBeganAtMs))throw fail();
  return journal;
 }catch{throw fail();}
}
/** Closed same-purpose transitions, including an exact acknowledged payload
 * retained during a later cleanup refusal. No retry from REQUIRES_REVIEW. */
export function canAppendInactiveCronDefinitionJournal(priorValue:unknown,nextValue:unknown):boolean{
 try{
  const next=parseInactiveCronDefinitionJournal(nextValue);if(priorValue===null)return next.state==='INTENT';
  const prior=parseInactiveCronDefinitionJournal(priorValue,next.context);
  if(prior.state==='INTENT')return next.state==='INACTIVE_DEFINITIONS_ACKNOWLEDGED'||next.state==='REQUIRES_REVIEW'&&next.acknowledgement===null;
  return prior.state==='INACTIVE_DEFINITIONS_ACKNOWLEDGED'&&next.state==='REQUIRES_REVIEW'&&same(prior.acknowledgement,next.acknowledgement);
 }catch{return false;}
}
/** Stored payload census only. Legacy execution consumers retain their exact
 * decoder, which refuses V3 instead of treating it as full schema completion. */
export function parseStoredHostedMigrationJournal(value:unknown):HostedMigrationStoredJournal{
 try{const copy=supplied(value);return copy&&typeof copy==='object'&&Object.getOwnPropertyDescriptor(copy,'version')?.value===3?parseInactiveCronDefinitionJournal(copy):parseHostedExecutionJournal(copy);}catch{throw fail();}
}
export function canAppendStoredHostedMigrationJournal(priorValue:unknown,nextValue:unknown):boolean{
 try{
  const next=parseStoredHostedMigrationJournal(nextValue);if(next.version===3)return canAppendInactiveCronDefinitionJournal(priorValue,next);
  if(priorValue===null)return next.state==='INTENT';const prior=parseHostedExecutionJournal(priorValue);
  return prior.state==='INTENT'?(next.state==='COMMITTED'||next.state==='REQUIRES_REVIEW'):prior.state==='COMMITTED'&&next.state==='REQUIRES_REVIEW';
 }catch{return false;}
}
const nativeReceiptSchema=z.object({
 version:z.literal(1),purpose:z.literal('CUEVO_NATIVE_INACTIVE_CRON_DEFINITION_ACKNOWLEDGEMENT'),evidence:z.literal('NATIVE_DATABASE_OWNED_DISABLED_DEFINITION_ACKNOWLEDGEMENT'),
 context:inactiveCronDefinitionContextSchema,journal:journalCommonSchema.extend({state:z.literal('INACTIVE_DEFINITIONS_ACKNOWLEDGED'),acknowledgement:acknowledgementSchema}).strict(),
 durable:z.object({localPayloadSha256:digest,remotePayloadSha256:digest,localChainSha256:digest,remoteChainSha256:digest,acknowledgedAtMs:time}).strict(),
 currentNativeProofBeganAtMs:time,currentObservedAtMs:time,packageExpiresAtMs:time,
 effectScope:z.literal('SQL_CRON_CONFIGURATION_ONLY'),effectAuthority:z.literal(false),foundationAccepted:z.literal(false),activationAuthorized:z.literal(false),
}).strict();
export type NativeInactiveCronDefinitionAcknowledgementMetadata=z.infer<typeof nativeReceiptSchema>;
const reboundNativeReceiptSchema=nativeReceiptSchema.extend({version:z.literal(2),readAdmission:z.object({purpose:z.literal('CUEVO_CURRENT_PERSISTED_INACTIVE_ACK_READ_ADMISSION'),currentContext:inactiveCronDefinitionContextSchema,selection:persistedInactiveCronAcknowledgementSelectionSchema,effectAuthority:z.literal(false),activationAuthorized:z.literal(false)}).strict()}).strict();
export type NativeReboundInactiveCronDefinitionAcknowledgementMetadata=z.infer<typeof reboundNativeReceiptSchema>;
/** Supplied metadata decoding only. The actual consumer separately reads the
 * private native token and independently verifies both persisted stores. */
export function readNativeReboundInactiveCronDefinitionAcknowledgementMetadata(value:unknown,expected:unknown):NativeReboundInactiveCronDefinitionAcknowledgementMetadata{
 try{
  const input=z.object({originalContext:inactiveCronDefinitionContextSchema,currentContext:inactiveCronDefinitionContextSchema,now:time,expiresAtMs:time}).strict().parse(supplied(expected)),receipt=reboundNativeReceiptSchema.parse(supplied(value)),current=readInactiveCronDefinitionContext(input.currentContext),selection=readPersistedInactiveCronAcknowledgementSelection(receipt.readAdmission.selection,current);
  if(!same(receipt.readAdmission.currentContext,current)||!same(selection.context,input.originalContext)||!same(receipt.context,input.originalContext)||receipt.durable.localPayloadSha256!==selection.journalPayloadSha256||receipt.durable.localChainSha256!==selection.journalChainSha256)throw fail();
  const{readAdmission,version,...base}=receipt;void readAdmission;void version;readNativeInactiveCronDefinitionAcknowledgementMetadata({...base,version:1},{context:input.originalContext,now:input.now,expiresAtMs:input.expiresAtMs});return receipt;
 }catch{throw fail();}
}
/** Validation of supplied native-shaped metadata only. The configuration
 * consumer obtains it exclusively from the native owner's private token map. */
export function readNativeInactiveCronDefinitionAcknowledgementMetadata(value:unknown,expected:unknown):NativeInactiveCronDefinitionAcknowledgementMetadata{
 try{
  const input=z.object({context:inactiveCronDefinitionContextSchema,now:time,expiresAtMs:time}).strict().parse(supplied(expected)),receipt=nativeReceiptSchema.parse(supplied(value)),context=readInactiveCronDefinitionContext(input.context),journal=parseInactiveCronDefinitionJournal(receipt.journal,context),proof=journal.acknowledgement;
  if(!proof||!same(receipt.context,context)||receipt.durable.localPayloadSha256!==payloadHash(journal)||receipt.durable.remotePayloadSha256!==payloadHash(journal)||receipt.durable.localChainSha256!==receipt.durable.remoteChainSha256||receipt.durable.acknowledgedAtMs<proof.observedAtMs||receipt.currentNativeProofBeganAtMs<receipt.durable.acknowledgedAtMs||receipt.currentNativeProofBeganAtMs>receipt.currentObservedAtMs||receipt.currentObservedAtMs>input.now||input.now-receipt.currentNativeProofBeganAtMs>30000||input.now>=receipt.packageExpiresAtMs||receipt.packageExpiresAtMs!==input.expiresAtMs)throw fail();
  return receipt;
 }catch{throw fail();}
}
