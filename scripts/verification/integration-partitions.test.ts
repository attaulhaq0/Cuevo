import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readCiPartitionCoverage} from './ci-partition-coverage';
import {criticalIntegrationFiles,fullIntegrationFiles,routineBrowserFiles} from './verification-profiles';
import {canonicalReleaseExecutionJson} from './release-review';
import type {IntegrationPartitionReceipt} from './integration-partitions';

const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
async function api(){let subject:Record<string,unknown>={};try{subject=await import('./integration-partitions');}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof subject.selectIntegrationPartition,'function','closed integration partition selector exists');return subject as typeof import('./integration-partitions');}
test('fixed integration partitions select every complete or critical owner once and refuse caller scope',async()=>{
 const subject=await api(),coverage=readCiPartitionCoverage(resolve('.'));
 for(const profile of ['routine','main-staging','full-runtime']as const){
  const selections=subject.integrationPartitionIds.map(id=>subject.selectIntegrationPartition(coverage,id,profile));
  assert.deepEqual(selections.map(row=>row.files.length),coverage.integration.map(row=>profile==='routine'?row.files.filter(file=>(criticalIntegrationFiles as readonly string[]).includes(file)).length:row.files.length));
  assert.deepEqual(selections.flatMap(row=>row.files).sort(),profile==='routine'?[...criticalIntegrationFiles].sort():fullIntegrationFiles());
  assert.equal(new Set(selections.flatMap(row=>row.files)).size,profile==='routine'?criticalIntegrationFiles.length:fullIntegrationFiles().length);
  assert.ok(selections.every(row=>!row.files.some(file=>file.includes('foundry-live'))));
 }
 for(const [id,profile]of [['integration-other','routine'],['integration-learning','full'],['integration-learning','critical'],['integration-learning','routine --exclude=x']])assert.throws(()=>subject.selectIntegrationPartition(coverage,id,profile));
});

