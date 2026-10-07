import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateFullRegressionWorkflow } from './verification-workflows';
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
test('full regression has separate scheduled diagnostic and explicit customer purpose with complete required work', async () => {
  const text = await readFile('.github/workflows/full-regression.yml','utf8');
  assert.deepEqual(validateFullRegressionWorkflow(text), []);
  for (const changed of [text.replace('npm run verify:technical','echo passed'), text.replace('chromium firefox webkit','chromium'), text.replace('purpose:','mode:'), text.replace('path: .local/full-verification/summary.json','path: .local/'), text.replace('cancel-in-progress: false','cancel-in-progress: true')]) assert.ok(validateFullRegressionWorkflow(changed).length);
});

test('fast CI executes each stateless fixture owner once and runtime selection cannot drop its tests', async () => {
  const ci = await readFile('.github/workflows/ci.yml','utf8'), runner = await readFile('scripts/verification/stateless-checks.ts','utf8');
  assert.equal(ci.split('node --import tsx scripts/verification/stateless-checks.ts').length-1,1);
  assert.ok(runner.includes('statelessVerificationSteps'));
  const stateless=statelessVerificationSteps;
  for(const name of ['verification-rules','local-runtime','migration-replay-rules','cicd-fixtures']) assert.ok(stateless.some(step=>step.name===name));
  for(const name of ['browser','browser-compatibility','clean-bootstrap','database','integration','runtime-outage','recovery'])assert.equal(stateless.some(step=>step.name===name),false,name);
  assert.equal(new Set(stateless.map(step=>step.name)).size,stateless.length);
  assert.ok(ci.includes('npm run lint && npm run typecheck && npm test'));
});
