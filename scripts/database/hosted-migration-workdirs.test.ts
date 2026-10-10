import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import { createHash } from 'node:crypto';
import { planHostedMigrations, readCanonicalMigrationSources, canonicalHostedMigrationPlan, createCanonicalHostedMigrationPlan } from './hosted-migration-plan';

const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const git=(root:string,...args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();
async function api(){let module:Record<string,unknown>={};try{module=await import(pathToFileURL(resolve(import.meta.dirname,'hosted-migration-workdirs.ts')).href);}catch(error){if((error as NodeJS.ErrnoException).code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof module.createHostedMigrationWorkdirs,'function','hosted workdir builder exists');return module as typeof import('./hosted-migration-workdirs');}
let originalSources:ReturnType<typeof readCanonicalMigrationSources>['sources']|undefined;
async function fixture(run:(input:{repoRoot:string;sourceSha:string;treeSha:string;plan:ReturnType<typeof planHostedMigrations>;outputRoot:string})=>Promise<void>,append=false){const root=mkdtempSync(join(tmpdir(),'cuevo-hosted-workdirs-'));try{if(!originalSources){const repository=resolve(import.meta.dirname,'../..');originalSources=readCanonicalMigrationSources({repoRoot:repository,sourceSha:git(repository,'rev-parse','HEAD'),treeSha:git(repository,'rev-parse','HEAD^{tree}')}).sources;}mkdirSync(join(root,'supabase/migrations'),{recursive:true});writeFileSync(join(root,'.gitattributes'),'supabase/migrations/* -text\nsupabase/migrations/20261002021737_native_academic_source_identity.sql text eol=lf\n');writeFileSync(join(root,'.gitignore'),'.local/\n');const sources=[...originalSources,...(append?[{name:'20261009000000_appended_workdir_fixture.sql',bytes:Buffer.from('-- Appended fixture; never executed.\nselect 1;\n')}]:[])];for(const row of sources)writeFileSync(join(root,'supabase/migrations',row.name),row.bytes);git(root,'init','--quiet');git(root,'add','.');git(root,'-c','user.name=Synthetic Test','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','synthetic immutable migration fixture');const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}');const plan=planHostedMigrations({sources,source:{sha:sourceSha,tree:treeSha},now:Date.parse('2026-10-06T00:00:00Z'),target:{projectRef:'mqxdjvsyckzocokuikmx',boundProjectRef:'mqxdjvsyckzocokuikmx',projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:'2026-10-06T00:00:00Z',authUsers:0,storageObjects:0,appSchemas:[],migrationVersions:[],dispatchDisabled:true,population:'EMPTY'}});await run({repoRoot:root,sourceSha,treeSha,plan,outputRoot:join(root,'.local/hosted-release')});}finally{rmSync(root,{recursive:true,force:true});}}

test('builder copies all original Git bytes in four cumulative dependency stages without running a provider',async()=>{const {createHostedMigrationWorkdirs}=await api();await fixture(async input=>{const first=await createHostedMigrationWorkdirs(input);assert.deepEqual(first.stages.map(stage=>stage.included.length),[123,124,180,input.plan.migrations.length]);assert.deepEqual(first.stages.map(stage=>stage.id),['prefix','native','pre-observability','remaining']);assert.equal(first.execution,'NOT_EXECUTED');for(const stage of first.stages){assert.deepEqual(readdirSync(stage.workdir),['supabase']);assert.deepEqual(readdirSync(join(stage.workdir,'supabase')).sort(),['config.toml','migrations']);const config=readFileSync(join(stage.workdir,'supabase/config.toml'),'utf8');assert.match(config,/\[db\.seed\]\nenabled = false/);assert.doesNotMatch(config,/env\(|vault|roles|remotes|sql_paths/);for(const row of stage.included)assert.equal(hash(readFileSync(join(stage.workdir,'supabase/migrations',row.name))),row.sha256);assert.deepEqual(stage.commandArgs,['db','push','--linked','--project-ref',input.plan.projectRef,'--include-all','--skip-vault','--workdir',stage.workdir,'--yes','--output-format','json']);}assert.equal(first.planSha256,canonicalHostedMigrationPlan(input.plan).sha256);assert.match(git(input.repoRoot,'check-ignore','--no-index',first.root),/migration-/);const second=await createHostedMigrationWorkdirs(input);assert.notEqual(first.root,second.root);assert.equal(JSON.parse(readFileSync(join(first.root,'builder-state.json'),'utf8')).state,'READY');});});

test('CRLF working checkout produces original LF Git migration artifacts',async()=>{const {createHostedMigrationWorkdirs}=await api();await fixture(async input=>{const name='20261002021737_native_academic_source_identity.sql',file=join(input.repoRoot,'supabase/migrations',name),original=readFileSync(file);writeFileSync(file,original.toString().replaceAll('\n','\r\n'));const built=await createHostedMigrationWorkdirs(input);const emitted=readFileSync(join(built.stages[1].workdir,'supabase/migrations',name));assert.deepEqual(emitted,original);assert.notEqual(hash(emitted),hash(readFileSync(file)));});});

test('forged stage boundaries and source identities fail before any output is created',async()=>{const {createHostedMigrationWorkdirs}=await api();await fixture(async input=>{const forged=structuredClone(input.plan);forged.stages[1].names.unshift(forged.stages[0].names.pop()!);canonicalHostedMigrationPlan(forged);for(const value of[{...input,plan:forged},{...input,sourceSha:'0'.repeat(40)},{...input,treeSha:'0'.repeat(40)},{...input,plan:{...input.plan,source:{sha:'0'.repeat(40),tree:input.treeSha}}}])await assert.rejects(createHostedMigrationWorkdirs(value));assert.equal(readdirSync(input.repoRoot).includes('.local'),false);});});

test('external output roots, missing ignore coverage and symbolic output ancestors are denied',async()=>{const {createHostedMigrationWorkdirs}=await api();await fixture(async input=>{await assert.rejects(createHostedMigrationWorkdirs({...input,outputRoot:join(input.repoRoot,'test-results')}));writeFileSync(join(input.repoRoot,'.gitignore'),'');await assert.rejects(createHostedMigrationWorkdirs(input));writeFileSync(join(input.repoRoot,'.gitignore'),'.local/\n');const outside=mkdtempSync(join(tmpdir(),'cuevo-hosted-outside-'));try{symlinkSync(outside,join(input.repoRoot,'.local'),process.platform==='win32'?'junction':'dir');await assert.rejects(createHostedMigrationWorkdirs(input));assert.deepEqual(readdirSync(outside),[]);rmSync(join(input.repoRoot,'.local'),{force:true});}finally{rmSync(outside,{recursive:true,force:true});}});});

test('migration edits and accessor plans are refused without reading getters or overwriting prior runs',async()=>{const {createHostedMigrationWorkdirs}=await api();await fixture(async input=>{let reads=0;const plan={...input.plan,get projectRef(){reads++;return input.plan.projectRef;}};await assert.rejects(createHostedMigrationWorkdirs({...input,plan}));assert.equal(reads,0);const first=await createHostedMigrationWorkdirs(input);const before=readFileSync(join(first.root,'builder-state.json'));writeFileSync(join(input.repoRoot,'supabase/migrations',input.plan.migrations[0].name),'select 99;\n');await assert.rejects(createHostedMigrationWorkdirs(input));assert.deepEqual(readFileSync(join(first.root,'builder-state.json')),before);});});

test('incremental native observability and completed history remains physically present in every earlier workdir',async()=>{const {createHostedMigrationWorkdirs}=await api();await fixture(async input=>{for(const appliedCount of[124,180,input.plan.migrations.length]){const applied=input.plan.migrations.slice(0,appliedCount),pending=input.plan.migrations.slice(appliedCount),names=new Set(pending.map(row=>row.name));const plan={...input.plan,mode:'INCREMENTAL' as const,applied:applied.map(({version,sha256})=>({version,sha256})),pending,stages:input.plan.stages.map(stage=>({...stage,names:stage.names.filter(name=>names.has(name))})),observedHistorySha256:hash(JSON.stringify(applied.map(row=>row.version).sort()))};const built=await createHostedMigrationWorkdirs({...input,plan});for(const[index,stage]of built.stages.entries()){assert.equal(stage.included.length,Math.max(appliedCount,[123,124,180,input.plan.migrations.length][index]));for(const row of applied)assert.ok(readdirSync(join(stage.workdir,'supabase/migrations')).includes(row.name));assert.ok(stage.expectedBeforeVersions.every(version=>stage.included.some(row=>row.version===version)));assert.deepEqual(stage.pending.map(row=>row.name),plan.stages[index].names);}if(appliedCount===input.plan.migrations.length)assert.ok(built.stages.every(stage=>stage.pending.length===0));}});});

test('appended committed source extends only the final stage and retains every original byte and hash',async()=>{
 const{createHostedMigrationWorkdirs}=await api();await fixture(async input=>{
  const built=await createHostedMigrationWorkdirs(input);assert.deepEqual(built.stages.map(stage=>stage.included.length),[123,124,180,input.plan.migrations.length]);
  const appended=input.plan.migrations.find(row=>row.name==='20261009000000_appended_workdir_fixture.sql')!;assert.ok(appended);
  assert.ok(built.stages.slice(0,-1).every(stage=>!stage.included.some(row=>row.name===appended.name)));
  const final=built.stages.at(-1)!;assert.equal(final.pending.at(-1)!.name,appended.name);assert.equal(final.expectedAfterVersions.length,input.plan.migrations.length);
  for(const row of final.included){const bytes=readFileSync(join(final.workdir,'supabase/migrations',row.name));assert.equal(hash(bytes),row.sha256);assert.deepEqual(bytes,readFileSync(join(input.repoRoot,'supabase/migrations',row.name)));}
 },true);
});

test('completed prior Git release keeps its populated prefix in all workdirs and appends only one final pending migration',async()=>{
 const{createHostedMigrationWorkdirs}=await api();await fixture(async input=>{
  const prior=input.plan,priorSha=input.sourceSha,priorTree=input.treeSha,count=prior.migrations.length;
  const name='20261009121000_completed_workdir_delta.sql';writeFileSync(join(input.repoRoot,'supabase/migrations',name),'begin;\nselect 1;\ncommit;\n');
  git(input.repoRoot,'add','.');git(input.repoRoot,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','one append-only delta');
  const sourceSha=git(input.repoRoot,'rev-parse','HEAD'),treeSha=git(input.repoRoot,'rev-parse','HEAD^{tree}'),now=Date.parse('2026-10-06T00:00:00Z');
  const priorReceipt={projectRef:prior.projectRef,sourceSha:priorSha,treeSha:priorTree,migrations:prior.migrations.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:count};
  const target={projectRef:prior.projectRef,boundProjectRef:prior.projectRef,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:'2026-10-06T00:00:00Z',authUsers:133,storageObjects:12,appSchemas:['app','authorization','internal'],migrationVersions:prior.migrations.map(row=>row.version),dispatchDisabled:true,population:'GUARDED_SYNTHETIC'};
  const{plan}=createCanonicalHostedMigrationPlan({repoRoot:input.repoRoot,sourceSha,treeSha,target,priorReceipt,now});
  const built=await createHostedMigrationWorkdirs({...input,sourceSha,treeSha,plan});
  assert.deepEqual(built.stages.map(stage=>stage.included.length),[count,count,count,count+1]);
  assert.deepEqual(built.stages.map(stage=>stage.pending.map(row=>row.name)),[[],[],[],[name]]);
  for(const stage of built.stages)for(const row of prior.migrations)assert.equal(hash(readFileSync(join(stage.workdir,'supabase/migrations',row.name))),row.sha256);
  for(const stage of built.stages)assert.deepEqual(stage.expectedBeforeVersions,prior.migrations.map(row=>row.version).sort());
  const batches=await(await api()).createHostedMigrationBatchWorkdirs({...input,sourceSha,treeSha,plan,stage:built.stages[3]});assert.equal(batches.batches.length,1);assert.deepEqual(batches.batches[0].pending.map(row=>row.name),[name]);assert.equal(batches.batches[0].expectedBeforeVersions.length,count);assert.equal(batches.batches[0].expectedAfterVersions.length,count+1);
  for(const row of batches.batches[0].cumulativeIncluded)assert.equal(hash(readFileSync(join(batches.batches[0].workdir,'supabase/migrations',row.name))),row.sha256);
  await assert.rejects(createHostedMigrationWorkdirs({...input,sourceSha,treeSha,plan:{...plan,priorCompletedRelease:{...plan.priorCompletedRelease!,treeSha:'0'.repeat(40)}}}));
 });
});

const recoveryProjectRef='mqxdjvsyckzocokuikmx',recoveryHash=(value:string)=>createHash('sha256').update(value).digest('hex');
function reconciliationTemplateFor(rows:{name:string;version:string;sha256:string}[],recovery:{sha:string;tree:string}){
 const originalIdentity={projectRef:recoveryProjectRef,sourceSha:'d87455114cac2d22d63d040ce5b13e6b2e74e743',treeSha:'1e85393d46beb4f5356e07277a13a7ef33cc67d9',planSha256:'413d23ed86f7379b3e88b90e09370762ce576d0395f4c4fceaa44d0f3abf3cf1',stageId:'prefix',stageSha256:'5f9e1d7804d816dc3ee387f126f946a0ee0ac3b192b3d4973774cbf33b2ba506',databaseUrl:'postgresql://postgres.mqxdjvsyckzocokuikmx@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',approvalDigest:'d46d4616c1b9eecdcd474b080bfefac98ee959fb7c54819d510773fc661a98de',ciRunId:'37702851953',certificateSha256:'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'};
 const ownerJson=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',identity:originalIdentity})+'\n',payload=(state:string)=>({version:1,identity:originalIdentity,state,schemaHistoryAtomic:false,evidence:'SUPPLIED_PORT_EXECUTION_ONLY'});
 const first=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:1,previousSha256:null,payload:payload('INTENT'),payloadSha256:recoveryHash(JSON.stringify(payload('INTENT')))})+'\n',second=JSON.stringify({version:1,purpose:'CUEVO_HOSTED_SCHEMA_MIGRATION_JOURNAL',sequence:2,previousSha256:recoveryHash(first),payload:payload('REQUIRES_REVIEW'),payloadSha256:recoveryHash(JSON.stringify(payload('REQUIRES_REVIEW')))})+'\n';
 return{version:1,purpose:'CUEVO_UNKNOWN_PREFIX_RECONCILIATION_TEMPLATE',recoverySource:{sourceSha:recovery.sha,treeSha:recovery.tree,ciRunId:'37710000000',releaseRunId:'37710000001',runAttempt:1},originalRunId:'37703459549',originalRunAttempt:1,originalIdentity,ownerJson,recordJson:[first,second],stageRows:rows.slice(0,123),prefixRows:rows.slice(0,120),configSha256:'cc91534b07b96e61b993f179225a9929b65e965d19a5a02e242c79126166b4ff',historySha256:'e'.repeat(64),cataloguePolicySha256:'f'.repeat(64),catalogueSha256:'1'.repeat(64),absencePolicySha256:'2'.repeat(64),endpointSha256:'3'.repeat(64)};
}


test('exact original120 recovery workdirs retain123 original bytes and only three pending files',async()=>{
 const {createHostedMigrationWorkdirs}=await api();
 const repository=resolve(import.meta.dirname,'../..'),root=mkdtempSync(join(tmpdir(),'cuevo-reconciliation-workdirs-'));
 try{git(root,'clone','--shared','--no-checkout','--quiet',repository,'.');git(root,'checkout','--quiet','--detach','d87455114cac2d22d63d040ce5b13e6b2e74e743');
  const sourceSha=git(root,'rev-parse','HEAD'),treeSha=git(root,'rev-parse','HEAD^{tree}'),loaded=readCanonicalMigrationSources({repoRoot:root,sourceSha,treeSha}),now=Date.parse('2026-10-08T01:00:00Z'),source={sha:sourceSha,tree:treeSha};
  const empty={projectRef:recoveryProjectRef,boundProjectRef:recoveryProjectRef,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(now).toISOString(),authUsers:0,storageObjects:0,appSchemas:[],migrationVersions:[],dispatchDisabled:true,population:'EMPTY'},initial=planHostedMigrations({sources:loaded.sources,source,target:empty,now}),prefix=initial.migrations.slice(0,120),priorReceipt={projectRef:recoveryProjectRef,sourceSha,treeSha,migrations:prefix.map(({version,sha256})=>({version,sha256}))},template=reconciliationTemplateFor(initial.migrations,source);
  const plan=createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha,treeSha,now,target:{...empty,population:'SCHEMA_ONLY',appSchemas:['app','authorization','internal'],migrationVersions:prefix.map(r=>r.version)},priorReceipt,reconciliationTemplate:template}).plan;
  const input={repoRoot:root,sourceSha,treeSha,plan,outputRoot:join(root,'.local/hosted-release')};const built=await createHostedMigrationWorkdirs(input),stage=built.stages[0];assert.equal(stage.included.length,123);assert.equal(stage.expectedBeforeVersions.length,120);assert.deepEqual(stage.pending,initial.migrations.slice(120,123));
  for(const row of stage.included)assert.equal(hash(readFileSync(join(stage.workdir,'supabase/migrations',row.name))),row.sha256);
  await assert.rejects(createHostedMigrationWorkdirs({...input,plan:{...plan,reconciliationTemplate:undefined}}));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('bounded batch workdirs retain exact cumulative original bytes with remaining51 split20/20/11',async()=>{
 const subject=await api();assert.equal(typeof subject.createHostedMigrationBatchWorkdirs,'function');
 await fixture(async input=>{const parent=(await subject.createHostedMigrationWorkdirs(input)).stages[3],built=await subject.createHostedMigrationBatchWorkdirs({...input,stage:parent});
  assert.deepEqual(built.batches.map(batch=>batch.pending.length),[20,20,11]);assert.equal(built.execution,'NOT_EXECUTED');assert.equal(built.stageSha256,hash(JSON.stringify({included:parent.included,configSha256:parent.configSha256})));
  assert.deepEqual(built.batches.map(batch=>batch.cumulativeIncluded.length),[200,220,231]);assert.deepEqual(built.batches.flatMap(batch=>batch.pending),parent.pending);assert.deepEqual(built.batches.at(-1)!.expectedAfterVersions,parent.expectedAfterVersions);
  for(const batch of built.batches){const manifest=JSON.parse(readFileSync(batch.manifestPath,'utf8'));assert.equal(manifest.stageSha256,built.stageSha256);assert.equal(manifest.batchSha256,batch.batchSha256);assert.equal(hash(readFileSync(batch.manifestPath)),batch.manifestSha256);for(const row of batch.cumulativeIncluded)assert.equal(hash(readFileSync(join(batch.workdir,'supabase/migrations',row.name))),row.sha256);assert.equal(batch.commandArgs[8],batch.workdir);}
  const changed=structuredClone(parent);changed.pending=changed.pending.slice(1);await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,stage:changed}));
 });
});

test('batch workdirs refuse caller size overrides, accessor stage and forged pending ordering before output',async()=>{
 const subject=await api();await fixture(async input=>{const parent=(await subject.createHostedMigrationWorkdirs(input)).stages[3],before=readdirSync(input.outputRoot).sort();let traps=0;
  await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,stage:parent,maxPendingPerBatch:100} as never));await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,get stage(){traps++;return parent;}}));assert.equal(traps,0);
  const changed=structuredClone(parent);changed.pending.reverse();await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,stage:changed}));assert.deepEqual(readdirSync(input.outputRoot).sort(),before);
 });
});

