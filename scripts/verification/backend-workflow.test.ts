import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
type Map = Record<string, unknown>;
const map = (value: unknown): Map => value && typeof value === 'object' && !Array.isArray(value) ? value as Map : {};
async function source() { return map(yaml.load(await readFile('.github/workflows/backend-release.yml', 'utf8'))); }
const originalRuntimeRecoveryCondition = "always() && inputs.scope == 'runtime-rollout' && (inputs.runtime_action == '' || inputs.runtime_action == 'ROLL_FORWARD') && (steps.runtime-rollout.outcome == 'failure' || steps.runtime-rollout.outcome == 'cancelled')";

test('original rollout recovery export cannot turn a completed rollout into a failed release', async () => {
 const flow=await source(),steps=(map(map(flow.jobs).schema).steps as unknown[]).map(map);
 const rollout=steps.find(row=>row.run==='node --import tsx scripts/verification/backend-release.ts rollout-runtime')!;
 const exported=steps.find(row=>row.run==='node --import tsx scripts/verification/backend-release.ts export-runtime-recovery')!;
 const retained=steps.find(row=>map(row.with).name==='cuevo-runtime-rollout-recovery-${{ github.run_id }}-${{ github.run_attempt }}')!;
 assert.equal(rollout.id,'runtime-rollout');
 assert.equal(exported.if,originalRuntimeRecoveryCondition);
 assert.equal(retained.if,originalRuntimeRecoveryCondition+" && steps.runtime-recovery-export.outcome == 'success'");
 assert.ok(steps.indexOf(exported)>steps.indexOf(rollout));
 assert.ok(steps.indexOf(retained)>steps.indexOf(exported));
 assert.deepEqual(Object.keys(map(exported.env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256']);
});
test('operating handover consumers receive only required protected credentials and fresh configuration observation',async()=>{
 const flow=await source(),steps=(map(map(flow.jobs).schema).steps as unknown[]).map(map);
 for(const mode of ['initialize-runtime','handover','configure-web','export-web-handover']){const step=steps.find(row=>row.run==='node --import tsx scripts/verification/backend-release.ts '+mode)!;assert.equal(map(step.env).CUEVO_SYNTHETIC_PILOT_PASSWORD,'${{ secrets.CUEVO_SYNTHETIC_PILOT_PASSWORD }}',mode);assert.equal(map(map(flow.jobs).schema).environment,'staging');}
 const rollout=steps.find(row=>row.run==='node --import tsx scripts/verification/backend-release.ts rollout-runtime')!;assert.equal(map(rollout.env).CUEVO_DATA_API_CONFIGURATION_EVIDENCE_JSON,undefined);
 const prepare=(map(map(flow.jobs).prepare).steps as unknown[]).map(map).find(row=>row.id==='prepare')!;assert.equal(Object.hasOwn(map(prepare.env),'CUEVO_SYNTHETIC_PILOT_PASSWORD'),false);
});
test('recovery completion exports one fixed canonical receipt after confirmed prefix and never supplies private credentials',async()=>{const workflow=await source(),steps=(map(map(workflow.jobs).schema).steps as unknown[]).map(map),reconcile=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts reconcile-prefix'),exported=steps.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts export-schema-completion');assert.ok(exported>reconcile);assert.equal(steps[exported].if,"inputs.scope == 'reconcile-schema'");assert.deepEqual(Object.keys(map(steps[exported].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256']);const uploaded=steps.find(step=>map(step.with).name==='cuevo-schema-recovery-completion-${{ github.run_id }}-${{ github.run_attempt }}')!;assert.equal(uploaded.if,"inputs.scope == 'reconcile-schema'");assert.equal(map(uploaded.with).path,'.local/hosted-release/schema-recovery-completion.json');assert.equal(map(uploaded.with)['if-no-files-found'],'error');});
test('pending confirmation has one protected scope and original immutable export has no private credential recipient',async()=>{const workflow=await source(),steps=(map(map(workflow.jobs).schema).steps as unknown[]).map(map),pending=steps.find(step=>step.run==='node --import tsx scripts/verification/backend-release.ts confirm-pending-activation'),exported=steps.find(step=>step.run==='node --import tsx scripts/verification/backend-release.ts export-activation-execution');assert(pending);assert.equal(pending.if,"inputs.scope == 'pending-runtime-confirmation'");assert(!Object.keys(map(pending.env)).includes('CUEVO_SYNTHETIC_PILOT_PASSWORD'));assert(!Object.keys(map(pending.env)).includes('CUEVO_RELEASE_JOURNAL_STORAGE_KEY'));assert(exported);assert.equal(exported.if,"always() && inputs.scope == 'complete-backend'");assert.deepEqual(Object.keys(map(exported.env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256']);const uploaded=steps.find(step=>map(step.with).name==='cuevo-worker-activation-execution-${{ github.run_id }}-${{ github.run_attempt }}');assert(uploaded);assert.equal(map(uploaded.with).path,'.local/hosted-release/worker-activation-execution-export.json');});

test('installed runtime has a guarded original-state observer and cannot invoke installation or activation',async()=>{
 const workflow=await source(),steps=(map(map(workflow.jobs).schema).steps as unknown[]).map(map),phase=(name:string)=>steps.find(step=>step.run==='node --import tsx scripts/verification/backend-release.ts '+name)!;
 assert.equal(phase('resume-runtime').if,"inputs.scope == 'installed-runtime'");
 assert.equal(map(phase('resume-runtime').env).CUEVO_DATA_API_CONFIGURATION_EVIDENCE_JSON,undefined);
 for(const name of ['bootstrap-schema','provision'])assert.equal(phase(name).if,"inputs.scope == 'schema-and-accounts' || inputs.scope == 'complete-backend'");
 for(const name of ['deploy','activate'])assert.equal(phase(name).if,"inputs.scope == 'complete-backend'");
 for(const name of ['verify','verify-private'])assert.equal(phase(name).if,"inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime'");
 for(const name of ['verify-recovery','verify-restore'])assert.equal(phase(name).if,"(inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime') && inputs.handoff == 'customer-candidate'");
 for(const name of ['handover','configure-web','export-web-handover'])assert.equal(phase(name).if,"inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime'");
});
test('backend schema workflow uses exact main manual dispatch and one serialized deployment window', async () => {
  const workflow = await source(); assert.deepEqual(Object.keys(map(workflow.on)), ['workflow_dispatch']);
  assert.deepEqual(Object.keys(map(map(map(workflow.on).workflow_dispatch).inputs)).sort(), ['ci_run_id', 'commit_sha', 'handoff','runtime_action','scope']);
  const scope = map(map(map(map(workflow.on).workflow_dispatch).inputs).scope);
  assert.deepEqual(scope.options, ['schema-and-accounts', 'complete-backend','installed-runtime','reconcile-schema','pending-runtime-confirmation','runtime-rollout']);
  assert.equal(scope.default, 'schema-and-accounts');
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' }); assert.deepEqual(workflow.concurrency, { group: 'cuevo-backend-release', 'cancel-in-progress': false });
  const jobs = map(workflow.jobs); assert.deepEqual(Object.keys(jobs), ['prepare', 'schema']);
  assert.equal(map(jobs.prepare).if, "github.ref == 'refs/heads/main'"); assert.equal(map(jobs.schema).if, "github.ref == 'refs/heads/main'"); assert.equal(map(jobs.schema).environment, 'staging'); assert.equal(map(jobs.schema).needs, 'prepare');
});

test('schema and account milestone skips every later backend deployment and handover consumer', async () => {
  const workflow = await source(), steps = (map(map(workflow.jobs).schema).steps as unknown[]).map(map);
  const provision = steps.findIndex(step => step.run === 'node --import tsx scripts/verification/backend-release.ts provision');
  const required = steps.filter((step, index) => index > provision && (typeof step.run === 'string' || step.id === 'web-transfer'
    || map(step.with).name === 'cuevo-web-handover-${{ github.run_id }}-${{ github.run_attempt }}'));
  assert.ok(required.length > 10);
  for(const step of required){const command=String(step.run??'');if(command.endsWith('export-activation-execution')){assert.equal(step.if,"always() && inputs.scope == 'complete-backend'");continue;}if(command.endsWith('confirm-pending-activation')){assert.equal(step.if,"inputs.scope == 'pending-runtime-confirmation'");continue;}if(command.endsWith('export-runtime-recovery')){assert.equal(step.if,originalRuntimeRecoveryCondition);continue;}if(command.endsWith('initialize-runtime')){assert.equal(step.if,"inputs.scope == 'complete-backend' && inputs.handoff == 'operating-staging'");continue;}if(command.endsWith('rollout-runtime')){assert.equal(step.if,"inputs.scope == 'runtime-rollout' && inputs.handoff == 'operating-staging'");continue;}if(command.endsWith('verify-recovery')||command.endsWith('verify-restore')||command.startsWith('docker pull')){assert.equal(step.if,"(inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime') && inputs.handoff == 'customer-candidate'");continue;}const completeOnly=['deploy','activate'].some(mode=>command.endsWith('backend-release.ts '+mode))||command.startsWith('npm install --global vercel');const later=['bind-api','handover','configure-web','export-web-handover'].some(mode=>command.endsWith('backend-release.ts '+mode))||step.id==='web-transfer'||map(step.with).name==='cuevo-web-handover-${{ github.run_id }}-${{ github.run_attempt }}';assert.equal(step.if,completeOnly?"inputs.scope == 'complete-backend'":command.endsWith('resume-runtime')?"inputs.scope == 'installed-runtime'":later?"inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime'":"inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime'");}
  assert.equal(steps.find(step=>step.run==='node --import tsx scripts/verification/backend-release.ts approval')!.if,undefined);for(const phase of ['bootstrap-schema','provision'])assert.equal(steps.find(step=>step.run===`node --import tsx scripts/verification/backend-release.ts ${phase}`)!.if,"inputs.scope == 'schema-and-accounts' || inputs.scope == 'complete-backend'");
});

test('completed backend exports exactly one public handover after web settings and never uploads runtime secrets with it',async()=>{
 const workflow=await source(),schema=(map(map(workflow.jobs).schema).steps as unknown[]).map(map);
 const configure=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts configure-web');
 const exported=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts export-web-handover');
 assert.ok(exported>configure&&configure>=0);
 const step=schema[exported];assert.equal(step.id,'web-transfer');assert.deepEqual(Object.keys(map(step.env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_RELEASE_JOURNAL_STORAGE_KEY','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
 const uploaded=schema.findIndex(row=>map(row.with).name==='cuevo-web-handover-${{ github.run_id }}-${{ github.run_attempt }}');assert.ok(uploaded>exported);
 const upload=schema[uploaded];assert.equal(map(upload.with).path,'.local/hosted-release/web-transfer.json');assert.equal(map(upload.with)['if-no-files-found'],'error');assert.equal(upload.if,"inputs.scope == 'complete-backend' || inputs.scope == 'installed-runtime'");
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
  const activationIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts activate');assert.ok(activationIndex>privateIndex);assert.deepEqual(Object.keys(map(schema[activationIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  const recoveryIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts verify-recovery');assert.ok(recoveryIndex>activationIndex);assert.deepEqual(Object.keys(map(schema[recoveryIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  const restoreIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts verify-restore');assert.ok(restoreIndex>recoveryIndex);assert.deepEqual(Object.keys(map(schema[restoreIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  const imageIndex=schema.findIndex(step=>step.run==='docker pull public.ecr.aws/supabase/postgres@sha256:0450166354dc9c1d25f0322ac8b580774d4fb0184d2b087f6e4fe9499c66cf53');assert.ok(imageIndex>approvalIndex&&imageIndex<restoreIndex);assert.deepEqual(Object.keys(map(schema[imageIndex].env)),[]);
  const bindIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts bind-api'),handoverIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts handover');assert.ok(bindIndex>restoreIndex&&handoverIndex>bindIndex);assert.deepEqual(Object.keys(map(schema[bindIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);assert.deepEqual(Object.keys(map(schema[handoverIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_RELEASE_JOURNAL_STORAGE_KEY','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  const publicIndex=schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts configure-web');assert.ok(publicIndex>handoverIndex);assert.deepEqual(Object.keys(map(schema[publicIndex].env)).sort(),['CUEVO_BACKEND_BUNDLE_PATH','CUEVO_BACKEND_BUNDLE_SHA256','CUEVO_MIGRATION_DATABASE_PASSWORD','CUEVO_RELEASE_JOURNAL_STORAGE_KEY','CUEVO_SYNTHETIC_PILOT_PASSWORD','GH_TOKEN','SUPABASE_ACCESS_TOKEN','VERCEL_TOKEN']);
  for (const [index, step] of schema.entries()) {
    if (![schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts reconcile-prefix'),schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts initialize-runtime'),schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts rollout-runtime'),mutationIndex,provisionIndex,deployIndex,activationIndex,recoveryIndex,restoreIndex,bindIndex,handoverIndex,publicIndex,schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts resume-runtime'),schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts export-web-handover'),schema.findIndex(step=>step.run==='node --import tsx scripts/verification/backend-release.ts confirm-pending-activation')].includes(index)) assert.ok(!Object.keys(map(step.env)).some(key => key === 'CUEVO_MIGRATION_DATABASE_PASSWORD' || key === 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'));
    if (step.run) assert.ok(!(step.run as string).includes('${{'));
    if (step.uses) assert.match(step.uses as string, /@[a-f0-9]{40}$/);
  }
  const download = schema.find(step => String(step.uses).startsWith('actions/download-artifact@'))!;
  assert.deepEqual(Object.keys(map(download.with)).sort(), ['name', 'path']); assert.equal(map(download.with).name, 'cuevo-backend-package-${{ github.run_id }}-${{ github.run_attempt }}');
  const retained = schema.find(step => String(step.uses).startsWith('actions/upload-artifact@') && map(step.with).name === 'cuevo-backend-schema-result-${{ github.run_id }}-${{ github.run_attempt }}')!;
  assert.equal(retained.if, 'always()'); assert.match(map(retained.with).path as string, /journal-\*\//); assert.doesNotMatch(map(retained.with).path as string, /ca\.pem|process-|backend-bundle|synthetic-access|\.env/);
  for(const suffix of ['intent','asset','room','result'])assert.ok((map(retained.with).path as string).includes(`private-probe-*-${suffix}.json`));
  for(const suffix of ['intent','result'])assert.ok((map(retained.with).path as string).includes(`protected-preview-api-${suffix}.json`));
  assert.doesNotMatch(map(retained.with).path as string,/protected-preview-api-private|\.local\/hosted-release\/\*\*|protected-preview-api-\*/);
  for(const path of ['worker-activation-intent.json','worker-activation-journal.jsonl','worker-activation-result.json','worker-activation-cleanup.json'])assert.ok((map(retained.with).path as string).includes(path));
  for(const path of ['database-restore-intent.json','database-restore-asset.json','database-restore-result.json','database-restore-cleanup.json'])assert.ok((map(retained.with).path as string).includes(path));
  assert.doesNotMatch(map(retained.with).path as string,/database-restore-private|\.dump|object\.bin/);
});
