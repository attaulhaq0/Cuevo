import { createRequire } from 'node:module';
import { canonicalReleaseReviewJson } from './release-review';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const fullSteps: Record<string, string[]> = {
  'technical-mvp': ['Check out frozen source','Set up Node','Install pinned npm','Install locked dependencies','Install local esbuild binary','Install complete browser engines','Run complete frozen acceptance','Export exact full profile evidence','Retain exact full profile summary','Stop owned local Supabase'],
  'codeql-evidence': ['Check out frozen source','Set up Node','Install pinned npm','Install locked dependencies','Install local esbuild binary','Verify canonical same-source security'],
  'secret-scan': ['Check out frozen source','Set up Node','Install pinned npm','Install locked dependencies','Install local esbuild binary','Verify pinned scanner and full source policy','Scan full history plus authored worktree'],
  required: ['Require every full regression boundary'],
};
export const fullRegressionJobPolicy = Object.fromEntries(Object.entries(fullSteps).map(([name, steps]) => [name, { steps, actionSteps: steps.filter(step => ['Check out frozen source','Set up Node','Retain exact full profile summary'].includes(step)) }]));

export function validateFullRegressionWorkflow(text: string): string[] {
  try {
    const flow = object(yaml.load(text)), trigger = object(flow.on), dispatch = object(trigger.workflow_dispatch), purpose = object(object(dispatch.inputs).purpose), jobs = object(flow.jobs);
    const same = (a: unknown, b: unknown) => canonicalReleaseReviewJson(a) === canonicalReleaseReviewJson(b);
    if (flow.name !== 'Cuevo full regression' || !same(Object.keys(trigger).sort(), ['schedule','workflow_dispatch'])
      || !same(trigger.schedule, [{ cron: '17 0 * * *' }]) || !same(purpose.options, ['regression','customer-candidate']) || purpose.default !== 'regression' || purpose.required !== true
      || !same(flow.permissions, { contents: 'read', actions: 'read' }) || object(flow.concurrency)['cancel-in-progress'] !== false
      || !same(Object.keys(jobs).sort(), Object.keys(fullSteps).sort()) || text.includes('secrets.')) return ['Full regression trigger, purpose or trust boundary is invalid.'];
    for (const [name, raw] of Object.entries(jobs)) {
      const job = object(raw), steps = job.steps as Row[];
      if (!Array.isArray(steps) || !same(steps.map(step => step.name), fullSteps[name]) || job['runs-on'] !== 'ubuntu-latest'
        || job.if !== (name === 'required' ? "always() && github.ref == 'refs/heads/main'" : "github.ref == 'refs/heads/main'")) return ['Full regression required job or ordered steps changed.'];
      for (const step of steps) {
        if (step['continue-on-error'] !== undefined || step.if !== undefined && !(step.name === 'Stop owned local Supabase' && step.if === 'always()')) return ['Full regression cannot skip required evidence.'];
        if (step.uses && !/@[a-f0-9]{40}$/.test(String(step.uses))) return ['Full regression actions require immutable pins.'];
        if (String(step.uses ?? '').startsWith('actions/checkout@') && (!same(step.with, { 'persist-credentials': false, 'fetch-depth': 0 }))) return ['Full regression needs complete nonpersistent source.'];
        if (step.name === 'Check out frozen source' && step.uses !== 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1') return ['Full regression checkout pin changed.'];
        if (step.name === 'Set up Node' && (step.uses !== 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020' || !same(step.with, { 'node-version':'24.16.0', cache:'npm' }))) return ['Full regression runtime configuration changed.'];
      }
    }
    const technical = object(jobs['technical-mvp']), steps = technical.steps as Row[];
    if (technical['timeout-minutes'] !== 120 || steps.find(step => step.name === 'Run complete frozen acceptance')?.run !== 'npm run verify:technical'
      || steps.find(step => step.name === 'Install complete browser engines')?.run !== 'npx --no-install playwright install --with-deps chromium firefox webkit'
      || steps.find(step => step.name === 'Export exact full profile evidence')?.run !== 'node --import tsx scripts/verification/full-verification-evidence.ts') return ['Full regression must execute complete frozen acceptance.'];
    const exportStep = steps.find(step => step.name === 'Export exact full profile evidence')!;
    if (!same(exportStep.env, { CUEVO_FULL_VERIFICATION_PURPOSE: "${{ github.event_name == 'workflow_dispatch' && inputs.purpose || 'regression' }}" })) return ['Full profile purpose must bind its original scheduled or manual event.'];
    for (const [name, raw] of Object.entries(jobs)) {
      const current = object(raw).steps as Row[];
      for (const step of current) {
        const commands: Record<string,string> = { 'Install pinned npm':'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund', 'Install locked dependencies':'npm ci --ignore-scripts --no-audit --no-fund','Install local esbuild binary':'node node_modules/esbuild/install.js','Verify canonical same-source security':'node --import tsx scripts/verification/staging-security.ts','Verify pinned scanner and full source policy':'node --import tsx --test scripts/verification/secret-scan-policy.test.ts scripts/verification/secret-scan.test.ts','Scan full history plus authored worktree':'node --import tsx scripts/verification/secret-scan.ts','Stop owned local Supabase':'npx --no-install supabase stop --project-id cuevo','Require every full regression boundary':'test "$TECHNICAL" = success && test "$CODEQL" = success && test "$SECRET_SCAN" = success' };
        if (commands[String(step.name)] && step.run !== commands[String(step.name)]) return ['Full regression evidence commands cannot be substituted.'];
      }
      if(name==='codeql-evidence'&&!same(current.find(step=>step.name==='Verify canonical same-source security')?.env,{GH_TOKEN:'${{ github.token }}'}))return ['Full security observation must use the read-only Actions token.'];
    }
    const upload = steps.find(step => step.name === 'Retain exact full profile summary')!, settings = object(upload.with);
    if (settings.path !== '.local/full-verification/summary.json' || settings.name !== 'cuevo-full-verification-${{ github.run_id }}-${{ github.run_attempt }}' || settings['if-no-files-found'] !== 'error') return ['Full regression may retain only its exact safe summary.'];
    if (!same(object(jobs.required).needs, ['technical-mvp','codeql-evidence','secret-scan'])) return ['Full regression aggregate must require all owners.'];
    if (!same((object(jobs.required).steps as Row[])[0].env, { TECHNICAL:'${{ needs.technical-mvp.result }}', CODEQL:'${{ needs.codeql-evidence.result }}', SECRET_SCAN:'${{ needs.secret-scan.result }}' })) return ['Full aggregate cannot substitute observed job outcomes.'];
    return [];
  } catch { return ['Full regression workflow is malformed.']; }
}
