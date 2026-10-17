import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateFullRegressionWorkflow,validateCiSourceJobs,validateCiRuntimeJobs } from './verification-workflows';
import {execFileSync} from 'node:child_process';
import {ciCodeqlJob,ciCodeqlJobBeforeUpgrade,deriveCodeqlJobStepContract,selectCanonicalWorkflowJob,ciDatabaseJobBeforeOriginal231,ciRuntimeBrowserJobBeforeDiagnostics,ciDatabaseJob,ciSourceJobs} from './verification-workflows';

test('native Cron is required in the current database job while historical pre-Cron source stays exact',()=>{
 const steps=ciDatabaseJob.steps as Record<string,unknown>[],proof=steps.find(step=>step.name==='Verify native restricted SQL Cron mechanics');assert.deepEqual(proof,{name:'Verify native restricted SQL Cron mechanics',run:'node --import tsx scripts/database/worker-native-cron-proof.ts'});assert.equal(steps.filter(step=>step.name===proof!.name).length,1);
 assert.ok(steps.some(step=>step.name==='Retain exact source original231 transport232 catalogue reference'));
 for(const [name,file]of[['Retain minimized native Cron proof','proof.json'],['Retain minimized native Cron failure','failure.json']]){const step=steps.find(step=>step.name===name)!;assert.equal((step.with as Record<string,unknown>).path,'.local/worker-native-cron-proof/'+file);assert.equal(step['continue-on-error'],undefined);assert.equal(step.if,file==='failure.json'?'always()':undefined);}
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),source='304254cf2e8fb80373aefca227fda30a18535ddb',old=(yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['database-checks'];assert.deepEqual(selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),old);assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'CURRENT_SOURCE',{sha:source,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',{...old as object,'continue-on-error':true},'ORIGINAL_RUNTIME_METADATA',{sha:source,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
});

test('the final custody source retains its exact pre-Cron original job after current proof integration',()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024});for(const source of['304254cf2e8fb80373aefca227fda30a18535ddb','0852c34c8c4001591e6752e616875cbd195c8d28']){const old=(yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['database-checks'];assert.deepEqual(selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),old);assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'CURRENT_SOURCE',{sha:source,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',{...old as object,'continue-on-error':true},'ORIGINAL_RUNTIME_METADATA',{sha:source,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));}
});

test('merged main retains the exact original pre-Cron job without satisfying current mechanics admission',()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),source='4edd18feaf7374f35cac1264e88470af061cb31b',old=(yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['database-checks'];assert.equal(git(['rev-parse',source+'^{tree}']).toString().trim(),'d3ffa3747529b4953b4176a252bbbe88c440b288');assert.deepEqual(selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),old);assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'CURRENT_SOURCE',{sha:source,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',{...old as object,'continue-on-error':true},'ORIGINAL_RUNTIME_METADATA',{sha:source,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
});

