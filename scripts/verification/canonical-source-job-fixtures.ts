import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {Readable} from 'node:stream';
import {canonicalReleaseExecutionJson} from './release-review';
import {ciSourceJobs,ciRuntimeJobs,ciDatabaseJob} from './verification-workflows';
import {criticalBrowserFiles} from './verification-profiles';
import {runtimeLaneEvidence,runtimeLaneSteps} from './runtime-lanes';
import {readCiPartitionCoverage} from './ci-partition-coverage';
import {integrationIdentity,integrationPartitionIds} from './integration-partitions';
import {fullIntegrationFiles,integrationExclusions,criticalIntegrationFiles} from './verification-profiles';

const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
type CheckoutMutation='head'|'replace'|'graft'|'dirty'|'historical-head';
export type CanonicalMetadataMutation=
 |{kind:'RUN_ATTEMPT_DRIFT'|'LAST_RUNTIME_ARTIFACT_DRIFT'|'DATABASE_METADATA_DRIFT'|'TREE_DRIFT'|'PAGE_COUNT'|'PAGE_EMPTY'|'WRONG_MAIN'|'JOB_DRIFT'|'PRIVATE_ERROR'|'REFRESH_UNRELATED_RUNTIME'|'FINAL_RUNTIME_EXPIRY'|'FINAL_SCHEMA_EXPIRY'}
 |{kind:'GUARDED_RUNTIME';mode:'source-artifact'|'runtime-artifact'|'expiry'|'job'|'run'}
 |{kind:'GUARDED_SCHEMA';mode:'source'|'database'|'security'|'job'|'run'}
 |{kind:'CHECKOUT';boundary:'run'|'jobs'|'main';reads:2|3|5;mutation:CheckoutMutation};
type CanonicalFixtureOptions={metadataMutation?:CanonicalMetadataMutation;artifactMutation?:'FORBIDDEN'|'INVALID_JSON';archiveName?:string;noncanonical?:boolean;sourcePurpose?:'CURRENT_SOURCE'|'ORIGINAL_RUNTIME_METADATA';advanceCheckout?:boolean;advanceIntegrationInventory?:boolean;guarded?:boolean;guardMutation?:CanonicalMetadataMutation};

