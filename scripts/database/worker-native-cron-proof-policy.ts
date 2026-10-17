import {types} from 'node:util';
import {isAbsolute} from 'node:path';
import type {EventEmitter} from 'node:events';
import {z} from 'zod';
import {sourceChildCatalogueImage,admitSourceChildCatalogueImageInspection,isSourceChildCatalogueImageAbsent} from './hosted-child-catalogue-reference';
import {original231TransportAppendMigration} from './original231-transport-source';
import {original231TransportDisabledDefinitionsQuerySha256} from './hosted-original231-transport-catalogue';

const fail=()=>Error('Native Cron mechanics source, identity or cleanup requires review; private contents withheld.');
const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),owner=z.uuid(),pid=z.number().int().positive().max(2147483647);
const int8=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n);
export const nativeCronCases=['commit','timeout','cumulative'] as const;
export type NativeCronCase=typeof nativeCronCases[number];
export const nativeCronCommands={commit:'CALL cuevo_cron_probe.commit_then_fail();',timeout:'CALL cuevo_cron_probe.commit_then_timeout();',cumulative:'CALL cuevo_cron_probe.cumulative_timeout();'} as const;
export const nativeCronFixture='scripts/database/test-fixtures/worker-native-cron-proof.sql';
export const nativeCronStartup='scripts/database/test-fixtures/worker-native-cron-start.sh';
export const nativeCronOwnerLabel='cuevo.native-cron.owner';
export const nativeCronRetainedContainer='e29c041fee47405319a97ad34f2a99491a8e99974969fab1278b0877793bcb1f';