test('batch builder refuses source drift during asynchronous emission before recording READY',async()=>{
 const subject=await api();await fixture(async input=>{const parent=(await subject.createHostedMigrationWorkdirs(input)).stages[3],native=createRequire(import.meta.url)('node:fs/promises') as typeof import('node:fs/promises'),originalOpen=native.open;let changed=false;
  native.open=(async(...args:Parameters<typeof originalOpen>)=>{if(!changed&&String(args[0]).includes('batch-001')&&String(args[0]).endsWith('config.toml')){changed=true;writeFileSync(join(input.repoRoot,'supabase/migrations',parent.pending[0].name),'select 999;\n');}return originalOpen(...args);}) as typeof originalOpen;syncBuiltinESMExports();
  try{await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,stage:parent}));assert.equal(changed,true);const batchRoot=readdirSync(input.outputRoot).find(name=>name.startsWith('batches-'))!;assert.equal(JSON.parse(readFileSync(join(input.outputRoot,batchRoot,'builder-state.json'),'utf8')).state,'REQUIRES_REVIEW');}
  finally{native.open=originalOpen;syncBuiltinESMExports();}
 });
});

test('observation-only preparation retains exact no-SQL stage identity without materializing migration files',async()=>{
 const subject=await api();await fixture(async input=>{
  const rows=input.plan.migrations,projectRef=input.plan.projectRef,now=Date.parse('2026-10-07T12:00:00Z');
  const plan=planHostedMigrations({sources:readCanonicalMigrationSources(input).sources,source:{sha:input.sourceSha,tree:input.treeSha},priorReceipt:{projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,migrations:rows.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:rows.length},now,target:{projectRef,boundProjectRef:projectRef,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(now).toISOString(),authUsers:133,storageObjects:3,appSchemas:['app','authorization','internal'],migrationVersions:rows.map(row=>row.version),dispatchDisabled:true,population:'GUARDED_SYNTHETIC'}});
  plan.runtimeOnly=true;
  const built=await subject.createHostedMigrationWorkdirs({...input,plan,preparation:'RUNTIME_OBSERVATION'});
  assert.equal(built.stages.length,4);assert.deepEqual(readdirSync(built.root),['builder-state.json']);
  assert.ok(built.stages.every(stage=>stage.pending.length===0&&stage.included.length===rows.length&&stage.materialization==='METADATA_ONLY'));
  for(const stage of built.stages)assert.equal(existsSync(stage.workdir),false);
  const admission=await import('./hosted-migration-stage-files');await assert.rejects(admission.admitHostedMigrationStageFiles({...input,plan,stage:built.stages[3]}));
  await assert.rejects(subject.createHostedMigrationWorkdirs({...input,preparation:'RUNTIME_OBSERVATION'}));await assert.rejects(subject.createHostedMigrationWorkdirs({...input,plan,preparation:'PREFIX_SQL'}));
 });
});