// These executable bodies are fixed repository-authored test code. Paths, source
// identities, fixture rows and negative modes travel through JSON, never syntax.
const fixtureHookSource=String.raw`
import{registerHooks}from'node:module';import{fileURLToPath}from'node:url';
process.env.CUEVO_CANONICAL_FIXTURE_CONFIG=fileURLToPath(new URL('./hook-input.json',import.meta.url));
const stepsSource="import{readFileSync}from'node:fs';const input=JSON.parse(readFileSync(process.env.CUEVO_CANONICAL_FIXTURE_CONFIG,'utf8')),original=await import(input.stepsUrl+'?fixture-original');export const verificationSteps=original.verificationSteps,routineVerificationSteps=original.routineVerificationSteps,fullRuntimeVerificationSteps=original.fullRuntimeVerificationSteps,mainStagingVerificationSteps=original.mainStagingVerificationSteps,commandArgs=original.commandArgs,statelessVerificationSteps=input.steps;";
const coverageSource="import{readFileSync}from'node:fs';const input=JSON.parse(readFileSync(process.env.CUEVO_CANONICAL_FIXTURE_CONFIG,'utf8')),coverage=input.coverage;export const readCiPartitionCoverage=()=>coverage;export const ciPartitionFiles=(_value,scope,id,profile)=>{const files=coverage[scope].find(row=>row.id===id).files;return profile==='critical'?files.filter(path=>input.criticalIntegrationFiles.includes(path)):files;};";
registerHooks({load(url,context,next){if(url.endsWith('/steps.ts'))return{format:'module',shortCircuit:true,source:stepsSource};if(url.endsWith('/ci-partition-coverage.ts'))return{format:'module',shortCircuit:true,source:coverageSource};return next(url,context);}});
`;
const fixtureProjectionSource=String.raw`
import{readFileSync}from'node:fs';
const input=JSON.parse(readFileSync(process.env.CUEVO_CANONICAL_PROJECTION_INPUT,'utf8'));
const{readCiPartitionCoverage}=await import(input.coverageUrl),{integrationPartitionReceipt}=await import(input.integrationUrl),{technicalAggregateReceipt}=await import(input.runtimeUrl);
const coverage=readCiPartitionCoverage(process.cwd()),partitions=input.partitionBodies.map(value=>integrationPartitionReceipt(value,coverage));
console.log(JSON.stringify({partitions,aggregate:technicalAggregateReceipt(input.lanes,partitions,input.identity,coverage)}));
`;
const fixtureReaderSource=String.raw`
import{readFileSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';
const input=JSON.parse(readFileSync(process.env.CUEVO_CANONICAL_READER_INPUT,'utf8'));
const mutation=input.options.guardMutation??input.options.metadataMutation;
if(mutation){
 const simple=['RUN_ATTEMPT_DRIFT','LAST_RUNTIME_ARTIFACT_DRIFT','DATABASE_METADATA_DRIFT','TREE_DRIFT','PAGE_COUNT','PAGE_EMPTY','WRONG_MAIN','JOB_DRIFT','PRIVATE_ERROR','REFRESH_UNRELATED_RUNTIME','FINAL_RUNTIME_EXPIRY','FINAL_SCHEMA_EXPIRY'];
 const valid=simple.includes(mutation.kind)||mutation.kind==='GUARDED_RUNTIME'&&['source-artifact','runtime-artifact','expiry','job','run'].includes(mutation.mode)||mutation.kind==='GUARDED_SCHEMA'&&['source','database','security','job','run'].includes(mutation.mode)||mutation.kind==='CHECKOUT'&&['run','jobs','main'].includes(mutation.boundary)&&[2,3,5].includes(mutation.reads)&&['head','replace','graft','dirty','historical-head'].includes(mutation.mutation);
 if(!valid){console.error('FIXTURE_MODE_INVALID');throw Error('Unknown fixture metadata mode');}
}
if(!['runtime','schema'].includes(input.mode)||!['CURRENT_SOURCE','ORIGINAL_RUNTIME_METADATA'].includes(input.options.sourcePurpose??'CURRENT_SOURCE')||input.options.artifactMutation&&!['FORBIDDEN','INVALID_JSON'].includes(input.options.artifactMutation)){console.error('FIXTURE_MODE_INVALID');throw Error('Unknown fixture reader mode');}
const subject=await import(input.subject),read=input.mode==='runtime'?(input.options.guarded?subject.readCanonicalRuntimeJobsAndGuard:subject.readCanonicalRuntimeJobs):(input.options.guarded?subject.readCanonicalSchemaJobsAndGuard:subject.observeCanonicalSchemaJobs);
const counts=new Map();let refreshing=false,archiveReads=0;
function mutate(path,reads,value){
 const mutation=input.options.guardMutation??input.options.metadataMutation;if(!mutation)return value;
 const reached=()=>console.error('FIXTURE_METADATA_'+mutation.kind);
 const artifacts=fn=>({...value,artifacts:value.artifacts.map(fn)}),jobs=fn=>({...value,jobs:value.jobs.map(fn)});
 switch(mutation.kind){
  case'RUN_ATTEMPT_DRIFT':if(path==='actions/runs/31'&&reads>1){reached();return{...value,run_attempt:3};}break;
  case'LAST_RUNTIME_ARTIFACT_DRIFT':if(path.includes('/artifacts?')&&reads===4){reached();return artifacts(row=>row.name==='cuevo-runtime-aggregate-31-2'?{...row,digest:'sha256:'+'0'.repeat(64)}:row);}break;
  case'DATABASE_METADATA_DRIFT':if(path.includes('artifacts?')&&reads>1){reached();return artifacts(row=>row.id===75?{...row,id:99}:row);}break;
  case'TREE_DRIFT':if(path.startsWith('git/commits/')&&reads>1){reached();return{...value,tree:{sha:'d'.repeat(40)}};}break;
  case'PAGE_COUNT':if(path.includes('jobs?')){reached();return{...value,total_count:value.total_count+1};}break;
  case'PAGE_EMPTY':if(path.includes('jobs?')){reached();return{...value,jobs:[]};}break;
  case'WRONG_MAIN':if(path==='git/ref/heads/main'){reached();return{object:{type:'commit',sha:'b'.repeat(40)}};}break;
  case'JOB_DRIFT':if(path.includes('jobs?')&&reads>1){reached();return jobs(row=>row.name==='database-checks'?{...row,conclusion:'failure'}:row);}break;
  case'PRIVATE_ERROR':reached();throw Error('PRIVATE credential');
  case'REFRESH_UNRELATED_RUNTIME':if(refreshing&&path.includes('/jobs?')){reached();return{...value,jobs:[...value.jobs,{id:999,name:'runtime-backend',run_id:31,run_attempt:2,head_sha:input.run.head_sha,head_branch:'main',status:'in_progress',conclusion:null,started_at:null,completed_at:null,steps:[]}],total_count:value.total_count+1};}break;
  case'FINAL_RUNTIME_EXPIRY':case'FINAL_SCHEMA_EXPIRY':if(refreshing&&path===(mutation.kind==='FINAL_RUNTIME_EXPIRY'?'actions/runs/31':'git/ref/heads/main')){reached();console.error(mutation.kind==='FINAL_RUNTIME_EXPIRY'?'FINAL_ORIGINAL_ARTIFACT_EXPIRED':'FINAL_SCHEMA_ARTIFACT_EXPIRED');Date.now=()=>Date.parse('2026-11-02T00:00:00Z');}break;
  case'GUARDED_RUNTIME':case'GUARDED_SCHEMA':{
   if(!refreshing)break;const mode=mutation.mode;
   if(mode==='run'&&path==='actions/runs/31'){reached();return{...value,run_attempt:3};}
   if(mode==='job'&&path.includes('/jobs?')){reached();return jobs(row=>row.name===(mutation.kind==='GUARDED_RUNTIME'?'runtime-backend':'source-contracts')?{...row,conclusion:'failure'}:row);}
   if(path.includes('/artifacts?')&&!['run','job'].includes(mode)){
    reached();const name=mutation.kind==='GUARDED_RUNTIME'?(mode==='source-artifact'?'cuevo-source-contracts-31-2':'cuevo-runtime-aggregate-31-2'):(mode==='source'?'cuevo-source-contracts-31-2':mode==='database'?'cuevo-runtime-database-31-2':'cuevo-codeql-31-2');
    return artifacts(row=>row.name===name?{...row,...(mode==='expiry'?{expires_at:'2026-10-01T00:00:00Z'}:{digest:'sha256:'+'0'.repeat(64)})}:row);
   }break;
  }
  case'CHECKOUT':{
   const matches=mutation.boundary==='run'?path==='actions/runs/31':mutation.boundary==='main'?path==='git/ref/heads/main':path.includes('/jobs?');if(!matches||reads!==mutation.reads)break;
   reached();const git=args=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}),historical=mutation.mutation==='historical-head';console.error(historical?'LATE_HISTORICAL_CHECKOUT_MUTATION':'LATE_OUTER_CHECKOUT_MUTATION');
   if(mutation.mutation==='head'||historical){const file=historical?'changed-current.txt':'late-source.txt';writeFileSync(file,historical?'changed current checkout':'changed source');git(['add',file]);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m',historical?'Late historical observer checkout change':'Late source change']);}
   if(mutation.mutation==='replace')git(['update-ref','refs/replace/'+input.run.head_sha,input.run.head_sha]);
   if(mutation.mutation==='graft')writeFileSync(git(['rev-parse','--git-path','info/grafts']).trim(),'untrusted graft');
   if(mutation.mutation==='dirty')writeFileSync('late-untracked.txt','unreviewed source');break;
  }
  default:throw Error('Unknown fixture metadata mode');
 }return value;
}
const github=async path=>{const reads=(counts.get(path)??0)+1;counts.set(path,reads);const value=path==='git/ref/heads/main'?{object:{type:'commit',sha:input.run.head_sha}}:path==='git/commits/'+input.run.head_sha?{sha:input.run.head_sha,tree:{sha:input.tree}}:path==='actions/runs/31'?input.run:path.includes('artifacts?')?{total_count:input.artifacts.length,artifacts:input.artifacts}:path.startsWith('actions/workflows/')?{total_count:1,workflow_runs:[input.run]}:{total_count:input.jobs.length,jobs:input.jobs};return mutate(path,reads,value);};
try{
 console.error('FIXTURE_CANONICAL_READER_ENTERED');
 const archive=async id=>{archiveReads++;if(input.options.artifactMutation){console.error('FIXTURE_ARTIFACT_'+input.options.artifactMutation);if(input.options.artifactMutation==='FORBIDDEN')throw Error('Artifact download forbidden while pending');if(input.options.artifactMutation==='INVALID_JSON')return Buffer.from('{}');throw Error('Unknown fixture artifact mode');}return Buffer.from(input.archives[String(id)],'base64');};
 const result=await(input.mode==='runtime'?read(input.run,github,archive,input.options.sourcePurpose??'CURRENT_SOURCE'):read(input.run,github,archive));
 if(input.options.guarded){const originalReads=archiveReads;refreshing=true;await result.refreshOriginalMetadata();result.assertOriginalValidity();if(archiveReads!==originalReads)throw Error('Metadata refresh downloaded archives again');console.log(JSON.stringify({...result.proof,archiveReads}));}else console.log(JSON.stringify(result));
}catch(error){console.error(String(error));process.exitCode=1;}
`;
const ids=['source-native','source-contracts','source-delivery'];
const {yazl}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle')as{yazl:{ZipFile:new()=>{outputStream:Readable;addBuffer(bytes:Buffer,name:string):void;end():void}}};
async function zip(value:unknown){const archive=new yazl.ZipFile(),parts:Buffer[]=[],done=new Promise<Buffer>((yes,no)=>{archive.outputStream.on('data',part=>parts.push(part));archive.outputStream.on('error',no);archive.outputStream.on('end',()=>yes(Buffer.concat(parts)));});archive.addBuffer(Buffer.from(canonicalReleaseExecutionJson(value)),'result.json');archive.end();return done;}

