import {createHash} from 'node:crypto';
import {z} from 'zod';
import {snapshotHostedMigrationMetadata} from './hosted-migration-journal-contracts';
import {persistedInactiveCronAcknowledgementSelectionSchema,readPersistedInactiveCronAcknowledgementSelection} from './hosted-inactive-cron-definition-contracts';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const fail=()=>Error('SQL Cron configuration metadata requires review; private contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),time=z.number().int().nonnegative().safe();
const id=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n);
const currentSchema=z.object({projectRef:z.string().regex(/^[a-z]{20}$/),sourceSha:sha,treeSha:sha,ciRunId:id,releaseRunId:id,releaseRunAttempt:z.number().int().positive().safe(),packageSha256:digest,sourceManifestSha256:digest,databaseUrl:z.string().max(400),certificateSha256:digest,installedHistorySha256:digest}).strict();
const jobSchema=z.object({name:z.literal('cuevo-sql-outbox-v2'),schedule:z.literal('1 second'),command:z.literal('CALL internal.run_sql_worker(1);'),generation:z.literal('1'),username:z.literal('postgres'),database:z.literal('postgres'),active:z.literal(false)}).strict();
const falseAuthority={effectAuthority:z.literal(false),nativeExecutionAuthorized:z.literal(false),activationAuthorized:z.literal(false),foundationAccepted:z.literal(false)};
const intentBodySchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_SQL_CRON_CONFIGURATION_INTENT'),provenance:z.literal('SUPPLIED_CONFIGURATION_REVIEW_METADATA'),action:z.literal('PREPARE_INACTIVE'),current:currentSchema,originalAcknowledgement:persistedInactiveCronAcknowledgementSelectionSchema,beforeStateSha256:digest,configurationOverlaySha256:digest,preparedAtMs:time,expiresAtMs:time,job:jobSchema,...falseAuthority}).strict();
export const sqlCronConfigurationIntentSchema=intentBodySchema.extend({intentSha256:digest}).strict();
export type SqlCronConfigurationIntent=z.infer<typeof sqlCronConfigurationIntentSchema>;
export type SqlCronConfigurationCurrent=z.infer<typeof currentSchema>;
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const same=(left:unknown,right:unknown)=>canonicalReleaseExecutionJson(left)===canonicalReleaseExecutionJson(right);
function parse<T>(schema:z.ZodType<T>,value:unknown):T{
 try{const snapshot=snapshotHostedMigrationMetadata(value);return schema.parse(JSON.parse(canonicalReleaseExecutionJson(snapshot)));}catch{throw fail();}
}
function requireLifetime(intent:Pick<SqlCronConfigurationIntent,'preparedAtMs'|'expiresAtMs'>,now:number){
 if(intent.preparedAtMs>now||intent.expiresAtMs<=now||intent.expiresAtMs<=intent.preparedAtMs||intent.expiresAtMs-intent.preparedAtMs>3600000)throw fail();
}
function requireOriginalBinding(intent:SqlCronConfigurationIntent){
 const selection=readPersistedInactiveCronAcknowledgementSelection(intent.originalAcknowledgement),original=selection.context,current=intent.current;
 if(current.projectRef!==original.identity.projectRef||current.databaseUrl!==original.identity.databaseUrl||current.certificateSha256!==original.identity.certificateSha256||current.installedHistorySha256!==original.catalogueReference232.migrationRowsSha256||current.releaseRunId===original.releaseRunId||current.releaseRunId===current.ciRunId)throw fail();
 // Metadata can name a future current source, but never supply cross-source
 // native adoption. The real owner must independently verify old ACK custody.
 const url=new URL(current.databaseUrl),direct=url.hostname===`db.${current.projectRef}.supabase.co`&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${current.projectRef}`;
 if(url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||url.toString()!==current.databaseUrl||!(direct||pooler))throw fail();
}
/** Pure first-configuration planning only. No I/O, permit registration, original
 * custody construction or mutation executor is exposed by these contracts. */
export function prepareSqlCronConfigurationIntent(value:unknown):SqlCronConfigurationIntent{
 try{
  const input=parse(z.object({current:currentSchema,originalAcknowledgement:persistedInactiveCronAcknowledgementSelectionSchema,beforeStateSha256:digest,configurationOverlaySha256:digest,preparedAtMs:time,expiresAtMs:time,now:time}).strict(),value),{now,...metadata}=input;
  const body=intentBodySchema.parse({version:1,purpose:'CUEVO_SQL_CRON_CONFIGURATION_INTENT',provenance:'SUPPLIED_CONFIGURATION_REVIEW_METADATA',action:'PREPARE_INACTIVE',...metadata,job:{name:'cuevo-sql-outbox-v2',schedule:'1 second',command:'CALL internal.run_sql_worker(1);',generation:'1',username:'postgres',database:'postgres',active:false},effectAuthority:false,nativeExecutionAuthorized:false,activationAuthorized:false,foundationAccepted:false});
  return readSqlCronConfigurationIntent({...body,intentSha256:hash(body)},{current:input.current,now});
 }catch{throw fail();}
}
/** Exact metadata read under a current supplied comparison, not authenticated
 * operator approval or a native acknowledgement token. */
export function readSqlCronConfigurationIntent(value:unknown,expected:unknown):SqlCronConfigurationIntent{
 try{
  const intent=parse(sqlCronConfigurationIntentSchema,value),input=parse(z.object({current:currentSchema,now:time}).strict(),expected),{intentSha256,...body}=intent;
  if(intentSha256!==hash(body)||!same(intent.current,input.current))throw fail();requireOriginalBinding(intent);requireLifetime(intent,input.now);return intent;
 }catch{throw fail();}
}
const ownedJobSchema=z.object({jobId:id,generation:z.literal('1'),active:z.literal(false),jobSha256:digest}).strict();
const durableSchema=z.object({localPayloadSha256:digest,remotePayloadSha256:digest,localChainSha256:digest,remoteChainSha256:digest}).strict();
export const sqlCronConfigurationObservationSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_SQL_CRON_CONFIGURATION_OBSERVATION'),evidence:z.literal('SUPPLIED_READ_ONLY_CONFIGURATION_OBSERVATION'),intentSha256:digest,action:z.literal('OBSERVE_ORIGINAL'),observedAtMs:time,stage:z.enum(['NOT_ATTEMPTED','UNKNOWN','PREPARED_INACTIVE']),attemptCount:z.number().int().min(0).max(1),commitment:z.enum(['NOT_ATTEMPTED','UNKNOWN','OBSERVED']),ownedJob:ownedJobSchema.nullable(),durableReceipt:durableSchema.nullable(),authenticCustodyCreated:z.literal(false),...falseAuthority}).strict();
export type SqlCronConfigurationObservation=z.infer<typeof sqlCronConfigurationObservationSchema>;
/** Supplied finite observation preserves UNKNOWN and positive int8 IDs. Even
 * paired metadata is not native custody, preparation acceptance or activation. */
export function readSqlCronConfigurationObservation(value:unknown,expected:unknown):SqlCronConfigurationObservation{
 try{
  const receipt=parse(sqlCronConfigurationObservationSchema,value),input=parse(z.object({intent:sqlCronConfigurationIntentSchema,current:currentSchema,now:time}).strict(),expected),intent=readSqlCronConfigurationIntent(input.intent,{current:input.current,now:input.now});
  if(receipt.intentSha256!==intent.intentSha256||receipt.observedAtMs<intent.preparedAtMs||receipt.observedAtMs>input.now||input.now-receipt.observedAtMs>30000)throw fail();
  if(receipt.stage==='PREPARED_INACTIVE'){
   if(receipt.attemptCount!==1||receipt.commitment!=='OBSERVED'||!receipt.ownedJob||receipt.ownedJob.jobSha256!==hash(intent.job)||!receipt.durableReceipt||receipt.durableReceipt.localPayloadSha256!==receipt.durableReceipt.remotePayloadSha256||receipt.durableReceipt.localChainSha256!==receipt.durableReceipt.remoteChainSha256)throw fail();
  }else if(receipt.ownedJob!==null||receipt.durableReceipt!==null||receipt.stage==='NOT_ATTEMPTED'&&(receipt.attemptCount!==0||receipt.commitment!=='NOT_ATTEMPTED')||receipt.stage==='UNKNOWN'&&(receipt.attemptCount!==1||receipt.commitment!=='UNKNOWN'))throw fail();
  return receipt;
 }catch{throw fail();}
}
