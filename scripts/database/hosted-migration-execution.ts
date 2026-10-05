import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { HostedMigrationConnection } from './hosted-migration-connection';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';

const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),ref=z.string().regex(/^[a-z]{20}$/),version=z.string().regex(/^\d{14}$/);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const row=z.object({name:z.string().regex(/^\d{14}_[a-z0-9_]+\.sql$/),version,sha256:digest}).strict();
const identitySchema=z.object({projectRef:ref,sourceSha:sha,treeSha:sha,planSha256:digest,stageId:z.enum(['prefix','native','pre-observability','remaining']),stageSha256:digest,databaseUrl:z.string(),approvalDigest:digest,ciRunId:z.string().regex(/^[1-9][0-9]*$/),certificateSha256:digest}).strict();
const journalSchema=z.object({version:z.literal(1),identity:identitySchema,state:z.enum(['INTENT','COMMITTED','REQUIRES_REVIEW']),schemaHistoryAtomic:z.literal(false),evidence:z.literal('SUPPLIED_PORT_EXECUTION_ONLY')}).strict();
const inputSchema=z.object({prepared:z.object({projectRef:ref,sourceSha:sha,treeSha:sha,planSha256:digest,stage:z.object({id:z.enum(['prefix','native','pre-observability','remaining']),workdir:z.string(),included:z.array(row).min(1).max(1000),pending:z.array(row).max(1000),expectedBeforeVersions:z.array(version).max(1000),expectedAfterVersions:z.array(version).max(1000),configSha256:digest,commandArgs:z.array(z.string())}).strict()}).strict(),connection:z.object({publicRecipe:z.object({projectRef:ref,databaseUrl:z.string(),cliTargetArgs:z.array(z.string()).length(2),operator:z.literal('postgres'),endpointKind:z.enum(['direct','session-pooler']),provenance:z.literal('CALLER_SUPPLIED_PROVIDER_METADATA'),tls:z.literal('VERIFY_FULL_CONFIGURATION_ONLY'),certificateProvenance:z.literal('CALLER_SUPPLIED_OWNED_PATH'),execution:z.literal('NOT_EXECUTED')}).strict(),privateEnvironment:z.record(z.string(),z.string())}).strict(),approvalDigest:digest,repoRoot:z.string(),ciRunId:z.string().regex(/^[1-9][0-9]*$/),certificateSha256:digest}).strict();
const snapshotSchema=z.object({kind:z.literal('ADMITTED'),observedAtMs:z.number().int().nonnegative(),source:z.object({sha,tree:sha,currentMainSha:sha,ciRunId:z.string().regex(/^[1-9][0-9]*$/)}).strict(),project:z.object({ref,host:z.string(),port:z.literal(5432),database:z.literal('postgres'),operator:z.literal('postgres')}).strict(),approval:z.object({purpose:z.literal('BACKEND_SYNTHETIC_STAGING'),digest,expiresAtMs:z.number().int().positive()}).strict(),artifact:z.object({stageSha256:digest}).strict(),tls:z.object({kind:z.literal('PEER_VERIFIED'),host:z.string(),certificateSha256:digest}).strict(),lock:z.object({id:z.string().min(1).max(200),key:z.string().min(1).max(200)}).strict(),history:z.array(z.object({version,sourceReceiptSha256:digest}).strict()).max(1000),postconditions:z.enum(['SATISFIED','NOT_CHECKED'])}).strict();
const environmentKeys=new Set(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','LANG','LC_ALL','TZ','PGPASSWORD','PGSSLROOTCERT']);
type Code='INPUT_INVALID'|'LOCK_UNCONFIRMED'|'JOURNAL_UNCONFIRMED'|'PRIOR_REQUIRES_REVIEW'|'ADMISSION_CHANGED'|'CLI_UNCONFIRMED'|'POSTCONDITION_UNCONFIRMED';
export type HostedExecutionJournal=z.infer<typeof journalSchema>;
export type HostedExecutionPorts={
 now():number;
 withLock(key:string,run:(lease:{kind:'HELD';id:string;key:string})=>Promise<void>):Promise<{kind:'RELEASED'}|{kind:'RELEASE_UNCONFIRMED'}>;
 readJournal():Promise<unknown>;
 /** Production adapters must perform current file/source/provider/approval/TLS/history reads, never echo input as proof. */
 revalidate():Promise<unknown>;
 /** SYNCED is an adapter's durable exact-payload acknowledgement; it is not supplied by this protocol. */
 writeJournal(value:HostedExecutionJournal):Promise<{kind:'SYNCED';sha256:string}|{kind:'UNCONFIRMED'}>;
 runCli(args:string[],privateEnvironment:Record<string,string>):Promise<{kind:'EXITED';exitCode:number}|{kind:'TIMEOUT'}|{kind:'UNKNOWN'}>;
};
export type HostedExecutionResult={status:'COMMITTED'|'NOOP'|'REQUIRES_REVIEW';commitment:'CONFIRMED'|'UNKNOWN'|'NOT_ATTEMPTED';schemaHistoryAtomic:false;evidence:'SUPPLIED_PORT_EXECUTION_ONLY';execution:'INJECTED_PORTS';primaryCode:Code|null;journalCode:'REVIEW_JOURNAL_UNCONFIRMED'|null;cleanupCode:'LOCK_RELEASE_UNCONFIRMED'|null;identity?:z.infer<typeof identitySchema>};

function snapshot(value:unknown,depth=0):unknown{
 if(depth>12)throw Error('Invalid metadata.');
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Invalid metadata.');
 const output:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw Error('Invalid metadata.');Object.defineProperty(output,key,{value:snapshot(field.value,depth+1),enumerable:true});}
 return output;
}

