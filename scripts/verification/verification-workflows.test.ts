import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateFullRegressionWorkflow } from './verification-workflows';
import { verificationSteps, fullRuntimeVerificationSteps } from './steps';
test('full regression has separate scheduled diagnostic and explicit customer purpose with complete required work', async () => {
  const text = await readFile('.github/workflows/full-regression.yml','utf8');
  assert.deepEqual(validateFullRegressionWorkflow(text), []);
  for (const changed of [text.replace('npm run verify:technical','echo passed'), text.replace('chromium firefox webkit','chromium'), text.replace('purpose:','mode:'), text.replace('path: .local/full-verification/summary.json','path: .local/'), text.replace('cancel-in-progress: false','cancel-in-progress: true')]) assert.ok(validateFullRegressionWorkflow(changed).length);
});

test('fast CI executes each stateless fixture owner once and runtime selection cannot drop its tests', async () => {
  const ci = await readFile('.github/workflows/ci.yml','utf8'), runner = await readFile('scripts/verification/stateless-checks.ts','utf8');
  assert.equal(ci.split('node --import tsx scripts/verification/stateless-checks.ts').length-1,1);
  assert.ok(runner.includes('verificationSteps.filter'));
  const runtime = new Set(fullRuntimeVerificationSteps.map(step=>step.name));
  const excluded = new Set(['unit','web-unit','lint','typecheck']);
  const stateless = verificationSteps.filter(step=>!runtime.has(step.name)&&!excluded.has(step.name));
  for(const name of ['verification-rules','local-runtime','migration-replay-rules','cicd-fixtures']) assert.ok(stateless.some(step=>step.name===name));
  assert.equal(new Set(stateless.map(step=>step.name)).size,stateless.length);
  assert.ok(ci.includes('npm run lint && npm run typecheck && npm test'));
});
