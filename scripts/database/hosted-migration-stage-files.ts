import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { canonicalHostedMigrationPlan, readCanonicalMigrationSources, verifyCompletedMigrationPrefix, verifyPriorSchemaPrefix, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { replayPlan, nativeSourceMigration, posthogIntelligenceMigration } from './replay-plan';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';
import { canonicalReleaseExecutionJson } from '../verification/release-review';

const failure=()=>new Error('Native migration stage source or physical artifact requires review; contents withheld.');
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
function plain(value:unknown,depth=0):unknown{
 if(depth>12)throw failure();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();
 if(Array.isArray(value)&&(value.length>5000||Reflect.ownKeys(value).length!==value.length+1))throw failure();const output:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);
 for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();Object.defineProperty(output,key,{value:plain(field.value,depth+1),enumerable:true});}return output;
}
const config='project_id = "cuevo"\n\n[db]\nmajor_version = 17\n\n[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n';
function git(root:string,args:string[]){const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']]));return execFileSync('git',['-C',root,...args],{env,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:15000,windowsHide:true,shell:false}).trim();}
async function physical(root:string,path:string,kind:'directory'|'file'){
 const part=relative(root,path);if(!isAbsolute(path)||resolve(path)!==path||!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw failure();
 const base=await lstat(root);if(!base.isDirectory()||base.isSymbolicLink()||await realpath(root)!==root)throw failure();let current=root;const pieces=part.split(/[\\/]/);
 for(const[index,piece]of pieces.entries()){current=join(current,piece);const stat=await lstat(current);if(stat.isSymbolicLink()||await realpath(current)!==current||(index===pieces.length-1?(kind==='file'?!stat.isFile()||stat.nlink!==1:!stat.isDirectory()):!stat.isDirectory()))throw failure();}
}
/** Re-admit original Git bytes and exact ignored CLI input. No provider, database or source acceptance is inferred. */
export async function admitHostedMigrationStageFiles(value:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;stage:HostedMigrationWorkdirs['stages'][number]}){
 try{
  const text=JSON.stringify(plain(value));if(Buffer.byteLength(text)>2*1024*1024)throw failure();const input=JSON.parse(text) as typeof value,root=input.repoRoot;
  if(!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root||git(root,['status','--porcelain','--untracked-files=all']))throw failure();
  const loaded=readCanonicalMigrationSources(input),plan=JSON.parse(canonicalHostedMigrationPlan(input.plan).json) as HostedMigrationPlanV1;
  if(plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha)throw failure();const replay=replayPlan(loaded.sources),ordered=[...replay.before,replay.prerequisite,...replay.remaining];
  const rows=ordered.map(name=>({name,version:name.slice(0,14),sha256:hash(loaded.sources.find(source=>source.name===name)!.bytes)}));
  if(canonicalReleaseExecutionJson(rows)!==canonicalReleaseExecutionJson(plan.migrations))throw failure();
  const boundary=replay.remaining.indexOf(posthogIntelligenceMigration),groups=[replay.before,[nativeSourceMigration],replay.remaining.slice(0,boundary),replay.remaining.slice(boundary)],boundaries=groups.map((_,index)=>groups.slice(0,index+1).flat().length),ids=['prefix','native','pre-observability','remaining'];
  const index=ids.indexOf(input.stage.id);if(index<0||boundary<0||plan.stages[index].id!==input.stage.id)throw failure();
  const pendingNames=new Set(plan.pending.map(row=>row.name));if(plan.applied.length&&!boundaries.includes(plan.applied.length)&&!(plan.priorSchemaRelease?verifyPriorSchemaPrefix(input.repoRoot,plan):verifyCompletedMigrationPrefix(input.repoRoot,plan))||plan.stages.some((stage,index)=>JSON.stringify(stage.names)!==JSON.stringify(groups[index].filter(name=>pendingNames.has(name)))))throw failure();const included=rows.slice(0,Math.max(plan.applied.length,boundaries[index])),before=rows.slice(0,Math.max(plan.applied.length,index?boundaries[index-1]:0)).map(row=>row.version).sort(),after=included.map(row=>row.version).sort(),pending=included.filter(row=>plan.stages[index].names.includes(row.name));
  if(canonicalReleaseExecutionJson(input.stage.included)!==canonicalReleaseExecutionJson(included)||canonicalReleaseExecutionJson(input.stage.pending)!==canonicalReleaseExecutionJson(pending)||JSON.stringify(input.stage.expectedBeforeVersions)!==JSON.stringify(before)||JSON.stringify(input.stage.expectedAfterVersions)!==JSON.stringify(after)||input.stage.configSha256!==hash(config))throw failure();
  const releaseRoot=join(root,'.local','hosted-release'),workdir=input.stage.workdir,part=relative(releaseRoot,workdir);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw failure();
  await physical(root,workdir,'directory');const supabase=join(workdir,'supabase'),migrations=join(supabase,'migrations');await physical(root,migrations,'directory');await physical(root,join(supabase,'config.toml'),'file');
  if(JSON.stringify((await readdir(workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify(included.map(row=>row.name).sort())||await readFile(join(supabase,'config.toml'),'utf8')!==config)throw failure();
  for(const row of included){const file=join(migrations,row.name);await physical(root,file,'file');const bytes=await readFile(file);if(hash(bytes)!==row.sha256)throw failure();}
  return{evidence:'VERIFIED_GIT_AND_PHYSICAL_STAGE' as const,sources:loaded.sources,stageSha256:hash(JSON.stringify({included:included.map(row=>({name:row.name,version:row.version,sha256:row.sha256})),configSha256:input.stage.configSha256})),planSha256:canonicalHostedMigrationPlan(plan).sha256};
 }catch{throw failure();}
}
