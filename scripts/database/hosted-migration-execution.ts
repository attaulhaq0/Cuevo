import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { HostedMigrationConnection } from './hosted-migration-connection';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';
import {hostedExecutionIdentitySchema as identitySchema,originalIntentExecutionSchema,parseHostedExecutionJournal,snapshotHostedMigrationMetadata as snapshot,type HostedExecutionJournal,type HostedExecutionPorts,type HostedExecutionResult} from './hosted-migration-journal-contracts';
export {originalIntentExecutionSchema,hostedExecutionJournalSchema,parseHostedExecutionJournal} from './hosted-migration-journal-contracts';
export type {HostedExecutionJournal,HostedExecutionPorts,HostedExecutionResult,NativeOriginalIntentExecution} from './hosted-migration-journal-contracts';

const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),ref=z.string().regex(/^[a-z]{20}$/),version=z.string().regex(/^\d{14}$/);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const row=z.object({name:z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/),version,sha256:digest}).strict();
const inputSchema=z.object({prepared:z.object({projectRef:ref,sourceSha:sha,treeSha:sha,planSha256:digest,stage:z.object({id:z.enum(['prefix','native','pre-observability','remaining']),workdir:z.string(),included:z.array(row).min(1).max(1000),pending:z.array(row).max(1000),expectedBeforeVersions:z.array(version).max(1000),expectedAfterVersions:z.array(version).max(1000),configSha256:digest,commandArgs:z.array(z.string()),materialization:z.literal('SQL_FILES').optional()}).strict()}).strict(),connection:z.object({publicRecipe:z.object({projectRef:ref,databaseUrl:z.string(),cliTargetArgs:z.array(z.string()).length(2),operator:z.literal('postgres'),endpointKind:z.enum(['direct','session-pooler']),provenance:z.literal('CALLER_SUPPLIED_PROVIDER_METADATA'),tls:z.literal('VERIFY_FULL_CONFIGURATION_ONLY'),certificateProvenance:z.literal('CALLER_SUPPLIED_OWNED_PATH'),execution:z.literal('NOT_EXECUTED')}).strict(),privateEnvironment:z.record(z.string(),z.string())}).strict(),approvalDigest:digest,repoRoot:z.string(),ciRunId:z.string().regex(/^[1-9][0-9]*$/),certificateSha256:digest}).strict();
const snapshotSchema=z.object({kind:z.literal('ADMITTED'),observedAtMs:z.number().int().nonnegative(),source:z.object({sha,tree:sha,currentMainSha:sha,ciRunId:z.string().regex(/^[1-9][0-9]*$/)}).strict(),project:z.object({ref,host:z.string(),port:z.literal(5432),database:z.literal('postgres'),operator:z.literal('postgres')}).strict(),approval:z.object({purpose:z.literal('BACKEND_SYNTHETIC_STAGING'),digest,expiresAtMs:z.number().int().positive()}).strict(),artifact:z.object({stageSha256:digest}).strict(),tls:z.object({kind:z.literal('PEER_VERIFIED'),host:z.string(),certificateSha256:digest}).strict(),lock:z.object({id:z.string().min(1).max(200),key:z.string().min(1).max(200)}).strict(),history:z.array(z.object({version,sourceReceiptSha256:digest}).strict()).max(1000),postconditions:z.enum(['SATISFIED','NOT_CHECKED'])}).strict();
const environmentKeys=new Set(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','LANG','LC_ALL','TZ','PGPASSWORD','PGSSLROOTCERT']);
export type HostedMigrationStageInput={prepared:Pick<HostedMigrationWorkdirs,'projectRef'|'sourceSha'|'treeSha'|'planSha256'>&{stage:HostedMigrationWorkdirs['stages'][number]};connection:HostedMigrationConnection;approvalDigest:string;repoRoot:string;ciRunId:string;certificateSha256:string};
export type HeldHostedMigrationStage={key:string|null;result:HostedExecutionResult;run(lease:{kind:'HELD';id:string;key:string},isHeld:()=>boolean):Promise<void>;releaseUnconfirmed():Promise<void>};
/** Stage authority and original journal protocol within a caller-owned live lease.
 * It never acquires/releases a lock or attests that a supplied lease is native. */
type OriginalExecutionBinding={journalIdentity:HostedExecutionJournal['identity'];currentExecutionIdentity:HostedExecutionJournal['identity'];link:Extract<HostedExecutionJournal,{version:2}>['originalIntentExecution']};
function prepareHeldStage(input:HostedMigrationStageInput,ports:Omit<HostedExecutionPorts,'withLock'>,original?:{binding:OriginalExecutionBinding;readBinding(purpose:'LIVE'|'EFFECT'|'CLI'):OriginalExecutionBinding}):HeldHostedMigrationStage{
 const result:HostedExecutionResult={status:'REQUIRES_REVIEW',commitment:'NOT_ATTEMPTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',execution:'INJECTED_PORTS',primaryCode:null,journalCode:null,cleanupCode:null};
 let parsed:z.infer<typeof inputSchema>,url:URL;
 try{parsed=inputSchema.parse(snapshot(input));url=new URL(parsed.connection.publicRecipe.databaseUrl);const p=parsed.prepared,s=p.stage,env=parsed.connection.privateEnvironment;
  const direct=url.hostname===`db.${p.projectRef}.supabase.co`&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${p.projectRef}`;
  const confined=(path:string)=>{const part=relative(join(parsed.repoRoot,'.local','hosted-release'),path);return isAbsolute(path)&&resolve(path)===path&&!!part&&!isAbsolute(part)&&!part.split(/[\\/]/).some(value=>value==='..'||value==='.'||!value);};
  if(!isAbsolute(parsed.repoRoot)||resolve(parsed.repoRoot)!==parsed.repoRoot||parsed.connection.publicRecipe.projectRef!==p.projectRef||url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||!(direct||pooler)||direct!== (parsed.connection.publicRecipe.endpointKind==='direct')||JSON.stringify(parsed.connection.publicRecipe.cliTargetArgs)!==JSON.stringify(['--db-url',url.toString()])||!confined(s.workdir)||Object.keys(env).some(key=>!environmentKeys.has(key))||!env.PGPASSWORD?.trim()||[...env.PGPASSWORD].some(value=>value.charCodeAt(0)<32||value.charCodeAt(0)===127)||!env.PGSSLROOTCERT||!confined(env.PGSSLROOTCERT))throw Error('Invalid input.');
  const included=s.included.map(row=>row.version),before=[...s.expectedBeforeVersions].sort(),after=[...s.expectedAfterVersions].sort(),pending=s.pending.map(row=>row.version);
  if(new Set(included).size!==included.length||s.included.some(row=>row.name.slice(0,14)!==row.version)||new Set(before).size!==before.length||new Set(after).size!==after.length||JSON.stringify([...included].sort())!==JSON.stringify(after)||before.some(value=>!included.includes(value))||JSON.stringify([...pending].sort())!==JSON.stringify(after.filter(value=>!before.includes(value)))||s.pending.some(row=>!s.included.some(value=>value.name===row.name&&value.version===row.version&&value.sha256===row.sha256)))throw Error('Invalid stage.');
 }catch{result.primaryCode='INPUT_INVALID';return{key:null,result,run:async()=>undefined,releaseUnconfirmed:async()=>undefined};}
 const p=parsed.prepared,s=p.stage,currentIdentity={projectRef:p.projectRef,sourceSha:p.sourceSha,treeSha:p.treeSha,planSha256:p.planSha256,stageId:s.id,stageSha256:hash({included:s.included,configSha256:s.configSha256}),databaseUrl:url.toString(),approvalDigest:parsed.approvalDigest,ciRunId:parsed.ciRunId,certificateSha256:parsed.certificateSha256},identity=original?.binding.journalIdentity??currentIdentity;result.identity=identity;
 const sameIdentity=(left:HostedExecutionJournal['identity'],right:HostedExecutionJournal['identity'])=>JSON.stringify(identitySchema.parse(snapshot(left)))===JSON.stringify(identitySchema.parse(snapshot(right)));
 if(original&&(!sameIdentity(currentIdentity,original.binding.currentExecutionIdentity)||s.id!=='native'||s.pending.length!==1||s.expectedBeforeVersions.length!==123||s.expectedAfterVersions.length!==124)){result.primaryCode='INPUT_INVALID';return{key:null,result,run:async()=>undefined,releaseUnconfirmed:async()=>undefined};}
 const key=`${p.projectRef}:HOSTED_SCHEMA_MIGRATION`;let entered=false,intent=false,attempted=false,committedAcknowledged=false,acknowledgedCommit:(HostedExecutionJournal&{state:'COMMITTED'})|undefined,lease:{id:string;key:string},isHeld=()=>false,lastOriginalLink=original?.binding.link;
 const nativeBinding=(purpose:'LIVE'|'EFFECT'|'CLI')=>{
  if(!original)return;const binding=original.readBinding(purpose),link=originalIntentExecutionSchema.parse(snapshot(binding.link)),initial=original.binding.link;
  if(!sameIdentity(binding.journalIdentity,identity)||!sameIdentity(binding.currentExecutionIdentity,currentIdentity)||!sameIdentity(link.currentExecutionIdentity,currentIdentity)||(['originalOperationSha256','originalIntentSha256','templateSha256','selectionSha256','runId','runAttempt','beforeHistorySha256','afterHistorySha256']as const).some(key=>link[key]!==initial[key]))throw Error('Original native execution changed.');
  parseHostedExecutionJournal({version:2,identity,state:'COMMITTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',originalIntentExecution:link});if(!committedAcknowledged){lastOriginalLink=binding.link;result.originalIntentExecution=structuredClone(lastOriginalLink);}return binding;
 };
 const live=()=>{if(!isHeld())throw Error('Lock no longer held.');nativeBinding('LIVE');};
 const write=async(state:HostedExecutionJournal['state'])=>{
  if(state!=='REQUIRES_REVIEW'){live();nativeBinding('EFFECT');}
  const value:HostedExecutionJournal=original&&state!=='INTENT'?{version:2,identity,state,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',originalIntentExecution:lastOriginalLink!}:{version:1,identity,state,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'},expected=hash(value),receipt=await ports.writeJournal(structuredClone(value));
  if(receipt.kind!=='SYNCED'||receipt.sha256!==expected)throw Error('Journal unconfirmed.');if(state==='COMMITTED'){committedAcknowledged=true;acknowledgedCommit=structuredClone(value) as HostedExecutionJournal&{state:'COMMITTED'};}if(value.version===2)result.originalIntentExecution=structuredClone(value.originalIntentExecution);
  if(state!=='REQUIRES_REVIEW')live();
 };
 const admission=async(expected:'before'|'after')=>{live();const value=snapshotSchema.parse(snapshot(await ports.revalidate())),now=ports.now();live();
  if(!Number.isSafeInteger(now)||now<value.observedAtMs||now-value.observedAtMs>30000||value.source.sha!==p.sourceSha||value.source.tree!==p.treeSha||value.source.currentMainSha!==p.sourceSha||value.source.ciRunId!==currentIdentity.ciRunId||value.project.ref!==p.projectRef||value.project.host!==url.hostname||value.approval.digest!==currentIdentity.approvalDigest||value.approval.expiresAtMs<=now||value.artifact.stageSha256!==currentIdentity.stageSha256||value.tls.host!==url.hostname||value.tls.certificateSha256!==currentIdentity.certificateSha256||value.lock.id!==lease.id||value.lock.key!==key)throw Error('Admission changed.');
  const versions=expected==='before'?s.expectedBeforeVersions:s.expectedAfterVersions;
  if(JSON.stringify(value.history.map(row=>row.version).sort())!==JSON.stringify([...versions].sort())||new Set(value.history.map(row=>row.version)).size!==value.history.length||value.history.some(row=>s.included.find(source=>source.version===row.version)?.sha256!==row.sourceReceiptSha256)||expected==='after'&&value.postconditions!=='SATISFIED')throw Error('History unavailable.');
 };
 const run=async(supplied:{kind:'HELD';id:string;key:string},held:()=>boolean)=>{
   if(entered||supplied.kind!=='HELD'||supplied.key!==key||!supplied.id||supplied.id.length>200){result.primaryCode='LOCK_UNCONFIRMED';result.status='REQUIRES_REVIEW';return;}entered=true;lease={id:supplied.id,key};isHeld=held;
   try{
    live();
    const prior=await ports.readJournal();live();if(prior!==null){const saved=parseHostedExecutionJournal(prior);if(hash(saved.identity)!==hash(identity)){result.primaryCode='PRIOR_REQUIRES_REVIEW';return;}if(original&&saved.version===1&&saved.state==='INTENT'&&hash(saved)===original.binding.link.originalIntentSha256){await admission('before');intent=true;}else{if(saved.state!=='COMMITTED'||original&&(saved.version!==2||(['originalOperationSha256','originalIntentSha256','templateSha256','selectionSha256','runId','runAttempt','beforeHistorySha256','afterHistorySha256']as const).some(key=>saved.originalIntentExecution[key]!==original.binding.link[key])||!sameIdentity(saved.originalIntentExecution.currentExecutionIdentity,currentIdentity))){result.primaryCode='PRIOR_REQUIRES_REVIEW';return;}await admission('after');if(original&&saved.version===2){committedAcknowledged=true;lastOriginalLink=saved.originalIntentExecution;result.originalIntentExecution=structuredClone(lastOriginalLink);}result.status='NOOP';result.commitment='CONFIRMED';return;}}else if(original){result.primaryCode='PRIOR_REQUIRES_REVIEW';return;}
    if(!intent){await admission('before');result.primaryCode='JOURNAL_UNCONFIRMED';await write('INTENT');intent=true;}
    result.primaryCode='ADMISSION_CHANGED';await admission('before');live();nativeBinding('CLI');result.primaryCode='CLI_UNCONFIRMED';attempted=true;result.commitment='UNKNOWN';
    const cli=await ports.runCli(['db','push','--db-url',url.toString(),'--include-all','--skip-vault','--workdir',s.workdir,'--yes','--output-format','json'],{...parsed.connection.privateEnvironment});live();if(cli.kind!=='EXITED'||cli.exitCode!==0)throw Error('CLI unconfirmed.');
    result.primaryCode='POSTCONDITION_UNCONFIRMED';await admission('after');result.primaryCode='JOURNAL_UNCONFIRMED';await write('COMMITTED');result.status='COMMITTED';result.commitment='CONFIRMED';result.primaryCode=null;
   }catch{if(acknowledgedCommit){result.acknowledgedCommit=structuredClone(acknowledgedCommit);result.primaryCode='ADMISSION_CHANGED';result.status='REQUIRES_REVIEW';result.commitment='CONFIRMED';return;}if(!result.primaryCode)result.primaryCode='ADMISSION_CHANGED';if(intent)await write('REQUIRES_REVIEW').catch(()=>{result.journalCode='REVIEW_JOURNAL_UNCONFIRMED';});result.status='REQUIRES_REVIEW';result.commitment=attempted?'UNKNOWN':'NOT_ATTEMPTED';}
 };
 const releaseUnconfirmed=async()=>{result.cleanupCode='LOCK_RELEASE_UNCONFIRMED';result.status='REQUIRES_REVIEW';if(acknowledgedCommit)result.acknowledgedCommit=structuredClone(acknowledgedCommit);if(intent)await write('REQUIRES_REVIEW').catch(()=>{result.journalCode='REVIEW_JOURNAL_UNCONFIRMED';});};
 return{key,result,run,releaseUnconfirmed};
}
export function prepareHeldHostedMigrationStage(input:HostedMigrationStageInput,ports:Omit<HostedExecutionPorts,'withLock'>):HeldHostedMigrationStage{return prepareHeldStage(input,ports);}
/** Only a native-owned, explicitly selected original intent can use the existing stage engine. */
export async function prepareHeldOriginalNativeIntentStage(input:HostedMigrationStageInput,ports:Omit<HostedExecutionPorts,'withLock'>,token:unknown):Promise<HeldHostedMigrationStage>{
 try{const native=await import('./hosted-migration-database'),readBinding=(purpose:'LIVE'|'EFFECT'|'CLI')=>native.readNativeOriginalIntentExecutionBinding(token,purpose),binding=readBinding('LIVE');return prepareHeldStage(input,ports,{binding,readBinding});}catch{return{key:null,result:{status:'REQUIRES_REVIEW',commitment:'NOT_ATTEMPTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',execution:'INJECTED_PORTS',primaryCode:'INPUT_INVALID',journalCode:null,cleanupCode:null},run:async()=>undefined,releaseUnconfirmed:async()=>undefined};}
}

/** Compatibility owner for one acquired/released stage. Aggregate consumers use
 * the same held-stage core inside their real session lock, never a release shim. */
export async function executeHostedMigrationStage(input:HostedMigrationStageInput,ports:HostedExecutionPorts):Promise<HostedExecutionResult>{
 const stage=prepareHeldHostedMigrationStage(input,ports);if(!stage.key)return structuredClone(stage.result);
 let entered=false,completed=false,returned=false,violation=false,callback:Promise<void>|undefined;
 try{
  const release=await ports.withLock(stage.key,supplied=>{
   if(entered||returned){violation=true;return Promise.resolve();}entered=true;
   callback=stage.run(supplied,()=>!returned&&!violation).finally(()=>{completed=true;});return callback;
  });
  returned=true;
  if(!entered){stage.result.primaryCode='LOCK_UNCONFIRMED';return structuredClone(stage.result);}
  if(!completed||violation){await callback?.catch(()=>undefined);stage.result.primaryCode='LOCK_UNCONFIRMED';stage.result.commitment=stage.result.commitment==='NOT_ATTEMPTED'?'NOT_ATTEMPTED':'UNKNOWN';await stage.releaseUnconfirmed();}
  else if(release.kind!=='RELEASED')await stage.releaseUnconfirmed();
 }catch{returned=true;await callback?.catch(()=>undefined);if(!entered)stage.result.primaryCode='LOCK_UNCONFIRMED';else await stage.releaseUnconfirmed();stage.result.status='REQUIRES_REVIEW';}
 return structuredClone(stage.result);
}