/** Only ordinary finite data enters these admissions; no accessor/proxy is evaluated. */
function data(value:unknown,depth=0):unknown{
 if(depth>12)throw fail();if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value==='string'){if(value.length>131072)throw fail();return value;}
 if(!value||typeof value!=='object'||types.isProxy(value))throw fail();
 const array=Array.isArray(value);if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail();
 const keys=Reflect.ownKeys(value);if(keys.length>2048)throw fail();const result:Record<string,unknown>|unknown[]=array?[]:Object.create(null);
 for(const key of keys){if(array&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw fail();Object.defineProperty(result,key,{value:data(field.value,depth+1),enumerable:true});}
 if(array){const length=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!Number.isInteger(length)||length<0||length>2047||keys.length!==length+1)throw fail();}
 return result;
}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{try{return schema.parse(data(value));}catch{throw fail();}}
export function admitNativeCronInvocation(value:unknown){const row=parse(z.object({entrypoint:z.string().max(4096),argv:z.array(z.string().max(4096)).length(2)}).strict(),value);let url:URL;try{url=new URL(row.entrypoint);}catch{throw fail();}const argument=row.argv[1].replaceAll('\\','/'),decoded=decodeURIComponent(url.pathname),path=/^[A-Za-z]:\//.test(argument)&&decoded.startsWith('/')?decoded.slice(1):decoded;if(!isAbsolute(row.argv[1])||url.protocol!=='file:'||url.host||url.search||url.hash||path!==argument||!row.entrypoint.endsWith('/scripts/database/worker-native-cron-proof.ts'))throw fail();}
const imageId=z.enum([sourceChildCatalogueImage.indexDigest,sourceChildCatalogueImage.configDigest]);
const intentSchema=z.object({ownerId:owner,imageId,name:z.string().regex(/^cuevo-native-cron-[a-f0-9-]{36}$/)}).strict().refine(value=>value.name==='cuevo-native-cron-'+value.ownerId);
export type NativeCronIntent=z.infer<typeof intentSchema>;
export function admitNativeCronImage(value:string,reference:string=sourceChildCatalogueImage.pinnedReference){try{const rows=JSON.parse(value),image=admitSourceChildCatalogueImageInspection(value,reference),config=parse(z.object({Entrypoint:z.tuple([z.literal('docker-entrypoint.sh')]),Cmd:z.tuple([z.literal('postgres'),z.literal('-D'),z.literal('/etc/postgresql')]),Volumes:z.null(),Env:z.array(z.string()).max(100)}).passthrough(),rows[0].Config);if(!config.Env.includes('PGDATA=/var/lib/postgresql/data'))throw fail();return image;}catch{throw fail();}}
/** Existing cached immutable references only; no acquisition or ambiguous fallback. */
export async function selectNativeCronCachedImage(inspect:(reference:string)=>Promise<string>){for(const reference of[sourceChildCatalogueImage.pinnedReference,sourceChildCatalogueImage.mirrorPinnedReference]){try{return admitNativeCronImage(await inspect(reference),reference);}catch(error){if(reference===sourceChildCatalogueImage.pinnedReference&&isSourceChildCatalogueImageAbsent(error,reference))continue;throw fail();}}throw fail();}
export function nativeCronCreateArguments(value:unknown,script:string):string[]{const intent=parse(intentSchema,value);if(!script||script.length>32768||script.includes('\0'))throw fail();return['create','--pull=never','--platform=linux/amd64','--name',intent.name,'--label',nativeCronOwnerLabel+'='+intent.ownerId,'--network=none','--restart=no','--tmpfs','/var/lib/postgresql/data:rw','--env','POSTGRES_USER=supabase_admin','--env','POSTGRES_PASSWORD','--interactive','--entrypoint','/bin/bash',intent.imageId,'-c',script];}
export function admitNativeCronContainer(value:unknown,expected:unknown):void{
 const wanted=parse(intentSchema.extend({containerId:digest}).strict(),expected);if(wanted.containerId===nativeCronRetainedContainer)throw fail();
 const row=parse(z.object({Id:z.literal(wanted.containerId),Name:z.literal('/'+wanted.name),Image:z.literal(wanted.imageId),Platform:z.literal('linux'),Config:z.object({Image:z.literal(wanted.imageId),Entrypoint:z.tuple([z.literal('/bin/bash')]),Cmd:z.array(z.string()).max(4),Labels:z.record(z.string(),z.string())}).passthrough(),HostConfig:z.object({NetworkMode:z.literal('none'),Privileged:z.literal(false),PortBindings:z.record(z.string(),z.unknown()).nullable(),Binds:z.null(),RestartPolicy:z.object({Name:z.literal('no'),MaximumRetryCount:z.literal(0)}).passthrough(),Tmpfs:z.record(z.string(),z.string()),AutoRemove:z.literal(false)}).passthrough(),Mounts:z.array(z.object({Type:z.literal('tmpfs'),Destination:z.literal('/var/lib/postgresql/data')}).passthrough()).max(1),NetworkSettings:z.object({Ports:z.record(z.string(),z.unknown())}).passthrough(),State:z.object({Status:z.enum(['created','running','exited','dead']),Running:z.boolean(),Paused:z.literal(false),Restarting:z.literal(false)}).passthrough()}).passthrough(),value);
 if(row.Config.Labels[nativeCronOwnerLabel]!==wanted.ownerId||row.HostConfig.PortBindings&&Object.keys(row.HostConfig.PortBindings).length||Object.keys(row.HostConfig.Tmpfs).length!==1||row.HostConfig.Tmpfs['/var/lib/postgresql/data']!=='rw'||Object.values(row.NetworkSettings.Ports).some(value=>value!==null))throw fail();
}
const startupSchema=z.object({version:z.literal(1),postgresVersion:z.literal('17.11'),preload:z.string().min(1).max(4096).regex(/^[a-zA-Z0-9_, ]+$/),entrypointSha256:digest,configSha256:digest,cronLibrarySha256:digest,cronControlSha256:digest,cronDefaultVersion:z.literal('1.6.4'),initScriptsSha256:digest}).strict();
export function admitNativeCronStartup(value:unknown){const row=parse(startupSchema,value),libs=row.preload.split(',').map(name=>name.trim());if(libs.some(name=>!name)||new Set(libs).size!==libs.length)throw fail();return{...row,preload:libs.includes('pg_cron')?row.preload:row.preload+',pg_cron',sourceBinaryCorrespondence:'UNKNOWN' as const};}
export function admitNativeCronStartupLine(line:string){if(typeof line!=='string'||line.length>8192)throw fail();const fields=line.split('\t');if(fields.length!==9||fields[0]!=='CUEVO_CRON_STARTUP_V1')throw fail();return admitNativeCronStartup({version:1,postgresVersion:fields[1],preload:fields[2],entrypointSha256:fields[3],configSha256:fields[4],cronLibrarySha256:fields[5],cronControlSha256:fields[6],cronDefaultVersion:fields[7],initScriptsSha256:fields[8]});}
export function nativeCronPasswordInput(role:unknown,password:unknown){const who=parse(z.enum(['cuevo_worker','cuevo_cron_peer']),role),secret=parse(digest,password);return String.fromCharCode(92)+'password '+who+'\n'+secret+'\n'+secret+'\n';}
const sessionSchema=z.object({sessionUser:z.literal('cuevo_worker'),currentUser:z.literal('cuevo_worker'),role:z.literal('none'),database:z.literal('postgres'),timeoutMs:z.literal(5000),login:z.literal(true),superuser:z.literal(false),bypassRls:z.literal(false),createRole:z.literal(false),createDb:z.literal(false),replication:z.literal(false),inherit:z.literal(false),rawGrant:z.literal(false),ownsAuthority:z.literal(false),unsafeMembership:z.literal(false),healthReady:z.literal(true)}).strict();
export function admitNativeCronSession(value:unknown){return parse(sessionSchema,value);}
const jobSchema=z.object({jobId:int8,name:z.string().min(1).max(100),database:z.literal('postgres'),username:z.literal('cuevo_worker'),command:z.string().max(100),active:z.boolean()}).strict();
export function admitNativeCronJob(value:unknown,expected:unknown){const want=parse(z.object({name:z.string().min(1).max(100),case:z.enum(nativeCronCases),inactive:z.literal(true).optional()}).strict(),expected),row=parse(jobSchema,value);if(row.name!==want.name||row.command!==nativeCronCommands[want.case]||row.active!==!want.inactive)throw fail();return row;}
const nativeClock=z.iso.datetime({offset:true}),elapsed=z.number().finite().nonnegative().max(300000);
const stageSchema=z.object({stage:z.enum(['A','B','B_FAILED','TIMEOUT_A','TIMEOUT_DONE','CUM_A','CUM_B','CUM_DONE','DENY_DEFINER','DENY_SET']),backendPid:pid,transactionId:int8,sessionUser:z.literal('cuevo_worker'),currentUser:z.literal('cuevo_worker'),database:z.literal('postgres'),timeoutMs:z.literal(5000),sourceSha256:digest,observedAt:nativeClock,statementStartedAt:nativeClock,observedElapsedMs:elapsed}).strict();
const runSchema=z.object({jobId:int8,runId:int8,backendPid:pid,username:z.literal('cuevo_worker'),status:z.literal('failed'),sqlstate:z.enum(['P0001','57014']),cancellationReason:z.enum(['STATEMENT_TIMEOUT','USER_REQUEST','UNKNOWN']).nullable(),startedAt:nativeClock,endedAt:nativeClock,elapsedMs:elapsed,statementStartedAt:nativeClock,statementElapsedMs:elapsed}).strict();
export function admitNativeCronCase(runValue:unknown,stagesValue:unknown,expected:unknown){
 const want=parse(z.object({case:z.enum(nativeCronCases),jobId:int8,sourceSha256:digest}).strict(),expected),run=parse(runSchema,runValue),stages=parse(z.array(stageSchema).max(10),stagesValue),labels=want.case==='commit'?['A','B_FAILED']:want.case==='timeout'?['TIMEOUT_A']:['CUM_A'];
 if(run.jobId!==want.jobId||run.sqlstate!==(want.case==='commit'?'P0001':'57014')||stages.length!==labels.length||new Set(stages.map(row=>row.transactionId)).size!==stages.length||stages.some(row=>row.backendPid!==run.backendPid||row.sourceSha256!==want.sourceSha256)||JSON.stringify(stages.map(row=>row.stage).sort())!==JSON.stringify([...labels].sort()))throw fail();
 const start=Date.parse(run.startedAt),statement=Date.parse(run.statementStartedAt),end=Date.parse(run.endedAt);
 // Native numeric intervals preserve microseconds; ISO parsing loses less than1ms.
 if(start>statement||statement>end||Math.abs(run.elapsedMs-(end-start))>1||Math.abs(run.statementElapsedMs-(end-statement))>1||stages.some((row,index)=>Date.parse(row.statementStartedAt)!==statement||Date.parse(row.observedAt)<statement||Date.parse(row.observedAt)>end||Math.abs(row.observedElapsedMs-(Date.parse(row.observedAt)-statement))>1||index>0&&Date.parse(stages[index-1].observedAt)>Date.parse(row.observedAt)))throw fail();
 if(want.case==='commit'){if(run.cancellationReason!==null||run.statementElapsedMs>=5000)throw fail();}
 else if(run.cancellationReason!=='STATEMENT_TIMEOUT'||run.statementElapsedMs<5000||run.statementElapsedMs>=6000||want.case==='cumulative'&&(stages[0].observedElapsedMs<3000||stages[0].observedElapsedMs>=5000))throw fail();
 return{case:want.case,run,stages};
}
/** One exact original own-unschedule attempt; read-only settlement never reenables it. */
export class NativeCronUnschedule{
 private job:ReturnType<typeof admitNativeCronJob>;private expected:unknown;private attempted=false;private acknowledgement:'NOT_ATTEMPTED'|'UNKNOWN'|'ACKNOWLEDGED'='NOT_ATTEMPTED';
 constructor(job:unknown,expected:unknown){this.job=admitNativeCronJob(job,expected);this.expected=expected;}
 canAttempt(){return !this.attempted;}
 async attempt(forward:(id:string)=>Promise<string>){if(this.attempted)throw fail();this.attempted=true;this.acknowledgement='UNKNOWN';const result=await forward(this.job.jobId);if(result!=='t')throw fail();this.acknowledgement='ACKNOWLEDGED';}
 async settle(read:()=>Promise<unknown[]>){const first=await read(),second=await read();if(JSON.stringify(data(first))!==JSON.stringify(data(second))||first.length>1)throw fail();if(first.length){const job=admitNativeCronJob(first[0],this.expected);if(JSON.stringify(job)!==JSON.stringify(this.job)||this.acknowledgement==='ACKNOWLEDGED')throw fail();return'PRESENT';}return'ABSENT';}
}
const permissionContextSchema=z.object({sessionUser:z.enum(['cuevo_worker','cuevo_cron_peer']),currentUser:z.enum(['cuevo_worker','cuevo_cron_peer']),role:z.literal('none'),database:z.literal('postgres'),login:z.literal(true),superuser:z.literal(false),bypassRls:z.literal(false),inherit:z.literal(false),createRole:z.literal(false),createDb:z.literal(false),replication:z.literal(false),roleParent:z.literal(false),schemaUsage:z.literal(true),routineExecute:z.literal(true),rawJobDelete:z.literal(false),routineOwner:z.literal('supabase_admin'),routineSymbol:z.enum(['cron_unschedule','cron_schedule_named']),routineSignature:z.enum(['cron.unschedule(bigint)','cron.schedule_in_database(text,text,text,text,text,boolean)']),routineDefinitionSha256:digest,routineAclSha256:digest}).strict();
const permissionResultSchema=z.object({sqlstate:z.enum(['42501','XX000']),cause:z.enum(['FOREIGN_JOB_DELETE_DENIED','EXPLICIT_USERNAME_REQUIRES_SUPERUSER']),ownJobUnchanged:z.literal(true),context:permissionContextSchema}).strict();
export function nativeCronControlFailure(stderr:string,kind:'foreign'|'explicit'){
 if(typeof stderr!=='string'||stderr.length>16384)return null;const headers=[...stderr.matchAll(/^ERROR:\s+([A-Z0-9]{5}): ([^\r\n]*)\r?$/gm)];if(headers.length!==1)return null;const [,sqlstate,message]=headers[0];
 if(kind==='foreign'&&sqlstate==='42501'&&message==='permission denied for table job')return{sqlstate:'42501' as const,cause:'FOREIGN_JOB_DELETE_DENIED' as const};
 if(kind==='explicit'&&sqlstate==='XX000'&&message==='must be superuser to create a job for another role')return{sqlstate:'XX000' as const,cause:'EXPLICIT_USERNAME_REQUIRES_SUPERUSER' as const};return null;
}
/** Finite control composition: one attempt, current genuine context and exact unchanged own row. */
export async function verifyNativeCronPermissionControl(kind:'foreign'|'explicit',jobValue:unknown,wanted:unknown,ports:{attempt:()=>Promise<{context:unknown;exitCode:number;stderr:string}>;readContext:()=>Promise<unknown>;readOwnJob:()=>Promise<unknown[]>}){
 const job=admitNativeCronJob(jobValue,wanted),attempt=parse(z.object({context:z.unknown(),exitCode:z.number().int().min(1).max(255),stderr:z.string().max(16384)}).strict(),await ports.attempt()),before=parse(permissionContextSchema,attempt.context),after=parse(permissionContextSchema,await ports.readContext()),rows=await ports.readOwnJob(),failure=nativeCronControlFailure(attempt.stderr,kind),who=kind==='foreign'?'cuevo_cron_peer':'cuevo_worker';
 if(!failure||before.sessionUser!==who||before.currentUser!==who||before.routineSymbol!==(kind==='foreign'?'cron_unschedule':'cron_schedule_named')||before.routineSignature!==(kind==='foreign'?'cron.unschedule(bigint)':'cron.schedule_in_database(text,text,text,text,text,boolean)')||JSON.stringify(before)!==JSON.stringify(after)||rows.length!==1||JSON.stringify(admitNativeCronJob(rows[0],wanted))!==JSON.stringify(job))throw fail();
 return{...failure,ownJobUnchanged:true as const,context:before};
}
/** Ephemeral diagnostic ownership only; never a domain task ledger or transferable permit. */
export class NativeCronOwnership{
 private intent:NativeCronIntent;private attempted=false;private id:string|undefined;private pending:{name:string;case:NativeCronCase}|undefined;private names=new Set<string>();
 constructor(value:unknown){this.intent=parse(intentSchema,value);}
 beginCreate(){if(this.attempted)throw fail();this.attempted=true;}
 acknowledgeCreate(value:string){if(!this.attempted||this.id)throw fail();this.id=parse(digest,value);if(this.id===nativeCronRetainedContainer){this.id=undefined;throw fail();}}
 resolveCreated(values:unknown[]){if(!this.attempted||this.id||values.length!==1)throw fail();const row=parse(z.object({Id:digest}).passthrough(),values[0]);admitNativeCronContainer(values[0],{...this.intent,containerId:row.Id});this.id=row.Id;}
 containerId(){if(!this.id)throw fail();return this.id;}
 beginSchedule(name:string,kind:NativeCronCase){if(!this.id||this.pending||this.names.has(name)||name!==this.intent.name+'-'+kind||!nativeCronCases.includes(kind))throw fail();this.names.add(name);this.pending={name,case:kind};}
 resolveScheduled(rows:unknown[]){if(!this.pending||rows.length!==1)throw fail();const job=admitNativeCronJob(rows[0],this.pending);this.pending=undefined;return job.jobId;}
}
export const nativeCronReceiptSchema=z.object({version:z.literal(2),purpose:z.literal('CUEVO_NATIVE_CRON_MECHANICS_PROOF'),status:z.literal('PASSED'),sourceSha:sha,treeSha:sha,sourceInventorySha256:digest,fixtureSha256:digest,startupSha256:digest,nodeBinarySha256:digest,runId:int8,runAttempt:z.number().int().positive(),imageReference:z.enum([sourceChildCatalogueImage.pinnedReference,sourceChildCatalogueImage.mirrorPinnedReference]),imageId,sourceBinaryCorrespondence:z.literal('UNKNOWN'),startupObservation:startupSchema.extend({sourceBinaryCorrespondence:z.literal('UNKNOWN')}).strict(),cronRoutines:z.array(z.object({name:z.enum(['schedule','unschedule','schedule_in_database']),owner:z.literal('supabase_admin'),definitionSha256:digest,aclSha256:digest}).strict()).length(3),registrationPermission:z.object({signature:z.literal('cron.schedule(text,text,text)'),explicitGrantRemoved:z.literal(true),residualExecute:z.boolean()}).strict(),postgresVersion:z.literal('170011'),cronVersion:z.literal('1.6.4'),mode:z.literal('BACKGROUND_WORKERS'),statementTimeoutMs:z.literal(5000),cases:z.array(z.unknown()).length(3),denials:z.object({outerTransaction:z.literal('2D000'),definer:z.literal('2D000'),procedureSet:z.literal('2D000'),explicitUsername:permissionResultSchema,foreignJob:permissionResultSchema,rawJobWrite:z.literal(true)}).strict(),canonicalSourceUnchanged:z.literal(true),sourceFrozen:z.literal(true),cleanup:z.literal('CONFIRMED_ABSENT'),domainEffects:z.literal(false),hostedAcceptance:z.literal(false),effectAuthority:z.literal(false)}).strict();
export const nativeCronSourceReplaySchema=z.object({version:z.literal(1),purpose:z.literal('CURRENT232_DISABLED_DEFINITIONS'),migrationCount:z.literal(232),provenance:z.literal('VERIFIED_GIT_BLOBS'),migrationManifestSha256:digest,migrationRowsSha256:digest,sourceInventorySha256:digest,original231HistorySha256:z.literal('46b7ac8b3a4f1bdcb1f2f0a83a5df7f1594c8ea37d841c8b1be495653df0f6ab'),append:z.object({name:z.literal(original231TransportAppendMigration.name),version:z.literal(original231TransportAppendMigration.version),sha256:z.literal(original231TransportAppendMigration.sha256)}).strict(),disabledDefinitionsQuerySha256:z.literal(original231TransportDisabledDefinitionsQuerySha256),disabledDefinitionsSha256:digest}).strict();
export type NativeCronSourceReplay=z.infer<typeof nativeCronSourceReplaySchema>;
export const nativeCronCurrentReceiptSchema=nativeCronReceiptSchema.extend({version:z.literal(3),sourceReplay:nativeCronSourceReplaySchema}).strict();
export function admitNativeCronReceipt(value:unknown){const row=parse(z.discriminatedUnion('version',[nativeCronReceiptSchema,nativeCronCurrentReceiptSchema]),value);const cases=row.cases.map(value=>parse(z.object({case:z.enum(nativeCronCases),run:runSchema,stages:z.array(stageSchema).max(10)}).strict(),value));if(JSON.stringify(cases.map(item=>item.case).sort())!==JSON.stringify([...nativeCronCases].sort())||new Set(cases.map(item=>item.run.jobId)).size!==3||new Set(cases.map(item=>item.run.runId)).size!==3||new Set(row.cronRoutines.map(item=>item.name)).size!==3)throw fail();for(const item of cases)admitNativeCronCase(item.run,item.stages,{case:item.case,jobId:item.run.jobId,sourceSha256:row.sourceInventorySha256});const foreign=row.denials.foreignJob,explicit=row.denials.explicitUsername;if(foreign.sqlstate!=='42501'||foreign.cause!=='FOREIGN_JOB_DELETE_DENIED'||foreign.context.sessionUser!=='cuevo_cron_peer'||foreign.context.currentUser!=='cuevo_cron_peer'||foreign.context.routineSymbol!=='cron_unschedule'||foreign.context.routineSignature!=='cron.unschedule(bigint)'||explicit.sqlstate!=='XX000'||explicit.cause!=='EXPLICIT_USERNAME_REQUIRES_SUPERUSER'||explicit.context.sessionUser!=='cuevo_worker'||explicit.context.currentUser!=='cuevo_worker'||explicit.context.routineSymbol!=='cron_schedule_named'||explicit.context.routineSignature!=='cron.schedule_in_database(text,text,text,text,text,boolean)')throw fail();return{...row,cases};}

export function nativeCronSqlstate(stderr:string):string|null{const codes=[...stderr.matchAll(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})(?:\s|$)/g)].map(row=>row[1]);return codes.length===1?codes[0]:null;}
export function nativeCronLoggedSqlstate(log:string,backendPid:number):string|null{const codes=new Set(log.split(/\r?\n/).flatMap(line=>{const found=/^([1-9][0-9]*) ([A-Z0-9]{5}) (?:ERROR|FATAL):/.exec(line);return found&&Number(found[1])===backendPid?[found[2]]:[];}));return codes.size===1?[...codes][0]:null;}
export function nativeCronLoggedFailure(log:string,backendPid:number){if(typeof log!=='string'||log.length>8*1024*1024)return null;const rows=log.split(/\r?\n/).flatMap(line=>{const found=/^([1-9][0-9]*) ([A-Z0-9]{5}) ERROR: {2}(.*)$/.exec(line);return found&&Number(found[1])===backendPid?[{sqlstate:found[2],message:found[3]}]:[];});if(rows.length!==1)return null;const row=rows[0];return{sqlstate:row.sqlstate,cancellationReason:row.sqlstate!=='57014'?null:row.message==='canceling statement due to statement timeout'?'STATEMENT_TIMEOUT' as const:row.message==='canceling statement due to user request'?'USER_REQUEST' as const:'UNKNOWN' as const};}
export async function verifyNativeCronTimedCase(runValue:unknown,expected:unknown,ports:{readStages:()=>Promise<unknown[]>;readLog:()=>Promise<string>}){const run=parse(runSchema.omit({sqlstate:true,cancellationReason:true}),runValue),stages=await ports.readStages(),failure=nativeCronLoggedFailure(await ports.readLog(),run.backendPid);if(!failure)throw fail();return admitNativeCronCase({...run,...failure},stages,expected);}

