import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import {lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import {z} from 'zod';
import { canonicalHostedMigrationPlan, prepareCanonicalMigrationOperation, readCanonicalMigrationOperation, disposeCanonicalMigrationOperation, type CanonicalMigrationOperation, verifyCompletedMigrationPrefix, verifyPriorSchemaPrefix, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { posthogIntelligenceMigration } from './replay-plan';
import { deriveCanonicalHostedMigrationBatches } from './hosted-migration-batches';
import type { HostedMigrationBatchWorkdir,HostedMigrationWorkdirs } from './hosted-migration-workdirs';
import { canonicalReleaseExecutionJson } from '../verification/release-review';
import {readOriginal231TransportAppendPlan,type Original231TransportAppendPlan} from './original231-transport-plan-contracts';
import {prepareCanonicalOriginal231TransportAppendOperation,readCanonicalOriginal231TransportAppendOperation} from './hosted-migration-plan';

const failure=()=>new Error('Native migration stage source or physical artifact requires review; contents withheld.');
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const toolchainDigest=z.string().regex(/^[a-f0-9]{64}$/),toolchainSha=z.string().regex(/^[a-f0-9]{40}$/);
export const hostedMigrationToolchainManifestSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_HOSTED_MIGRATION_TOOLCHAIN'),sourceSha:toolchainSha,treeSha:toolchainSha,sourceLockSha256:toolchainDigest,cliVersion:z.enum(['2.119.0','2.120.0']),platform:z.string(),cli:z.object({shimSha256:toolchainDigest,binarySha256:toolchainDigest,sidecarSha256:toolchainDigest}).strict()}).strict();
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
/** Actual owned manifest/source-lock read. Its fingerprint must come from the
 * caller's separately authenticated approval; this reader creates no permit. */
export async function readHostedMigrationToolchainManifest(value:{repoRoot:string;sourceSha:string;treeSha:string;manifestSha256:string;path?:string;cli?:z.infer<typeof hostedMigrationToolchainManifestSchema>['cli']}){
 try{
  const input=z.object({repoRoot:z.string(),sourceSha:toolchainSha,treeSha:toolchainSha,manifestSha256:toolchainDigest,path:z.string().optional(),cli:hostedMigrationToolchainManifestSchema.shape.cli.optional()}).strict().parse(plain(value)),root=input.repoRoot,path=input.path??join(root,'.local','hosted-release','migration-toolchain.json'),part=relative(join(root,'.local','hosted-release'),path);
  if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>piece==='.'||piece==='..'))throw failure();await physical(root,path,'file');const before=await lstat(path);if(before.size>48*1024)throw failure();const bytes=await readFile(path),after=await lstat(path);
  if(before.ino!==after.ino||before.dev!==after.dev||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes.length>48*1024||hash(bytes)!==input.manifestSha256)throw failure();
  const manifest=hostedMigrationToolchainManifestSchema.parse(plain(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes))));if(manifest.sourceSha!==input.sourceSha||manifest.treeSha!==input.treeSha||manifest.platform!==`${process.platform}-${process.arch}`||input.cli&&canonicalReleaseExecutionJson(input.cli)!==canonicalReleaseExecutionJson(manifest.cli))throw failure();
  const relativePath=relative(root,path).replaceAll('\\','/');if(git(root,['check-ignore','--no-index',relativePath])!==relativePath||git(root,['ls-files','--cached','--',relativePath]).length)throw failure();
  const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']])),lockBytes=execFileSync('git',['-C',root,'show',input.sourceSha+':package-lock.json'],{env,stdio:['ignore','pipe','ignore'],timeout:15000,maxBuffer:2*1024*1024,windowsHide:true,shell:false});
  if(hash(lockBytes)!==manifest.sourceLockSha256)throw failure();const lock=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(lockBytes)) as {lockfileVersion:number;packages:Record<string,{version?:string;integrity?:string;resolved?:string}>},platform=process.platform==='win32'?'windows':process.platform;
  for(const dependency of['node_modules/supabase',`node_modules/@supabase/cli-${platform}-${process.arch}`]){const row=lock.packages?.[dependency];if(lock.lockfileVersion!==3||row?.version!==manifest.cliVersion||!row.integrity?.startsWith('sha512-')||!row.resolved?.startsWith('https://registry.npmjs.org/'))throw failure();}
  await physical(root,path,'file');if(hash(await readFile(path))!==input.manifestSha256)throw failure();return manifest;
 }catch{throw failure();}
}
/** Separate current232 physical admission. It never enters ordinary V1 SQL or
 * original231 metadata preparation, and grants no execution capability. */