test('completed inactive installation prepares no SQL copies while preserving original no-op migration identity',async()=>{
 const subject=await api();await fixture(async input=>{
  const rows=input.plan.migrations,projectRef=input.plan.projectRef,now=Date.parse('2026-10-07T12:00:00Z');
  const plan=planHostedMigrations({sources:readCanonicalMigrationSources(input).sources,source:{sha:input.sourceSha,tree:input.treeSha},priorReceipt:{projectRef,sourceSha:input.sourceSha,treeSha:input.treeSha,migrations:rows.map(({version,sha256})=>({version,sha256})),completedSourceMigrationCount:rows.length},now,target:{projectRef,boundProjectRef:projectRef,projectName:'Cuevo',projectStatus:'ACTIVE_HEALTHY',deploymentEnvironment:'synthetic-staging',observedAt:new Date(now).toISOString(),authUsers:133,storageObjects:3,appSchemas:['app','authorization','internal'],migrationVersions:rows.map(row=>row.version),dispatchDisabled:true,population:'GUARDED_SYNTHETIC'}});
  const built=await subject.createHostedMigrationWorkdirs({...input,plan,preparation:'INSTALLED_NOOP' as never});
  assert.equal(plan.runtimeOnly,undefined);assert.deepEqual(readdirSync(built.root),['builder-state.json']);
  for(const stage of built.stages){assert.equal(stage.materialization,'METADATA_ONLY');assert.equal(existsSync(stage.workdir),false);assert.deepEqual(stage.included,rows);assert.equal(stage.pending.length,0);assert.deepEqual(stage.expectedBeforeVersions,rows.map(row=>row.version).sort());}
  const admission=await import('./hosted-migration-stage-files');assert.equal(typeof admission.admitInstalledMigrationStageMetadata,'function');
  const inputStage={...input,plan,stage:built.stages[3]},receipt=await admission.admitInstalledMigrationStageMetadata(inputStage);
  assert.equal(receipt.evidence,'VERIFIED_GIT_AND_INSTALLED_STAGE_METADATA');assert.equal(receipt.sources.length,rows.length);
  await assert.rejects(admission.admitHostedMigrationStageFiles(inputStage));
  await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,plan,stage:built.stages[3]}));
  await assert.rejects(subject.createHostedMigrationWorkdirs({...input,preparation:'INSTALLED_NOOP' as never}));
  await assert.rejects(subject.createHostedMigrationWorkdirs({...input,plan:{...plan,runtimeOnly:true},preparation:'INSTALLED_NOOP' as never}));
  await assert.rejects(subject.createHostedMigrationWorkdirs({...input,plan:{...plan,priorCompletedRelease:undefined},preparation:'INSTALLED_NOOP' as never}));
  await assert.rejects(admission.admitInstalledMigrationStageMetadata({...inputStage,stage:{...built.stages[3],included:rows.slice(1)}}));
  await assert.rejects(admission.admitInstalledMigrationStageMetadata({...inputStage,stage:{...built.stages[3],commandArgs:['db','push','--yes']}}));
  const statePath=join(built.root,'builder-state.json'),originalState=readFileSync(statePath);
  for(const text of [originalState.toString().replace('"state":"READY"','"state":"CREATING"'),originalState.toString().replace('"state":"READY"','"state":"CREATING","state":"READY"'),' '.repeat(49153)+originalState.toString()]){writeFileSync(statePath,text);await assert.rejects(admission.admitInstalledMigrationStageMetadata(inputStage));}
  writeFileSync(statePath,originalState);
  const fsPromises=createRequire(import.meta.url)('node:fs/promises')as typeof import('node:fs/promises'),originalLstat=fsPromises.lstat;let changed=false;
  fsPromises.lstat=(async(...args:Parameters<typeof originalLstat>)=>{if(!changed&&String(args[0])===built.stages[3].workdir){changed=true;writeFileSync(statePath,originalState.toString().replace('"state":"READY"','"state":"CREATING"'));}return originalLstat(...args);})as typeof originalLstat;syncBuiltinESMExports();
  try{await assert.rejects(admission.admitInstalledMigrationStageMetadata(inputStage),'Builder state changed during the final filesystem await must refuse source metadata');assert.equal(changed,true);}finally{fsPromises.lstat=originalLstat;syncBuiltinESMExports();writeFileSync(statePath,originalState);}
  mkdirSync(built.stages[3].workdir);await assert.rejects(admission.admitInstalledMigrationStageMetadata(inputStage));rmSync(built.stages[3].workdir,{recursive:true});
  writeFileSync(join(input.repoRoot,'supabase/migrations',rows[0].name),'select 999;');await assert.rejects(admission.admitInstalledMigrationStageMetadata(inputStage));
 });
});