const startupRefusals=['CHILD_ERROR','CHILD_CLOSE','TIMER','STREAM_LIMIT','FIRST_FRAME','HANDSHAKE_ADMISSION','SOURCE_GUARD','UNKNOWN'] as const;
const startupStages=['ENTRYPOINT','PG_CONFIG_PATHS','PG_VERSION','FILES','PRELOAD_READER','PRELOAD_VALIDATE','CRON_VERSION','HASHES','METADATA','GATE'] as const;
const requiredFiles=['ENTRYPOINT','CONFIG','LIBRARY','CONTROL'] as const;
const startupErrorCodes=['EACCES','EINVAL','ENOENT','ENOSPC','ENOMEM','EPERM','EIO','EPIPE','ESRCH','ETIMEDOUT','UNKNOWN'] as const;
const startupSignals=['SIGINT','SIGTERM','SIGKILL','SIGHUP','SIGABRT','SIGQUIT','SIGILL','SIGTRAP','SIGBUS','SIGFPE','SIGSEGV','SIGPIPE','SIGALRM','SIGUSR1','SIGUSR2','SIGCHLD','SIGCONT','SIGSTOP','SIGTSTP','SIGTTIN','SIGTTOU','OTHER'] as const;
const startupExit=z.number().int().min(0).max(255),startupFailureExit=startupExit.refine(value=>value>0);
const errorObservation=z.union([
 z.object({status:z.literal('UNOBSERVED'),code:z.null(),observedAt:z.null()}).strict(),
 z.object({status:z.literal('OBSERVED'),code:z.enum(startupErrorCodes),observedAt:nativeClock.nullable()}).strict()
]);
const closeObservation=z.union([
 z.object({status:z.literal('UNOBSERVED'),exitCode:z.null(),signal:z.null(),observedAt:z.null()}).strict(),
 z.object({status:z.literal('OBSERVED'),exitCode:startupExit.nullable(),signal:z.enum(startupSignals).nullable(),observedAt:nativeClock.nullable()}).strict()
]);
const containerExitObservation=z.union([
 z.object({status:z.literal('UNOBSERVED'),exitCode:z.null(),finishedAt:z.null(),observedAt:z.null()}).strict(),
 z.object({status:z.literal('OBSERVED'),exitCode:startupExit,finishedAt:nativeClock,observedAt:nativeClock.nullable()}).strict()
]);
const preflightObservation=z.union([
 z.object({status:z.literal('UNOBSERVED'),stage:z.null(),exitCode:z.null(),terminalSource:z.null(),observedAt:z.null()}).strict(),
 z.object({status:z.literal('UNKNOWN'),stage:z.null(),exitCode:z.null(),terminalSource:z.null(),observedAt:nativeClock.nullable()}).strict(),
 z.object({status:z.literal('MATCHED'),stage:z.enum(startupStages),exitCode:startupFailureExit,terminalSource:z.enum(['CONTAINER_EXIT','CHILD_CLOSE']),observedAt:nativeClock.nullable()}).strict()
]);
const startupDiagnosticV1Schema=z.object({version:z.literal(1),refusal:z.enum(startupRefusals),observedAt:nativeClock.nullable(),firstFrame:z.enum(['UNOBSERVED','OBSERVED','REJECTED']),childError:errorObservation,childClose:closeObservation,preflight:preflightObservation,containerExit:containerExitObservation}).strict();
const preflightV2Observation=z.union([
 z.object({status:z.literal('UNOBSERVED'),stage:z.null(),exitCode:z.null(),terminalSource:z.null(),observedAt:z.null(),requiredFile:z.null()}).strict(),
 z.object({status:z.literal('UNKNOWN'),stage:z.null(),exitCode:z.null(),terminalSource:z.null(),observedAt:nativeClock.nullable(),requiredFile:z.null()}).strict(),
 z.object({status:z.literal('MATCHED'),stage:z.enum(startupStages),exitCode:startupFailureExit,terminalSource:z.enum(['CONTAINER_EXIT','CHILD_CLOSE']),observedAt:nativeClock.nullable(),requiredFile:z.enum(requiredFiles).nullable()}).strict()
]);
const startupDiagnosticV2Schema=startupDiagnosticV1Schema.extend({version:z.literal(2),preflight:preflightV2Observation}).strict();
const startupDiagnosticSchema=z.discriminatedUnion('version',[startupDiagnosticV1Schema,startupDiagnosticV2Schema]);
export type NativeCronStartupDiagnostic=z.infer<typeof startupDiagnosticSchema>;
type NativeCronStartupDiagnosticV2=z.infer<typeof startupDiagnosticV2Schema>;
function emptyStartupDiagnosticV2():NativeCronStartupDiagnosticV2{return{version:2,refusal:'UNKNOWN',observedAt:null,firstFrame:'UNOBSERVED',childError:{status:'UNOBSERVED',code:null,observedAt:null},childClose:{status:'UNOBSERVED',exitCode:null,signal:null,observedAt:null},preflight:{status:'UNOBSERVED',stage:null,exitCode:null,terminalSource:null,observedAt:null,requiredFile:null},containerExit:{status:'UNOBSERVED',exitCode:null,finishedAt:null,observedAt:null}};}
export function unobservedNativeCronStartupDiagnostic():NativeCronStartupDiagnostic{return emptyStartupDiagnosticV2();}
export function admitNativeCronStartupDiagnostic(value:unknown){
 const row=parse(startupDiagnosticSchema,value);
 if(row.refusal==='CHILD_ERROR'&&row.childError.status!=='OBSERVED'||row.refusal==='CHILD_CLOSE'&&row.childClose.status!=='OBSERVED'||row.refusal==='FIRST_FRAME'&&row.firstFrame!=='REJECTED'||['HANDSHAKE_ADMISSION','SOURCE_GUARD'].includes(row.refusal)&&row.firstFrame!=='OBSERVED')throw fail();
 if(row.preflight.status==='MATCHED'){
  const terminal=row.preflight.terminalSource==='CONTAINER_EXIT'?row.containerExit.status==='OBSERVED'?row.containerExit.exitCode:null:row.childClose.status==='OBSERVED'&&row.childClose.signal===null?row.childClose.exitCode:null;
  if(terminal!==row.preflight.exitCode)throw fail();
  if(row.version===2&&row.preflight.requiredFile!==null&&(row.preflight.stage!=='FILES'||row.preflight.exitCode!==92))throw fail();
 }
 return row;
}
type StartupChild=Pick<EventEmitter,'on'|'removeListener'>&{stdout?:Pick<EventEmitter,'on'|'removeListener'>|null;stderr?:Pick<EventEmitter,'on'|'removeListener'>|null};
type StartupPorts={clock:()=>string;setTimer:(callback:()=>void,delay:number)=>unknown;clearTimer:(handle:unknown)=>void};