test('source owner deletion and addition retain a failure-only original captured partition receipt',async()=>{
 const subject=await api(),coverage=readCiPartitionCoverage(resolve('.')),selection=subject.selectIntegrationPartition(coverage,'integration-learning','routine'),directory=await mkdtemp(join(tmpdir(),'cuevo-integration-source-drift-'));
 try{
  assert.equal(typeof subject.integrationPartitionFailure,'function','source drift retains only failed original partition evidence');
  const identity=subject.integrationIdentity({repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'routine',browserFiles:routineBrowserFiles,sourceLockSha256:hash('lock'),partitionManifestSha256:coverage.manifestSha256,nodeVersion:process.version,nodeBinarySha256:hash('node'),platform:process.platform,arch:process.arch});
  const capturedFiles=selection.files.map(path=>({path,sha256:hash(readFileSync(path)),durationMs:null,cases:[]})),producer=pathToFileURL(resolve('scripts/verification/integration-partitions.ts')).href;
  const hook=join(directory,'deny-current-coverage.mjs');await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){if(url.endsWith('/ci-partition-coverage.ts'))return{format:'module',shortCircuit:true,source:'export const ciPartitionFiles=()=>{throw Error("CURRENT_DISCOVERY_CHANGED");};export const readCiPartitionCoverage=()=>{throw Error("CURRENT_DISCOVERY_CHANGED");};'};return next(url,context);}});`);
  const body={identity:{...identity,job:selection.partition},partition:selection.partition,scope:selection.scope,files:capturedFiles,inventorySha256:null,reportSha256:null,diagnosticsSha256:null,startedAtMs:1000,completedAtMs:2000,executionStartedAtMs:null,executionCompletedAtMs:null,exitCode:1,signal:null,rows:['clean-bootstrap',selection.scope,'demo-seed-restore','owned-stack-stop','source-freeze'].map(name=>({name,exitCode:name==='source-freeze'?1:0,required:true,durationMs:1})),processesStopped:true,sourceUnchanged:false,cleanupBasis:'CLI_STOP_EXIT_SUCCESS',reasons:['SOURCE_CHANGED']};
  for(const mode of ['deleted','added']){
   const file=join(directory,'original.test.ts');await writeFile(file,'original private source');if(mode==='deleted')await rm(file);else await writeFile(join(directory,'new-owner.test.ts'),'new private source');
   const script=join(directory,'failure-only.mjs'),inputPath=join(directory,'failure-input.json');await writeFile(inputPath,JSON.stringify({producer,body,selection}));await writeFile(script,`import{readFileSync}from'node:fs';const input=JSON.parse(readFileSync(process.env.CUEVO_FAILURE_FIXTURE_INPUT,'utf8')),{integrationPartitionFailure}=await import(input.producer);console.log(JSON.stringify(integrationPartitionFailure(input.body,input.selection)));`);
   const actual=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(hook).href,script],{cwd:directory,encoding:'utf8',env:{...process.env,CUEVO_FAILURE_FIXTURE_INPUT:inputPath}});assert.equal(actual.status,0,actual.stderr);assert.doesNotMatch(actual.stderr,/CURRENT_DISCOVERY_CHANGED/);
   const receipt=JSON.parse(actual.stdout);assert.equal(receipt.status,'FAILED');assert.deepEqual(receipt.files,capturedFiles);assert.deepEqual(receipt.reasons,['SOURCE_CHANGED']);assert.doesNotMatch(canonicalReleaseExecutionJson(receipt),/private source|rawError/);
   assert.throws(()=>subject.combineIntegrationPartitions([receipt,receipt],identity,coverage));
  }
  assert.throws(()=>subject.integrationPartitionFailure({...body,exitCode:0,sourceUnchanged:true,reasons:[],rows:body.rows.map(row=>({...row,exitCode:0}))},selection),'failure-only constructor cannot mint passing evidence');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('actual Vitest lifecycle diagnostics expose retried passed tests and original reporter coverage safely',async()=>{
 const subject=await api(),directory=await mkdtemp(join(tmpdir(),'cuevo-integration-diagnostics-'));
 try{
  assert.equal(typeof subject.integrationExecutedFiles,'function','actual integration lifecycle validation exists');
  const runner=resolve('node_modules/vitest/vitest.mjs'),config=join(directory,'vitest.config.mjs'),file=join(directory,'owner.test.mjs'),inventoryPath=join(directory,'inventory.json'),reportPath=join(directory,'report.json'),diagnosticPath=join(directory,'diagnostic.json');
  await symlink(resolve('node_modules'),join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
  await writeFile(config,"export default {test:{include:['*.test.mjs'],fileParallelism:false,testTimeout:5000}};");
  const run=(args:string[])=>spawnSync(process.execPath,[runner,...args,'--root',directory,'--config',config],{encoding:'utf8',timeout:30000,env:{...process.env,CUEVO_INTEGRATION_DIAGNOSTIC_PATH:diagnosticPath}});
  for(const retry of [false,true]){
   await writeFile(file,retry?"import{it,expect}from'vitest';let calls=0;it('private title true',{retry:1},()=>{calls++;expect(calls,'private failure').toBe(2);});":"import{it,expect}from'vitest';let calls=0;it('private title false',()=>{calls++;expect(calls).toBe(1);});");
   const listed=run(['list','--staticParse=false','--allowOnly=false',`--json=${inventoryPath}`,file]);assert.equal(listed.status,0,listed.stderr);
   const startedAt=Date.now(),executed=run(['run','--allowOnly=false','--fileParallelism=false','--reporter=json','--reporter='+resolve('scripts/verification/integration-partitions.ts'),`--outputFile=${reportPath}`,file]),finishedAt=Date.now();assert.equal(executed.status,0,executed.stderr);
   const diagnostics=await readFile(diagnosticPath,'utf8');assert.doesNotMatch(diagnostics,/private title|private failure/);
   // Reading the original files is asynchronous; keep the validation invocation synchronous.
   const report:unknown=JSON.parse(await readFile(reportPath,'utf8')),inventory:unknown=JSON.parse(await readFile(inventoryPath,'utf8'));
   const validate=()=>subject.integrationExecutedFiles(report,inventory,JSON.parse(diagnostics),{expectedFiles:[file],startedAt,finishedAt,repoRoot:directory});
   if(retry)assert.throws(validate,'a pass after one retry must not certify original first-attempt coverage');else assert.equal(validate()[0].cases.length,1);
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('an actual failing Vitest case retains safe original failure hashes and cannot certify successful coverage',async()=>{
 const subject=await api(),directory=await mkdtemp(join(tmpdir(),'cuevo-integration-failure-diagnostics-'));
 try{
  assert.equal(typeof subject.integrationFailureFiles,'function','failed lifecycle projection exists');
  const runner=resolve('node_modules/vitest/vitest.mjs'),config=join(directory,'vitest.config.mjs'),file=join(directory,'owner.test.mjs'),inventoryPath=join(directory,'inventory.json'),reportPath=join(directory,'report.json'),diagnosticPath=join(directory,'diagnostic.json');
  await symlink(resolve('node_modules'),join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
  await writeFile(config,"export default {test:{include:['*.test.mjs'],fileParallelism:false,testTimeout:5000}};");await writeFile(file,"import{it,expect}from'vitest';it('private failing test',()=>expect(1,'private failure message').toBe(2));");
  const run=(args:string[])=>spawnSync(process.execPath,[runner,...args,'--root',directory,'--config',config],{encoding:'utf8',timeout:30000,env:{...process.env,CUEVO_INTEGRATION_DIAGNOSTIC_PATH:diagnosticPath}});
  const listed=run(['list','--staticParse=false','--allowOnly=false',`--json=${inventoryPath}`,file]);assert.equal(listed.status,0,listed.stderr);
  const startedAt=Date.now(),executed=run(['run','--allowOnly=false','--fileParallelism=false','--reporter=json','--reporter='+resolve('scripts/verification/integration-partitions.ts'),`--outputFile=${reportPath}`,file]),finishedAt=Date.now();assert.notEqual(executed.status,0);
  const inventory:unknown=JSON.parse(await readFile(inventoryPath,'utf8')),diagnostics:unknown=JSON.parse(await readFile(diagnosticPath,'utf8')),report:unknown=JSON.parse(await readFile(reportPath,'utf8')),captured=[{path:file,sha256:hash(readFileSync(file))}];
  const files=subject.integrationFailureFiles(inventory,diagnostics,{files:captured,repoRoot:directory});assert.equal(files[0].cases.length,1);assert.equal(files[0].cases[0].outcome,'FAILED');assert.equal(files[0].cases[0].definitionSha256,hash('private failing test'));assert.doesNotMatch(canonicalReleaseExecutionJson(files),/private failing test|private failure message/);
  assert.throws(()=>subject.integrationExecutedFiles(report,inventory,diagnostics,{expectedFiles:[file],startedAt,finishedAt,repoRoot:directory}));
  const partial=structuredClone(diagnostics)as{files:unknown[]};partial.files=[];assert.equal(subject.integrationFailureFiles(inventory,partial,{files:captured,repoRoot:directory})[0].cases.length,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('actual integration runner exports its nonzero original failed phase without services or private diagnostics',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-integration-failed-phase-'));
 try{
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  await mkdir(join(root,'apps/api/test/integration'),{recursive:true});await mkdir(join(root,'.local'));await writeFile(join(root,'.gitignore'),'.local/\nnode_modules/\n');await writeFile(join(root,'vitest.config.mjs'),"export default {test:{include:['apps/api/test/integration/*.test.ts'],fileParallelism:false,testTimeout:5000}};");
  await symlink(resolve('node_modules'),join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
  const ownerPath='scripts/verification/integration-partitions.ts';await mkdir(join(root,'scripts/verification'),{recursive:true});await writeFile(join(root,ownerPath),"const owner=await import(process.env.CUEVO_FAILURE_FIXTURE_REPORTER);export default owner.default;");
  const file='apps/api/test/integration/failure.test.ts';await writeFile(join(root,file),"import{it,expect}from'vitest';it('private phase failure',()=>expect(false,'private provider credential').toBe(true));");
  git(['init','--quiet']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','fixture']);
  const subject=resolve('scripts/test-integration.ts'),hook=join(root,'.local/runner-hook.mjs'),phasePath=join(root,'.local/phase.json');
  await writeFile(hook,`import{registerHooks}from'node:module';registerHooks({load(url,context,next){if(url.endsWith('/ci-partition-coverage.ts'))return{format:'module',shortCircuit:true,source:'export const readCiPartitionCoverage=()=>({});export const ciPartitionFiles=()=>["apps/api/test/integration/failure.test.ts"];'};return next(url,context);}});`);
  // Only Vitest source/runner location is adapted; the real runner, lifecycle
  // reporter, nonzero outcome and phase projection remain production code.
  const run=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(hook).href,subject,'--ci-partition=integration-learning'],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,CI:'true',GITHUB_ACTIONS:'true',GITHUB_JOB:'integration-learning',GITHUB_EVENT_NAME:'pull_request',CUEVO_INTEGRATION_PHASE_RECEIPT_FILE:phasePath,CUEVO_FAILURE_FIXTURE_REPORTER:pathToFileURL(resolve(ownerPath)).href}});
  assert.notEqual(run.status,0);let phaseBytes:string;try{phaseBytes=await readFile(phasePath,'utf8');}catch{assert.fail(run.stderr+'\n'+run.stdout);}const phase=JSON.parse(phaseBytes)as{exitCode:number;files:{cases:{outcome:string;definitionSha256:string}[]}[];reportSha256:string;diagnosticsSha256:string};
  assert.notEqual(phase.exitCode,0);assert.equal(phase.files[0].cases[0].outcome,'FAILED');assert.equal(phase.files[0].cases[0].definitionSha256,hash('private phase failure'));assert.match(phase.reportSha256,/^[a-f0-9]{64}$/);assert.match(phase.diagnosticsSha256,/^[a-f0-9]{64}$/);assert.doesNotMatch(canonicalReleaseExecutionJson(phase),/private phase failure|private provider credential/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('original integration receipts retain safe expanded cases and exact source clocks outcomes and full union',async()=>{
 const subject=await api(),coverage=readCiPartitionCoverage(resolve('.'));
 const identity={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'routine' as const,browserFiles:routineBrowserFiles,sourceLockSha256:hash(readFileSync('package-lock.json')),partitionManifestSha256:coverage.manifestSha256,nodeVersion:process.version,nodeBinarySha256:hash(readFileSync(process.execPath)),platform:process.platform,arch:process.arch};
 const expected=subject.integrationIdentity(identity);
 const make=(partition:'integration-learning'|'integration-state')=>{
  const selected=subject.selectIntegrationPartition(coverage,partition,'routine');
  return subject.integrationPartitionReceipt({identity:{...expected,job:partition},partition,scope:selected.scope,files:selected.files.map(path=>({path,sha256:hash(readFileSync(path)),cases:[{definitionSha256:hash(path+' > private case'),outcome:'PASSED' as const,retryCount:0,repeatCount:0}],durationMs:10})),inventorySha256:hash(partition+'inventory'),reportSha256:hash(partition+'report'),diagnosticsSha256:hash(partition+'diagnostic'),startedAtMs:1000,completedAtMs:2000,executionStartedAtMs:1200,executionCompletedAtMs:1500,exitCode:0,signal:null,rows:[{name:'clean-bootstrap',exitCode:0,required:true,durationMs:100},{name:'critical-integration',exitCode:0,required:true,durationMs:300},{name:'demo-seed-restore',exitCode:0,required:true,durationMs:100},{name:'owned-stack-stop',exitCode:0,required:true,durationMs:100},{name:'source-freeze',exitCode:0,required:true,durationMs:10}],processesStopped:true,sourceUnchanged:true,cleanupBasis:'CLI_STOP_EXIT_SUCCESS',reasons:[]},coverage);
 };
 const original=subject.integrationPartitionIds.map(make),combined=subject.combineIntegrationPartitions(original,expected,coverage);
 assert.equal(combined.status,'PASSED');assert.equal(combined.files.length,13);assert.equal(combined.caseCount,13);assert.equal(combined.durationMs,300);assert.equal(combined.overlapSpanMs,300);assert.doesNotMatch(canonicalReleaseExecutionJson(combined),/private case|access_token|password|rawConsole/);
 for(const mode of ['missing','duplicate','source','attempt','lock','manifest','toolchain','environment','empty','skipped','todo','retry','repeat','failed','cancelled','cleanup','source-change','clock','foreign','file-bytes','duplicate-case','tamper']){
  const changed=structuredClone(original)as IntegrationPartitionReceipt[];
  if(mode==='missing')changed.pop();if(mode==='duplicate')changed[1]=changed[0];if(mode==='source')changed[0].identity.sourceDigest='d'.repeat(64);if(mode==='attempt')changed[0].identity.runAttempt=3;if(mode==='lock')changed[0].identity.sourceLockSha256='d'.repeat(64);if(mode==='manifest')changed[0].identity.partitionManifestSha256='d'.repeat(64);if(mode==='toolchain')changed[0].identity.toolchainSha256='d'.repeat(64);if(mode==='environment')changed[0].identity.environmentPolicySha256='d'.repeat(64);if(mode==='empty')changed[0].files[0].cases=[];if(mode==='skipped')changed[0].files[0].cases[0].outcome='SKIPPED';if(mode==='todo')changed[0].files[0].cases[0].outcome='TODO';if(mode==='retry')changed[0].files[0].cases[0].retryCount=1;if(mode==='repeat')changed[0].files[0].cases[0].repeatCount=1;if(mode==='failed')changed[0].rows[0].exitCode=1;if(mode==='cancelled')changed[0].signal='SIGTERM';if(mode==='cleanup')changed[0].processesStopped=false;if(mode==='source-change')changed[0].sourceUnchanged=false;if(mode==='clock')changed[0].executionCompletedAtMs=3000;if(mode==='foreign')changed[0].files[0].path='apps/api/test/integration/foreign.test.ts';if(mode==='file-bytes')changed[0].files[0].sha256='d'.repeat(64);if(mode==='duplicate-case')changed[0].files[0].cases.push(changed[0].files[0].cases[0]);if(mode==='tamper')changed[0].payloadSha256='d'.repeat(64);
  assert.throws(()=>subject.combineIntegrationPartitions(changed,expected,coverage),mode);
 }
});
