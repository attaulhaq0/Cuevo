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
import { deriveSourceChildCatalogueBaseline, parseHostedChildCatalogueReceipt } from './hosted-child-catalogue-reference';

const fail=()=>Error('Source child144 catalogue producer requires review; contents withheld.');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const image='public.ecr.aws/supabase/postgres:17.11.0.002',imageId='sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53';
const producerFiles=['scripts/database/hosted-child-catalogue-producer.ts','scripts/database/hosted-child-catalogue-reference.ts','scripts/database/hosted-schema-catalogue.ts','scripts/database/replay-plan.ts','scripts/database/unknown-prefix-catalogue-policy.json'];
const exec=(file:string,args:string[],input?:Uint8Array)=>execFileSync(file,args,{input,shell:false,windowsHide:true,stdio:['pipe','pipe','ignore'],timeout:120000,maxBuffer:32*1024*1024});
function removeOwnedReference(rawId:string,label:string){
 const raw=JSON.parse(exec('docker',['inspect',rawId]).toString('utf8')) as {Id:string;Image:string;Config:{Labels:Record<string,string>}}[];
 if(raw.length!==1||raw[0].Id!==rawId||raw[0].Image!==imageId||raw[0].Config.Labels['cuevo.reference']!==label)throw fail();
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
 const config=source('supabase/config.toml').toString('utf8');assertCuevoLocalConfig(config);
 const pending=await mkdtemp(resolve(process.env.TEMP??process.env.TMP??'/tmp','cuevo-source-child144-')),workdir=resolve(pending,'empty');await mkdir(resolve(workdir,'supabase/migrations'),{recursive:true});
 const emptyConfig=config.replace(/(\[db\.seed\][\s\S]*?enabled\s*=\s*)true/,'$1false');if(emptyConfig===config)throw fail();await writeFile(resolve(workdir,'supabase/config.toml'),emptyConfig,{flag:'wx',mode:0o600});
 const cli=resolve('node_modules/supabase/dist/supabase.js'),startedAt=new Date().toISOString();
 // The normal database lane will subsequently reuse this same owned stack.
 try{exec('docker',['network','inspect','cuevo-local']);}catch{exec('docker',['network','create','--subnet','10.252.60.0/24','cuevo-local']);}
 try{exec('docker',['inspect','supabase_db_cuevo']);throw fail();}catch(error){if((error as {status?:number}).status!==1)throw fail();}
 exec(process.execPath,[cli,'start','--workdir',workdir,'--network-id','cuevo-local','--exclude','studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor']);
 const db=JSON.parse(exec('docker',['inspect','supabase_db_cuevo']).toString('utf8')) as {Id:string;Config:{Image:string};Image:string}[];if(db.length!==1||db[0].Config.Image!==image||db[0].Image!==imageId)throw fail();
 const dump=(schema:string)=>exec('docker',['exec',db[0].Id,'pg_dump','--schema-only','--schema',schema,'--username','supabase_admin','--dbname','postgres']);
 const dumps={auth:dump('auth'),storage:dump('storage'),realtime:dump('realtime')};
 const label=`cuevo-child144-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,password=randomBytes(32).toString('hex');
 let rawId:string|undefined,client:Client|undefined,baselineResult:ReturnType<typeof deriveSourceChildCatalogueBaseline>|undefined,capturedAt:string|undefined,cleanupCompletedAt:string|undefined;
 try{
  rawId=exec('docker',['run','--detach','--label','cuevo.reference='+label,'--name',label,'--publish','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data:rw','--env','POSTGRES_USER=supabase_admin','--env','POSTGRES_PASSWORD='+password,imageId]).toString('ascii').trim();if(!/^[a-f0-9]{64}$/.test(rawId))throw fail();
  const raw=JSON.parse(exec('docker',['inspect',rawId]).toString('utf8')) as {Id:string;Image:string;Config:{Labels:Record<string,string>};NetworkSettings:{Ports:Record<string,{HostIp:string;HostPort:string}[]>}}[];if(raw.length!==1||raw[0].Id!==rawId||raw[0].Image!==imageId||raw[0].Config.Labels['cuevo.reference']!==label)throw fail();const ports=raw[0].NetworkSettings.Ports['5432/tcp'];if(ports?.length!==1||ports[0].HostIp!=='127.0.0.1'||!/^[0-9]+$/.test(ports[0].HostPort))throw fail();
  for(let attempt=0;attempt<30;attempt++){try{exec('docker',['exec',rawId,'psql','-X','--set','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres','-h','127.0.0.1','-c','select 1']);break;}catch{if(attempt===29)throw fail();await new Promise(done=>setTimeout(done,1000));}}
  exec('docker',['exec','-i',rawId,'psql','-X','--set','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],source('scripts/database/hosted-child-catalogue-bootstrap.sql'));
  for(const bytes of Object.values(dumps))exec('docker',['exec','-i',rawId,'psql','-X','--set','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],bytes);
  client=new Client({host:'127.0.0.1',port:Number(ports[0].HostPort),user:'postgres',password,database:'postgres',connectionTimeoutMillis:5000,query_timeout:30000});await client.connect();
  await client.query("set search_path=pg_catalog; set DateStyle='ISO,YMD'; set IntervalStyle='postgres'; set TimeZone='UTC'; set check_function_bodies=on");
  if((await client.query("select current_setting('server_version_num') as version")).rows[0]?.version!=='170011')throw fail();
  let prefix123:unknown;
  for(const[index,row]of rows.entries()){await client.query(new TextDecoder('utf8',{fatal:true}).decode(row.bytes));if(index===122||index===143){context.finalMetadata();await client.query('begin isolation level repeatable read read only');try{const catalogue=requireCompleteHostedSchemaCatalogue([...(await client.query(hostedSchemaCatalogueStructuralSql)).rows,...(await client.query(hostedSchemaCatalogueAuthoritySql)).rows]);if(index===122)prefix123=catalogue.rows;else baselineResult=deriveSourceChildCatalogueBaseline(prefix123,catalogue.rows);}finally{await client.query('rollback');}}}
  const empty=await client.query("select (select count(*)::text from app.schools) as schools,(select count(*)::text from auth.users) as users");if(empty.rows[0]?.schools!=='0'||empty.rows[0]?.users!=='0')throw fail();capturedAt=new Date().toISOString();context.finalMetadata();
 }finally{
  try{if(client)await client.end();}finally{if(rawId)cleanupCompletedAt=removeOwnedReference(rawId,label);}
 }
 if(!baselineResult||!capturedAt||!cleanupCompletedAt)throw fail();context.finalMetadata();
 const receipt=parseHostedChildCatalogueReceipt({version:1,purpose:'CUEVO_SOURCE_CHILD144_CATALOGUE',repository:env.GITHUB_REPOSITORY,sourceSha:env.GITHUB_SHA,treeSha:context.treeSha,baselineSourceSha:'1a493ad735798bb6d3fa0ffaabc779e62149ac37',baselineTreeSha:'a207a7ec44dd29d61adc0490b85fedbf1e696fcd',runId:env.GITHUB_RUN_ID,runAttempt:Number(env.GITHUB_RUN_ATTEMPT),producerJob:'database-checks',producerStep:'Build exact source child144 catalogue reference',migrationCount:144,migrationRowsSha256:hash(canonicalReleaseExecutionJson(rows.map(row=>({version:row.name.slice(0,14),sourceReceiptSha256:hash(row.bytes)})))),sourceInventorySha256:hash(canonicalReleaseExecutionJson(rows.map(row=>({name:row.name,sha256:hash(row.bytes)})))),querySha256:baselineResult.querySha256,policySha256:baselineResult.policySha256,producerSha256:hash(canonicalReleaseExecutionJson(producerFiles.map(path=>({path,sha256:hash(source(path))})))),bootstrapSha256:hash(source('scripts/database/hosted-child-catalogue-bootstrap.sql')),serviceSchemaSha256:Object.fromEntries(Object.entries(dumps).map(([name,bytes])=>[name,hash(bytes)])),image,imageId,sourceLockSha256:hash(source('package-lock.json')),nodeVersion:process.version,nodeBinarySha256:hash(await readFile(process.execPath)),scratch123:baselineResult.scratch123,provider123:baselineResult.provider123,scratch144:baselineResult.scratch144,catalogueSummary:baselineResult.provider144,startedAt,capturedAt,cleanupCompletedAt,cleanupConfirmed:true,sourceFrozen:true,hostedAcceptance:false,effectAuthority:false});
 const directory=resolve('.local/child144-catalogue');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'reference.json'),canonicalReleaseExecutionJson(receipt),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({check:'source-child144-catalogue',status:'SOURCE_REFERENCE_VERIFIED',catalogueSha256:receipt.catalogueSummary.sha256,hostedAcceptance:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await produceHostedChildCatalogueReference();}catch{console.error(fail().message);process.exitCode=1;}}