/** Observes only the original owned child; it never creates, gates or retries one. */
export class NativeCronStartupObservation{
 private row=emptyStartupDiagnosticV2();private pending=true;private attempted=false;private disposed=false;private refused=false;private cleanupEffects=false;private inspectionAttempted=false;private incompleteFrame=false;private bytes=0;private stdout='';private stderr='';private frameCount=0;private preflightFrame:{stage:typeof startupStages[number];exitCode:number;observedAt:string|null;requiredFile:typeof requiredFiles[number]|null}|undefined;private frameObservedAt:string|null=null;
 private line:Promise<string>;private resolveLine!:(value:string)=>void;private rejectLine!:(error:Error)=>void;private timer:unknown;private timerActive=true;private ports:StartupPorts;
 private stdoutListener=(bytes:unknown)=>this.stream(bytes,'stdout');private stderrListener=(bytes:unknown)=>this.stream(bytes,'stderr');
 private errorListener=(error:unknown)=>{if(this.cleanupEffects||this.disposed)return;const at=this.clock();if(this.row.childError.status==='UNOBSERVED'){let code:typeof startupErrorCodes[number]='UNKNOWN';if(error&&typeof error==='object'&&!types.isProxy(error)){const field=Object.getOwnPropertyDescriptor(error,'code');if(field&&'value'in field&&typeof field.value==='string'&&(startupErrorCodes as readonly string[]).includes(field.value))code=field.value as typeof code;}this.row.childError={status:'OBSERVED',code,observedAt:at};}if(this.pending)this.refuse('CHILD_ERROR',at);};
 private closeListener=(code:unknown,signal:unknown)=>{if(this.cleanupEffects||this.disposed)return;const at=this.clock();if(this.row.childClose.status==='UNOBSERVED'){this.row.childClose={status:'OBSERVED',exitCode:typeof code==='number'&&startupExit.safeParse(code).success?code:null,signal:signal===null?null:typeof signal==='string'&&(startupSignals as readonly string[]).includes(signal)?signal as typeof startupSignals[number]:'OTHER',observedAt:at};}if(this.pending)this.refuse('CHILD_CLOSE',at);};
 constructor(private child:StartupChild,ports?:StartupPorts){
  this.ports=ports??{clock:()=>new Date().toISOString(),setTimer:(callback,delay)=>setTimeout(callback,delay),clearTimer:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)};
  this.line=new Promise<string>((resolve,reject)=>{this.resolveLine=resolve;this.rejectLine=reject;});void this.line.catch(()=>{});
  this.timer=this.ports.setTimer(()=>this.refuse('TIMER'),5000);
  child.stdout?.on('data',this.stdoutListener);child.stderr?.on('data',this.stderrListener);child.on('error',this.errorListener);child.on('close',this.closeListener);
 }
 private clock(){try{const value=this.ports.clock();return typeof value==='string'&&nativeClock.safeParse(value).success?value:null;}catch{return null;}}
 private finish(){if(!this.pending)return;this.incompleteFrame||=this.stderr.startsWith('CUEVO_CRON_PREFLIGHT_FAILURE_V');this.pending=false;if(this.timerActive){this.timerActive=false;try{this.ports.clearTimer(this.timer);}catch{/* Observation failure cannot replace the original refusal. */}}/* Keep the original pipes drained without further capture until owned cleanup. */}
 private refuse(cause:typeof startupRefusals[number],at=this.clock()){
  if(!this.refused){this.refused=true;this.row.refusal=cause;this.row.observedAt=at;}
  if(this.pending){const original=fail();this.finish();this.rejectLine(original);}
 }
 private stream(value:unknown,channel:'stdout'|'stderr'){
  if(!this.pending||this.disposed)return;
  if(!value||typeof value!=='object'||types.isProxy(value)||!Buffer.isBuffer(value)||Object.getOwnPropertyDescriptor(value,'length'))return this.refuse('UNKNOWN');
  this.bytes+=value.length;if(this.bytes>1024*1024)return this.refuse('STREAM_LIMIT');
  const text=Buffer.prototype.toString.call(value,'utf8');
  if(channel==='stderr'){
   this.stderr+=text;let end=this.stderr.indexOf('\n');while(end>=0){const line=this.stderr.slice(0,end).replace(/\r$/,'');this.stderr=this.stderr.slice(end+1);this.readPreflight(line);end=this.stderr.indexOf('\n');}return;
  }
  this.stdout+=text;const end=this.stdout.indexOf('\n');if(end<0)return;const line=this.stdout.slice(0,end).trim();if(!line.startsWith('CUEVO_CRON_STARTUP_V1\t')){this.row.firstFrame='REJECTED';return this.refuse('FIRST_FRAME');}this.row.firstFrame='OBSERVED';this.finish();this.resolveLine(line);
 }
 private readPreflight(line:string){
  if(!line.startsWith('CUEVO_CRON_PREFLIGHT_FAILURE_V'))return;this.frameCount++;const at=this.clock();if(this.frameCount===1)this.frameObservedAt=at;const fields=line.split('\t'),v1=fields[0]==='CUEVO_CRON_PREFLIGHT_FAILURE_V1'&&fields.length===3,v2=fields[0]==='CUEVO_CRON_PREFLIGHT_FAILURE_V2'&&fields.length===4&&fields[1]==='FILES'&&(requiredFiles as readonly string[]).includes(fields[2])&&fields[3]==='92',code=v2?fields[3]:fields[2];
  if(this.frameCount!==1||!v1&&!v2||!(startupStages as readonly string[]).includes(fields[1])||!/^([1-9][0-9]{0,2})$/.test(code)||!startupFailureExit.safeParse(Number(code)).success){this.preflightFrame=undefined;return;}
  this.preflightFrame={stage:fields[1] as typeof startupStages[number],exitCode:Number(code),observedAt:at,requiredFile:v2?fields[2] as typeof requiredFiles[number]:null};
 }
 async handshake(assertSource:()=>void){
  if(this.attempted||this.disposed)throw fail();this.attempted=true;const line=await this.line;let result:ReturnType<typeof admitNativeCronStartupLine>;
  try{result=admitNativeCronStartupLine(line);}catch(error){this.refuse('HANDSHAKE_ADMISSION');throw error;}
  try{assertSource();}catch(error){this.refuse('SOURCE_GUARD');throw error;}return result;
 }
 inspectOwnedExit(value:unknown){
  if(this.cleanupEffects||this.disposed||this.inspectionAttempted)return;this.inspectionAttempted=true;
  try{const state=parse(z.object({Status:z.literal('exited'),Running:z.literal(false),ExitCode:startupExit,FinishedAt:nativeClock}).passthrough(),value);if(Date.parse(state.FinishedAt)<=0)return;this.row.containerExit={status:'OBSERVED',exitCode:state.ExitCode,finishedAt:state.FinishedAt,observedAt:this.clock()};}catch{/* Missing, hostile or nonterminal defaults remain unobserved. */}
 }
 beginCleanupEffects(){this.cleanupEffects=true;}
 diagnostic():NativeCronStartupDiagnostic{
  const row={...this.row,childError:{...this.row.childError},childClose:{...this.row.childClose},containerExit:{...this.row.containerExit}},partial=this.incompleteFrame||this.stderr.startsWith('CUEVO_CRON_PREFLIGHT_FAILURE_V');
  if(this.frameCount===0&&!partial)row.preflight={status:'UNOBSERVED',stage:null,exitCode:null,terminalSource:null,observedAt:null,requiredFile:null};
  else{
   row.preflight={status:'UNKNOWN',stage:null,exitCode:null,terminalSource:null,observedAt:this.frameObservedAt,requiredFile:null};
   if(this.frameCount===1&&!partial&&this.preflightFrame){const frame=this.preflightFrame,source=row.containerExit.status==='OBSERVED'?'CONTAINER_EXIT':row.childClose.status==='OBSERVED'&&row.childClose.signal===null?'CHILD_CLOSE':null,code=source==='CONTAINER_EXIT'&&row.containerExit.status==='OBSERVED'?row.containerExit.exitCode:source==='CHILD_CLOSE'&&row.childClose.status==='OBSERVED'?row.childClose.exitCode:null;if(code===frame.exitCode&&source)row.preflight={status:'MATCHED',stage:frame.stage,exitCode:frame.exitCode,terminalSource:source,observedAt:frame.observedAt,requiredFile:frame.requiredFile};}
  }
  return admitNativeCronStartupDiagnostic(row);
 }
 dispose(){if(this.disposed)return;if(this.pending)this.refuse('UNKNOWN');this.disposed=true;this.child.stdout?.removeListener('data',this.stdoutListener);this.child.stderr?.removeListener('data',this.stderrListener);this.child.removeListener('error',this.errorListener);this.child.removeListener('close',this.closeListener);this.stdout='';this.stderr='';}
}

