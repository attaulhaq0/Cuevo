import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { canonicalHostedMigrationPlan, readCanonicalMigrationSources, verifyCompletedMigrationPrefix, verifyPriorSchemaPrefix, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { replayPlan, nativeSourceMigration, posthogIntelligenceMigration } from './replay-plan';

const failure=()=>new Error('Hosted migration workdir source, plan or owned output requires review; contents withheld.');
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const config='project_id = "cuevo"\n\n[db]\nmajor_version = 17\n\n[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n';
const gitEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','LANG','LC_ALL'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']]));
type MigrationRow=HostedMigrationPlanV1['migrations'][number];
export type HostedMigrationWorkdirs={
 root:string; projectRef:string; sourceSha:string; treeSha:string; planSha256:string;
 execution:'NOT_EXECUTED'; sourceProvenance:ReturnType<typeof readCanonicalMigrationSources>['provenance'];
 stages:{id:HostedMigrationPlanV1['stages'][number]['id'];workdir:string;included:MigrationRow[];pending:MigrationRow[];expectedBeforeVersions:string[];expectedAfterVersions:string[];configSha256:string;commandArgs:string[]}[];
};

/** Builds ignored CLI input only. Hosted target, credentials, approval and execution remain separate. */
export async function createHostedMigrationWorkdirs(input:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;outputRoot:string}):Promise<HostedMigrationWorkdirs>{
 const canonical=canonicalHostedMigrationPlan(input.plan),plan=JSON.parse(canonical.json) as HostedMigrationPlanV1;
 const loaded=readCanonicalMigrationSources(input);
 if(plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha)throw failure();
 const replay=replayPlan(loaded.sources),order=[...replay.before,replay.prerequisite,...replay.remaining];
 const rows=order.map(name=>({name,version:name.slice(0,14),sha256:hash(loaded.sources.find(row=>row.name===name)!.bytes)}));
 if(rows.length!==plan.migrations.length||rows.some((row,index)=>{const current=plan.migrations[index];return row.name!==current.name||row.version!==current.version||row.sha256!==current.sha256;}))throw failure();
 const observability=replay.remaining.indexOf(posthogIntelligenceMigration);
 if(observability<0)throw failure();
 const groups=[replay.before,[nativeSourceMigration],replay.remaining.slice(0,observability),replay.remaining.slice(observability)];
 const boundaries=groups.map((_,index)=>groups.slice(0,index+1).flat().length);
 if(plan.applied.length&&!boundaries.includes(plan.applied.length)&&!(plan.priorSchemaRelease?verifyPriorSchemaPrefix(input.repoRoot,plan):verifyCompletedMigrationPrefix(input.repoRoot,plan))||plan.mode===(plan.applied.length?'EMPTY_INITIAL':'INCREMENTAL'))throw failure();
 const pendingSet=new Set(plan.pending.map(row=>row.name));
 if(plan.stages.some((stage,index)=>JSON.stringify(stage.names)!==JSON.stringify(groups[index].filter(name=>pendingSet.has(name)))))throw failure();
 const repoRoot=await realpath(input.repoRoot),expected=join(repoRoot,'.local','hosted-release');
 if(!isAbsolute(input.outputRoot)||resolve(input.outputRoot)!==expected)throw failure();
 const git=(args:string[],stdin?:string)=>{try{return execFileSync('git',['-C',repoRoot,...args],{encoding:'utf8',input:stdin,env:gitEnv(),stdio:['pipe','pipe','pipe'],windowsHide:true,timeout:15000,maxBuffer:1024*1024});}catch{throw failure();}};
 const probe='.local/hosted-release/migration-probe/builder-state.json';
 if(git(['check-ignore','--no-index','--stdin'],probe+'\n').trim()!==probe||git(['ls-files','--cached','--','.local/hosted-release']).length)throw failure();
 const directory=async(path:string,create=false)=>{let stat;try{stat=await lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||!create)throw failure();await mkdir(path);stat=await lstat(path);}if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw failure();};
 await directory(join(repoRoot,'.local'),true);await directory(expected,true);
 const root=join(expected,'migration-'+randomUUID());await mkdir(root);await directory(root);
 const state=await open(join(root,'builder-state.json'),'wx',0o600);
 const record=async(status:'CREATING'|'READY'|'REQUIRES_REVIEW')=>{await state.truncate(0);await state.write(JSON.stringify({version:1,state:status,sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256,execution:'NOT_EXECUTED'})+'\n',0,'utf8');await state.sync();};
 const stages:HostedMigrationWorkdirs['stages']=[];
 try{
  await record('CREATING');
  for(const [index,stage]of plan.stages.entries()){
   await directory(expected);await directory(root);
   const workdir=join(root,stage.id);await mkdir(workdir);await directory(workdir);
   const supabase=join(workdir,'supabase'),migrations=join(supabase,'migrations');await mkdir(supabase);await mkdir(migrations);
   const included=rows.slice(0,Math.max(plan.applied.length,boundaries[index])),pending=included.filter(row=>pendingSet.has(row.name)&&stage.names.includes(row.name));
   const write=async(path:string,bytes:Uint8Array|string)=>{await directory(expected);await directory(root);await directory(workdir);await directory(supabase);await directory(migrations);const handle=await open(path,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}if((await lstat(path)).isSymbolicLink()||hash(await readFile(path))!==hash(typeof bytes==='string'?Buffer.from(bytes):bytes))throw failure();};
   await write(join(supabase,'config.toml'),config);
   for(const row of included)await write(join(migrations,row.name),loaded.sources.find(source=>source.name===row.name)!.bytes);
   if(JSON.stringify((await readdir(workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify(included.map(row=>row.name).sort()))throw failure();
   const commandArgs=['db','push','--linked','--project-ref',plan.projectRef,'--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json'];
   stages.push({id:stage.id,workdir,included,pending,expectedBeforeVersions:rows.slice(0,Math.max(plan.applied.length,index?boundaries[index-1]:0)).map(row=>row.version).sort(),expectedAfterVersions:rows.slice(0,Math.max(plan.applied.length,boundaries[index])).map(row=>row.version).sort(),configSha256:hash(config),commandArgs});
  }
  await directory(expected);await directory(root);
  if(JSON.stringify((await readdir(root)).sort())!==JSON.stringify(['builder-state.json',...plan.stages.map(stage=>stage.id)].sort()))throw failure();
  await record('READY');
  return{root,projectRef:plan.projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256,execution:'NOT_EXECUTED',sourceProvenance:loaded.provenance,stages};
 }catch{await record('REQUIRES_REVIEW').catch(()=>undefined);throw failure();}finally{await state.close();}
}