export async function admitOriginal231TransportAppendStageFiles(value:{repoRoot:string;sourceSha:string;treeSha:string;plan:Original231TransportAppendPlan;stage:HostedMigrationWorkdirs['stages'][number]},borrowed?:CanonicalMigrationOperation){
 let operation:CanonicalMigrationOperation|undefined;
 try{
  const text=canonicalReleaseExecutionJson(plain(value));if(Buffer.byteLength(text)>2*1024*1024)throw failure();const input=JSON.parse(text) as typeof value,root=input.repoRoot,plan=readOriginal231TransportAppendPlan(input.plan);
  if(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(['repoRoot','sourceSha','treeSha','plan','stage'].sort())||!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root||git(root,['status','--porcelain','--untracked-files=all']))throw failure();
  const binding={repoRoot:root,sourceSha:input.sourceSha,treeSha:input.treeSha,plan};operation=borrowed??prepareCanonicalOriginal231TransportAppendOperation(binding);const loaded=readCanonicalOriginal231TransportAppendOperation(operation,binding),stage=input.stage;
  if(JSON.stringify(Object.keys(stage).sort())!==JSON.stringify(['id','workdir','included','pending','expectedBeforeVersions','expectedAfterVersions','configSha256','commandArgs','materialization'].sort())||stage.materialization!=='SQL_FILES'||stage.configSha256!==hash(config)||canonicalReleaseExecutionJson({id:stage.id,included:stage.included,pending:stage.pending,expectedBeforeVersions:stage.expectedBeforeVersions,expectedAfterVersions:stage.expectedAfterVersions})!==canonicalReleaseExecutionJson(plan.stage))throw failure();
  const releaseRoot=join(root,'.local','hosted-release'),deliveryRoot=resolve(stage.workdir,'..'),part=relative(releaseRoot,deliveryRoot);
  if(!/^migration-[a-f0-9-]{36}$/.test(part)||stage.workdir!==join(deliveryRoot,'remaining')||JSON.stringify(stage.commandArgs)!==JSON.stringify(['db','push','--linked','--project-ref',plan.projectRef,'--include-all','--skip-vault','--workdir',stage.workdir,'--yes','--output-format','json']))throw failure();
  await physical(root,deliveryRoot,'directory');await physical(root,join(deliveryRoot,'builder-state.json'),'file');
  const state=JSON.stringify({version:1,purpose:'CUEVO_ORIGINAL231_TRANSPORT_APPEND_DELIVERY',state:'READY',sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:plan.planSha256,execution:'NOT_EXECUTED',effectAuthority:false,originalAcknowledgement:'UNKNOWN'})+'\n';
  if(await readFile(join(deliveryRoot,'builder-state.json'),'utf8')!==state||JSON.stringify((await readdir(deliveryRoot)).sort())!==JSON.stringify(['builder-state.json','remaining']))throw failure();
  const supabase=join(stage.workdir,'supabase'),migrations=join(supabase,'migrations');await physical(root,migrations,'directory');await physical(root,join(supabase,'config.toml'),'file');
  if(JSON.stringify((await readdir(stage.workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify(plan.migrations.map(row=>row.name).sort())||await readFile(join(supabase,'config.toml'),'utf8')!==config)throw failure();
  for(const row of plan.migrations){const file=join(migrations,row.name);await physical(root,file,'file');if(hash(await readFile(file))!==row.sha256)throw failure();}
  readCanonicalOriginal231TransportAppendOperation(operation,binding);return{evidence:'VERIFIED_GIT_AND_PHYSICAL_TRANSPORT_APPEND' as const,effectAuthority:false as const,sources:loaded.sources,planSha256:plan.planSha256,stageSha256:hash(JSON.stringify({included:plan.migrations.map(({name,version,sha256})=>({name,version,sha256})),configSha256:stage.configSha256}))};
 }catch{throw failure();}finally{if(operation&&borrowed===undefined)disposeCanonicalMigrationOperation(operation);}
}
/** Re-admit original Git bytes and exact ignored CLI input. No provider, database or source acceptance is inferred. */
export async function admitHostedMigrationStageFiles(value:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;stage:HostedMigrationWorkdirs['stages'][number]},borrowed?:CanonicalMigrationOperation){
 let operation:CanonicalMigrationOperation|undefined;try{
  const text=JSON.stringify(plain(value));if(Buffer.byteLength(text)>2*1024*1024)throw failure();const input=JSON.parse(text) as typeof value,root=input.repoRoot;
  if(input.plan.original231Recovery||input.stage.materialization!==undefined&&input.stage.materialization!=='SQL_FILES')throw failure();
  if(!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root||git(root,['status','--porcelain','--untracked-files=all']))throw failure();
  const plan=JSON.parse(canonicalHostedMigrationPlan(input.plan).json) as HostedMigrationPlanV1,binding={repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan};operation=borrowed===undefined?prepareCanonicalMigrationOperation(binding):borrowed;const loaded=readCanonicalMigrationOperation(operation,binding);
  if(plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha)throw failure();const replay=loaded.replay;
  const rows=loaded.rows;
  if(canonicalReleaseExecutionJson(rows)!==canonicalReleaseExecutionJson(plan.migrations))throw failure();
  const boundary=replay.remaining.indexOf(posthogIntelligenceMigration),groups=loaded.groups,boundaries=loaded.boundaries,ids=['prefix','native','pre-observability','remaining'];
  const index=ids.indexOf(input.stage.id);if(index<0||boundary<0||plan.stages[index].id!==input.stage.id)throw failure();
  const pendingNames=new Set(plan.pending.map(row=>row.name));if(plan.applied.length&&!boundaries.includes(plan.applied.length)&&!(plan.priorSchemaRelease?verifyPriorSchemaPrefix(input.repoRoot,plan,operation):verifyCompletedMigrationPrefix(input.repoRoot,plan,operation))||plan.stages.some((stage,index)=>JSON.stringify(stage.names)!==JSON.stringify(groups[index].filter(name=>pendingNames.has(name)))))throw failure();const included=rows.slice(0,Math.max(plan.applied.length,boundaries[index])),before=rows.slice(0,Math.max(plan.applied.length,index?boundaries[index-1]:0)).map(row=>row.version).sort(),after=included.map(row=>row.version).sort(),pending=included.filter(row=>plan.stages[index].names.includes(row.name));
  if(canonicalReleaseExecutionJson(input.stage.included)!==canonicalReleaseExecutionJson(included)||canonicalReleaseExecutionJson(input.stage.pending)!==canonicalReleaseExecutionJson(pending)||JSON.stringify(input.stage.expectedBeforeVersions)!==JSON.stringify(before)||JSON.stringify(input.stage.expectedAfterVersions)!==JSON.stringify(after)||input.stage.configSha256!==hash(config))throw failure();
  const releaseRoot=join(root,'.local','hosted-release'),workdir=input.stage.workdir,part=relative(releaseRoot,workdir);if(!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..'))throw failure();
  await physical(root,workdir,'directory');const supabase=join(workdir,'supabase'),migrations=join(supabase,'migrations');await physical(root,migrations,'directory');await physical(root,join(supabase,'config.toml'),'file');
  if(JSON.stringify((await readdir(workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify(included.map(row=>row.name).sort())||await readFile(join(supabase,'config.toml'),'utf8')!==config)throw failure();
  for(const row of included){const file=join(migrations,row.name);await physical(root,file,'file');const bytes=await readFile(file);if(hash(bytes)!==row.sha256)throw failure();}
  readCanonicalMigrationOperation(operation,binding);return{evidence:'VERIFIED_GIT_AND_PHYSICAL_STAGE' as const,sources:loaded.sources,stageSha256:hash(JSON.stringify({included:included.map(row=>({name:row.name,version:row.version,sha256:row.sha256})),configSha256:input.stage.configSha256})),planSha256:canonicalHostedMigrationPlan(plan).sha256};
 }catch{throw failure();}finally{if(operation&&borrowed===undefined)disposeCanonicalMigrationOperation(operation);}
}
/** Shared structural proof; the public surfaces preserve each exact metadata plan boundary. */
async function admitInstalledStageMetadata(value:Parameters<typeof admitHostedMigrationStageFiles>[0],mode:'INSTALLED'|'RUNTIME'|'ORIGINAL231',borrowed?:CanonicalMigrationOperation){
 let operation:CanonicalMigrationOperation|undefined;try{
  const text=JSON.stringify(plain(value));if(Buffer.byteLength(text)>2*1024*1024)throw failure();const input=JSON.parse(text) as typeof value,root=input.repoRoot,plan=JSON.parse(canonicalHostedMigrationPlan(input.plan).json) as HostedMigrationPlanV1,stage=input.stage;
  const original231=mode==='ORIGINAL231';
  if(original231&&(JSON.stringify(Object.keys(input).sort())!==JSON.stringify(['repoRoot','sourceSha','treeSha','plan','stage'].sort())||JSON.stringify(Object.keys(stage).sort())!==JSON.stringify(['id','workdir','included','pending','expectedBeforeVersions','expectedAfterVersions','configSha256','commandArgs','materialization'].sort())))throw failure();
  if(stage.materialization!=='METADATA_ONLY'||(mode==='RUNTIME'?plan.runtimeOnly!==true:!!plan.runtimeOnly)||plan.reconciliationTemplate||(original231?!plan.original231Recovery||!plan.priorSchemaRelease||!!plan.priorCompletedRelease:!!plan.original231Recovery||!!plan.priorSchemaRelease||!plan.priorCompletedRelease)||plan.pending.length||plan.applied.length!==plan.migrations.length||plan.stages.some(stage=>stage.names.length)||plan.source.sha!==input.sourceSha||plan.source.tree!==input.treeSha||!isAbsolute(root)||resolve(root)!==root||await realpath(root)!==root||git(root,['status','--porcelain','--untracked-files=all']))throw failure();
  const binding={repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan};operation=borrowed===undefined?prepareCanonicalMigrationOperation(binding):borrowed;const loaded=readCanonicalMigrationOperation(operation,binding);if(!(original231?verifyPriorSchemaPrefix(root,plan,operation):verifyCompletedMigrationPrefix(root,plan,operation)))throw failure();
  const rows=loaded.rows,versions=rows.map(row=>row.version).sort();
  if(canonicalReleaseExecutionJson(rows)!==canonicalReleaseExecutionJson(plan.migrations)||canonicalReleaseExecutionJson(plan.applied)!==canonicalReleaseExecutionJson(rows.map(({version,sha256})=>({version,sha256})))||!plan.stages.some(current=>current.id===stage.id)||canonicalReleaseExecutionJson(stage.included)!==canonicalReleaseExecutionJson(rows)||stage.pending.length||JSON.stringify(stage.expectedBeforeVersions)!==JSON.stringify(versions)||JSON.stringify(stage.expectedAfterVersions)!==JSON.stringify(versions)||stage.configSha256!==hash(config))throw failure();
  const releaseRoot=join(root,'.local/hosted-release'),directory=join(stage.workdir,'..'),part=relative(releaseRoot,directory);
  if(!isAbsolute(stage.workdir)||resolve(stage.workdir)!==stage.workdir||!part||isAbsolute(part)||part.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..')||stage.workdir!==join(directory,stage.id))throw failure();
  const args=original231?[]:['db','push','--linked','--project-ref',plan.projectRef,'--include-all','--skip-vault','--workdir',stage.workdir,'--yes','--output-format','json'];if(JSON.stringify(stage.commandArgs)!==JSON.stringify(args))throw failure();
  await physical(root,directory,'directory');await physical(root,join(directory,'builder-state.json'),'file');
  if(JSON.stringify((await readdir(directory)).sort())!==JSON.stringify(['builder-state.json']))throw failure();
  const statePath=join(directory,'builder-state.json'),before=await lstat(statePath);if(before.size>49152)throw failure();
  const stateBytes=await readFile(statePath),state={version:1,state:'READY',sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:canonicalHostedMigrationPlan(plan).sha256,execution:'NOT_EXECUTED'};
  await physical(root,statePath,'file');const after=await lstat(statePath);
  if(stateBytes.length>49152||before.size!==after.size||before.dev!==after.dev||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||stateBytes.toString()!==JSON.stringify(state)+'\n')throw failure();
  try{await lstat(stage.workdir);throw failure();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();}
  // The ignored builder can change during the preceding filesystem awaits.
  // Recheck its exact original identity and bytes synchronously at return.
  let parent=root;for(const part of relative(root,directory).split(/[\\/]/).filter(Boolean)){parent=join(parent,part);const stat=lstatSync(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(parent)!==parent)throw failure();}
  const finalState=lstatSync(statePath);if(!finalState.isFile()||finalState.isSymbolicLink()||realpathSync(statePath)!==statePath||finalState.nlink!==1||finalState.size>49152||finalState.dev!==after.dev||finalState.ino!==after.ino||finalState.size!==after.size||finalState.mtimeMs!==after.mtimeMs||finalState.ctimeMs!==after.ctimeMs||finalState.mode!==after.mode||!readFileSync(statePath).equals(stateBytes)||JSON.stringify(readdirSync(directory).sort())!==JSON.stringify(['builder-state.json']))throw failure();
  try{lstatSync(stage.workdir);throw failure();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();}
  const final=readCanonicalMigrationOperation(operation,binding);if(canonicalReleaseExecutionJson(final.provenance)!==canonicalReleaseExecutionJson(loaded.provenance)||git(root,['status','--porcelain','--untracked-files=all']))throw failure();
  return{sources:loaded.sources,stageSha256:hash(JSON.stringify({included:rows,configSha256:stage.configSha256})),planSha256:canonicalHostedMigrationPlan(plan).sha256};
 }catch{throw failure();}finally{if(operation&&borrowed===undefined)disposeCanonicalMigrationOperation(operation);}
}
/** Complete inactive installed source metadata only. Cannot admit SQL or runtime-only plans. */
export async function admitInstalledMigrationStageMetadata(value:Parameters<typeof admitHostedMigrationStageFiles>[0],borrowed?:CanonicalMigrationOperation){
 return{...await admitInstalledStageMetadata(value,'INSTALLED',borrowed),evidence:'VERIFIED_GIT_AND_INSTALLED_STAGE_METADATA' as const};
}
/** Exact runtime-only installed metadata. No SQL files, provider reads or native effect authority. */
export async function admitInstalledRuntimeStageMetadata(value:Parameters<typeof admitHostedMigrationStageFiles>[0],borrowed?:CanonicalMigrationOperation){
 return{...await admitInstalledStageMetadata(value,'RUNTIME',borrowed),evidence:'VERIFIED_GIT_AND_INSTALLED_RUNTIME_STAGE_METADATA' as const};
}
/** Closed original231 observation input only; no SQL, CLI or native effect admission. */
export async function admitOriginal231ObservationStageMetadata(value:Parameters<typeof admitHostedMigrationStageFiles>[0],borrowed?:CanonicalMigrationOperation){
 return{...await admitInstalledStageMetadata(value,'ORIGINAL231',borrowed),evidence:'VERIFIED_GIT_AND_ORIGINAL231_OBSERVATION_METADATA' as const};
}
/** Re-admit a source-derived child without granting an intermediate prefix execution authority. */
export async function admitHostedMigrationBatchFiles(value:{repoRoot:string;sourceSha:string;treeSha:string;plan:HostedMigrationPlanV1;stage:HostedMigrationWorkdirs['stages'][number];batch:HostedMigrationBatchWorkdir},borrowed?:CanonicalMigrationOperation){
 let operation:CanonicalMigrationOperation|undefined;try{
  const text=JSON.stringify(plain(value));if(Buffer.byteLength(text)>2*1024*1024)throw failure();const input=JSON.parse(text) as typeof value,plan=JSON.parse(canonicalHostedMigrationPlan(input.plan).json) as HostedMigrationPlanV1,binding={repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan};operation=borrowed===undefined?prepareCanonicalMigrationOperation(binding):borrowed;readCanonicalMigrationOperation(operation,binding);const parent=await admitHostedMigrationStageFiles({repoRoot:input.repoRoot,sourceSha:input.sourceSha,treeSha:input.treeSha,plan,stage:input.stage},operation);
  const derived=deriveCanonicalHostedMigrationBatches({...binding,stage:input.stage},operation),batch=input.batch; if(!Number.isSafeInteger(batch.index)||batch.index<1)throw failure();const expected=derived.batches[batch.index-1];if(!expected||batch.index!==expected.index||parent.stageSha256!==derived.stageSha256)throw failure();
  const keys=['index','workdir','pending','cumulativeIncluded','expectedBeforeVersions','expectedAfterVersions','configSha256','batchSha256','manifestPath','manifestSha256','commandArgs'].sort();if(JSON.stringify(Object.keys(batch).sort())!==JSON.stringify(keys)||canonicalReleaseExecutionJson(batch.pending)!==canonicalReleaseExecutionJson(expected.pending)||canonicalReleaseExecutionJson(batch.cumulativeIncluded)!==canonicalReleaseExecutionJson(expected.cumulativeIncluded)||JSON.stringify(batch.expectedBeforeVersions)!==JSON.stringify(expected.expectedBeforeVersions)||JSON.stringify(batch.expectedAfterVersions)!==JSON.stringify(expected.expectedAfterVersions)||batch.configSha256!==hash(config)||batch.batchSha256!==expected.sha256)throw failure();
  const root=input.repoRoot,releaseRoot=join(root,'.local','hosted-release'),deliveryRoot=resolve(batch.workdir,'..'),part=relative(releaseRoot,deliveryRoot),number=String(batch.index).padStart(3,'0');if(!part||isAbsolute(part)||part.split(/[\\/]/).length!==1||!/^batches-[a-f0-9-]{36}$/.test(part)||batch.workdir!==join(deliveryRoot,'batch-'+number)||batch.manifestPath!==join(deliveryRoot,'batch-'+number+'.manifest.json')||JSON.stringify(batch.commandArgs)!==JSON.stringify(['db','push','--linked','--project-ref',plan.projectRef,'--include-all','--skip-vault','--workdir',batch.workdir,'--yes','--output-format','json']))throw failure();
  await physical(root,deliveryRoot,'directory');await physical(root,join(deliveryRoot,'builder-state.json'),'file');const stateBytes=await readFile(join(deliveryRoot,'builder-state.json'));if(stateBytes.length>49152)throw failure();const state={version:1,purpose:'CUEVO_HOSTED_MIGRATION_BATCH_DELIVERY',state:'READY',sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:parent.planSha256,stageId:input.stage.id,stageSha256:derived.stageSha256,sourceSetSha256:derived.sourceSetSha256,batchCount:derived.batches.length,execution:'NOT_EXECUTED'};if(stateBytes.toString()!==JSON.stringify(state)+'\n')throw failure();
  const expectedNames=['builder-state.json',...derived.batches.flatMap(batch=>['batch-'+String(batch.index).padStart(3,'0'),'batch-'+String(batch.index).padStart(3,'0')+'.manifest.json'])].sort();if(JSON.stringify((await readdir(deliveryRoot)).sort())!==JSON.stringify(expectedNames))throw failure();
  await physical(root,batch.manifestPath,'file');const manifestBytes=await readFile(batch.manifestPath);if(manifestBytes.length>2*1024*1024||hash(manifestBytes)!==batch.manifestSha256)throw failure();const manifest={version:1,purpose:'CUEVO_HOSTED_MIGRATION_BATCH',sourceSha:input.sourceSha,treeSha:input.treeSha,planSha256:parent.planSha256,stageId:input.stage.id,stageSha256:derived.stageSha256,sourceSetSha256:derived.sourceSetSha256,index:batch.index,batchSha256:expected.sha256,pending:expected.pending,cumulativeIncluded:expected.cumulativeIncluded,expectedBeforeVersions:expected.expectedBeforeVersions,expectedAfterVersions:expected.expectedAfterVersions,configSha256:hash(config),execution:'NOT_EXECUTED'};if(manifestBytes.toString()!==canonicalReleaseExecutionJson(manifest)+'\n')throw failure();
  await physical(root,batch.workdir,'directory');const supabase=join(batch.workdir,'supabase'),migrations=join(supabase,'migrations');await physical(root,migrations,'directory');await physical(root,join(supabase,'config.toml'),'file');if(JSON.stringify((await readdir(batch.workdir)).sort())!==JSON.stringify(['supabase'])||JSON.stringify((await readdir(supabase)).sort())!==JSON.stringify(['config.toml','migrations'])||JSON.stringify((await readdir(migrations)).sort())!==JSON.stringify(expected.cumulativeIncluded.map(row=>row.name).sort())||await readFile(join(supabase,'config.toml'),'utf8')!==config)throw failure();
  for(const row of expected.cumulativeIncluded){const path=join(migrations,row.name);await physical(root,path,'file');if(hash(await readFile(path))!==row.sha256)throw failure();}
  readCanonicalMigrationOperation(operation,binding);return{evidence:'VERIFIED_GIT_AND_PHYSICAL_BATCH' as const,sources:parent.sources,stageSha256:parent.stageSha256,planSha256:parent.planSha256,batchSha256:expected.sha256,manifestSha256:batch.manifestSha256,index:batch.index};
 }catch{throw failure();}finally{if(operation&&borrowed===undefined)disposeCanonicalMigrationOperation(operation);}
}
