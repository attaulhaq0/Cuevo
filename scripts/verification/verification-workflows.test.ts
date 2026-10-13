import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateFullRegressionWorkflow,validateCiSourceJobs,validateCiRuntimeJobs } from './verification-workflows';

test('one existing database producer retains exact original231 source proof without a second replay',async()=>{
 const api:Record<string,unknown>=await import('./verification-workflows');assert.ok(api.ciOriginal231CatalogueArtifactStep,'source231 requires its own exact retained artifact');const step=api.ciOriginal231CatalogueArtifactStep as Record<string,unknown>,job=api.ciDatabaseJob as{steps:Record<string,unknown>[]};assert.deepEqual(step,{name:'Retain exact source original231 catalogue reference',uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:'cuevo-original231-catalogue-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/child144-catalogue/source231.json','include-hidden-files':true,'if-no-files-found':'error','retention-days':90}});assert.equal(job.steps.filter(row=>row.run==='node --import tsx scripts/database/hosted-child-catalogue-producer.ts').length,1);assert.equal(job.steps.filter(row=>row.name===step.name).length,1);const source=await readFile('.github/workflows/ci.yml','utf8'),flow=yaml.load(source)as{jobs:Record<string,{steps:Record<string,unknown>[]}>};assert.deepEqual(flow.jobs['database-checks'],job);assert.ok(flow.jobs['database-checks'].steps.some(row=>row.name===step.name));
});
import { statelessVerificationSteps } from './steps';
import { createRequire } from 'node:module';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): Record<string, unknown>; dump(value: unknown): string };

test('reset failure companion retains only minimized files without changing required restoration admission', async()=>{
  const text=await readFile('.github/workflows/ci.yml','utf8'),flow=yaml.load(text) as {jobs:Record<string,{steps:Record<string,unknown>[]}>};
  assert.deepEqual(validateCiRuntimeJobs(flow.jobs),[]);
  const steps=flow.jobs['integration-state'].steps,diagnostic=steps.filter(s=>s.name==='Retain minimized local reset failure diagnostics');
  assert.equal(diagnostic.length,1);
  assert.deepEqual(diagnostic[0],{name:'Retain minimized local reset failure diagnostics',if:'always()',uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:'cuevo-reset-diagnostic-integration-state-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/migration-replay/operation-*/reset-diagnostic.json','include-hidden-files':true,'if-no-files-found':'warn','retention-days':14}});
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
