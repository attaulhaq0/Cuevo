import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { canonicalHostedMigrationPlan, readCanonicalMigrationSources, prepareCanonicalMigrationOperation, readCanonicalMigrationOperation, disposeCanonicalMigrationOperation, type CanonicalMigrationOperation, verifyCompletedMigrationPrefix, verifyPriorSchemaPrefix, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { deriveCanonicalHostedMigrationBatches } from './hosted-migration-batches';
import { types } from 'node:util';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import { posthogIntelligenceMigration } from './replay-plan';

const failure=()=>new Error('Hosted migration workdir source, plan or owned output requires review; contents withheld.');
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const config='project_id = "cuevo"\n\n[db]\nmajor_version = 17\n\n[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n';
const gitEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','LANG','LC_ALL'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']]));
type MigrationRow=HostedMigrationPlanV1['migrations'][number];
export type HostedMigrationWorkdirs={
 root:string; projectRef:string; sourceSha:string; treeSha:string; planSha256:string;
 execution:'NOT_EXECUTED'; sourceProvenance:ReturnType<typeof readCanonicalMigrationSources>['provenance'];
 stages:{id:HostedMigrationPlanV1['stages'][number]['id'];workdir:string;included:MigrationRow[];pending:MigrationRow[];expectedBeforeVersions:string[];expectedAfterVersions:string[];configSha256:string;commandArgs:string[];materialization?:'SQL_FILES'|'METADATA_ONLY'}[];
};