test('actual main88 pre-Actions source and original501 require original purpose without changing current or earlier CodeQL policy',()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024});
 for(const source of ['501224dc5f6bfea631ecc66a0efae7892a83c847','88b35965242e5b076806da3f05110bd61db12ef7']){
  const jobs=yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>;
  for(const name of ['fast-checks','source-fixtures-native','source-fixtures-contracts','source-fixtures-delivery','source-contracts','source-cohort-continuation-1','source-cohort-reconciliation-2','runtime-backend','runtime-browser','integration-learning','integration-state','technical-mvp','database-checks']){
   assert.deepEqual(selectCanonicalWorkflowJob(name,jobs[name],'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),jobs[name],source+': '+name);
   assert.throws(()=>selectCanonicalWorkflowJob(name,jobs[name],'CURRENT_SOURCE',{sha:source,git}),source+': '+name);
  }
  const original=deriveCodeqlJobStepContract(jobs.codeql,'ORIGINAL_RUNTIME_METADATA',{sha:source,git});
  assert.equal(original.requiredSteps[1],'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
  assert.throws(()=>deriveCodeqlJobStepContract(jobs.codeql,'CURRENT_SOURCE',{sha:source,git}));
  assert.throws(()=>deriveCodeqlJobStepContract(jobs.codeql,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
 }
 const original951=(yaml.load(git(['show','95184c1146f341bd2f1e60536229ab0e134ef5b9:.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>).codeql;
 assert.equal(deriveCodeqlJobStepContract(original951,'ORIGINAL_RUNTIME_METADATA',{sha:'95184c1146f341bd2f1e60536229ab0e134ef5b9',git}).requiredSteps[5],'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2');
});

test('canonical job eras preserve actual original source jobs and reject current old mixed or unbound contracts',()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),source='501224dc5f6bfea631ecc66a0efae7892a83c847';
 const original=yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,{steps:Record<string,unknown>[]}>;
 const pins=[['actions/setup-node@820762786026740c76f36085b0efc47a31fe5020','actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'],['actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a','actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'],['actions/download-artifact@70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3','actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333']];
 for(const name of ['fast-checks','source-fixtures-native','source-fixtures-contracts','source-fixtures-delivery','source-contracts','source-cohort-continuation-1','source-cohort-reconciliation-2','runtime-backend','runtime-browser','integration-learning','integration-state','technical-mvp','database-checks']){
  const old=original[name],current=structuredClone(name==='database-checks'?ciDatabaseJob:name==='source-fixtures-delivery'?(ciSourceJobs as Record<string,unknown>)[name]:old)as{steps:Record<string,unknown>[]};for(const step of current.steps)for(const[before,after]of pins)if(step.uses===before)step.uses=after;
  assert.deepEqual(selectCanonicalWorkflowJob(name,current,'CURRENT_SOURCE'),current,name);
  assert.deepEqual(selectCanonicalWorkflowJob(name,old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),old,name);
  assert.throws(()=>selectCanonicalWorkflowJob(name,old,'CURRENT_SOURCE',{sha:source,git}),name);
  assert.throws(()=>selectCanonicalWorkflowJob(name,old,'ORIGINAL_RUNTIME_METADATA'),name);
  assert.throws(()=>selectCanonicalWorkflowJob(name,old,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}),name);
  const changed=structuredClone(current);changed.steps.find(step=>String(step.uses??'').startsWith('actions/setup-node@'))!.uses='actions/setup-node@'+'f'.repeat(40);
  assert.throws(()=>selectCanonicalWorkflowJob(name,changed,'CURRENT_SOURCE'),name);
  assert.throws(()=>selectCanonicalWorkflowJob(name,changed,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),name);
 }
 assert.throws(()=>selectCanonicalWorkflowJob('unknown',original['database-checks'],'ORIGINAL_RUNTIME_METADATA',{sha:source,git}));
 assert.deepEqual(ciDatabaseJobBeforeOriginal231,(yaml.load(git(['show','239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37:.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['database-checks']);
 assert.deepEqual(ciRuntimeBrowserJobBeforeDiagnostics,(yaml.load(git(['show','08006c085d5030178bc104129b7ff28f7273346e:.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['runtime-browser']);
});

test('reviewed Actions pins are admitted as current complete source and runtime jobs without relaxing mixed pins',async()=>{
 const text=await readFile('.github/workflows/ci.yml','utf8');
 const upgrades=[['043fb46d1a93c77aae656e7c1c64a875d1fc6a0a','cf430e030ddbb5b0abf93d22962f4752f3646cd9'],['70fc10c6e5e1ce46ad2ea6f2b72d43f7d47b13c3','9000827ccba6bdab643e8b6fd33ac0654aef8333'],['820762786026740c76f36085b0efc47a31fe5020','949feb2413d6458794dcd2491c4babbbce0c15c1']];
 const upgraded=upgrades.reduce((value,[before,after])=>value.replaceAll(before,after),text),flow=yaml.load(upgraded);
 assert.deepEqual(validateCiSourceJobs(flow.jobs),[]);
 assert.deepEqual(validateCiRuntimeJobs(flow.jobs),[]);
 for(const [oldPin,newPin] of upgrades){const changed=yaml.load(upgraded.replaceAll(newPin,oldPin));assert.ok(validateCiSourceJobs(changed.jobs).length||validateCiRuntimeJobs(changed.jobs).length);}
 const mixed=yaml.load(upgraded.replace('actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1','actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'));
 assert.ok(validateCiSourceJobs(mixed.jobs).length);
});

test('CodeQL current and original pre-Actions source select distinct setup and receipt contracts',async()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),source='501224dc5f6bfea631ecc66a0efae7892a83c847';
 const original=(yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>).codeql;
 const current=structuredClone(original) as {steps:Record<string,unknown>[]};
 current.steps[1].uses='actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1';current.steps[8].uses='actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9';
 const contract=deriveCodeqlJobStepContract(current,'CURRENT_SOURCE');
 assert.equal(contract.requiredSteps[1],'Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1');
 assert.ok(contract.allowedPostSteps.includes('Post Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'));
 assert.ok(!contract.allowedPostSteps.includes('Post Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'));
 assert.throws(()=>deriveCodeqlJobStepContract(original,'CURRENT_SOURCE',{sha:source,git}));
 const retained=deriveCodeqlJobStepContract(original,'ORIGINAL_RUNTIME_METADATA',{sha:source,git});
 assert.equal(retained.requiredSteps[1],'Run actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
 assert.ok(!retained.allowedPostSteps.includes('Post Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'));
 assert.throws(()=>deriveCodeqlJobStepContract(original,'ORIGINAL_RUNTIME_METADATA'));
 assert.throws(()=>deriveCodeqlJobStepContract(original,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
 for(const index of [1,8]){const mixed=structuredClone(current);mixed.steps[index].uses=(original as typeof current).steps[index].uses;assert.throws(()=>deriveCodeqlJobStepContract(mixed,'CURRENT_SOURCE'));assert.throws(()=>deriveCodeqlJobStepContract(mixed,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}));}
});

test('official CodeQL step projection admits exact new whole job and source-bound original cutoffs only',async()=>{
 const current=deriveCodeqlJobStepContract(ciCodeqlJob,'CURRENT_SOURCE');
 assert.equal(current.requiredSteps[5],'Run github/codeql-action/init@24c54180a607b1449ed407dd24f251e4e9147c8d');
 assert.equal(current.requiredSteps[6],'Run github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d');
 assert.ok(current.allowedPostSteps.includes('Post Run github/codeql-action/analyze@24c54180a607b1449ed407dd24f251e4e9147c8d'));
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),cutoff='95184c1146f341bd2f1e60536229ab0e134ef5b9';
 for(const sha of ['08006c085d5030178bc104129b7ff28f7273346e','561085f8df13c40fbd23ba51f422ed3445d3a4a9','c4e734d07b1484262bbedbc4b9fcc73baf3eeff2','ef8437b7fd77cc0f518efbb88756ab0ae78c07c6',cutoff,'239bb18f5646bbfcc0aa5a5bee56edb81e9dfb37']){
  const original=(yaml.load(new TextDecoder('utf8',{fatal:true}).decode(git(['show',sha+':.github/workflows/ci.yml']))).jobs as Record<string,unknown>).codeql;
  assert.equal(deriveCodeqlJobStepContract(original,'ORIGINAL_RUNTIME_METADATA',{sha,git}).requiredSteps[5],'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2');
  assert.throws(()=>deriveCodeqlJobStepContract(original,'CURRENT_SOURCE',{sha,git}));
  assert.throws(()=>deriveCodeqlJobStepContract(original,'ORIGINAL_RUNTIME_METADATA',{sha:'0ed9a09d4316466de45fe08d09d2f0afcb2845ac',git}));
  assert.throws(()=>deriveCodeqlJobStepContract(original,'ORIGINAL_RUNTIME_METADATA',{sha,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
 }
 const lastPreUpgrade=(yaml.load(new TextDecoder('utf8',{fatal:true}).decode(git(['show',cutoff+':.github/workflows/ci.yml']))).jobs as Record<string,unknown>).codeql;
 assert.deepEqual(lastPreUpgrade,ciCodeqlJobBeforeUpgrade);
 assert.equal(deriveCodeqlJobStepContract(lastPreUpgrade,'ORIGINAL_RUNTIME_METADATA',{sha:cutoff,git}).requiredSteps[5],'Run github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2');
 assert.throws(()=>deriveCodeqlJobStepContract(lastPreUpgrade,'CURRENT_SOURCE',{sha:cutoff,git}));
 assert.throws(()=>deriveCodeqlJobStepContract(lastPreUpgrade,'ORIGINAL_RUNTIME_METADATA',{sha:cutoff,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
 assert.throws(()=>deriveCodeqlJobStepContract(lastPreUpgrade,'ORIGINAL_RUNTIME_METADATA',{sha:'0'.repeat(40),git}));
 assert.throws(()=>deriveCodeqlJobStepContract(lastPreUpgrade,'ORIGINAL_RUNTIME_METADATA',{sha:'9cb2b02620a2be39649970c49488fc65194beb28',git}));
 assert.throws(()=>deriveCodeqlJobStepContract({},'ORIGINAL_RUNTIME_METADATA',{sha:cutoff,git}));
 const suppliedCutoff={sha:'9cb2b02620a2be39649970c49488fc65194beb28',git,cutoff:'9cb2b02620a2be39649970c49488fc65194beb28',tree:'a635b2e566f13dd7ef7bb80816c7a246dab58fe1'};
 assert.throws(()=>deriveCodeqlJobStepContract(lastPreUpgrade,'ORIGINAL_RUNTIME_METADATA',suppliedCutoff));
 for(const mode of ['split','permission','hidden','sarif','wait','path','budget']){
  const changed=structuredClone(ciCodeqlJob) as unknown as {steps:Record<string,unknown>[];permissions:Record<string,string>;[key:string]:unknown};
  if(mode==='split')changed.steps[5].uses='github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2';
  if(mode==='permission')changed.permissions.contents='write';if(mode==='budget')changed['timeout-minutes']=25;
  if(mode==='hidden'||mode==='path')(changed.steps[8].with as Record<string,unknown>)[mode==='hidden'?'include-hidden-files':'path']=mode==='hidden'?false:'.local/**';
  if(mode==='wait')(changed.steps[6].with as Record<string,unknown>)['wait-for-processing']=false;
  if(mode==='sarif')(changed.steps[7].env as Record<string,unknown>).CUEVO_CODEQL_SARIF_ID='supplied';
  assert.throws(()=>deriveCodeqlJobStepContract(changed,'CURRENT_SOURCE'),mode);
 }
});

test('one existing database producer retains exact original231 source proof without a second replay',async()=>{
 const api:Record<string,unknown>=await import('./verification-workflows');assert.ok(api.ciOriginal231CatalogueArtifactStep,'source231 requires its own exact retained artifact');const step=api.ciOriginal231CatalogueArtifactStep as Record<string,unknown>,job=api.ciDatabaseJob as{steps:Record<string,unknown>[]};assert.deepEqual(step,{name:'Retain exact source original231 catalogue reference',uses:'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',with:{name:'cuevo-original231-catalogue-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/child144-catalogue/source231.json','include-hidden-files':true,'if-no-files-found':'error','retention-days':90}});assert.equal(job.steps.filter(row=>row.run==='node --import tsx scripts/database/hosted-child-catalogue-producer.ts').length,1);assert.equal(job.steps.filter(row=>row.name===step.name).length,1);const source=await readFile('.github/workflows/ci.yml','utf8'),flow=yaml.load(source)as{jobs:Record<string,{steps:Record<string,unknown>[]}>};assert.deepEqual(flow.jobs['database-checks'],job);assert.ok(flow.jobs['database-checks'].steps.some(row=>row.name===step.name));
});
test('one existing database producer retains distinct exact232 definition proof and preserves only the verified pre232 source era',async()=>{
 const api:Record<string,unknown>=await import('./verification-workflows'),step=api.ciOriginal231TransportCatalogueArtifactStep as Record<string,unknown>|undefined;assert.ok(step,'source232 needs a distinct required artifact from its existing producer');
 assert.deepEqual(step,{name:'Retain exact source original231 transport232 catalogue reference',uses:'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',with:{name:'cuevo-original231-transport232-catalogue-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/child144-catalogue/source232.json','include-hidden-files':true,'if-no-files-found':'error','retention-days':90}});
 const job=api.ciDatabaseJob as{steps:Record<string,unknown>[]};assert.equal(job.steps.filter(row=>row.run==='node --import tsx scripts/database/hosted-child-catalogue-producer.ts').length,1);assert.equal(job.steps.filter(row=>row.name===step.name).length,1);
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),sha='5b6e39956d7b9cbe507ec4352812f433225fa6f6',old=(yaml.load(git(['show',sha+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['database-checks'];
 assert.deepEqual(selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha,git}),old);assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'CURRENT_SOURCE',{sha,git}));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA'));assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
 const changed=structuredClone(old) as {steps:Record<string,unknown>[]};changed.steps.push(structuredClone(step));changed.steps.at(-1)!.with={...(step.with as object),path:'.local/'};assert.throws(()=>selectCanonicalWorkflowJob('database-checks',changed,'ORIGINAL_RUNTIME_METADATA',{sha,git}));
 const current=yaml.load(await readFile('.github/workflows/ci.yml','utf8'))as{jobs:Record<string,unknown>};assert.deepEqual(current.jobs['database-checks'],job);
});
test('pre-Actions database source retains its original contract after232 retention is added to current CI',()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024}),sha='501224dc5f6bfea631ecc66a0efae7892a83c847',old=(yaml.load(git(['show',sha+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['database-checks'];assert.deepEqual(selectCanonicalWorkflowJob('database-checks',old,'ORIGINAL_RUNTIME_METADATA',{sha,git}),old);assert.throws(()=>selectCanonicalWorkflowJob('database-checks',old,'CURRENT_SOURCE',{sha,git}));
});
import { statelessVerificationSteps } from './steps';
import { createRequire } from 'node:module';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): Record<string, unknown>; dump(value: unknown): string };

test('reset failure companion retains only minimized files without changing required restoration admission', async()=>{
  const text=await readFile('.github/workflows/ci.yml','utf8'),flow=yaml.load(text) as {jobs:Record<string,{steps:Record<string,unknown>[]}>};
  assert.deepEqual(validateCiRuntimeJobs(flow.jobs),[]);
  const steps=flow.jobs['integration-state'].steps,diagnostic=steps.filter(s=>s.name==='Retain minimized local reset failure diagnostics');
  assert.equal(diagnostic.length,1);
  assert.deepEqual(diagnostic[0],{name:'Retain minimized local reset failure diagnostics',if:'always()',uses:'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',with:{name:'cuevo-reset-diagnostic-integration-state-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/migration-replay/operation-*/reset-diagnostic.json','include-hidden-files':true,'if-no-files-found':'warn','retention-days':14}});
  const result=steps.find(s=>s.name==='Retain exact integration-state partition')!;
  assert.equal((result.with as Record<string,unknown>).path,'.local/integration-partitions/integration-state/result.json');
  assert.equal((result.with as Record<string,unknown>)['if-no-files-found'],'error');
  assert.equal(steps.indexOf(diagnostic[0]),steps.indexOf(result)+1);
  assert.equal(steps.at(-1)?.run,'npx --no-install supabase stop --project-id cuevo');
  const aggregate=flow.jobs['technical-mvp'].steps.find(s=>s.name==='Combine exact source and required runtime lanes')!;
  assert.ok(String(aggregate.run).includes('test "$STATE" = success'));
  for(const mode of ['missing','raw-path','wrong-name','success-only','required','budget','ignore-failure','omit-result']){
    const changed=structuredClone(flow.jobs),job=changed['integration-state'] as Record<string,unknown>,rows=job.steps as Record<string,unknown>[],d=rows.find(s=>s.name===diagnostic[0].name)!;
    if(mode==='missing')rows.splice(rows.indexOf(d),1);
    if(mode==='raw-path')(d.with as Record<string,unknown>).path='.local/migration-replay/';
    if(mode==='wrong-name')(d.with as Record<string,unknown>).name='cuevo-reset-diagnostic-latest';
    if(mode==='success-only')d.if='success()';
    if(mode==='required')(d.with as Record<string,unknown>)['if-no-files-found']='error';
    if(mode==='budget')job['timeout-minutes']=60;
    if(mode==='ignore-failure')job['continue-on-error']=true;
    if(mode==='omit-result')rows.splice(rows.findIndex(s=>s.name===result.name),1);
    assert.ok(validateCiRuntimeJobs(changed).length,mode);
  }
});

test('start failure companion retains only safe exact operation files and cannot replace the required partition',async()=>{
 const workflow=yaml.load(await readFile('.github/workflows/ci.yml','utf8')) as {jobs:Record<string,{steps:Record<string,unknown>[]}>};
 assert.deepEqual(validateCiRuntimeJobs(workflow.jobs),[]);
 const steps=workflow.jobs['integration-state'].steps,artifact=steps.find(s=>s.name==='Retain minimized local start failure diagnostics')!;
 assert.deepEqual(artifact,{name:'Retain minimized local start failure diagnostics',if:'always()',uses:'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',with:{name:'cuevo-start-diagnostic-integration-state-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/migration-replay/operation-*/start-diagnostic.json','include-hidden-files':true,'if-no-files-found':'warn','retention-days':14}});
 assert.equal((steps.find(s=>s.name==='Retain exact integration-state partition')!.with as Record<string,unknown>).path,'.local/integration-partitions/integration-state/result.json');
 for(const mode of ['missing','raw','overwrite','success-only','required','continue']){const jobs=structuredClone(workflow.jobs),job=jobs['integration-state'],rows=job.steps,a=rows.find(s=>s.name===artifact.name)!;
 if(mode==='missing')rows.splice(rows.indexOf(a),1);if(mode==='raw')(a.with as Record<string,unknown>).path='.local/supabase-start.log';if(mode==='overwrite')(a.with as Record<string,unknown>).name='cuevo-integration-integration-state-${{ github.run_id }}-${{ github.run_attempt }}';if(mode==='success-only')a.if='success()';if(mode==='required')(a.with as Record<string,unknown>)['if-no-files-found']='error';if(mode==='continue')(job as Record<string,unknown>)['continue-on-error']=true;
 assert.ok(validateCiRuntimeJobs(jobs).length,mode);
 }
});

test('full workflow admission refuses execution changes outside named commands', async () => {
  const text = await readFile('.github/workflows/full-regression.yml','utf8');
  type Row = Record<string, unknown>;
  const mutations = [
    (flow: Row) => { (flow.env as Row).NODE_OPTIONS = '--import ./unreviewed.js'; },
    (flow: Row) => { ((flow.jobs as Row)['technical-mvp'] as Row)['continue-on-error'] = true; },
    (flow: Row) => { ((flow.jobs as Row)['secret-scan'] as Row).permissions = { contents: 'write' }; },
    (flow: Row) => { ((flow.jobs as Row)['technical-mvp'] as Row).container = 'unreviewed:latest'; },
    (flow: Row) => { (flow.concurrency as Row).group = 'different-boundary'; },
    (flow: Row) => { const steps = ((flow.jobs as Row)['technical-mvp'] as Row).steps as Row[]; steps[0].env = { NODE_OPTIONS: '--import ./unreviewed.js' }; },
    (flow: Row) => { const steps = ((flow.jobs as Row)['technical-mvp'] as Row).steps as Row[]; (steps[8].with as Row)['retention-days'] = 90; },
    (flow: Row) => { flow.defaults = { run: { shell: 'unreviewed-shell' } }; },
  ];
  for (const mutate of mutations) { const flow = yaml.load(text); mutate(flow); assert.ok(validateFullRegressionWorkflow(yaml.dump(flow)).length > 0); }
});

test('isolated source job admission refuses changed commands budgets setup secrets and omitted frozen source checks', async()=>{
 const text=await readFile('.github/workflows/ci.yml','utf8'),flow=yaml.load(text);
 assert.deepEqual(validateCiSourceJobs(flow.jobs),[]);
 type Row=Record<string,unknown>;
 for(const owner of ['fast-checks','source-contracts','source-fixtures-native','source-fixtures-contracts','source-fixtures-delivery']){
  const mutations=[
   (job:Row)=>{job['continue-on-error']=true;},
   (job:Row)=>{job.if='false';},
   (job:Row)=>{job.needs=['runtime-backend'];},
   (job:Row)=>{job.env={GH_TOKEN:'private-token'};},
   (job:Row)=>{job['timeout-minutes']=120;},
   (job:Row)=>{(job.steps as Row[]).pop();},
   (job:Row)=>{const steps=job.steps as Row[];steps[steps.length-2].run='echo omitted';},
   (job:Row)=>{const checkout=(job.steps as Row[])[0];(checkout.with as Row)['fetch-depth']=1;},
  ];
  for(const mutate of mutations){const changed=yaml.load(text),jobs=changed.jobs as Record<string,Row>;mutate(jobs[owner]);assert.ok(validateCiSourceJobs(jobs).length,owner);}
 }
});
test('full regression has separate scheduled diagnostic and explicit customer purpose with complete required work', async () => {
  const text = await readFile('.github/workflows/full-regression.yml','utf8');
  assert.deepEqual(validateFullRegressionWorkflow(text), []);
  for (const changed of [text.replace('npm run verify:technical','echo passed'), text.replace('chromium firefox webkit','chromium'), text.replace('purpose:','mode:'), text.replace('path: .local/full-verification/summary.json','path: .local/'), text.replace('cancel-in-progress: false','cancel-in-progress: true')]) assert.ok(validateFullRegressionWorkflow(changed).length);
});

test('full regression retains failed-phase diagnostics at one exact bounded path without weakening success summary',async()=>{
  const text=await readFile('.github/workflows/full-regression.yml','utf8'),flow=yaml.load(text) as {jobs:{'technical-mvp':{steps:Record<string,unknown>[]}}},steps=flow.jobs['technical-mvp'].steps;
  const exporter=steps.find(row=>row.name==='Export exact full profile evidence')!,acceptance=steps.find(row=>row.name==='Run complete frozen acceptance')!;
  assert.equal(acceptance.id,'full-acceptance');assert.equal(exporter.if,'always()');
  assert.equal((exporter.env as Record<string,unknown>).CUEVO_FULL_ACCEPTANCE_OUTCOME,'${{ steps.full-acceptance.outcome }}');
  const diagnostics=steps.filter(row=>row.name==='Retain minimized full profile diagnostics');assert.equal(diagnostics.length,1);
  assert.equal(diagnostics[0].if,'always()');assert.deepEqual(diagnostics[0].with,{name:'cuevo-full-diagnostic-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/full-verification/diagnostic.json','include-hidden-files':true,'if-no-files-found':'warn','retention-days':14});
  const summary=steps.find(row=>row.name==='Retain exact full profile summary')!;assert.equal((summary.with as Record<string,unknown>).path,'.local/full-verification/summary.json');assert.equal(summary.if,undefined);
  assert.deepEqual(validateFullRegressionWorkflow(text),[]);
  for(const changed of [text.replace('path: .local/full-verification/diagnostic.json','path: .local/'),text.replace('CUEVO_FULL_ACCEPTANCE_OUTCOME:','CUEVO_FULL_UNTRUSTED_OUTCOME:'),text.replace('id: full-acceptance','id: foreign')])assert.ok(validateFullRegressionWorkflow(changed).length);
});

test('isolated source contracts execute each stateless owner once while fast checks retain complete lint types and unit work', async () => {
  const ci = await readFile('.github/workflows/ci.yml','utf8'), runner = await readFile('scripts/verification/stateless-checks.ts','utf8');
  type Job = { 'timeout-minutes': number; needs?: string[]; steps: { run?: string; name?: string }[] };
  const jobs = (yaml.load(ci).jobs as Record<string, Job>);
  const source = jobs['source-contracts'], fast = jobs['fast-checks'];
  assert.ok(source, 'Stateless source contracts need their own isolated required runner.');
  assert.equal(source['timeout-minutes'], 10);
  assert.equal(fast['timeout-minutes'], 20);
  assert.deepEqual(source.needs,['source-fixtures-native','source-fixtures-contracts','source-fixtures-delivery',...['continuation-1','continuation-2','continuation-3','continuation-4','continuation-5','reconciliation-1','reconciliation-2'].map(id=>'source-cohort-'+id)]); assert.equal(fast.needs, undefined);
  assert.equal(source.steps.filter(step => step.run?.includes('node --import tsx scripts/verification/stateless-source-aggregate.ts')).length, 1);
  assert.equal(fast.steps.some(step => step.run?.includes('stateless-checks.ts')), false);
  assert.equal(fast.steps.filter(step => step.run === 'npm run lint && npm run typecheck && npm test').length, 1);
  assert.equal(source.steps.some(step => step.run?.includes('npm run lint')), false);
  assert.ok(jobs.required.needs?.includes('source-contracts'));
  assert.equal(ci.split('node --import tsx scripts/verification/stateless-checks.ts --partition=').length-1,2);assert.equal(ci.split('--cohort-producer=').length-1,7);
  for(const partition of ['native','contracts','delivery'])assert.equal(jobs['source-fixtures-'+partition].steps.filter(step=>step.run==='node --import tsx scripts/verification/stateless-checks.ts '+(partition==='contracts'?'--ordinary-contracts':'--partition=source-'+partition)).length,1);
  assert.ok(runner.includes('statelessVerificationSteps'));
  const stateless=statelessVerificationSteps;
  for(const name of ['verification-rules','local-runtime','migration-replay-rules','cicd-fixtures']) assert.ok(stateless.some(step=>step.name===name));
  for(const name of ['browser','browser-compatibility','clean-bootstrap','database','integration','runtime-outage','recovery'])assert.equal(stateless.some(step=>step.name===name),false,name);
  assert.equal(new Set(stateless.map(step=>step.name)).size,stateless.length);
  assert.ok(ci.includes('npm run lint && npm run typecheck && npm test'));
});

test('source-contract evidence is retained only by its exact required producer with original source freeze',async()=>{
 const workflow=yaml.load(await readFile('.github/workflows/ci.yml','utf8')) as {jobs:Record<string,Record<string,unknown>>};
 assert.deepEqual(validateCiSourceJobs(workflow.jobs),[]);
 const source=workflow.jobs['source-contracts'] as {steps:{name?:string;run?:string;uses?:string;with?:Record<string,unknown>;if?:string}[]},step=source.steps.find(item=>item.name==='Retain exact safe source contracts')!;
 assert.ok(step);assert.equal(step.if,'always()');assert.equal(step.with?.path,'.local/verification/source-contracts/result.json');
 for(const mode of ['missing','extra-path','optional','clock','budget']){const jobs=structuredClone(workflow.jobs),steps=(jobs['source-contracts'] as {steps:typeof source.steps}).steps,artifact=steps.find(item=>item.name===step.name)!;
  if(mode==='missing')steps.splice(steps.indexOf(artifact),1);if(mode==='extra-path')artifact.with!.path='.local/';if(mode==='optional')artifact.if='success()';if(mode==='clock')artifact.with!.name='cuevo-source-contracts-latest';if(mode==='budget')jobs['source-contracts']['timeout-minutes']=60;
  assert.ok(validateCiSourceJobs(jobs).length,mode);
 }
});

test('source-bound pre-companion delivery is historical metadata and cannot substitute for current source',()=>{
 const git=(args:string[])=>execFileSync('git',args,{windowsHide:true,maxBuffer:2*1024*1024});
 for(const source of ['5b6e39956d7b9cbe507ec4352812f433225fa6f6','15271080265baf4b8be56750706ae603b0770af2']){
  const original=(yaml.load(git(['show',source+':.github/workflows/ci.yml']).toString('utf8')).jobs as Record<string,unknown>)['source-fixtures-delivery'];
  assert.deepEqual(selectCanonicalWorkflowJob('source-fixtures-delivery',original,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}),original);
  assert.throws(()=>selectCanonicalWorkflowJob('source-fixtures-delivery',original,'CURRENT_SOURCE',{sha:source,git}));
  assert.throws(()=>selectCanonicalWorkflowJob('source-fixtures-delivery',original,'ORIGINAL_RUNTIME_METADATA'));
  assert.throws(()=>selectCanonicalWorkflowJob('source-fixtures-delivery',original,'ORIGINAL_RUNTIME_METADATA',{sha:source,git:args=>args[0]==='rev-parse'?Buffer.from('0'.repeat(40)):git(args)}));
  const changed=structuredClone(original) as {steps:Record<string,unknown>[]};(changed.steps.find(step=>String(step.uses??'').startsWith('actions/upload-artifact@'))!.with as {path:string}).path='.local/';
  assert.throws(()=>selectCanonicalWorkflowJob('source-fixtures-delivery',changed,'ORIGINAL_RUNTIME_METADATA',{sha:source,git}));
 }
});

test('inactive pairing failure companion retains its exact source owner without replacing a partition receipt',async()=>{
 const flow=yaml.load(await readFile('.github/workflows/ci.yml','utf8')) as {jobs:Record<string,{steps:Record<string,unknown>[]}>};
 assert.deepEqual(validateCiSourceJobs(flow.jobs),[]);
 const steps=flow.jobs['source-fixtures-delivery'].steps,name='Retain minimized inactive-Cron pairing failure',diagnostic=steps.find(row=>row.name===name)!;
 assert.ok(diagnostic);
 assert.equal(diagnostic.if,'always()');
 assert.equal(diagnostic.uses,'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9');
 assert.deepEqual(diagnostic.with,{name:'cuevo-inactive-cron-pairing-failure-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/verification/inactive-cron-pairing/failure.json','include-hidden-files':true,'if-no-files-found':'ignore','retention-days':90});
 const receipt=steps.find(row=>row.name==='Retain exact source-delivery fixture receipt')!;
 assert.equal((receipt.with as {path:string}).path,'.local/verification/source-partitions/source-delivery/result.json');
 assert.equal(receipt.if,'always()');assert.ok(steps.indexOf(diagnostic)>steps.indexOf(receipt));assert.ok(steps.indexOf(diagnostic)<steps.findIndex(row=>row.name==='Confirm frozen authored source'));
 for(const mode of ['missing','duplicate','path','condition','pin','owner','partition-substitution']){
  const jobs=structuredClone(flow.jobs),selected=jobs['source-fixtures-delivery'].steps,row=selected.find(item=>item.name===name)!;
  if(mode==='missing')selected.splice(selected.indexOf(row),1);
  if(mode==='duplicate')selected.push(structuredClone(row));
  if(mode==='path')(row.with as {path:string}).path='.local/';
  if(mode==='condition')row.if='failure()';
  if(mode==='pin')row.uses='actions/upload-artifact@main';
  if(mode==='owner')jobs['source-fixtures-native'].steps.push(structuredClone(row));
  if(mode==='partition-substitution'){const original=selected.find(item=>item.name==='Retain exact source-delivery fixture receipt')!;(original.with as {path:string}).path='.local/verification/inactive-cron-pairing/failure.json';}
  assert.ok(validateCiSourceJobs(jobs).length,mode);
 }
});

test('browser startup and reset diagnostics retain only existing minimized companions after the required lane',async()=>{
 const flow=yaml.load(await readFile('.github/workflows/ci.yml','utf8')) as {jobs:Record<string,{steps:Record<string,unknown>[]}>};
 const steps=flow.jobs['runtime-browser'].steps,lane=steps.find(row=>row.name==='Retain exact safe browser lane')!,start=steps.find(row=>row.name==='Retain minimized local start failure diagnostics')!,reset=steps.find(row=>row.name==='Retain minimized local reset failure diagnostics')!;
 assert.ok(start,'The observed startup boundary needs its own retained minimized companion');assert.ok(reset,'A later original reset failure needs its existing distinct minimized companion');
 assert.equal(steps.indexOf(start),steps.indexOf(lane)+1);assert.equal(steps.indexOf(reset),steps.indexOf(start)+1);assert.equal(steps.at(-1)?.run,'npx --no-install supabase stop --project-id cuevo');
 for(const[kind,row]of [['start',start],['reset',reset]]as const){assert.deepEqual(row,{name:`Retain minimized local ${kind} failure diagnostics`,if:'always()',uses:'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9',with:{name:`cuevo-${kind}-diagnostic-runtime-browser-\${{ github.run_id }}-\${{ github.run_attempt }}`,path:`.local/migration-replay/operation-*/${kind}-diagnostic.json`,'include-hidden-files':true,'if-no-files-found':'warn','retention-days':14}});}
 assert.deepEqual(validateCiRuntimeJobs(flow.jobs),[]);
 for(const kind of['start','reset'])for(const mode of['missing','raw','glob','success-only','required','continue','collision']){const jobs=structuredClone(flow.jobs),job=jobs['runtime-browser'],row=job.steps.find(r=>r.name===`Retain minimized local ${kind} failure diagnostics`)!;if(mode==='missing')job.steps.splice(job.steps.indexOf(row),1);if(mode==='raw')(row.with as Record<string,unknown>).path='.local/supabase-start.log';if(mode==='glob')(row.with as Record<string,unknown>).path='.local/migration-replay/**';if(mode==='success-only')row.if='success()';if(mode==='required')(row.with as Record<string,unknown>)['if-no-files-found']='error';if(mode==='continue')(job as Record<string,unknown>)['continue-on-error']=true;if(mode==='collision')(row.with as Record<string,unknown>).name='cuevo-runtime-browser-${{ github.run_id }}-${{ github.run_attempt }}';assert.ok(validateCiRuntimeJobs(jobs).length,kind+':'+mode);}
});

test('full-regression current whole workflow rejects each old or arbitrary Actions pin independently',async()=>{
 const validate=validateFullRegressionWorkflow,text=await readFile('.github/workflows/full-regression.yml','utf8');assert.deepEqual(validate(text),[]);
 for(const[current,old]of [['949feb2413d6458794dcd2491c4babbbce0c15c1','820762786026740c76f36085b0efc47a31fe5020'],['cf430e030ddbb5b0abf93d22962f4752f3646cd9','043fb46d1a93c77aae656e7c1c64a875d1fc6a0a']])if(text.includes(current))for(const pin of [old,'f'.repeat(40)])assert.ok(validate(text.replace(current,pin)).length,current);
});
