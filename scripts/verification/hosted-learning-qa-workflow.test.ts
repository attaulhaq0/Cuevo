import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): Record<string, unknown>; dump(value: unknown): string };
type ObjectValue = Record<string, unknown>;
const map = (value: unknown) => value as ObjectValue;
async function owner() {
  let module: Record<string, unknown> = {};
  try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-learning-qa-workflow.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.validateHostedLearningQaWorkflow, 'function', 'native QA workflow guard exists');
  return module as typeof import('./hosted-learning-qa-workflow');
}
async function workflow() { return await readFile(resolve(import.meta.dirname, '../../.github/workflows/hosted-learning-qa.yml'), 'utf8'); }
function change(text: string, mutation: (workflow: ObjectValue, prepare: ObjectValue, native: ObjectValue, prepSteps: ObjectValue[], steps: ObjectValue[]) => void) {
  const flow = yaml.load(text), jobs = map(flow.jobs), prepare = map(jobs['prepare-qa']), native = map(jobs['native-qa']);
  mutation(flow, prepare, native, prepare.steps as ObjectValue[], native.steps as ObjectValue[]); return yaml.dump(flow);
}

test('current actual native QA workflow isolates protected credential recipients and two safe receipts', async () => {
  const api = await owner(); assert.deepEqual(api.validateHostedLearningQaWorkflow(await workflow()), []);
});

test('untrusted triggers permissions nonmain jobs concurrency cancellation and environment bypass fail', async () => {
  const api = await owner(), text = await workflow();
  for (const mutate of [(w: ObjectValue) => { w.on = { pull_request: {} }; }, (w: ObjectValue) => { map(w.on).pull_request_target = {}; }, (w: ObjectValue) => { w.permissions = 'write-all'; }, (w: ObjectValue) => { w.permissions = { contents: 'write', actions: 'read' }; }, (_w: ObjectValue, p: ObjectValue) => { p.if = 'always()'; }, (_w: ObjectValue, _p: ObjectValue, n: ObjectValue) => { n.environment = 'production'; }, (w: ObjectValue) => { map(w.concurrency)['cancel-in-progress'] = true; }, (w: ObjectValue) => { map(w.jobs).extra = { steps: [{ run: 'echo bypass' }] }; }]) assert(api.validateHostedLearningQaWorkflow(change(text, mutate)).length > 0);
});

test('manual inputs cannot acquire defaults broaden reconciliation mode or add executable options', async () => {
  const api = await owner(), text = await workflow();
  for (const mutate of [(w: ObjectValue) => { map(map(map(w.on).workflow_dispatch).inputs).sql = { required: true, type: 'string' }; }, (w: ObjectValue) => { delete map(map(map(w.on).workflow_dispatch).inputs).ui_artifact_id; }, (w: ObjectValue) => { map(map(map(map(w.on).workflow_dispatch).inputs).commit_sha).default = 'unreviewed'; }, (w: ObjectValue) => { map(map(map(map(w.on).workflow_dispatch).inputs).mode).options = ['FULL_LOOP', 'FORCE_REPLAY']; }]) assert(api.validateHostedLearningQaWorkflow(change(text, mutate)).length > 0);
});

test('credentials cannot move to setup preparation approval or inherited workflow environments', async () => {
  const api = await owner(), text = await workflow();
  for (const mutate of [(w: ObjectValue) => { map(w.env).DATABASE_URL = '${{ secrets.DATABASE_URL }}'; }, (_w: ObjectValue, p: ObjectValue) => { p.env = { GH_TOKEN: '${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}' }; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { steps[2].env = { VERCEL_TOKEN: '${{ secrets.VERCEL_TOKEN }}' }; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { map(steps[3].env).CUEVO_MIGRATION_DATABASE_PASSWORD = '${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[3].env).CUEVO_DATABASE_TLS_CA = '${{ secrets.CUEVO_DATABASE_TLS_CA }}'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[4].env).CUEVO_SYNTHETIC_PILOT_PASSWORD = '${{ secrets.CUEVO_SYNTHETIC_PILOT_PASSWORD }}'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { map(steps[3].env).GH_TOKEN = '${{ github.token }}'; }]) assert(api.validateHostedLearningQaWorkflow(change(text, mutate)).length > 0);
});

test('unpinned actions shallow persisted checkouts expression shells skipped and tolerated steps fail', async () => {
  const api = await owner(), text = await workflow();
  for (const mutate of [(_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { steps[0].uses = 'actions/checkout@main'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { map(steps[0].with)['fetch-depth'] = 1; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { map(steps[0].with)['persist-credentials'] = true; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, steps: ObjectValue[]) => { steps[3].run = 'node --import tsx scripts/verification/hosted-learning-qa.ts ${{ inputs.mode }}'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { steps[4]['continue-on-error'] = true; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { steps[3].if = 'false'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { steps.splice(3, 1); }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { steps.push({ run: 'eval "$INPUT"' }); }]) assert(api.validateHostedLearningQaWorkflow(change(text, mutate)).length > 0);
});

test('artifact glob CA package missing failure retention and unsafe expressions are refused', async () => {
  const api = await owner(), text = await workflow();
  for (const mutate of [(_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[5].with).path = '.local/'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[5].with).path = '.local/hosted-release/ca.pem'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[5].with).path = '.local/hosted-release/native-qa-package.json'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { steps[5].if = 'success()'; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[5].with)['retention-days'] = 90; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[5].with)['include-hidden-files'] = false; }, (_w: ObjectValue, _p: ObjectValue, _n: ObjectValue, _ps: ObjectValue[], steps: ObjectValue[]) => { map(steps[5].with).name = '${{ fromJSON(inputs.mode) }}'; }]) assert(api.validateHostedLearningQaWorkflow(change(text, mutate)).length > 0);
});
