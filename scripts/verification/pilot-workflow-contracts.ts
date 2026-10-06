import { createRequire } from 'node:module';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(value: string): unknown };
type Mapping = Record<string, unknown>;
const map = (value: unknown): Mapping => value && typeof value === 'object' && !Array.isArray(value) ? value as Mapping : {};
const same = (actual: unknown, expected: unknown) => JSON.stringify(actual) === JSON.stringify(expected);
const exactKeys = (value: Mapping, expected: string[]) => same(Object.keys(value).sort(), [...expected].sort());
const scope = { CUEVO_PILOT_EXPECTED_SHA: '${{ inputs.expected_sha }}', CUEVO_PILOT_CI_RUN_ID: '${{ inputs.ci_run_id }}' };
const phaseCommands = {
  npm: 'npm install --global npm@11.17.0 --ignore-scripts --no-audit --no-fund',
  dependencies: 'npm ci --ignore-scripts --no-audit --no-fund', esbuild: 'node node_modules/esbuild/install.js',
  browsers: 'npx --no-install playwright install --with-deps chromium firefox webkit',
  measure: 'node --import tsx scripts/verification/pilot-window.ts',
  cleanup: 'node --import tsx scripts/verification/pilot-window.ts cleanup',
  export: 'node --import tsx scripts/verification/pilot-evidence.ts',
  stop: 'node --import tsx scripts/verification/pilot-window.ts stop',
} as const;
/** The manual fixture window is separate from canonical CI and receives no external secrets. */
export function validatePilotWorkflow(source: string): string[] {
  let raw: unknown; try { raw = yaml.load(source); } catch { return ['Pilot workflow YAML is invalid.']; }
  const workflow = map(raw), issues: string[] = [];
  if (!exactKeys(workflow, ['name', 'on', 'permissions', 'concurrency', 'env', 'jobs']) || workflow.name !== 'Cuevo isolated pilot measurements') issues.push('Pilot workflow root contract differs.');
  const trigger = map(workflow.on), dispatch = map(trigger.workflow_dispatch), inputs = map(dispatch.inputs);
  if (!exactKeys(trigger, ['workflow_dispatch']) || !exactKeys(dispatch, ['inputs']) || !exactKeys(inputs, ['expected_sha', 'ci_run_id'])) issues.push('Pilot runs require the two exact manual-only inputs.');
  for (const input of Object.values(inputs).map(map)) if (!exactKeys(input, ['description', 'required', 'type']) || typeof input.description !== 'string' || !input.description.trim() || input.required !== true || input.type !== 'string') issues.push('Pilot input must be an explicit required string.');
  if (!same(workflow.permissions, { contents: 'read', actions: 'read' })) issues.push('Pilot permissions must remain read-only.');
  if (!same(workflow.concurrency, { group: 'cuevo-pilot-${{ github.ref }}', 'cancel-in-progress': false })) issues.push('Pilot concurrency cannot cancel an owned mutation window.');
  if (!same(workflow.env, { CI: 'true', NEXT_TELEMETRY_DISABLED: '1', SCARF_ANALYTICS: 'false' })) issues.push('Pilot environment must not enable measurement flags globally.');
  const jobs = map(workflow.jobs), job = map(jobs['pilot-measurements']);
  if (!exactKeys(jobs, ['pilot-measurements']) || !exactKeys(job, ['runs-on', 'timeout-minutes', 'steps']) || job['runs-on'] !== 'ubuntu-latest' || job['timeout-minutes'] !== 45) issues.push('Pilot requires one bounded fresh hosted Ubuntu job.');
  const steps = Array.isArray(job.steps) ? job.steps.map(map) : [];
  const expectedIds = ['checkout', 'node', 'npm', 'dependencies', 'esbuild', 'browsers', 'measure', 'cleanup', 'export', 'upload', 'stop'];
  if (!same(steps.map(step => step.id), expectedIds)) issues.push('Pilot cleanup, evidence and stop sequence must remain exact.');
  for (const step of steps) {
    const id = String(step.id), keys = ['id'];
    if (typeof step.name === 'string') keys.push('name');
    if (['checkout', 'node', 'upload'].includes(id)) keys.push('uses', 'with'); else keys.push('run');
    if (['measure', 'cleanup', 'export', 'stop'].includes(id)) keys.push('env');
    if (['cleanup', 'export', 'upload', 'stop'].includes(id)) keys.push('if');
    if (!exactKeys(step, keys)) issues.push('Pilot step contains an unreviewed execution option.');
    if (step.run !== undefined && step.run !== phaseCommands[id as keyof typeof phaseCommands]) issues.push('Pilot executable commands are fixed; user input is env only.');
    if (['cleanup', 'export', 'upload', 'stop'].includes(id) && step.if !== 'always()') issues.push('Pilot terminal cleanup and evidence must always run.');
    if (['measure', 'cleanup', 'export', 'stop'].includes(id) && !same(step.env, id === 'measure' ? { GH_TOKEN: '${{ github.token }}', ...scope } : scope)) issues.push('Pilot environment recipients differ from their exact purpose.');
    if (id === 'checkout' && (step.uses !== 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' || !same(step.with, { 'persist-credentials': false }))) issues.push('Pilot checkout must pin action and exact dispatched source without credentials.');
    if (id === 'node' && (step.uses !== 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020' || !same(step.with, { 'node-version': '24.16.0', cache: 'npm' }))) issues.push('Pilot toolchain is immutable.');
    if (id === 'upload' && (step.uses !== 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a' || !same(step.with, { name: 'cuevo-pilot-safe-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}', path: '.local/cicd-safe/pilot-summary.json', 'retention-days': 14, 'if-no-files-found': 'error' }))) issues.push('Pilot artifacts must contain only the unique sanitized summary.');
  }
  if (JSON.stringify(workflow).includes('secrets.') || JSON.stringify(workflow).includes('CUEVO_REQUIRE_BROWSER_')) issues.push('Pilot workflow cannot receive external secrets or global browser flags.');
  return [...new Set(issues)];
}