const nativeFailureBase=z.object({purpose:z.literal('CUEVO_NATIVE_CRON_MECHANICS_FAILURE'),status:z.literal('REQUIRES_REVIEW'),phase:z.enum(['SOURCE','IMAGE','CREATE','STARTUP','READY','SCHEMA','CAPABILITY','IDENTITY','REGISTER','COMMIT_PROOF','TIMEOUT_PROOF','DENIALS','CLEANUP']),sqlstate:z.string().regex(/^[A-Z0-9]{5}$/).nullable(),cleanup:z.enum(['UNCONFIRMED','CONFIRMED_ABSENT']),containerAbsence:z.enum(['NOT_OBSERVED','CONFIRMED']),sourceSha:sha,treeSha:sha,sourceInventorySha256:digest.nullable(),runId:int8,runAttempt:z.number().int().positive(),sourceBinaryCorrespondence:z.literal('UNKNOWN'),domainEffects:z.literal(false),hostedAcceptance:z.literal(false),effectAuthority:z.literal(false)});
export function admitNativeCronFailure(value:unknown){
 const row=parse(z.discriminatedUnion('version',[nativeFailureBase.extend({version:z.literal(1)}).strict(),nativeFailureBase.extend({version:z.literal(2),startupDiagnostic:startupDiagnosticSchema.nullable()}).strict()]),value);
 if(row.version===2){if(row.phase==='STARTUP'){if(!row.startupDiagnostic)throw fail();admitNativeCronStartupDiagnostic(row.startupDiagnostic);}else if(row.startupDiagnostic!==null)throw fail();}return row;
}
