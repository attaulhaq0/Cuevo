import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const api = await import('./pilot-workflow-contracts').catch(() => ({})) as typeof import('./pilot-workflow-contracts');
const yaml = createRequire(import.meta.url)('js-yaml') as { load(value: string): Record<string, unknown>; dump(value: unknown): string };
async function original() { return yaml.load(await readFile('.github/workflows/pilot.yml', 'utf8')); }
function job(value: Record<string, unknown>) { return (value.jobs as Record<string, Record<string, unknown>>)['pilot-measurements']; }
function steps(value: Record<string, unknown>) { return job(value).steps as Record<string, unknown>[]; }

test('manual pilot workflow uses its exact separate guarded source/runtime/evidence contract', async () => {
  assert.equal(typeof api.validatePilotWorkflow, 'function');
  const source = await readFile('.github/workflows/pilot.yml', 'utf8');
  assert.deepEqual(api.validatePilotWorkflow(source), []);
});
test('pilot workflow refuses untrusted events, checkout override, mutable actions and credentials', async () => {
  assert.equal(typeof api.validatePilotWorkflow, 'function');
  const mutate: ((value: Record<string, unknown>) => void)[] = [
    value => { value.on = { pull_request: {} }; },
    value => { (value.on as Record<string, unknown>).workflow_run = {}; },
    value => { value.permissions = { contents: 'write', actions: 'read' }; },
    value => { (value.concurrency as Record<string, unknown>)['cancel-in-progress'] = true; },
    value => { job(value)['runs-on'] = 'self-hosted'; },
    value => { job(value).environment = 'production'; },
    value => { (steps(value)[0].with as Record<string, unknown>).ref = '${{ inputs.expected_sha }}'; },
    value => { (steps(value)[0].with as Record<string, unknown>)['persist-credentials'] = true; },
    value => { steps(value)[0].uses = 'actions/checkout@main'; },
    value => { steps(value).find(step => step.id === 'measure')!.env = { GH_TOKEN: '${{ secrets.PERSONAL_TOKEN }}' }; },
  ];
  for (const apply of mutate) { const value = await original(); apply(value); assert.notDeepEqual(api.validatePilotWorkflow(yaml.dump(value)), []); }
});
test('pilot flags and user inputs cannot leak into global environment or executable shell', async () => {
  assert.equal(typeof api.validatePilotWorkflow, 'function');
  const mutations: ((value: Record<string, unknown>) => void)[] = [
    value => { (value.env as Record<string, unknown>).CUEVO_REQUIRE_BROWSER_PERFORMANCE = '1'; },
    value => { (value.env as Record<string, unknown>).CUEVO_PILOT_EXPECTED_SHA = '${{ inputs.expected_sha }}'; },
    value => { job(value).env = { CUEVO_REQUIRE_BROWSER_PILOT_VOLUME: '1' }; },
    value => { steps(value).find(step => step.id === 'measure')!.run = 'node --import tsx scripts/verification/pilot-window.ts ${{ inputs.expected_sha }}'; },
    value => { steps(value).find(step => step.id === 'measure')!.run = 'eval "$USER_COMMAND"'; },
    value => { steps(value).find(step => step.id === 'measure')!.run = 'npm run verify:technical'; },
  ];
  for (const apply of mutations) { const value = await original(); apply(value); assert.notDeepEqual(api.validatePilotWorkflow(yaml.dump(value)), []); }
});
test('cleanup, safe export and owned stop remain always-run in order and cannot upload raw data', async () => {
  assert.equal(typeof api.validatePilotWorkflow, 'function');
  const mutations: ((value: Record<string, unknown>) => void)[] = [
    value => { steps(value).find(step => step.id === 'cleanup')!.if = 'success()'; },
    value => { steps(value).find(step => step.id === 'export')!.if = 'success()'; },
    value => { const index = steps(value).findIndex(step => step.id === 'cleanup'); steps(value).splice(index, 1); },
    value => { const list = steps(value), cleanup = list.findIndex(step => step.id === 'cleanup'), exportStep = list.findIndex(step => step.id === 'export'); [list[cleanup], list[exportStep]] = [list[exportStep], list[cleanup]]; },
    value => { (steps(value).find(step => step.id === 'upload')!.with as Record<string, unknown>).path = '.local/'; },
    value => { (steps(value).find(step => step.id === 'upload')!.with as Record<string, unknown>).path = '.local/cicd-safe/'; },
    value => { steps(value).find(step => step.id === 'stop')!.run = 'npx --no-install supabase stop --project-id cuevo'; },
    value => { steps(value).push({ run: 'echo unsafe' }); },
  ];
  for (const apply of mutations) { const value = await original(); apply(value); assert.notDeepEqual(api.validatePilotWorkflow(yaml.dump(value)), []); }
});
test('malformed YAML and incomplete or changed dispatch inputs are refused', async () => {
  assert.equal(typeof api.validatePilotWorkflow, 'function');
  assert.notDeepEqual(api.validatePilotWorkflow('on: [broken'), []);
  const value = await original(); delete ((value.on as Record<string, Record<string, Record<string, unknown>>>).workflow_dispatch.inputs).ci_run_id;
  assert.notDeepEqual(api.validatePilotWorkflow(yaml.dump(value)), []);
});
