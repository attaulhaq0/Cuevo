import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { z } from 'zod';
import { assertCuevoLocalConfig } from '../configure-local';
import { captureCanonicalSourceContext } from '../verification/canonical-source-jobs';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { readCanonicalMigrationSources, readHistoricalMigrationSources } from './hosted-migration-plan';
import { replayPlan } from './replay-plan';
import { hostedSchemaCatalogueStructuralSql, hostedSchemaCatalogueAuthoritySql, requireCompleteHostedSchemaCatalogue } from './hosted-schema-catalogue';
import { deriveSourceChildCatalogueBaseline, deriveSourceNative180CatalogueBaseline, deriveSourceOriginal231CatalogueBaseline, parseHostedChildCatalogueReceipt, parseHostedNative180CatalogueReceipt, parseHostedOriginal231CatalogueReceipt, sourceNative180CatalogueReceiptSha256, sourceChildCatalogueReceiptSha256, sourceChildCatalogueImage, verifySourceChildCatalogueImage } from './hosted-child-catalogue-reference';

const fail=()=>Error('Source child144 catalogue producer requires review; contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const image=sourceChildCatalogueImage.tag,imageId=sourceChildCatalogueImage.indexDigest,imageReference=sourceChildCatalogueImage.mirrorPinnedReference;
const producerFiles=['scripts/database/hosted-child-catalogue-producer.ts','scripts/database/hosted-child-catalogue-reference.ts','scripts/database/hosted-schema-catalogue.ts','scripts/database/replay-plan.ts','scripts/database/unknown-prefix-catalogue-policy.json'];
type ProducerPhase='SOURCE'|'SERVICE_POSTGRES_PREPARATION'|'SERVICE_START'|'SERVICE_IMAGE'|'SERVICE_DUMPS'|'RAW_START'|'RAW_IMAGE'|'RAW_READY'|'BOOTSTRAP'|'SERVICE_RESTORE'|'SOURCE_REPLAY'|'CATALOGUE'|'CLEANUP'|'RECEIPT';
type ServiceImageDiagnostic={tagMatches:boolean|null;idClass:'INDEX'|'CONFIG'|'MANIFEST'|'OTHER'|'UNKNOWN';repositoryDigestPresent:boolean|null;osMatches:boolean|null;architectureMatches:boolean|null};
const cliStartErrorCodes=['ImagePrepullError','StartWorkdirError','StartConfigLoadError','StartInvalidConfigError','NetworkCreateError','VolumeCreateError','ContainerCreateError','ContainerStartError','HealthCheckTimeoutError','DbSetupError'] as const;
type AcquisitionDiagnostic={classification:'OBSERVED_TEXT_CLASSIFICATION';imageKeys:('postgres'|'kong'|'mailpit'|'postgrest'|'auth'|'realtime'|'storage')[];stage:'PULL'|'IMAGE_INSPECT'|'DAEMON'|'MIXED'|'UNKNOWN';response:'MANIFEST_UNKNOWN'|'DENIED'|'RATE_LIMIT'|'DNS'|'CONNECTION'|'TLS'|'TIMEOUT'|'MIXED'|'UNKNOWN'};
type ServiceStartDiagnostic={exitCode:number|null;signal:'SIGTERM'|'SIGKILL'|'SIGINT'|'SIGHUP'|'OTHER'|null;timedOut:boolean|null;cliErrorCode:typeof cliStartErrorCodes[number]|'UNKNOWN';acquisition:AcquisitionDiagnostic|null};
type PreparationDiagnostic={classification:'OBSERVED_TEXT_CLASSIFICATION';substep:'PULL'|'INSPECT'|'DECODE'|'ADMISSION'|'CACHE_ALIAS'|'CACHE_ADMISSION';exitCode:ServiceStartDiagnostic['exitCode'];signal:ServiceStartDiagnostic['signal'];timedOut:boolean|null;response:AcquisitionDiagnostic['response'];image:Omit<ServiceImageDiagnostic,'tagMatches'>|null};
let serviceImageDiagnostic:ServiceImageDiagnostic|null=null;
let serviceStartDiagnostic:ServiceStartDiagnostic|null=null;
let servicePreparationDiagnostic:PreparationDiagnostic|null=null;
function imageObservations(value:{Id?:unknown;RepoDigests?:unknown;Os?:unknown;Architecture?:unknown}|undefined):Omit<ServiceImageDiagnostic,'tagMatches'>{return{idClass:value?.Id===sourceChildCatalogueImage.indexDigest?'INDEX':value?.Id===sourceChildCatalogueImage.configDigest?'CONFIG':value?.Id===sourceChildCatalogueImage.manifestDigest?'MANIFEST':typeof value?.Id==='string'?'OTHER':'UNKNOWN',repositoryDigestPresent:Array.isArray(value?.RepoDigests)?value.RepoDigests.includes(imageReference):null,osMatches:typeof value?.Os==='string'?value.Os==='linux':null,architectureMatches:typeof value?.Architecture==='string'?value.Architecture==='amd64':null};}
let producerPhase:ProducerPhase='SOURCE',phaseAt=Date.now();
function phase(value:ProducerPhase){producerPhase=value;phaseAt=Date.now();console.log(JSON.stringify({check:'source-child144-producer-phase',phase:value}));}
async function retainFailure(error:unknown){const candidate=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'code')?.value:undefined,code=typeof candidate==='string'&&/^[0-9A-Z]{5}$/.test(candidate)?candidate:null,directory=resolve('.local/child144-catalogue');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'failure.json'),canonicalReleaseExecutionJson({version:1,purpose:'CUEVO_SOURCE_CHILD144_PRODUCER_FAILURE',status:'REQUIRES_REVIEW',phase:producerPhase,phaseDurationMs:Math.max(0,Date.now()-phaseAt),databaseCode:code,serviceImage:producerPhase==='SERVICE_IMAGE'?serviceImageDiagnostic:null,serviceStart:producerPhase==='SERVICE_START'?serviceStartDiagnostic:null,servicePreparation:producerPhase==='SERVICE_POSTGRES_PREPARATION'?servicePreparationDiagnostic:null,sourceSha:process.env.GITHUB_SHA??null,runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,hostedAcceptance:false,effectAuthority:false}),{flag:'wx',mode:0o600});}
const exec=(file:string,args:string[],input?:Uint8Array,env?:NodeJS.ProcessEnv,captureStderr=false)=>execFileSync(file,args,{input,env,shell:false,windowsHide:true,stdio:['pipe','pipe',captureStderr?'pipe':'ignore'],timeout:120000,maxBuffer:32*1024*1024});
function removeOwnedReference(rawId:string,label:string){
 const raw=JSON.parse(exec('docker',['inspect',rawId]).toString('utf8')) as {Id:string;Image:string;Config:{Labels:Record<string,string>}}[];
 if(raw.length!==1||raw[0].Id!==rawId||raw[0].Config.Labels['cuevo.reference']!==label)throw fail();verifySourceChildCatalogueImage(JSON.parse(exec('docker',['image','inspect',raw[0].Image]).toString('utf8'))[0],imageReference);
 exec('docker',['rm','--force',rawId]);if(exec('docker',['ps','--all','--quiet','--filter','label=cuevo.reference='+label]).toString('ascii').trim())throw fail();return new Date().toISOString();
}
/** CI-only source replay. No hosted credentials, data, or SQL authority cross this owner. */
export async function produceHostedChildCatalogueReference(){
 const env=z.object({CI:z.literal('true'),GITHUB_ACTIONS:z.literal('true'),GITHUB_JOB:z.literal('database-checks'),GITHUB_REPOSITORY:z.literal('attaulhaq0/Cuevo'),GITHUB_SHA:z.string().regex(/^[a-f0-9]{40}$/),GITHUB_RUN_ID:z.string().regex(/^[1-9][0-9]*$/),GITHUB_RUN_ATTEMPT:z.string().regex(/^[1-9][0-9]*$/)}).parse(process.env);
 if(process.platform!=='linux'||process.arch!=='x64'||process.version!=='v24.16.0'||process.argv.length!==2||['SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','WORKER_DATABASE_URL','VERCEL_TOKEN','VERCEL_API_KEY','SUPABASE_DB_PASSWORD','GH_TOKEN','GITHUB_TOKEN'].some(key=>process.env[key]!==undefined))throw fail();
 const root=resolve('.'),context=captureCanonicalSourceContext(root,env.GITHUB_SHA,undefined),source=(path:string)=>context.git(['show',env.GITHUB_SHA+':'+path]);
 context.git(['merge-base','--is-ancestor','1a493ad735798bb6d3fa0ffaabc779e62149ac37',env.GITHUB_SHA]);
 const baseline=readHistoricalMigrationSources(root,'1a493ad735798bb6d3fa0ffaabc779e62149ac37','a207a7ec44dd29d61adc0490b85fedbf1e696fcd'),current=readCanonicalMigrationSources({repoRoot:root,sourceSha:env.GITHUB_SHA,treeSha:context.treeSha}),plan=replayPlan(baseline),names=[...plan.before,plan.prerequisite,...plan.remaining].slice(0,144),rows=names.map(name=>baseline.find(row=>row.name===name)!),currentByName=new Map(current.sources.map(row=>[row.name,row.bytes]));
 if(names.length!==144||rows.some(row=>!currentByName.has(row.name)||hash(currentByName.get(row.name)!)!==hash(row.bytes)))throw fail();
 const native180Plan=replayPlan(current.sources),native180Names=[...native180Plan.before,native180Plan.prerequisite,...native180Plan.remaining].slice(0,180),native180Rows=native180Names.map(name=>current.sources.find(row=>row.name===name)!);
 context.git(['merge-base','--is-ancestor','9bee5e0d59d95274266158a0644139fd4df5334e',env.GITHUB_SHA]);
 if(native180Rows.length!==180||native180Rows.some((row,index)=>!currentByName.has(row.name)||hash(currentByName.get(row.name)!)!==hash(row.bytes)||index<144&&(row.name!==rows[index].name||hash(row.bytes)!==hash(rows[index].bytes)))||hash(canonicalReleaseExecutionJson(native180Rows.map(row=>({version:row.name.slice(0,14),sourceReceiptSha256:hash(row.bytes)}))))!=='28ad9500aa5719898303ffce30e6dc8d598d22b650413d4a9639c5bd1313cbb4')throw fail();
 const original231Baseline=readHistoricalMigrationSources(root,'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37','a58fa0bef6f6c0ea9cc57d12156b6c3464ac5559'),original231Plan=replayPlan(original231Baseline),original231Names=[...original231Plan.before,original231Plan.prerequisite,...original231Plan.remaining],current231Names=[...native180Plan.before,native180Plan.prerequisite,...native180Plan.remaining].slice(0,231),original231Rows=original231Names.map(name=>current.sources.find(row=>row.name===name)!);
 context.git(['merge-base','--is-ancestor','239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37',env.GITHUB_SHA]);
 if(original231Rows.length!==231||current231Names.length!==231||original231Names.some((name,index)=>name!==current231Names[index]||!original231Rows[index]||hash(original231Rows[index].bytes)!==hash(original231Baseline.find(row=>row.name===name)!.bytes)||index<180&&(name!==native180Rows[index].name||hash(original231Rows[index].bytes)!==hash(native180Rows[index].bytes)))||hash(canonicalReleaseExecutionJson(original231Rows.map(row=>({version:row.name.slice(0,14),sourceReceiptSha256:hash(row.bytes)}))))!=='46b7ac8b3a4f1bdcb1f2f0a83a5df7f1594c8ea37d841c8b1be495653df0f6ab')throw fail();
 const config=source('supabase/config.toml').toString('utf8');assertCuevoLocalConfig(config);
 const pending=await mkdtemp(resolve(process.env.TEMP??process.env.TMP??'/tmp','cuevo-source-child144-')),workdir=resolve(pending,'empty');await mkdir(resolve(workdir,'supabase/migrations'),{recursive:true});
 const emptyConfig=config.replace(/(\[db\.seed\][\s\S]*?enabled\s*=\s*)true/,'$1false');if(emptyConfig===config)throw fail();await writeFile(resolve(workdir,'supabase/config.toml'),emptyConfig,{flag:'wx',mode:0o600});
 const cli=resolve('node_modules/supabase/dist/supabase.js'),startedAt=new Date().toISOString();
 // The normal database lane will subsequently reuse this same owned stack.
 try{exec('docker',['network','inspect','cuevo-local']);}catch{exec('docker',['network','create','--subnet','10.252.60.0/24','cuevo-local']);}
 try{exec('docker',['inspect','supabase_db_cuevo']);throw fail();}catch(error){if((error as {status?:number}).status!==1)throw fail();}
 // Admit the exact ECR cache tag first; CLI 2.119 selects it before native auxiliary-service fallbacks.
 phase('SERVICE_POSTGRES_PREPARATION');servicePreparationDiagnostic={classification:'OBSERVED_TEXT_CLASSIFICATION',substep:'PULL',exitCode:null,signal:null,timedOut:null,response:'UNKNOWN',image:null};
 try{
  exec('docker',['pull','--platform','linux/amd64',imageReference],undefined,undefined,true);
  servicePreparationDiagnostic.substep='INSPECT';const inspected=exec('docker',['image','inspect',imageReference],undefined,undefined,true);
  servicePreparationDiagnostic.substep='DECODE';const prepared=JSON.parse(inspected.toString('utf8'))[0] as {Id?:unknown;RepoDigests?:unknown;Os?:unknown;Architecture?:unknown}|undefined;
  servicePreparationDiagnostic.substep='ADMISSION';servicePreparationDiagnostic.image=imageObservations(prepared);
  verifySourceChildCatalogueImage(prepared,imageReference);
  servicePreparationDiagnostic.substep='CACHE_ALIAS';servicePreparationDiagnostic.image=null;exec('docker',['tag',prepared!.Id as string,image],undefined,undefined,true);
  servicePreparationDiagnostic.substep='CACHE_ADMISSION';const cached=JSON.parse(exec('docker',['image','inspect',image],undefined,undefined,true).toString('utf8'))[0];servicePreparationDiagnostic.image=imageObservations(cached);verifySourceChildCatalogueImage(cached,imageReference);
 }catch(error){
  if(servicePreparationDiagnostic.substep==='PULL'||servicePreparationDiagnostic.substep==='INSPECT'||servicePreparationDiagnostic.substep==='CACHE_ALIAS'||servicePreparationDiagnostic.substep==='CACHE_ADMISSION'){
   const field=(key:string)=>error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,key)?.value:undefined,status=field('status'),signal=field('signal'),code=field('code'),stderr=field('stderr'),exitCode=typeof status==='number'&&Number.isInteger(status)&&status>=0&&status<=255?status:null;
   servicePreparationDiagnostic.exitCode=exitCode;servicePreparationDiagnostic.signal=typeof signal!=='string'?null:signal==='SIGTERM'||signal==='SIGKILL'||signal==='SIGINT'||signal==='SIGHUP'?signal:'OTHER';servicePreparationDiagnostic.timedOut=code==='ETIMEDOUT'?true:exitCode!==null?false:null;
   if(Buffer.isBuffer(stderr)&&stderr.length<=64*1024){const message=stderr.toString('utf8'),responses:AcquisitionDiagnostic['response'][]=[];
    if(/manifest unknown|manifest[^\n;]*not found|\b404 not found\b/i.test(message))responses.push('MANIFEST_UNKNOWN');
    if(/\bdenied\b|\bunauthorized\b|\b403 forbidden\b|\b401 unauthorized\b/i.test(message))responses.push('DENIED');
    if(/toomanyrequests|too many requests|\b429\b/i.test(message))responses.push('RATE_LIMIT');
    if(/lookup [^\n;]*no such host|temporary failure in name resolution|server misbehaving/i.test(message))responses.push('DNS');
    if(/connection refused|connection reset|network is unreachable|cannot connect to the docker daemon/i.test(message))responses.push('CONNECTION');
    if(/x509:|tls handshake|certificate signed by unknown authority|certificate has expired/i.test(message))responses.push('TLS');
    if(/context deadline exceeded|i\/o timeout|client\.timeout exceeded|tls handshake timeout/i.test(message))responses.push('TIMEOUT');
    servicePreparationDiagnostic.response=responses.length===1?responses[0]:responses.length>1?'MIXED':'UNKNOWN';
   }
  }
  throw error;
 }
 phase('SERVICE_START');
 try{exec(process.execPath,[cli,'start','--workdir',workdir,'--network-id','cuevo-local','--exclude','studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor','--output-format','json'],undefined,{...process.env,SUPABASE_INTERNAL_IMAGE_REGISTRY:'',SUPABASE_USE_SLIM_IMAGES:'false'});}catch(error){
  const field=(key:string)=>error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,key)?.value:undefined,status=field('status'),signal=field('signal'),code=field('code'),exitCode=typeof status==='number'&&Number.isInteger(status)&&status>=0&&status<=255?status:null;
  serviceStartDiagnostic={exitCode,signal:typeof signal!=='string'?null:signal==='SIGTERM'||signal==='SIGKILL'||signal==='SIGINT'||signal==='SIGHUP'?signal:'OTHER',timedOut:code==='ETIMEDOUT'?true:exitCode!==null?false:null,cliErrorCode:'UNKNOWN',acquisition:null};
  // Native JSON errors carry a code beside private message/detail fields; retain only exact source-known codes.
  try{const stdout=field('stdout');if(Buffer.isBuffer(stdout)&&stdout.length<=32*1024*1024){const parsed=JSON.parse(stdout.toString('utf8'));if(parsed?._tag==='Error'&&cliStartErrorCodes.includes(parsed.error?.code))serviceStartDiagnostic.cliErrorCode=parsed.error.code;
   if(serviceStartDiagnostic.cliErrorCode==='ImagePrepullError'){
    const acquisition:AcquisitionDiagnostic={classification:'OBSERVED_TEXT_CLASSIFICATION',imageKeys:[],stage:'UNKNOWN',response:'UNKNOWN'};serviceStartDiagnostic.acquisition=acquisition;
    const message=parsed.error?.message;
    if(typeof message==='string'&&Buffer.byteLength(message,'utf8')<=64*1024){
     const images=[['postgres','public.ecr.aws/supabase/postgres:17.11.0.002'],['kong','public.ecr.aws/supabase/kong:2.8.1'],['mailpit','public.ecr.aws/supabase/mailpit:v1.31.3'],['postgrest','public.ecr.aws/supabase/postgrest:v16.4'],['auth','public.ecr.aws/supabase/gotrue:v2.197.0'],['realtime','public.ecr.aws/supabase/realtime:v2.140.3'],['storage','public.ecr.aws/supabase/storage-api:v1.79.28']] as const;
     const references:string[]=message.match(/(?:[a-z0-9.-]+(?::[0-9]+)?\/)?[a-z0-9._-]+\/[a-z0-9._/-]+:[a-z0-9._-]+(?:@sha256:[a-f0-9]+)?/gi)??[];
     if(references.every(reference=>images.some(([,known])=>reference===known))){
      acquisition.imageKeys=images.filter(([,reference])=>references.includes(reference)).map(([key])=>key);
      const stages:AcquisitionDiagnostic['stage'][]=[];if(message.includes('failed to pull docker image from all registries:'))stages.push('PULL');if(message.includes('failed to inspect docker image:'))stages.push('IMAGE_INSPECT');if(/cannot connect to the docker daemon|is the docker daemon running\?/i.test(message))stages.push('DAEMON');acquisition.stage=stages.length===1?stages[0]:stages.length>1?'MIXED':'UNKNOWN';
      const responses:AcquisitionDiagnostic['response'][]=[];
      if(/manifest unknown|manifest[^\n;]*not found|\b404 not found\b/i.test(message))responses.push('MANIFEST_UNKNOWN');
      if(/\bdenied\b|\bunauthorized\b|\b403 forbidden\b|\b401 unauthorized\b/i.test(message))responses.push('DENIED');
      if(/toomanyrequests|too many requests|\b429\b/i.test(message))responses.push('RATE_LIMIT');
      if(/lookup [^\n;]*no such host|temporary failure in name resolution|server misbehaving/i.test(message))responses.push('DNS');
      if(/connection refused|connection reset|network is unreachable|cannot connect to the docker daemon/i.test(message))responses.push('CONNECTION');
      if(/x509:|tls handshake|certificate signed by unknown authority|certificate has expired/i.test(message))responses.push('TLS');
      if(/context deadline exceeded|i\/o timeout|client\.timeout exceeded|tls handshake timeout/i.test(message))responses.push('TIMEOUT');
      acquisition.response=responses.length===1?responses[0]:responses.length>1?'MIXED':'UNKNOWN';
     }
    }
   }
  }}catch{/* Unstructured or truncated output cannot identify the startup failure. */}
  throw error;
 }
 phase('SERVICE_IMAGE');
 serviceImageDiagnostic={tagMatches:null,idClass:'UNKNOWN',repositoryDigestPresent:null,osMatches:null,architectureMatches:null};
 const db=JSON.parse(exec('docker',['inspect','supabase_db_cuevo']).toString('utf8')) as {Id:string;Config:{Image:string};Image:string}[];
 if(db.length!==1)throw fail();serviceImageDiagnostic.tagMatches=typeof db[0]?.Config?.Image==='string'?db[0].Config.Image===image:null;if(db[0].Config.Image!==image)throw fail();
 const serviceImage=JSON.parse(exec('docker',['image','inspect',db[0].Image]).toString('utf8'))[0] as {Id?:unknown;RepoDigests?:unknown;Os?:unknown;Architecture?:unknown}|undefined;
 serviceImageDiagnostic.idClass=serviceImage?.Id===sourceChildCatalogueImage.indexDigest?'INDEX':serviceImage?.Id===sourceChildCatalogueImage.configDigest?'CONFIG':serviceImage?.Id===sourceChildCatalogueImage.manifestDigest?'MANIFEST':typeof serviceImage?.Id==='string'?'OTHER':'UNKNOWN';
 serviceImageDiagnostic.repositoryDigestPresent=Array.isArray(serviceImage?.RepoDigests)?serviceImage.RepoDigests.includes(imageReference):null;serviceImageDiagnostic.osMatches=typeof serviceImage?.Os==='string'?serviceImage.Os==='linux':null;serviceImageDiagnostic.architectureMatches=typeof serviceImage?.Architecture==='string'?serviceImage.Architecture==='amd64':null;
 verifySourceChildCatalogueImage(serviceImage,imageReference);
 const dump=(schema:string)=>exec('docker',['exec',db[0].Id,'pg_dump','--schema-only','--schema',schema,'--username','supabase_admin','--dbname','postgres']);
 phase('SERVICE_DUMPS');const dumps={auth:dump('auth'),storage:dump('storage'),realtime:dump('realtime')};
 const label=`cuevo-child144-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,password=randomBytes(32).toString('hex');
 let rawId:string|undefined,client:Client|undefined,baselineResult:ReturnType<typeof deriveSourceChildCatalogueBaseline>|undefined,native180Result:ReturnType<typeof deriveSourceNative180CatalogueBaseline>|undefined,original231Result:ReturnType<typeof deriveSourceOriginal231CatalogueBaseline>|undefined,capturedAt:string|undefined,native180CapturedAt:string|undefined,original231CapturedAt:string|undefined,cleanupCompletedAt:string|undefined;
 try{
  phase('RAW_START');
  rawId=exec('docker',['run','--detach','--platform','linux/amd64','--label','cuevo.reference='+label,'--name',label,'--publish','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data:rw','--env','POSTGRES_USER=supabase_admin','--env','POSTGRES_PASSWORD='+password,imageReference]).toString('ascii').trim();if(!/^[a-f0-9]{64}$/.test(rawId))throw fail();
  phase('RAW_IMAGE');const raw=JSON.parse(exec('docker',['inspect',rawId]).toString('utf8')) as {Id:string;Image:string;Config:{Labels:Record<string,string>};NetworkSettings:{Ports:Record<string,{HostIp:string;HostPort:string}[]>}}[];if(raw.length!==1||raw[0].Id!==rawId||raw[0].Config.Labels['cuevo.reference']!==label)throw fail();verifySourceChildCatalogueImage(JSON.parse(exec('docker',['image','inspect',raw[0].Image]).toString('utf8'))[0],imageReference);const ports=raw[0].NetworkSettings.Ports['5432/tcp'];if(ports?.length!==1||ports[0].HostIp!=='127.0.0.1'||!/^[0-9]+$/.test(ports[0].HostPort))throw fail();
  phase('RAW_READY');
  for(let attempt=0;attempt<30;attempt++){try{exec('docker',['exec',rawId,'psql','-X','--set','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-h','127.0.0.1','-c','select 1']);break;}catch{if(attempt===29)throw fail();await new Promise(done=>setTimeout(done,1000));}}
  phase('BOOTSTRAP');exec('docker',['exec','-i',rawId,'psql','-X','--set','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],source('scripts/database/hosted-child-catalogue-bootstrap.sql'));
  phase('SERVICE_RESTORE');
  for(const bytes of Object.values(dumps))exec('docker',['exec','-i',rawId,'psql','-X','--set','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],bytes);
  client=new Client({host:'127.0.0.1',port:Number(ports[0].HostPort),user:'postgres',password,database:'postgres',connectionTimeoutMillis:5000,query_timeout:30000});await client.connect();
  await client.query("set search_path=pg_catalog; set DateStyle='ISO,YMD'; set IntervalStyle='postgres'; set TimeZone='UTC'; set check_function_bodies=on");
  if((await client.query("select current_setting('server_version_num') as version")).rows[0]?.version!=='170011')throw fail();
  phase('SOURCE_REPLAY');let prefix123:unknown;
  for(const[index,row]of original231Rows.entries()){await client.query(new TextDecoder('utf8',{fatal:true}).decode(row.bytes));if(index===122||index===143||index===179||index===230){context.finalMetadata();await client.query('begin isolation level repeatable read read only');try{phase('CATALOGUE');const catalogue=requireCompleteHostedSchemaCatalogue([...(await client.query(hostedSchemaCatalogueStructuralSql)).rows,...(await client.query(hostedSchemaCatalogueAuthoritySql)).rows]);if(index===122)prefix123=catalogue.rows;else if(index===143){baselineResult=deriveSourceChildCatalogueBaseline(prefix123,catalogue.rows);capturedAt=new Date().toISOString();}else if(index===179){native180Result=deriveSourceNative180CatalogueBaseline(catalogue.rows);native180CapturedAt=new Date().toISOString();}else{original231Result=deriveSourceOriginal231CatalogueBaseline(catalogue.rows);original231CapturedAt=new Date().toISOString();}}finally{await client.query('rollback');}phase('SOURCE_REPLAY');}}
  const empty=await client.query("select (select count(*)::text from app.schools) as schools,(select count(*)::text from auth.users) as users");if(empty.rows[0]?.schools!=='0'||empty.rows[0]?.users!=='0')throw fail();context.finalMetadata();
 }catch(error){await retainFailure(error);throw error;}finally{
  phase('CLEANUP');
  try{if(client)await client.end();}finally{if(rawId)cleanupCompletedAt=removeOwnedReference(rawId,label);}
 }
 if(!baselineResult||!native180Result||!original231Result||!capturedAt||!native180CapturedAt||!original231CapturedAt||!cleanupCompletedAt)throw fail();context.finalMetadata();
 phase('RECEIPT');const receipt=parseHostedChildCatalogueReceipt({version:2,purpose:'CUEVO_SOURCE_CHILD144_CATALOGUE',repository:env.GITHUB_REPOSITORY,sourceSha:env.GITHUB_SHA,treeSha:context.treeSha,baselineSourceSha:'1a493ad735798bb6d3fa0ffaabc779e62149ac37',baselineTreeSha:'a207a7ec44dd29d61adc0490b85fedbf1e696fcd',runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),producerJob:'database-checks',producerStep:'Build exact source child144 catalogue reference',migrationCount:144,migrationRowsSha256:hash(canonicalReleaseExecutionJson(rows.map(row=>({version:row.name.slice(0,14),sourceReceiptSha256:hash(row.bytes)})))),sourceInventorySha256:hash(canonicalReleaseExecutionJson(rows.map(row=>({name:row.name,sha256:hash(row.bytes)})))),querySha256:baselineResult.querySha256,policySha256:baselineResult.policySha256,producerSha256:hash(canonicalReleaseExecutionJson(producerFiles.map(path=>({path,sha256:hash(source(path))})))),bootstrapSha256:hash(source('scripts/database/hosted-child-catalogue-bootstrap.sql')),serviceSchemaSha256:Object.fromEntries(Object.entries(dumps).map(([name,bytes])=>[name,hash(bytes)])),image,imageId,imageReference,imageManifestSha256:sourceChildCatalogueImage.manifestDigest,imageConfigSha256:sourceChildCatalogueImage.configDigest,imagePlatform:sourceChildCatalogueImage.platform,sourceLockSha256:hash(source('package-lock.json')),nodeVersion:process.version,nodeBinarySha256:hash(await readFile(process.execPath)),scratch123:baselineResult.scratch123,provider123:baselineResult.provider123,scratch144:baselineResult.scratch144,catalogueSummary:baselineResult.provider144,startedAt,capturedAt,cleanupCompletedAt,cleanupConfirmed:true,sourceFrozen:true,hostedAcceptance:false,effectAuthority:false});
 const directory=resolve('.local/child144-catalogue');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'reference.json'),canonicalReleaseExecutionJson(receipt),{mode:0o600,flag:'wx'});
 const native180Receipt=parseHostedNative180CatalogueReceipt({...receipt,version:3,purpose:'CUEVO_SOURCE_NATIVE180_CATALOGUE',baselineSourceSha:'9bee5e0d59d95274266158a0644139fd4df5334e',baselineTreeSha:'2574891343d9bfd1be09c57dd4e450e086f76f40',migrationCount:180,migrationRowsSha256:hash(canonicalReleaseExecutionJson(native180Rows.map(row=>({version:row.name.slice(0,14),sourceReceiptSha256:hash(row.bytes)})))),sourceInventorySha256:hash(canonicalReleaseExecutionJson(native180Rows.map(row=>({name:row.name,sha256:hash(row.bytes)})))),provider144:baselineResult.provider144,scratch180:native180Result.scratch180,catalogueSummary:native180Result.provider180,child144ReceiptSha256:sourceChildCatalogueReceiptSha256(receipt),capturedAt:native180CapturedAt});
 await writeFile(resolve(directory,'source180.json'),canonicalReleaseExecutionJson(native180Receipt),{mode:0o600,flag:'wx'});
 const original231Receipt=parseHostedOriginal231CatalogueReceipt({...native180Receipt,version:4,purpose:'CUEVO_SOURCE_ORIGINAL231_CATALOGUE',baselineSourceSha:'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37',baselineTreeSha:'a58fa0bef6f6c0ea9cc57d12156b6c3464ac5559',migrationCount:231,migrationRowsSha256:hash(canonicalReleaseExecutionJson(original231Rows.map(row=>({version:row.name.slice(0,14),sourceReceiptSha256:hash(row.bytes)})))),sourceInventorySha256:hash(canonicalReleaseExecutionJson(original231Rows.map(row=>({name:row.name,sha256:hash(row.bytes)})))),provider180:native180Result.provider180,scratch231:original231Result.scratch231,catalogueSummary:original231Result.provider231,sourceNative180ReceiptSha256:sourceNative180CatalogueReceiptSha256(native180Receipt),capturedAt:original231CapturedAt});
 await writeFile(resolve(directory,'source231.json'),canonicalReleaseExecutionJson(original231Receipt),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({check:'source-child144-catalogue',status:'SOURCE_REFERENCE_VERIFIED',catalogueSha256:receipt.catalogueSummary.sha256,hostedAcceptance:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await produceHostedChildCatalogueReference();}catch(error){await retainFailure(error).catch(()=>undefined);console.error(fail().message);process.exitCode=1;}}
