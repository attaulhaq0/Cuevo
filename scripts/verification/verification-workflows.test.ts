import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateFullRegressionWorkflow,validateCiSourceJobs } from './verification-workflows';
import { statelessVerificationSteps } from './steps';
import { createRequire } from 'node:module';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): Record<string, unknown>; dump(value: unknown): string };

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
 for(const owner of ['fast-checks','source-contracts']){
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

test('isolated source contracts execute each stateless owner once while fast checks retain complete lint types and unit work', async () => {
  const ci = await readFile('.github/workflows/ci.yml','utf8'), runner = await readFile('scripts/verification/stateless-checks.ts','utf8');
  type Job = { 'timeout-minutes': number; needs?: string[]; steps: { run?: string; name?: string }[] };
  const jobs = (yaml.load(ci).jobs as Record<string, Job>);
  const source = jobs['source-contracts'], fast = jobs['fast-checks'];
  assert.ok(source, 'Stateless source contracts need their own isolated required runner.');
  assert.equal(source['timeout-minutes'], 30);
  assert.equal(fast['timeout-minutes'], 20);
  assert.equal(source.needs, undefined); assert.equal(fast.needs, undefined);
  assert.equal(source.steps.filter(step => step.run === 'node --import tsx scripts/verification/stateless-checks.ts').length, 1);
  assert.equal(fast.steps.some(step => step.run?.includes('stateless-checks.ts')), false);
  assert.equal(fast.steps.filter(step => step.run === 'npm run lint && npm run typecheck && npm test').length, 1);
  assert.equal(source.steps.some(step => step.run?.includes('npm run lint')), false);
  assert.ok(jobs.required.needs?.includes('source-contracts'));
  assert.equal(ci.split('node --import tsx scripts/verification/stateless-checks.ts').length-1,1);
  assert.ok(runner.includes('statelessVerificationSteps'));
  const stateless=statelessVerificationSteps;
  for(const name of ['verification-rules','local-runtime','migration-replay-rules','cicd-fixtures']) assert.ok(stateless.some(step=>step.name===name));
  for(const name of ['browser','browser-compatibility','clean-bootstrap','database','integration','runtime-outage','recovery'])assert.equal(stateless.some(step=>step.name===name),false,name);
  assert.equal(new Set(stateless.map(step=>step.name)).size,stateless.length);
  assert.ok(ci.includes('npm run lint && npm run typecheck && npm test'));
});