test('actual child144 workdirs and file admission preserve installed rows while residual CLI children contain only missing36',async()=>{
 const subject=await api();await fixture(async input=>{const cp=createRequire(import.meta.url)('node:child_process')as typeof import('node:child_process'),nativeExec=cp.execFileSync,originalSha='1a493ad735798bb6d3fa0ffaabc779e62149ac37',originalTree='a207a7ec44dd29d61adc0490b85fedbf1e696fcd';cp.execFileSync=((command:string,args:readonly string[],...rest:unknown[])=>{if(command==='git'&&args[0]==='-C'&&args[1]===input.repoRoot&&(args.includes(originalSha)||args.some(arg=>arg.startsWith(originalSha+'^')))){const repository=resolve(import.meta.dirname,'../..');if(args[2]==='merge-base')return Buffer.alloc(0);return Reflect.apply(nativeExec,cp,[command,['-C',repository,...args.slice(2)],...rest]);}return Reflect.apply(nativeExec,cp,[command,args,...rest]);})as typeof nativeExec;syncBuiltinESMExports();try{assert.equal(git(resolve(import.meta.dirname,'../..'),'rev-parse',originalSha+'^{tree}'),originalTree);const selected=(await import('./hosted-original-child-recovery.fixture')).originalChildRecoveryPlanFixture({sha:input.sourceSha,tree:input.treeSha}),plan=planHostedMigrations(selected),built=await subject.createHostedMigrationWorkdirs({...input,plan}),parent=built.stages[2];assert.equal(parent.pending.length,36);assert.equal(parent.expectedBeforeVersions.length,144);assert.deepEqual(built.stages.slice(0,2).map(stage=>stage.pending.length),[0,0]);const batches=await subject.createHostedMigrationBatchWorkdirs({...input,plan,stage:parent});assert.deepEqual(batches.batches.map(batch=>[batch.expectedBeforeVersions.length,batch.expectedAfterVersions.length,batch.pending.length]),[[144,164,20],[164,180,16]]);const files=await import('./hosted-migration-stage-files');await files.admitHostedMigrationStageFiles({...input,plan,stage:parent});for(const batch of batches.batches)await files.admitHostedMigrationBatchFiles({...input,plan,stage:parent,batch});assert.equal(batches.batches[0].pending.some(row=>selected.originalChildRecovery.template.firstChild.pending.some(old=>old.name===row.name)),false);for(const row of selected.originalChildRecovery.template.firstChild.pending)assert.equal(hash(readFileSync(join(parent.workdir,'supabase/migrations',row.name))),row.sha256);await assert.rejects(subject.createHostedMigrationBatchWorkdirs({...input,plan:{...plan,originalChildRecovery:undefined,reconciledChild:undefined},stage:parent}));}finally{cp.execFileSync=nativeExec;syncBuiltinESMExports();}});
});