async function createOwnedMigrationDelivery(input:{workdir:string;included:MigrationRow[];sources:ReturnType<typeof readCanonicalMigrationSources>['sources'];verify:()=>Promise<void>}){
 await input.verify();await mkdir(input.workdir);await input.verify();const supabase=join(input.workdir,'supabase'),migrations=join(supabase,'migrations');await mkdir(supabase);await mkdir(migrations);
 const verifyOwned=async()=>{await input.verify();for(const path of [input.workdir,supabase,migrations]){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw failure();}};
 const write=async(path:string,bytes:Uint8Array|string)=>{await verifyOwned();const handle=await open(path,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||await realpath(path)!==path||hash(await readFile(path))!==hash(bytes))throw failure();};
 await write(join(supabase,'config.toml'),config);for(const row of input.included){const source=input.sources.find(source=>source.name===row.name);if(!source||hash(source.bytes)!==row.sha256)throw failure();await write(join(migrations,row.name),source.bytes);}
 if(JSON.stringify((await readdir(input.workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify(input.included.map(row=>row.name).sort()))throw failure();
}
function ownedMetadata(value:unknown,depth=0):unknown{if(depth>12)throw failure();if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;if(!value||typeof value!=='object'||types.isProxy(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw failure();if(Array.isArray(value)&&(value.length>5000||Reflect.ownKeys(value).length!==value.length+1))throw failure();const output:Record<string,unknown>|unknown[]=Array.isArray(value)?[]:Object.create(null);for(const key of Reflect.ownKeys(value)){if(Array.isArray(value)&&key==='length')continue;const field=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!field||!('value'in field)||!field.enumerable)throw failure();Object.defineProperty(output,key,{value:ownedMetadata(field.value,depth+1),enumerable:true});}return output;}

/** Builds ignored CLI input only. Hosted target, credentials, approval and execution remain separate. */
export async function createHostedMigrationWorkdirs(input:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;outputRoot:string;preparation?:'ALL_SQL'|'PREFIX_SQL'|'RUNTIME_OBSERVATION'|'INSTALLED_NOOP'},borrowed?:CanonicalMigrationOperation):Promise<HostedMigrationWorkdirs>{
 let operation:CanonicalMigrationOperation|undefined;try{
 const canonical=canonicalHostedMigrationPlan(input.plan),plan=JSON.parse(canonical.json) as HostedMigrationPlanV1;
 const preparation=input.preparation??'ALL_SQL';
 if(!['ALL_SQL','PREFIX_SQL','RUNTIME_OBSERVATION','INSTALLED_NOOP'].includes(preparation)||preparation==='RUNTIME_OBSERVATION'&&(!plan.runtimeOnly||plan.pending.length||plan.stages.some(stage=>stage.names.length))||preparation==='PREFIX_SQL'&&(!plan.reconciliationTemplate||plan.applied.length!==120||plan.runtimeOnly)||preparation==='INSTALLED_NOOP'&&(plan.runtimeOnly||plan.reconciliationTemplate||plan.priorSchemaRelease||!plan.priorCompletedRelease||plan.applied.length!==plan.migrations.length||plan.pending.length||plan.stages.some(stage=>stage.names.length)))throw failure();
 const binding={repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan};operation=borrowed===undefined?prepareCanonicalMigrationOperation(binding):borrowed;const loaded=readCanonicalMigrationOperation(operation,binding);if(preparation==='INSTALLED_NOOP'&&!verifyCompletedMigrationPrefix(input.repoRoot,plan,operation))throw failure();
 if(plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha)throw failure();
 const replay=loaded.replay;
 const rows=loaded.rows;
 if(rows.length!==plan.migrations.length||rows.some((row,index)=>{const current=plan.migrations[index];return row.name!==current.name||row.version!==current.version||row.sha256!==current.sha256;}))throw failure();
 const observability=replay.remaining.indexOf(posthogIntelligenceMigration);
 if(observability<0)throw failure();
 const groups=loaded.groups;
 const boundaries=loaded.boundaries;
 if(plan.applied.length&&!boundaries.includes(plan.applied.length)&&!(plan.priorSchemaRelease?verifyPriorSchemaPrefix(input.repoRoot,plan,operation):verifyCompletedMigrationPrefix(input.repoRoot,plan,operation))||plan.mode===(plan.applied.length?'EMPTY_INITIAL':'INCREMENTAL'))throw failure();
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
   const workdir=join(root,stage.id),included=rows.slice(0,Math.max(plan.applied.length,boundaries[index])),pending=included.filter(row=>pendingSet.has(row.name)&&stage.names.includes(row.name));
   const materialize=preparation==='ALL_SQL'||preparation==='PREFIX_SQL'&&stage.id==='prefix';
   if(materialize)await createOwnedMigrationDelivery({workdir,included,sources:loaded.sources,verify:async()=>{await directory(expected);await directory(root);}});
   const commandArgs=['db','push','--linked','--project-ref',plan.projectRef,'--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json'];
   stages.push({id:stage.id,workdir,included,pending,expectedBeforeVersions:rows.slice(0,Math.max(plan.applied.length,index?boundaries[index-1]:0)).map(row=>row.version).sort(),expectedAfterVersions:rows.slice(0,Math.max(plan.applied.length,boundaries[index])).map(row=>row.version).sort(),configSha256:hash(config),commandArgs,...(preparation==='ALL_SQL'?{}:{materialization:materialize?'SQL_FILES' as const:'METADATA_ONLY' as const})});
  }
  await directory(expected);await directory(root);
  if(JSON.stringify((await readdir(root)).sort())!==JSON.stringify(['builder-state.json',...stages.filter(stage=>stage.materialization!=='METADATA_ONLY').map(stage=>stage.id)].sort()))throw failure();
  readCanonicalMigrationOperation(operation,binding);await record('READY');readCanonicalMigrationOperation(operation,binding);
  return{root,projectRef:plan.projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256,execution:'NOT_EXECUTED',sourceProvenance:loaded.provenance,stages};
 }catch{await record('REQUIRES_REVIEW').catch(()=>undefined);throw failure();}finally{await state.close();}
 }finally{if(operation&&borrowed===undefined)disposeCanonicalMigrationOperation(operation);}
}
export type HostedMigrationBatchWorkdir={index:number;workdir:string;pending:MigrationRow[];cumulativeIncluded:MigrationRow[];expectedBeforeVersions:string[];expectedAfterVersions:string[];configSha256:string;batchSha256:string;manifestPath:string;manifestSha256:string;commandArgs:string[]};
export type HostedMigrationBatchWorkdirs={root:string;sourceSha:string;treeSha:string;planSha256:string;stageId:HostedMigrationWorkdirs['stages'][number]['id'];stageSha256:string;sourceSetSha256:string;execution:'NOT_EXECUTED';sourceProvenance:ReturnType<typeof readCanonicalMigrationSources>['provenance'];batches:HostedMigrationBatchWorkdir[]};
/** Source-owned child delivery only. It creates no execution, intermediate-history or journal authority. */
export async function createHostedMigrationBatchWorkdirs(value:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;stage:HostedMigrationWorkdirs['stages'][number];outputRoot:string},borrowed?:CanonicalMigrationOperation):Promise<HostedMigrationBatchWorkdirs>{
 let operation:CanonicalMigrationOperation|undefined;
 try{
  const input=JSON.parse(canonicalReleaseExecutionJson(ownedMetadata(value))) as typeof value,canonical=canonicalHostedMigrationPlan(input.plan),plan=JSON.parse(canonical.json) as HostedMigrationPlanV1,binding={repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan};operation=borrowed===undefined?prepareCanonicalMigrationOperation(binding):borrowed;const loaded=readCanonicalMigrationOperation(operation,binding);
  if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(['repoRoot','sourceSha','treeSha','plan','stage','outputRoot'].sort())||plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha)throw failure();
  const derived=deriveCanonicalHostedMigrationBatches({...binding,stage:input.stage},operation);
  // The canonical derivation just verified this exact completed prefix synchronously.
  const completedBoundaryAlreadyVerified=!!plan.priorCompletedRelease&&input.stage.expectedBeforeVersions.length===plan.priorCompletedRelease.migrationCount;
  const replay=loaded.replay,boundary=replay.remaining.indexOf(posthogIntelligenceMigration),groups=loaded.groups,ids=['prefix','native','pre-observability','remaining'],index=ids.indexOf(input.stage.id),boundaries=loaded.boundaries;
  if(index<0||boundary<0||plan.applied.length&&!boundaries.includes(plan.applied.length)&&!(plan.priorSchemaRelease?verifyPriorSchemaPrefix(input.repoRoot,plan,operation):completedBoundaryAlreadyVerified||verifyCompletedMigrationPrefix(input.repoRoot,plan,operation))||input.stage.expectedBeforeVersions.length!==Math.max(plan.applied.length,index?boundaries[index-1]:0)||canonicalReleaseExecutionJson(input.stage.pending.map(row=>row.name))!==canonicalReleaseExecutionJson(plan.stages[index].names)||plan.stages.some((stage,index)=>JSON.stringify(stage.names)!==JSON.stringify(groups[index].filter(name=>plan.pending.some(row=>row.name===name))))||derived.sourceSetSha256!==hash(JSON.stringify(plan.migrations.map(({name,version,sha256})=>({name,version,sha256})))))throw failure();
  const repoRoot=await realpath(input.repoRoot),releaseRoot=join(repoRoot,'.local','hosted-release'),part=relative(releaseRoot,input.stage.workdir);if(repoRoot!==input.repoRoot||input.outputRoot!==releaseRoot||!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw failure();
  const git=(args:string[],stdin?:string)=>execFileSync('git',['-C',repoRoot,...args],{env:gitEnv(),encoding:'utf8',input:stdin,stdio:['pipe','pipe','ignore'],windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  if(git(['check-ignore','--no-index','--stdin'],'.local/hosted-release/batch-probe/builder-state.json\n').trim()!=='.local/hosted-release/batch-probe/builder-state.json'||git(['ls-files','--cached','--','.local/hosted-release']).length)throw failure();
  const directory=async(path:string)=>{const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw failure();};await directory(repoRoot);await directory(join(repoRoot,'.local'));await directory(releaseRoot);
  const root=join(releaseRoot,'batches-'+randomUUID());await mkdir(root);await directory(root);const state=await open(join(root,'builder-state.json'),'wx',0o600),batches:HostedMigrationBatchWorkdir[]=[];
  const record=async(status:'CREATING'|'READY'|'REQUIRES_REVIEW')=>{const body={version:1,purpose:'CUEVO_HOSTED_MIGRATION_BATCH_DELIVERY',state:status,sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256,stageId:input.stage.id,stageSha256:derived.stageSha256,sourceSetSha256:derived.sourceSetSha256,batchCount:derived.batches.length,execution:'NOT_EXECUTED'};await state.truncate(0);await state.write(JSON.stringify(body)+'\n',0,'utf8');await state.sync();};
  try{await record('CREATING');for(const batch of derived.batches){const workdir=join(root,'batch-'+String(batch.index).padStart(3,'0'));await createOwnedMigrationDelivery({workdir,included:batch.cumulativeIncluded,sources:loaded.sources,verify:async()=>{await directory(releaseRoot);await directory(root);}});
    const manifestPath=join(root,'batch-'+String(batch.index).padStart(3,'0')+'.manifest.json'),manifest={version:1,purpose:'CUEVO_HOSTED_MIGRATION_BATCH',sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256,stageId:input.stage.id,stageSha256:derived.stageSha256,sourceSetSha256:derived.sourceSetSha256,index:batch.index,batchSha256:batch.sha256,pending:batch.pending,cumulativeIncluded:batch.cumulativeIncluded,expectedBeforeVersions:batch.expectedBeforeVersions,expectedAfterVersions:batch.expectedAfterVersions,configSha256:hash(config),execution:'NOT_EXECUTED'},bytes=canonicalReleaseExecutionJson(manifest)+'\n',handle=await open(manifestPath,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    batches.push({index:batch.index,workdir,pending:batch.pending,cumulativeIncluded:batch.cumulativeIncluded,expectedBeforeVersions:batch.expectedBeforeVersions,expectedAfterVersions:batch.expectedAfterVersions,configSha256:hash(config),batchSha256:batch.sha256,manifestPath,manifestSha256:hash(bytes),commandArgs:['db','push','--linked','--project-ref',plan.projectRef,'--include-all','--skip-vault','--workdir',workdir,'--yes','--output-format','json']});}
   const expectedNames=['builder-state.json',...batches.flatMap(batch=>['batch-'+String(batch.index).padStart(3,'0'),'batch-'+String(batch.index).padStart(3,'0')+'.manifest.json'])].sort();if(JSON.stringify((await readdir(root)).sort())!==JSON.stringify(expectedNames))throw failure();const finalSource=readCanonicalMigrationOperation(operation,binding),finalDerived=deriveCanonicalHostedMigrationBatches({...binding,stage:input.stage},operation);if(canonicalReleaseExecutionJson(finalSource.provenance)!==canonicalReleaseExecutionJson(loaded.provenance)||canonicalReleaseExecutionJson(finalDerived)!==canonicalReleaseExecutionJson(derived))throw failure();await record('READY');readCanonicalMigrationOperation(operation,binding);return{root,sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonical.sha256,stageId:input.stage.id,stageSha256:derived.stageSha256,sourceSetSha256:derived.sourceSetSha256,execution:'NOT_EXECUTED',sourceProvenance:loaded.provenance,batches};
  }catch{await record('REQUIRES_REVIEW').catch(()=>undefined);throw failure();}finally{await state.close();}
 }catch{throw failure();}finally{if(operation&&borrowed===undefined)disposeCanonicalMigrationOperation(operation);}
}