/** Protocol over explicit injected adapters only. It performs no native/provider I/O and never attests hosted readiness. */
export async function executeHostedMigrationStage(input:{prepared:Pick<HostedMigrationWorkdirs,'projectRef'|'sourceSha'|'treeSha'|'planSha256'>&{stage:HostedMigrationWorkdirs['stages'][number]};connection:HostedMigrationConnection;approvalDigest:string;repoRoot:string;ciRunId:string;certificateSha256:string},ports:HostedExecutionPorts):Promise<HostedExecutionResult>{
 const result:HostedExecutionResult={status:'REQUIRES_REVIEW',commitment:'NOT_ATTEMPTED',schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY',execution:'INJECTED_PORTS',primaryCode:null,journalCode:null,cleanupCode:null};
 let parsed:z.infer<typeof inputSchema>,url:URL;
 try{parsed=inputSchema.parse(snapshot(input));url=new URL(parsed.connection.publicRecipe.databaseUrl);const p=parsed.prepared,s=p.stage,env=parsed.connection.privateEnvironment;
  const direct=url.hostname===`db.${p.projectRef}.supabase.co`&&url.username==='postgres',pooler=/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`postgres.${p.projectRef}`;
  const confined=(path:string)=>{const part=relative(join(parsed.repoRoot,'.local','hosted-release'),path);return isAbsolute(path)&&resolve(path)===path&&!!part&&!isAbsolute(part)&&!part.split(/[\\/]/).some(value=>value==='..'||value==='.'||!value);};
  if(!isAbsolute(parsed.repoRoot)||resolve(parsed.repoRoot)!==parsed.repoRoot||parsed.connection.publicRecipe.projectRef!==p.projectRef||url.protocol!=='postgresql:'||url.password||url.port!=='5432'||url.pathname!=='/postgres'||url.search!=='?sslmode=verify-full'||url.hash||!(direct||pooler)||direct!== (parsed.connection.publicRecipe.endpointKind==='direct')||JSON.stringify(parsed.connection.publicRecipe.cliTargetArgs)!==JSON.stringify(['--db-url',url.toString()])||!confined(s.workdir)||Object.keys(env).some(key=>!environmentKeys.has(key))||!env.PGPASSWORD?.trim()||[...env.PGPASSWORD].some(value=>value.charCodeAt(0)<32||value.charCodeAt(0)===127)||!env.PGSSLROOTCERT||!confined(env.PGSSLROOTCERT))throw Error('Invalid input.');
  const included=s.included.map(row=>row.version),before=[...s.expectedBeforeVersions].sort(),after=[...s.expectedAfterVersions].sort(),pending=s.pending.map(row=>row.version);
  if(new Set(included).size!==included.length||s.included.some(row=>row.name.slice(0,14)!==row.version)||new Set(before).size!==before.length||new Set(after).size!==after.length||JSON.stringify([...included].sort())!==JSON.stringify(after)||before.some(value=>!included.includes(value))||JSON.stringify([...pending].sort())!==JSON.stringify(after.filter(value=>!before.includes(value)))||s.pending.some(row=>!s.included.some(value=>value.name===row.name&&value.version===row.version&&value.sha256===row.sha256)))throw Error('Invalid stage.');
 }catch{result.primaryCode='INPUT_INVALID';return result;}
 const p=parsed.prepared,s=p.stage,identity={projectRef:p.projectRef,sourceSha:p.sourceSha,treeSha:p.treeSha,planSha256:p.planSha256,stageId:s.id,stageSha256:hash({included:s.included,configSha256:s.configSha256}),databaseUrl:url.toString(),approvalDigest:parsed.approvalDigest,ciRunId:parsed.ciRunId,certificateSha256:parsed.certificateSha256};result.identity=identity;
 const key=`${p.projectRef}:HOSTED_SCHEMA_MIGRATION`;let entered=false,intent=false,attempted=false,lease:{id:string;key:string},leaseLive=true,completed=false,lockReturned=false,protocolViolation=false;let callback:Promise<void>|undefined;
 const live=()=>{if(!leaseLive)throw Error('Lock no longer held.');};
 const write=async(state:HostedExecutionJournal['state'])=>{if(state!=='REQUIRES_REVIEW')live();const value:HostedExecutionJournal={version:1,identity,state,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'};const expected=hash(value);const receipt=await ports.writeJournal(structuredClone(value));if(state!=='REQUIRES_REVIEW')live();if(receipt.kind!=='SYNCED'||receipt.sha256!==expected)throw Error('Journal unconfirmed.');};
 const admission=async(expected:'before'|'after')=>{live();const value=snapshotSchema.parse(snapshot(await ports.revalidate())),now=ports.now();live();
  if(!Number.isSafeInteger(now)||now<value.observedAtMs||now-value.observedAtMs>30000||value.source.sha!==p.sourceSha||value.source.tree!==p.treeSha||value.source.currentMainSha!==p.sourceSha||value.source.ciRunId!==identity.ciRunId||value.project.ref!==p.projectRef||value.project.host!==url.hostname||value.approval.digest!==identity.approvalDigest||value.approval.expiresAtMs<=now||value.artifact.stageSha256!==identity.stageSha256||value.tls.host!==url.hostname||value.tls.certificateSha256!==identity.certificateSha256||value.lock.id!==lease.id||value.lock.key!==key)throw Error('Admission changed.');
  const versions=expected==='before'?s.expectedBeforeVersions:s.expectedAfterVersions;
  if(JSON.stringify(value.history.map(row=>row.version).sort())!==JSON.stringify([...versions].sort())||new Set(value.history.map(row=>row.version)).size!==value.history.length||value.history.some(row=>s.included.find(source=>source.version===row.version)?.sha256!==row.sourceReceiptSha256)||expected==='after'&&value.postconditions!=='SATISFIED')throw Error('History unavailable.');
 };
 try{
  const release=await ports.withLock(key,supplied=>{
   if(entered||lockReturned){protocolViolation=true;leaseLive=false;return Promise.resolve();}
   callback=(async()=>{
   if(supplied.kind!=='HELD'||supplied.key!==key||!supplied.id||supplied.id.length>200)throw Error('Lock unconfirmed.');entered=true;lease={id:supplied.id,key};
   try{
    const prior=await ports.readJournal();live();if(prior!==null){const saved=journalSchema.parse(snapshot(prior));if(hash(saved.identity)!==hash(identity)||saved.state!=='COMMITTED'){result.primaryCode='PRIOR_REQUIRES_REVIEW';return;}await admission('after');result.status='NOOP';result.commitment='CONFIRMED';return;}
    await admission('before');result.primaryCode='JOURNAL_UNCONFIRMED';await write('INTENT');intent=true;
    result.primaryCode='ADMISSION_CHANGED';await admission('before');result.primaryCode='CLI_UNCONFIRMED';attempted=true;result.commitment='UNKNOWN';
    live();const cli=await ports.runCli(['db','push','--db-url',url.toString(),'--include-all','--skip-vault','--workdir',s.workdir,'--yes','--output-format','json'],{...parsed.connection.privateEnvironment});live();if(cli.kind!=='EXITED'||cli.exitCode!==0)throw Error('CLI unconfirmed.');
    result.primaryCode='POSTCONDITION_UNCONFIRMED';await admission('after');result.primaryCode='JOURNAL_UNCONFIRMED';await write('COMMITTED');result.status='COMMITTED';result.commitment='CONFIRMED';result.primaryCode=null;
   }catch{if(!result.primaryCode)result.primaryCode='ADMISSION_CHANGED';if(intent)await write('REQUIRES_REVIEW').catch(()=>{result.journalCode='REVIEW_JOURNAL_UNCONFIRMED';});result.status='REQUIRES_REVIEW';result.commitment=attempted?'UNKNOWN':'NOT_ATTEMPTED';}
   })().finally(()=>{completed=true;});return callback;
  });
  lockReturned=true;if(!completed||protocolViolation){leaseLive=false;await callback?.catch(()=>undefined);result.primaryCode='LOCK_UNCONFIRMED';result.cleanupCode='LOCK_RELEASE_UNCONFIRMED';result.status='REQUIRES_REVIEW';result.commitment=attempted?'UNKNOWN':'NOT_ATTEMPTED';}
  if(!entered){result.primaryCode='LOCK_UNCONFIRMED';return result;}if(release.kind!=='RELEASED'){result.cleanupCode='LOCK_RELEASE_UNCONFIRMED';result.status='REQUIRES_REVIEW';if(intent)await write('REQUIRES_REVIEW').catch(()=>{result.journalCode='REVIEW_JOURNAL_UNCONFIRMED';});}
 }catch{lockReturned=true;leaseLive=false;await callback?.catch(()=>undefined);if(!entered)result.primaryCode='LOCK_UNCONFIRMED';else result.cleanupCode='LOCK_RELEASE_UNCONFIRMED';result.status='REQUIRES_REVIEW';if(intent)await write('REQUIRES_REVIEW').catch(()=>{result.journalCode='REVIEW_JOURNAL_UNCONFIRMED';});}
 return structuredClone(result);
}
