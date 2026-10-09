import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {integrationPartitionIds,integrationIdentity,integrationPartitionReceipt,selectIntegrationPartition} from './integration-partitions';
import {readCiPartitionCoverage} from './ci-partition-coverage';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';

test('runtime source digests preserve the exact Git path order for case and punctuation across all actual producers',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cuevo-runtime-source-order-'));
 try{
  const sources={'README.md':'Frozen guide\n','AGENTS.md':'Frozen rules\n','apps/api/README.md':'Frozen API guide\n','apps/api/AGENTS.md':'Frozen API rules\n','apps/api/package.json':'{}\n','a-b/source.ts':'hyphen owner\n','a/source.ts':'slash owner\n','a_b/source.ts':'underscore owner\n'};
  for(const[path,bytes]of Object.entries(sources)){await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),bytes);}
  const git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});git(['init','--quiet']);git(['config','core.autocrlf','false']);git(['add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Exact source order']);
  const paths=git(['ls-files','-z']).split('\0').filter(Boolean),ordered=[...paths].sort();assert.notDeepEqual(ordered,[...paths].sort((a,b)=>a.localeCompare(b)),'The fixture must distinguish canonical Git order from locale order.');
  const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),expected=hash(JSON.stringify(ordered.map(path=>({path,sha256:hash(readFileSync(join(root,path)))}))));
  for(const owner of ['technical-exit.ts','../test-integration.ts','runtime-lane-aggregate.ts','browser-complete.ts']){
   const path=resolve(import.meta.dirname,owner),parsed=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
   const variable=(name:string)=>{let result:ts.Expression|undefined;for(const statement of parsed.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name)&&declaration.name.text===name)result=declaration.initializer;assert.ok(result,owner+' retains its actual '+name+' owner');return result.getText(parsed);};
   const body=owner==='../test-integration.ts'?`const git=${variable('git')};const snapshot=${variable('snapshot')};return snapshot();`:owner==='browser-complete.ts'?`const snapshot=${variable('snapshot')};return snapshot();`:`const snapshot=${variable('snapshot')};const manifest=await snapshot();return ${variable('sourceDigest')};`;
   const javascript=ts.transpileModule(`const observe=async()=>{${body}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
   const observed=await new Function('execFileSync','readFile','readFileSync','createHash',javascript+'\nreturn observe();')((command:string,args:string[],options:Record<string,unknown>)=>execFileSync(command,args,{...options,cwd:root}), (path:string)=>readFile(resolve(root,path)), (path:string)=>readFileSync(resolve(root,path)), createHash) as string;
   assert.equal(observed,expected,owner+' must produce the exact original Git descriptor digest');
  }
 }finally{await rm(root,{recursive:true,force:true});}
});

function integrationFixture(common:Record<string,unknown>){
 const coverage=readCiPartitionCoverage(resolve(import.meta.dirname,'../..')),hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
 const identity=integrationIdentity({...common,sourceLockSha256:hash(readFileSync(resolve(import.meta.dirname,'../../package-lock.json'))),partitionManifestSha256:coverage.manifestSha256,nodeVersion:process.version,nodeBinarySha256:hash(readFileSync(process.execPath)),platform:process.platform,arch:process.arch});
 const values=integrationPartitionIds.map(partition=>{const selection=selectIntegrationPartition(coverage,partition,String(common.profile));return integrationPartitionReceipt({identity:{...identity,job:partition},partition,scope:selection.scope,files:selection.files.map(path=>({path,sha256:hash(readFileSync(resolve(import.meta.dirname,'../..',path))),durationMs:10,cases:[{definitionSha256:hash(path),outcome:'PASSED',retryCount:0,repeatCount:0}]})),inventorySha256:hash(partition+'inventory'),reportSha256:hash(partition+'report'),diagnosticsSha256:hash(partition+'diagnostics'),startedAtMs:1000,completedAtMs:2000,executionStartedAtMs:1100,executionCompletedAtMs:1500,exitCode:0,signal:null,rows:['clean-bootstrap',selection.scope,'demo-seed-restore','owned-stack-stop','source-freeze'].map(name=>({name,required:true,exitCode:0,durationMs:1})),processesStopped:true,sourceUnchanged:true,cleanupBasis:'CLI_STOP_EXIT_SUCCESS',reasons:[]},coverage);});return{values,identity,coverage};
}

test('isolated backend and browser lanes retain exact complete selected scope and cannot become full acceptance alone',async()=>{
 const subject=await import('./runtime-lanes');
 assert.deepEqual(subject.readTechnicalRequest(['--profile=ci','--lane=backend']),{profile:'ci',lane:'backend'});
 for(const args of [['--profile=full','--lane=backend'],['--lane=browser'],['--profile=ci','--lane=other']])assert.throws(()=>subject.readTechnicalRequest(args));
 for(const profile of ['routine','full-runtime','main-staging'] as const){
  const backend:string[]=subject.runtimeLaneSteps(profile,'backend').map(row=>row.name),browser:string[]=subject.runtimeLaneSteps(profile,'browser').map(row=>row.name);
  assert.equal(backend.includes('database'),false);assert.equal(backend.includes('database-advisors'),false);assert.ok(backend.includes('edge-runtime'));assert.equal(backend.includes('critical-browser'),false);
  for(const step of ['clean-browser-seed','web-build','browser-secrets','critical-browser','demo-seed-restore'])assert.ok(browser.includes(step));
  assert.equal(browser.includes('database'),false);assert.equal(browser.includes('integration'),false);
 }
});

test('integration work has exactly two fixed CI owners and leaves all default complete acceptance steps intact',async()=>{
 const subject=await import('./runtime-lanes'),{verificationSteps}=await import('./steps');
 for(const partition of ['integration-learning','integration-state']as const)assert.deepEqual(subject.readTechnicalRequest(['--profile=ci','--ci-partition='+partition]),{profile:'ci',partition});
 for(const args of [['--ci-partition=integration-learning'],['--profile=full','--ci-partition=integration-learning'],['--profile=ci','--ci-partition=other'],['--profile=ci','--ci-partition=integration-learning','--lane=backend']])assert.throws(()=>subject.readTechnicalRequest(args));
 for(const profile of ['routine','full-runtime','main-staging']as const)assert.equal(subject.runtimeLaneSteps(profile,'backend').some(row=>['integration','critical-integration'].includes(row.name)),false);
 assert.equal(verificationSteps.filter(row=>row.name==='integration').length,1);
});

test('isolated build owners retain exact component commands and one browser secret check before complete build aggregation',async()=>{
 const subject=await import('./runtime-lanes'),{commandArgs}=await import('./steps');
 for(const profile of ['routine','full-runtime','main-staging']as const){
  const backend=subject.runtimeLaneSteps(profile,'backend'),browser=subject.runtimeLaneSteps(profile,'browser');
  assert.equal(backend.filter(row=>row.name==='backend-build').length,1);assert.equal(browser.filter(row=>row.name==='web-build').length,1);assert.equal(backend.some(row=>row.name==='build'||row.name==='browser-secrets'),false);assert.equal(browser.some(row=>row.name==='build'||row.name==='backend-build'),false);
  assert.deepEqual(commandArgs(backend.find(row=>row.name==='backend-build')!),['--env-file=.env.local','--import','tsx','scripts/verification/build-workspaces.ts','--scope=backend']);assert.deepEqual(commandArgs(browser.find(row=>row.name==='web-build')!),['--env-file=.env.local','--import','tsx','scripts/verification/build-workspaces.ts','--scope=web']);
  assert.equal(browser.filter(row=>row.name==='browser-secrets').length,1);assert.ok(browser.findIndex(row=>row.name==='browser-secrets')>browser.findIndex(row=>row.name==='web-build'));assert.ok(browser.findIndex(row=>row.name==='browser-secrets')<browser.findIndex(row=>row.name==='critical-browser'));
  const {routineBrowserFiles}=await import('./verification-profiles'),common={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile,browserFiles:routineBrowserFiles};
  const receipt=(lane:'backend'|'browser'|'database')=>subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps(profile,lane).map(row=>({name:row.name,exitCode:0,required:true,durationMs:row.name==='backend-build'?11:row.name==='web-build'?17:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]});
  const original=[receipt('backend'),receipt('browser'),receipt('database')],integration=integrationFixture(common),combined=subject.combineRuntimeLanes(original,common,integration.values,integration.identity,integration.coverage);assert.equal(combined.rows.filter(row=>row.name==='build').length,1);assert.equal(combined.rows.find(row=>row.name==='build')!.durationMs,28);assert.equal(combined.rows.filter(row=>row.name==='browser-secrets').length,1);assert.equal(combined.rows.some(row=>row.name==='backend-build'||row.name==='web-build'),false);
  for(const mode of ['missing-web','failed-backend','generic-build','misplaced-secrets','duplicate-web','foreign-source']){
   const changed=structuredClone(original);if(mode==='missing-web')changed[1].rows=changed[1].rows.filter(row=>row.name!=='web-build');if(mode==='failed-backend')changed[0].rows.find(row=>row.name==='backend-build')!.exitCode=1;if(mode==='generic-build')changed[1].rows.find(row=>row.name==='web-build')!.name='build';if(mode==='misplaced-secrets'){const secret=changed[1].rows.find(row=>row.name==='browser-secrets')!;changed[1].rows=changed[1].rows.filter(row=>row!==secret);changed[0].rows.push(secret);}if(mode==='duplicate-web')changed[1].rows.push(changed[1].rows.find(row=>row.name==='web-build')!);if(mode==='foreign-source')changed[1].sourceDigest='d'.repeat(64);assert.throws(()=>subject.combineRuntimeLanes(changed,common,integration.values,integration.identity,integration.coverage),mode);
  }
 }
});

test('database lane proves only replay grants and advisors and cannot replace either application lane',async()=>{
 const subject=await import('./runtime-lanes');
 assert.deepEqual(subject.readTechnicalRequest(['--profile=ci','--lane=database']),{profile:'ci',lane:'database'});
 const common={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:1,profile:'routine' as const,browserFiles:['foundation.spec.ts','role-home.spec.ts','role-accessibility.spec.ts','hydration-diagnostics.spec.ts','learning-lifecycle.spec.ts','customer-browser-learning-loop.spec.ts','customer-command-scope.spec.ts']};
 assert.deepEqual(subject.runtimeLaneSteps('routine','database').map(row=>row.name),['clean-bootstrap','database-advisors','database','demo-seed-restore']);
 const database=subject.runtimeLaneEvidence({...common,lane:'database',rows:[...subject.runtimeLaneSteps('routine','database').map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]});
 assert.equal(database.status,'LANE_VERIFIED');
 const browser=subject.runtimeLaneEvidence({...common,lane:'browser',rows:[...subject.runtimeLaneSteps('routine','browser').map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]});
 const integration=integrationFixture(common);assert.throws(()=>subject.combineRuntimeLanes([database,browser],common,integration.values,integration.identity,integration.coverage));
 assert.throws(()=>subject.runtimeLaneEvidence({...common,lane:'database',rows:database.rows.filter(row=>row.name!=='database')}));
});

test('actual aggregate consumes only bounded same-attempt JSON and refuses private or missing artifact files',async()=>{
 const subject=await import('./runtime-lanes'),root=await mkdtemp(join(tmpdir(),'cuevo-lane-aggregate-'));
 try{
  const git=(...args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();await writeFile(join(root,'README.md'),'Frozen lane source\n');await writeFile(join(root,'.gitignore'),'.local/\n');
  await mkdir(join(root,'apps/api/test/integration'),{recursive:true});const {fullIntegrationFiles,integrationExclusions}=await import('./verification-profiles');for(const path of [...fullIntegrationFiles(),...integrationExclusions.map(row=>row.file)])await writeFile(join(root,path),readFileSync(path));await writeFile(join(root,'package-lock.json'),readFileSync('package-lock.json'));
  git('init','--quiet');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','source');
  const sha=git('rev-parse','HEAD'),manifest=git('ls-files').split('\n').map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(root,path))).digest('hex')}));
  const {routineBrowserFiles}=await import('./verification-profiles');
  const common={repository:'owner/repo',sourceSha:sha,treeSha:git('rev-parse','HEAD^{tree}'),sourceDigest:createHash('sha256').update(JSON.stringify(manifest.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))).digest('hex'),githubRunId:'31',runAttempt:2,profile:'full-runtime' as const,browserFiles:routineBrowserFiles};
  for(const lane of ['backend','browser','database'] as const){await mkdir(join(root,'.local/runtime-lane-inputs',lane),{recursive:true});await writeFile(join(root,'.local/runtime-lane-inputs',lane,'lane.json'),JSON.stringify(subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps(common.profile,lane).map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]})));}
  const integration=integrationFixture(common);for(const value of integration.values){await mkdir(join(root,'.local/integration-partition-inputs',value.partition),{recursive:true});await writeFile(join(root,'.local/integration-partition-inputs',value.partition,'result.json'),JSON.stringify(value));}
  const run=()=>spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,resolve('scripts/verification/runtime-lane-aggregate.ts')],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'true',CI:'true',GITHUB_JOB:'technical-mvp',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:sha,GITHUB_RUN_ID:'31',GITHUB_RUN_ATTEMPT:'2'}});
  const first=run();assert.equal(first.status,0,first.stderr);
  for(const mutation of ['tracked','untracked']){
   const hook=join(root,'.local','source-mutation.mjs');await writeFile(hook,`import {registerHooks} from 'node:module';import {writeFileSync} from 'node:fs';registerHooks({load(url,context,next){const result=next(url,context);if(url.endsWith('/runtime-lane-aggregate.ts'))return{...result,source:String(result.source).replace('const expected={',${JSON.stringify(`await import('node:fs/promises').then(fs=>fs.writeFile(${JSON.stringify(mutation==='tracked'?'README.md':'late-source.ts')},'Changed after lane reads\\n'));const expected={`)})};return result;}});`);
   const changed=spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--import',pathToFileURL(hook).href,resolve('scripts/verification/runtime-lane-aggregate.ts')],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'true',CI:'true',GITHUB_JOB:'technical-mvp',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'owner/repo',GITHUB_SHA:sha,GITHUB_RUN_ID:'31',GITHUB_RUN_ATTEMPT:'2'}});
   assert.notEqual(changed.status,0,mutation);assert.doesNotMatch(changed.stdout,/Combined exact/);
   if(mutation==='tracked')await writeFile(join(root,'README.md'),'Frozen lane source\n');else await rm(join(root,'late-source.ts'));
  }
  await writeFile(join(root,'.local/runtime-lane-inputs/backend/private.txt'),'forbidden');assert.notEqual(run().status,0);await rm(join(root,'.local/runtime-lane-inputs/backend/private.txt'));await rm(join(root,'.local/runtime-lane-inputs/browser/lane.json'));assert.notEqual(run().status,0);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('runtime aggregate refuses missing failed foreign attempt source scope and substituted required lane rows',async()=>{
 const subject=await import('./runtime-lanes');
 const common={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'routine' as const,browserFiles:['foundation.spec.ts','role-home.spec.ts','role-accessibility.spec.ts','hydration-diagnostics.spec.ts','learning-lifecycle.spec.ts','customer-browser-learning-loop.spec.ts','customer-command-scope.spec.ts']};
 const receipt=(lane:'backend'|'browser'|'database')=>subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps('routine',lane).map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]});
 const backend=receipt('backend'),browser=receipt('browser'),database=receipt('database');
 const integration=integrationFixture(common),combined=subject.combineRuntimeLanes([backend,browser,database],common,integration.values,integration.identity,integration.coverage);assert.equal(combined.status,'ROUTINE_VERIFIED');assert.ok(combined.rows.some(row=>row.name==='critical-browser'));
 assert.equal(backend.status,'LANE_VERIFIED');assert.notEqual(backend.status,'VERIFIED');
 for(const change of ['missing','attempt','source','rows','failed','private','duplicate']){
  const values=[structuredClone(backend),structuredClone(browser),structuredClone(database)] as Record<string,unknown>[];
  if(change==='missing')values.pop();if(change==='attempt')values[1].runAttempt=3;if(change==='source')values[1].sourceDigest='d'.repeat(64);
  if(change==='rows')(values[1].rows as unknown[]).pop();if(change==='failed')(values[1].rows as {exitCode:number}[])[0].exitCode=1;
  if(change==='private')values[1].rawConsole='private';if(change==='duplicate')values[1]=values[0];
  assert.throws(()=>subject.combineRuntimeLanes(values,common,integration.values,integration.identity,integration.coverage),change);
 }
});

test('complete technical evidence refuses every missing integration producer and retains exact original receipt hashes',async()=>{
 const subject=await import('./runtime-lanes'),{canonicalReleaseExecutionJson}=await import('./release-review');
 const common={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'routine' as const,browserFiles:(await import('./verification-profiles')).routineBrowserFiles};
 const lanes=(['backend','browser','database']as const).map(lane=>subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps(common.profile,lane).map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]}));
 const integration=integrationFixture(common),aggregate=subject.technicalAggregateReceipt(lanes,integration.values,integration.identity,integration.coverage);
 assert.equal(aggregate.status,'PASSED');assert.equal(aggregate.integration.caseCount,13);assert.equal(aggregate.runtime.length,3);assert.equal(aggregate.integration.partitions.length,2);assert.equal(aggregate.result.rows.filter(row=>row.name==='critical-integration').length,1);
 assert.deepEqual(subject.validateTechnicalAggregateReceipt(aggregate,lanes,integration.values,integration.identity,integration.coverage),aggregate);
 assert.throws(()=>subject.combineRuntimeLanes(lanes,common,[],integration.identity,integration.coverage));
 for(const mutate of ['missing','changed-hash','wrong-case-union','raw-data']){const changed=structuredClone(aggregate);if(mutate==='missing')changed.integration.partitions.pop();if(mutate==='changed-hash')changed.runtime[0].receiptSha256='d'.repeat(64);if(mutate==='wrong-case-union')changed.integration.files.pop();if(mutate==='raw-data')Object.assign(changed,{rawError:'private secret'});assert.throws(()=>subject.validateTechnicalAggregateReceipt(changed,lanes,integration.values,integration.identity,integration.coverage),mutate);}
 assert.doesNotMatch(canonicalReleaseExecutionJson(aggregate),/private secret|access_token|rawError/);
});

test('historical metadata retains the original committed full integration union after the current checkout inventory changes',async()=>{
 const subject=await import('./runtime-lanes'),{canonicalReleaseExecutionJson}=await import('./release-review'),{fullIntegrationFiles}=await import('./verification-profiles');
 const common={repository:'owner/repo',sourceSha:'a'.repeat(40),treeSha:'b'.repeat(40),sourceDigest:'c'.repeat(64),githubRunId:'31',runAttempt:2,profile:'main-staging' as const,browserFiles:(await import('./verification-profiles')).criticalBrowserFiles};
 const integration=integrationFixture(common),lanes=(['backend','browser','database']as const).map(lane=>subject.runtimeLaneEvidence({...common,lane,rows:[...subject.runtimeLaneSteps(common.profile,lane).map(step=>({name:step.name,exitCode:0,required:true,durationMs:1})),{name:'source-freeze',exitCode:0,required:true,durationMs:1}]}));
 const aggregate=subject.technicalAggregateReceipt(lanes,integration.values,integration.identity,integration.coverage),descriptor={integration:integration.coverage.integration.map(row=>({id:row.id,files:[...row.files]})),files:fullIntegrationFiles().map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))};
 assert.deepEqual(subject.validateCommittedTechnicalAggregateReceipt(aggregate,lanes,integration.values,integration.identity,descriptor),aggregate);
 const root=await mkdtemp(join(tmpdir(),'cuevo-original-integration-metadata-')),originalCwd=process.cwd();
 try{
  await mkdir(join(root,'apps/api/test/integration'),{recursive:true});await writeFile(join(root,'apps/api/test/integration/current-new-owner.test.ts'),'current unexecuted private source');process.chdir(root);
  assert.deepEqual(subject.validateCommittedTechnicalAggregateReceipt(aggregate,lanes,integration.values,integration.identity,descriptor),aggregate,'historical proof uses independently checked original Git bytes, never current files');
  for(const mode of ['missing-original-file','tampered-original-bytes','unassigned-original-owner','missing-original-partition','routine-profile']){
   const changed=structuredClone(descriptor);if(mode==='missing-original-file')changed.files.pop();if(mode==='tampered-original-bytes')changed.files[0].sha256='d'.repeat(64);if(mode==='unassigned-original-owner')changed.files.push({path:'apps/api/test/integration/old-unassigned.test.ts',sha256:'d'.repeat(64)});if(mode==='missing-original-partition')changed.integration.pop();
   assert.throws(()=>subject.validateCommittedTechnicalAggregateReceipt(aggregate,lanes,integration.values,mode==='routine-profile'?{...integration.identity,profile:'routine'}:integration.identity,changed),mode);
  }
  assert.doesNotMatch(canonicalReleaseExecutionJson(aggregate),/private source/);
 }finally{process.chdir(originalCwd);await rm(root,{recursive:true,force:true});}
});
