import { createRequire } from 'node:module';
import { canonicalReleaseReviewJson } from './release-review';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
type ObjectValue = Record<string, unknown>;
const map = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const same = (left: unknown, right: unknown) => canonicalReleaseReviewJson(left) === canonicalReleaseReviewJson(right);
const main = "github.ref == 'refs/heads/main'";
const checkout = { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { 'persist-credentials': false, 'fetch-depth': 0 } };
const node = { uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', with: { 'node-version': '24.16.0' } };
const install = { run: 'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund && npm ci --ignore-scripts --no-audit --no-fund && node node_modules/esbuild/install.js' };
const metadata = { GH_TOKEN: '${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}', SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}' };
const review = { ...metadata, VERCEL_TOKEN: '${{ secrets.VERCEL_TOKEN }}', NATIVE_REVIEW_BASE64: '${{ needs.prepare-qa.outputs.review-base64 }}', NATIVE_REVIEW_DIGEST: '${{ needs.prepare-qa.outputs.review-digest }}' };
const command = (mode: string) => 'node --import tsx scripts/verification/hosted-learning-qa.ts ' + mode;
const outputPaths = '.local/hosted-release/learning-native-result.json\n.local/hosted-release/learning-native-failure.json\n';

/** Required workflow contract only. This validates source configuration; it
 * does not configure protected environments or attest actual QA execution. */
export function validateHostedLearningQaWorkflow(text: string): string[] {
  const issues: string[] = [];
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 48 * 1024) return ['Native QA workflow source is unavailable.'];
    const flow = map(yaml.load(text));
    if (!same(Object.keys(flow).sort(), ['name', 'on', 'permissions', 'env', 'concurrency', 'jobs'].sort())) issues.push('Native QA workflow has unreviewed top-level configuration.');
    const trigger = map(flow.on), dispatch = map(trigger.workflow_dispatch), inputs = map(dispatch.inputs);
    if (!same(Object.keys(trigger), ['workflow_dispatch']) || !same(Object.keys(dispatch), ['inputs'])) issues.push('Native QA accepts only exact manual dispatch.');
    const stringInputs = ['commit_sha', 'ci_run_id', 'ui_run_id', 'ui_run_attempt', 'ui_artifact_id', 'command_manifest_sha256', 'journal_head_sha256'];
    if (!same(Object.keys(inputs).sort(), [...stringInputs, 'mode'].sort())) issues.push('Native QA dispatch input selection changed.');
    for (const name of stringInputs) {
      const input = map(inputs[name]);
      if (!same(Object.keys(input).sort(), ['description', 'required', 'type'].sort()) || input.required !== true || input.type !== 'string' || typeof input.description !== 'string') issues.push('Native QA requires bounded explicit string selections without defaults.');
    }
    const mode = map(inputs.mode);
    if (!same(Object.keys(mode).sort(), ['description', 'required', 'type', 'options'].sort()) || mode.required !== true || mode.type !== 'choice' || typeof mode.description !== 'string'
      || !same(mode.options, ['FULL_LOOP', 'ORIGINAL_RECONCILIATION'])) issues.push('Native QA mode must preserve full-loop and original-only reconciliation.');
    if (!same(flow.permissions, { contents: 'read', actions: 'read' })) issues.push('Native QA requires read-only contents and Actions permissions.');
    if (!same(flow.env, { RELEASE_ENVIRONMENT: 'staging' })) issues.push('Native QA cannot inherit credentials or override the staging boundary.');
    if (!same(flow.concurrency, { group: 'cuevo-hosted-learning-native-qa', 'cancel-in-progress': false })) issues.push('Native QA must serialize without cancelling original proof.');
    const jobs = map(flow.jobs), prepare = map(jobs['prepare-qa']), native = map(jobs['native-qa']);
    if (!same(Object.keys(jobs).sort(), ['prepare-qa', 'native-qa'].sort())) issues.push('Native QA has unreviewed jobs.');
    if (!same(Object.keys(prepare).sort(), ['if', 'runs-on', 'timeout-minutes', 'outputs', 'steps'].sort()) || prepare.if !== main || prepare['runs-on'] !== 'ubuntu-latest' || prepare['timeout-minutes'] !== 15
      || !same(prepare.outputs, { 'review-base64': '${{ steps.prepare.outputs.review-base64 }}', 'review-digest': '${{ steps.prepare.outputs.review-digest }}' })) issues.push('Native QA preparation must use fixed trusted main runner and same-run review outputs.');
    if (!same(Object.keys(native).sort(), ['needs', 'if', 'runs-on', 'timeout-minutes', 'environment', 'steps'].sort()) || native.needs !== 'prepare-qa' || native.if !== main || native['runs-on'] !== 'ubuntu-latest'
      || native['timeout-minutes'] !== 20 || !same(native.environment, { name: 'staging' })) issues.push('Native QA must follow preparation in the protected staging main runner.');
    const preparation = array(prepare.steps), nativeSteps = array(native.steps);
    const expectedPreparation = [checkout, node, install, { id: 'prepare', env: metadata, run: command('prepare') }];
    const expectedNative = [checkout, node, install,
      { name: 'Admit current protected QA before operator credentials', env: review, run: command('approval') },
      { name: 'Verify fixed original commands and native chain read only', env: { ...review, CUEVO_MIGRATION_DATABASE_PASSWORD: '${{ secrets.CUEVO_MIGRATION_DATABASE_PASSWORD }}', CUEVO_DATABASE_TLS_CA: '${{ secrets.CUEVO_DATABASE_TLS_CA }}' }, run: command('verify') },
      { name: 'Preserve only native QA result or failure metadata', if: 'always()', uses: 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
        with: { name: 'cuevo-learning-native-${{ github.run_id }}-${{ github.run_attempt }}', path: outputPaths, 'include-hidden-files': true, 'if-no-files-found': 'warn', 'retention-days': 14 } },
    ];
    if (!same(preparation, expectedPreparation)) issues.push('Native QA preparation actions, credential recipients or required command changed.');
    if (!same(nativeSteps, expectedNative)) issues.push('Native QA approval/read-only credential boundary or exact safe receipt export changed.');
    for (const value of [...preparation, ...nativeSteps]) {
      const step = map(value);
      if (step.run !== undefined && (typeof step.run !== 'string' || step.run.includes('${{') || /\beval\b|\bfromJSON\b|curl.+\|\s*(?:sh|bash)/i.test(step.run))) issues.push('Native QA shell input must remain fixed and expression-free.');
      if (step.uses !== undefined && (typeof step.uses !== 'string' || !/@[a-f0-9]{40}$/.test(step.uses))) issues.push('Native QA actions require exact immutable pins.');
      if (step['continue-on-error'] !== undefined) issues.push('Native QA cannot tolerate a failed proof boundary.');
    }
    return [...new Set(issues)];
  } catch { return ['Native QA workflow source or exact contract requires review.']; }
}
