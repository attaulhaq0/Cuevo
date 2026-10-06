import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
type Map = Record<string, unknown>;
const map = (value: unknown): Map => value && typeof value === 'object' && !Array.isArray(value) ? value as Map : {};
async function source() { return map(yaml.load(await readFile('.github/workflows/backend-release.yml', 'utf8'))); }
test('backend schema workflow uses exact main manual dispatch and one serialized deployment window', async () => {
  const workflow = await source(); assert.deepEqual(Object.keys(map(workflow.on)), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(map(map(map(workflow.on).workflow_dispatch).inputs)).sort(), ['ci_run_id', 'commit_sha']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' }); assert.deepEqual(workflow.concurrency, { group: 'cuevo-backend-release', 'cancel-in-progress': false });
  const jobs = map(workflow.jobs); assert.deepEqual(Object.keys(jobs), ['prepare', 'schema']);
  assert.equal(map(jobs.prepare).if, "github.ref == 'refs/heads/main'"); assert.equal(map(jobs.schema).if, "github.ref == 'refs/heads/main'"); assert.equal(map(jobs.schema).environment, 'staging'); assert.equal(map(jobs.schema).needs, 'prepare');
});
test('only metadata token reaches preparation; schema credentials arrive after package approval and never enter shell input', async () => {
  const workflow = await source(), jobs = map(workflow.jobs), prepare = (map(jobs.prepare).steps as unknown[]).map(map), schema = (map(jobs.schema).steps as unknown[]).map(map);
  const preparation = prepare.find(step => step.id === 'prepare')!;
  assert.equal(preparation.run, 'node --import tsx scripts/verification/backend-release.ts prepare');
  assert.deepEqual(Object.keys(map(preparation.env)).sort(), ['CUEVO_BACKEND_RELEASE_INPUT_JSON', 'GH_TOKEN', 'SUPABASE_ACCESS_TOKEN']);
  assert.equal(map(preparation.env).GH_TOKEN, '${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}');
  const approvalIndex = schema.findIndex(step => step.run === 'node --import tsx scripts/verification/backend-release.ts approval');
  const mutationIndex = schema.findIndex(step => step.run === 'node --import tsx scripts/verification/backend-release.ts bootstrap-schema'); assert.ok(approvalIndex >= 0 && mutationIndex > approvalIndex);
  const provisionIndex = schema.findIndex(step => step.run === 'node --import tsx scripts/verification/backend-release.ts provision'); assert.ok(provisionIndex > mutationIndex);
  const deployIndex = schema.findIndex(step => step.run === 'node --import tsx scripts/verification/backend-release.ts deploy');assert.ok(deployIndex>provisionIndex);
  const verifyIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts verify'),privateIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts verify-private');assert.ok(verifyIndex>deployIndex&&privateIndex>verifyIndex);assert.deepEqual(Object.keys(map(schema[privateIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  const activationIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts activate');assert.ok(activationIndex>privateIndex);assert.deepEqual(Object.keys(map(schema[activationIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_DATA_API_CONFIGURATION_EVIDENCE_JSON','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  for (const [index, step] of schema.entries()) {
    if (index !== mutationIndex && index !== provisionIndex && index!==deployIndex && index!==activationIndex) assert.ok(!Object.keys(map(step.env)).some(key => key === 'CUEVO_MIGRATION_DATABASE_PASSWORD' || key === 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'));
    if (step.run) assert.ok(!(step.run as string).includes('${{'));
    if (step.uses) assert.match(step.uses as string, /@[a-f0-9]{40}$/);
  }
  const download = schema.find(step => String(step.uses).startsWith('actions/download-artifact@'))!;
  assert.deepEqual(Object.keys(map(download.with)).sort(), ['name', 'path']); assert.equal(map(download.with).name, 'cuevo-backend-package-${{ github.run_id }}-${{ github.run_attempt }}');
  const retained = schema.find(step => String(step.uses).startsWith('actions/upload-artifact@'))!;
  assert.equal(retained.if, 'always()'); assert.match(map(retained.with).path as string, /journal-\*\//); assert.doesNotMatch(map(retained.with).path as string, /ca\.pem|process-|backend-bundle|synthetic-access|\.env/);
  for(const suffix of ['intent','asset','room','result'])assert.ok((map(retained.with).path as string).includes(`private-probe-*-${suffix}.json`));
  for(const path of ['worker-activation-intent.json','worker-activation-journal.jsonl','worker-activation-result.json','worker-activation-cleanup.json'])assert.ok((map(retained.with).path as string).includes(path));
});