/** Controlled real Git/ZIP fixture shared only by canonical reader tests. */
export async function createCanonicalSourceJobFixture(){
 const root=await mkdtemp(join(tmpdir(),'cuevo-canonical-source-'));
 try{
  const files=ids.map((_,index)=>`scripts/verification/source-${index}.test.ts`),steps=files.map((path,index)=>({name:'source-'+index,args:['--import','tsx','--test',path]}));
  await mkdir(join(root,'scripts/verification'),{recursive:true});await mkdir(join(root,'.local'));await writeFile(join(root,'.gitignore'),'.local/\n');await writeFile(join(root,'.gitattributes'),'* -text\n');await writeFile(join(root,'package-lock.json'),'{}\n');
  for(const file of files)await writeFile(join(root,file),'one exact committed source\n');const separate=['pilot-evidence','pilot-private-cleanup','pilot-window-rules','pilot-window','pilot-workflow-contracts','secret-scan-policy','secret-scan'].map(name=>'scripts/verification/'+name+'.test.ts');for(const file of separate)await writeFile(join(root,file),'separate exact source fixture\n');for(const policy of ['scripts/verification/stateless-checks.ts','scripts/verification/stateless-source-aggregate.ts','scripts/verification/ci-test-timings-reporter.ts','scripts/verification/ci-test-timings.ts','scripts/verification/ci-partition-coverage.ts','scripts/verification/release-review.ts','scripts/verification/runtime-lanes.ts','scripts/verification/integration-partitions.ts','scripts/verification/verification-profiles.ts','scripts/verification/steps.ts'])await writeFile(join(root,policy),await readFile(resolve(policy)));await mkdir(join(root,'.github/workflows'),{recursive:true});const yaml=createRequire(import.meta.url)('js-yaml')as{dump(value:unknown):string};await writeFile(join(root,'.github/workflows/ci.yml'),yaml.dump({jobs:{...ciSourceJobs,...ciRuntimeJobs,'database-checks':ciDatabaseJob}}));
  const currentCoverage=readCiPartitionCoverage(resolve('.'));await mkdir(join(root,'apps/api/test/integration'),{recursive:true});for(const path of [...fullIntegrationFiles(),...integrationExclusions.map(row=>row.file)])await writeFile(join(root,path),await readFile(resolve(path)));const manifest={version:1,purpose:'CUEVO_FIXED_CI_PARTITIONS',source:ids.map((id,index)=>({id,files:[files[index]]})),integration:currentCoverage.integration,separateSource:separate.map(file=>({file,reason:file.includes('secret-scan')?'SEPARATE_SECRET_SCANNER_OWNER':'SEPARATE_PILOT_ACCEPTANCE'})),separateIntegration:currentCoverage.separateIntegration,nonTestChecks:[],measurements:{source:[],integration:[],provenance:{sourceSha:'a'.repeat(40),runId:'31',runAttempt:2,basis:'ORIGINAL_CASE_FILE_DURATION'}}};await writeFile(join(root,'scripts/verification/ci-partitions.json'),JSON.stringify(manifest)+'\n');
  const git=(args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true}).trim();git(['init','--quiet']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Exact source fixture']);const sourceSha=git(['rev-parse','HEAD']),treeSha=git(['rev-parse','HEAD^{tree}']);
  const coverage={...manifest,manifestSha256:hash(await readFile(join(root,'scripts/verification/ci-partitions.json'))),effectAuthority:false,timeTargetAchieved:false},all=git(['ls-files','-z']).split('\0').filter(Boolean).sort(),descriptors=await Promise.all(all.map(async path=>({path,sha256:hash(await readFile(join(root,path)))}))),sourceLockSha256=hash(await readFile(join(root,'package-lock.json'))),nodeVersion='v24.16.0',nodeBinarySha256='c'.repeat(64),identity={repository:'owner/repo',sourceSha,treeSha,sourceDigest:hash(JSON.stringify(descriptors)),sourceLockSha256,partitionManifestSha256:coverage.manifestSha256,nodeVersion,nodeBinarySha256,toolchainSha256:hash(canonicalReleaseExecutionJson({nodeVersion,nodeBinarySha256,sourceLockSha256,platform:'linux',arch:'x64'})),environmentPolicySha256:hash(canonicalReleaseExecutionJson({CI:'true',NEXT_TELEMETRY_DISABLED:'1',SCARF_ANALYTICS:'false',CUEVO_REQUIRE_LIVE_INTELLIGENCE:'0',fileConcurrency:'NODE_DEFAULT_PROCESS_ISOLATION',partitionManifestSha256:coverage.manifestSha256})),runId:'31',runAttempt:2,job:'source-contracts'};
  const receipts=ids.map((partition,index)=>{const body={version:1,purpose:'CUEVO_STATELESS_SOURCE_PARTITION',partition,status:'PASSED',identity:{...identity,job:'source-fixtures-'+partition.slice(7)},files:[{path:files[index],sha256:descriptors.find(row=>row.path===files[index])!.sha256,group:steps[index].name,durationMs:1,cases:[{definitionSha256:'d'.repeat(64),outcome:'PASSED'}]}],startedAtMs:Date.parse('2026-10-08T00:00:10Z'),completedAtMs:Date.parse('2026-10-08T00:00:50Z'),exitCode:0,signal:null,frozenBefore:true,frozenAfter:true,cleanupConfirmed:true,reasons:[]};return{...body,payloadSha256:hash(canonicalReleaseExecutionJson(body))};});
  const summary={version:1,purpose:'CUEVO_PARTITIONED_SOURCE_CONTRACTS',status:'PASSED',identity,partitions:receipts.map(row=>({partition:row.partition,job:row.identity.job,payloadSha256:row.payloadSha256,receiptSha256:hash(canonicalReleaseExecutionJson(row))})).sort((a,b)=>a.partition.localeCompare(b.partition)),files:receipts.flatMap(row=>row.files).sort((a,b)=>a.path.localeCompare(b.path)),checks:[]};
  const bodies=[summary,...receipts],archives=await Promise.all(bodies.map(zip)),jobs=['source-contracts',...ids.map(id=>'source-fixtures-'+id.slice(7))].map((name,index)=>({id:index+1,name,run_id:31,run_attempt:2,head_sha:sourceSha,head_branch:'main',status:'completed',conclusion:'success',started_at:index?'2026-10-08T00:00:00Z':'2026-10-08T00:01:00Z',completed_at:index?'2026-10-08T00:01:00Z':'2026-10-08T00:02:00Z'})),artifacts=archives.map((bytes,index)=>({id:71+index,name:index?`cuevo-source-partition-${ids[index-1]}-31-2`:'cuevo-source-contracts-31-2',size_in_bytes:bytes.length,expired:false,digest:'sha256:'+hash(bytes),created_at:index?'2026-10-08T00:00:55Z':'2026-10-08T00:01:50Z',expires_at:'2026-10-21T00:00:00Z',workflow_run:{id:31,head_sha:sourceSha,head_branch:'main'}}));
  const hook=join(root,'.local/hook.mjs'),hookInput=join(root,'.local/hook-input.json');await writeFile(hookInput,JSON.stringify({stepsUrl:pathToFileURL(resolve('scripts/verification/steps.ts')).href,steps,coverage,criticalIntegrationFiles}));await writeFile(hook,fixtureHookSource);

  return {root,sourceSha,treeSha,coverage,identity,receipts,summary,jobs,artifacts,archives,hook,hookInput,files,steps,zip,async destroy(){await rm(root,{recursive:true,force:true});}};
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}

/** Every reader runs in a separate actual checkout; no process-wide chdir. */
export async function runCanonicalJobFixture(mode:'schema'|'runtime',scenario:(value:{run:Record<string,unknown>;jobs:Record<string,unknown>[];artifacts:Record<string,unknown>[];bodies:unknown[]})=>void=()=>undefined,options:CanonicalFixtureOptions={}){
 const fixture=await createCanonicalSourceJobFixture();
 try{
  const source=fixture.sourceSha,tree=fixture.treeSha,repository='owner/repo',run:Record<string,unknown>={id:31,run_attempt:2,head_sha:source,head_branch:'main',event:'push',path:'.github/workflows/ci.yml',status:mode==='runtime'?'completed':'in_progress',conclusion:mode==='runtime'?'success':null,repository:{full_name:repository}},setup=['Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1','Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020','Run npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund','Run npm ci --ignore-scripts --no-audit --no-fund','Run node node_modules/esbuild/install.js'];
  const contracts={...(mode==='runtime'?ciRuntimeJobs:{}),...ciSourceJobs,'database-checks':ciDatabaseJob},policies={...Object.fromEntries(Object.entries(contracts).map(([name,job])=>[name,job.steps.map(step=>'name'in step?step.name:'Run '+('uses'in step?step.uses:step.run))])),codeql:[...setup,'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2','Run github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2','Require current processed CodeQL security findings to be clear','Retain original processed CodeQL receipt'],'secret-scan':[...setup,'Verify pinned scanner and scan full history plus authored worktree','Scan full history plus authored worktree'],...(mode==='runtime'?{required:['Require every verification boundary']}:{})},jobs:Record<string,unknown>[]=Object.entries(policies).map(([name,steps],index)=>({id:100+index,name,run_id:31,run_attempt:2,head_sha:source,head_branch:'main',status:'completed',conclusion:'success',started_at:name==='source-contracts'?'2026-10-08T00:01:00Z':'2026-10-08T00:00:00Z',completed_at:'2026-10-08T00:02:00Z',steps:steps.map((name,number)=>({name,number:number+1,status:'completed',conclusion:'success'}))}));
  const lane=runtimeLaneEvidence({repository,sourceSha:source,treeSha:tree,sourceDigest:fixture.identity.sourceDigest,githubRunId:'31',runAttempt:2,profile:'main-staging',browserFiles:[...criticalBrowserFiles],lane:'database',rows:[...runtimeLaneSteps('main-staging','database').map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]}),security={version:1,purpose:'ORIGINAL_PROCESSED_CODEQL_RECEIPT',policy:'CODEQL_MEDIUM_HIGH_CRITICAL_V1',repository,sourceSha:source,ref:'refs/heads/main',runId:'31',runAttempt:2,observedAt:'2026-10-08T00:01:00Z',analysis:{id:20,sarifId:'01234567-89ab-cdef-0123-456789abcdef',key:'.github/workflows/ci.yml:codeql',toolVersion:'2.27.1',createdAt:'2026-10-08T00:00:30Z'},result:{check:'codeql-open-security-alerts',status:'VERIFIED',analysisResults:0,analysisRules:87,openAlerts:0,blockingAlerts:0,severities:{low:0,medium:0,high:0,critical:0,nonsecurity:0},snapshotPasses:2}},bodies:unknown[]=[fixture.summary,...fixture.receipts,lane,security],artifacts:Record<string,unknown>[]=[...fixture.artifacts,{id:75,name:'cuevo-runtime-database-31-2',size_in_bytes:1,expired:false,digest:'sha256:'+'a'.repeat(64),created_at:'2026-10-08T00:01:10Z',expires_at:'2026-10-21T00:00:00Z',workflow_run:{id:31,head_sha:source,head_branch:'main'}},{id:76,name:'cuevo-codeql-31-2',size_in_bytes:1,expired:false,digest:'sha256:'+'a'.repeat(64),created_at:'2026-10-08T00:01:10Z',expires_at:'2026-10-21T00:00:00Z',workflow_run:{id:31,head_sha:source,head_branch:'main'}}];
  if(mode==='runtime'){
   const browserFiles=[...criticalBrowserFiles],common={repository,sourceSha:source,treeSha:tree,sourceDigest:fixture.identity.sourceDigest,githubRunId:'31',runAttempt:2,profile:'main-staging' as const,browserFiles};
   const lanes=(['backend','browser','database']as const).map(lane=>runtimeLaneEvidence({...common,lane,rows:[...runtimeLaneSteps('main-staging',lane).map(step=>({name:step.name,exitCode:0,required:true as const,durationMs:1})),{name:'source-freeze',exitCode:0,required:true as const,durationMs:1}]}));
   const integrationContext=integrationIdentity({...common,sourceLockSha256:fixture.identity.sourceLockSha256,partitionManifestSha256:fixture.coverage.manifestSha256,nodeVersion:'v24.16.0',nodeBinarySha256:'c'.repeat(64),platform:'linux',arch:'x64'});
   const partitionBodies=integrationPartitionIds.map(partition=>{const files=fixture.coverage.integration.find(row=>row.id===partition)!.files;return {identity:{...integrationContext,job:partition},partition,scope:'integration',files:files.map(path=>({path,sha256:hash(readFileSync(join(fixture.root,path))),durationMs:1,cases:[{definitionSha256:hash(path),outcome:'PASSED',retryCount:0,repeatCount:0}]})),inventorySha256:hash(partition+'inventory'),reportSha256:hash(partition+'report'),diagnosticsSha256:hash(partition+'diagnostics'),startedAtMs:Date.parse('2026-10-08T00:00:10Z'),completedAtMs:Date.parse('2026-10-08T00:00:50Z'),executionStartedAtMs:Date.parse('2026-10-08T00:00:20Z'),executionCompletedAtMs:Date.parse('2026-10-08T00:00:40Z'),exitCode:0,signal:null,rows:['clean-bootstrap','integration','demo-seed-restore','owned-stack-stop','source-freeze'].map(name=>({name,exitCode:0,required:true,durationMs:1})),processesStopped:true,sourceUnchanged:true,cleanupBasis:'CLI_STOP_EXIT_SUCCESS',reasons:[]};});
   const projectionInput=join(fixture.root,'.local/runtime-projection-input.json'),projectionScript=join(fixture.root,'.local/runtime-projection.mjs');await writeFile(projectionInput,JSON.stringify({partitionBodies,lanes,identity:integrationContext,coverageUrl:pathToFileURL(resolve('scripts/verification/ci-partition-coverage.ts')).href,integrationUrl:pathToFileURL(resolve('scripts/verification/integration-partitions.ts')).href,runtimeUrl:pathToFileURL(resolve('scripts/verification/runtime-lanes.ts')).href}));
   await writeFile(projectionScript,fixtureProjectionSource);
   const projected=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(fixture.hook).href,projectionScript],{cwd:fixture.root,encoding:'utf8',env:{...process.env,CUEVO_CANONICAL_FIXTURE_CONFIG:fixture.hookInput,CUEVO_CANONICAL_PROJECTION_INPUT:projectionInput}});if(projected.status!==0)throw Error('Runtime metadata fixture projection failed: '+projected.stderr);const projection=JSON.parse(projected.stdout)as{partitions:unknown[];aggregate:unknown};
   bodies.push(lanes[0],lanes[1],...projection.partitions,projection.aggregate);
   const names=['cuevo-runtime-backend-31-2','cuevo-runtime-browser-31-2','cuevo-integration-integration-learning-31-2','cuevo-integration-integration-state-31-2','cuevo-runtime-aggregate-31-2'];
   for(const[index,name]of names.entries())artifacts.push({id:77+index,name,size_in_bytes:1,expired:false,digest:'sha256:'+'a'.repeat(64),created_at:'2026-10-08T00:01:50Z',expires_at:'2026-11-01T00:00:00Z',workflow_run:{id:31,head_sha:source,head_branch:'main'}});
   jobs.find(row=>row.name==='technical-mvp')!.started_at='2026-10-08T00:01:00Z';
  }
  scenario({run,jobs,artifacts,bodies});const archives:Record<string,string>={};for(const[index,body]of bodies.entries()){const name=index===4||index===6||index===7?(options.archiveName??'lane.json'):index===5?'receipt.json':'result.json',archive=new yazl.ZipFile(),parts:Buffer[]=[],done=new Promise<Buffer>((yes,no)=>{archive.outputStream.on('data',part=>parts.push(part));archive.outputStream.on('error',no);archive.outputStream.on('end',()=>yes(Buffer.concat(parts)));});archive.addBuffer(Buffer.from(index===4&&options.noncanonical?JSON.stringify(body):canonicalReleaseExecutionJson(body)),name);archive.end();const bytes=await done;archives[String(71+index)]=bytes.toString('base64');const item=artifacts.find(row=>row.id===71+index);if(item){item.size_in_bytes=bytes.length;item.digest='sha256:'+hash(bytes);}}
  if(options.advanceCheckout||options.advanceIntegrationInventory){const git=(args:string[])=>execFileSync('git',['-C',fixture.root,...args],{encoding:'utf8',windowsHide:true}).trim();await writeFile(join(fixture.root,'current-source.txt'),'Reviewed new checkout source\n');if(options.advanceIntegrationInventory){const path='apps/api/test/integration/new-current.test.ts',manifest=JSON.parse(await readFile(join(fixture.root,'scripts/verification/ci-partitions.json'),'utf8'));await writeFile(join(fixture.root,path),'new current integration owner\n');manifest.integration[0].files.push(path);manifest.integration[0].files.sort();await writeFile(join(fixture.root,'scripts/verification/ci-partitions.json'),JSON.stringify(manifest)+'\n');}git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Current checkout advances while original source remains retained']);if(git(['rev-parse','HEAD'])===source)throw Error('Historical fixture checkout did not advance');}
  const script=join(fixture.root,'.local/canonical-runner.mjs'),input=join(fixture.root,'.local/canonical-input.json'),subject=pathToFileURL(resolve('scripts/verification/canonical-'+(mode==='runtime'?'runtime':'schema')+'-jobs.ts')).href;await writeFile(input,JSON.stringify({run,jobs,artifacts,archives,tree,mode,subject,options}));await writeFile(script,fixtureReaderSource);
  return spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(fixture.hook).href,script],{cwd:fixture.root,encoding:'utf8',env:{...process.env,CUEVO_CANONICAL_FIXTURE_CONFIG:fixture.hookInput,CUEVO_CANONICAL_READER_INPUT:input}});
 }finally{await fixture.destroy();}
}
