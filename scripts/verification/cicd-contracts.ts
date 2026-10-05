import { createRequire } from 'node:module';
import { z } from 'zod';
import { verificationSteps } from './steps';
const yaml = createRequire(import.meta.url)('js-yaml') as { load(text: string): unknown };
const sha = z.string().regex(/^[a-f0-9]{40}$/); const digest = z.string().regex(/^[a-f0-9]{64}$/);
const secureUrl = z.url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !['localhost', '127.0.0.1'].includes(url.hostname); });
const origin = secureUrl.refine(value => { const url = new URL(value); return url.pathname === '/' && !url.search && !url.hash; });
export function vercelTarget(environment: string): 'preview' | 'production' {
  if (environment === 'staging') return 'preview';
  if (environment === 'production') return 'production';
  throw Error('Unknown application release environment.');
}
export function validateVercelDeployment(value: unknown, expected: { sha: string; projectId: string; teamId: string; target: string; url: string; deploymentId?: string }) {
  const deployment = z.object({ id: z.string().startsWith('dpl_'), projectId: z.string(), ownerId: z.string(), url: z.string(), readyState: z.literal('READY'), target: z.string().nullable(), meta: z.object({ cuevoCommitSha: sha }) }).safeParse(value);
  if (!deployment.success) throw Error('Vercel deployment evidence is incomplete or invalid; response contents withheld.');
  const source = deployment.data;
  if (source.projectId !== expected.projectId || source.ownerId !== expected.teamId || source.meta.cuevoCommitSha !== expected.sha || `https://${source.url}` !== expected.url || (source.target ?? 'preview') !== expected.target || expected.deploymentId !== undefined && source.id !== expected.deploymentId) throw Error('Deployment must match the approved Vercel team, project, deployment, target, URL and source commit.');
}
const dependency = z.object({ origin, commitSha: sha, imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), healthVerified: z.literal(true), evidenceUrl: secureUrl }).strict();
const apiDependency = z.preprocess(value => {
  // Existing reviewed manifests described only containers before kind was introduced.
  if (value && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'kind')) return { ...value, kind: 'container' };
  return value;
}, z.discriminatedUnion('kind', [
  dependency.extend({ kind: z.literal('container') }).strict(),
  z.object({ kind: z.literal('vercel'), origin, commitSha: sha, projectId: z.string().regex(/^prj_[a-zA-Z0-9]+$/), teamId: z.string().regex(/^team_[a-zA-Z0-9]+$/), deploymentId: z.string().regex(/^dpl_[a-zA-Z0-9]+$/), deploymentUrl: origin.refine(value => /^[a-z0-9.-]+\.vercel\.app$/.test(new URL(value).hostname)), target: z.enum(['preview', 'production']), artifactSha256: digest, metadataVerified: z.literal(true), healthVerified: z.literal(true), evidenceUrl: secureUrl }).strict(),
]));
const projectRef = z.string().regex(/^[a-z0-9]+$/);
const workerDependency = z.discriminatedUnion('kind', [
  dependency.extend({ kind: z.literal('container') }).strict(),
  z.object({ kind: z.literal('supabase-edge'), commitSha: sha, projectRef, functionName: z.literal('cuevo-worker'), artifactSha256: digest, denoLockSha256: digest, authVerified: z.literal(true), queueRecoveryVerified: z.literal(true), roleGrantsVerified: z.literal(true), transportPrivateVerified: z.literal(true), evidenceUrl: secureUrl }).strict(),
]);
const migration = z.object({ version: z.string().regex(/^\d{14}$/), sha256: digest }).strict();
const manifestSchema = z.object({
  version: z.literal(1), environment: z.enum(['staging', 'production']), commitSha: sha, ciRunId: z.string().regex(/^\d+$/), verifiedAt: z.iso.datetime(),
  api: apiDependency, worker: workerDependency,
  database: z.object({ projectRef, migrations: z.array(migration).min(1), grantsVerified: z.literal(true), rlsVerified: z.literal(true), privateStorageVerified: z.literal(true), privateRealtimeVerified: z.literal(true), recoveryVerified: z.literal(true), evidenceUrl: secureUrl }).strict(),
  approval: z.object({ reviewer: z.string().min(1).max(100), basis: z.enum(['SYNTHETIC_STAGING', 'PRODUCTION_APPROVED']), evidenceUrl: secureUrl }).strict(),
  publicConfig: z.object({ apiUrl: origin, supabaseUrl: origin, supabasePublishableKey: z.string().startsWith('sb_publishable_').min(20) }).strict(),
}).strict();
export function validateReleaseManifest(value: unknown, expected: { sha: string; environment: string; ciRunId: string; now: number; migrations: { version: string; sha256: string }[] }) {
  const result = manifestSchema.parse(value); const verifiedAt = Date.parse(result.verifiedAt);
  if (result.commitSha !== expected.sha || result.api.commitSha !== expected.sha || result.worker.commitSha !== expected.sha || result.environment !== expected.environment || result.ciRunId !== expected.ciRunId) throw Error('Release identity is not the verified dependency commit.');
  if (verifiedAt > expected.now || expected.now - verifiedAt > 86400000) throw Error('Release dependency evidence must be current within 24 hours.');
  if (result.publicConfig.apiUrl !== result.api.origin || new URL(result.publicConfig.supabaseUrl).hostname !== `${result.database.projectRef}.supabase.co`) throw Error('Public endpoints do not match the approved dependencies.');
  if (result.worker.kind === 'supabase-edge' && result.worker.projectRef !== result.database.projectRef) throw Error('Edge worker must use the approved database project.');
  if (result.api.kind === 'vercel' && result.api.target !== vercelTarget(expected.environment)) throw Error('API Vercel deployment must match the approved release environment.');
  if (result.approval.basis !== (expected.environment === 'production' ? 'PRODUCTION_APPROVED' : 'SYNTHETIC_STAGING')) throw Error('Deployment approval is not valid for this environment.');
  const canonical = (rows: { version: string; sha256: string }[]) => JSON.stringify([...rows].sort((a, b) => a.version.localeCompare(b.version)));
  if (new Set(result.database.migrations.map(row => row.version)).size !== result.database.migrations.length || canonical(result.database.migrations) !== canonical(expected.migrations)) throw Error('Applied migration versions and source hashes must exactly match this release.');
  return { ...result.publicConfig, api: result.api, worker: result.worker, ...(result.worker.kind === 'container' ? { workerOrigin: result.worker.origin } : {}) };
}
export function validateCiRun(value: unknown, expected: { sha: string; repository: string; ciRunId: string }) {
  const run = z.object({ id: z.number().int().positive(), head_sha: sha, head_branch: z.literal('main'), event: z.literal('push'), status: z.literal('completed'), conclusion: z.literal('success'), path: z.literal('.github/workflows/ci.yml'), repository: z.object({ full_name: z.string() }) }).parse(value);
  if (run.head_sha !== expected.sha || String(run.id) !== expected.ciRunId || run.repository.full_name !== expected.repository) throw Error('CI evidence must belong to this exact trusted repository commit.');
}
export function releaseContext(value: unknown, expected: { sha: string; ref: string; repository: string; eventName: string }): { sha: string; ciRunId: string; environment: 'staging' | 'production' } {
  if (expected.ref !== 'refs/heads/main') throw Error('Release requires the current trusted main checkout.');
  const sourceSha = sha.parse(expected.sha);
  if (expected.eventName === 'workflow_run') {
    const event = z.object({ workflow_run: z.object({ id: z.number().int().positive() }).passthrough() }).parse(value);
    const ciRunId = String(event.workflow_run.id);
    validateCiRun(event.workflow_run, { sha: sourceSha, repository: expected.repository, ciRunId });
    return { sha: sourceSha, ciRunId, environment: 'production' };
  }
  if (expected.eventName === 'workflow_dispatch') {
    const event = z.object({ inputs: z.object({ environment: z.enum(['staging', 'production']), commit_sha: sha, ci_run_id: z.string().regex(/^\d+$/) }) }).parse(value);
    if (event.inputs.commit_sha !== sourceSha) throw Error('Manual release must match the current main checkout.');
    return { sha: sourceSha, ciRunId: event.inputs.ci_run_id, environment: event.inputs.environment };
  }
  throw Error('Untrusted release event.');
}
export function validateReleaseControls(value: unknown, expected: { environment: string }) {
  const reviewer = z.object({ type: z.enum(['User', 'Team']), reviewer: z.object({ id: z.number().int().positive() }) });
  const controls = z.object({
    environment: z.object({ name: z.literal(expected.environment), can_admins_bypass: z.literal(false), protection_rules: z.array(z.object({ type: z.string(), prevent_self_review: z.boolean().optional(), reviewers: z.array(reviewer).optional() }).passthrough()), deployment_branch_policy: z.object({ protected_branches: z.literal(false), custom_branch_policies: z.literal(true) }) }),
    branches: z.object({ branch_policies: z.array(z.object({ name: z.literal('main'), type: z.literal('branch') })).length(1) }),
    signatures: z.object({ enabled: z.literal(true) }),
    main: z.object({ enforce_admins: z.object({ enabled: z.literal(true) }), required_status_checks: z.object({ strict: z.literal(true), contexts: z.array(z.string()) }), required_pull_request_reviews: z.object({ dismiss_stale_reviews: z.literal(true), require_code_owner_reviews: z.literal(true), required_approving_review_count: z.number().int().min(1), bypass_pull_request_allowances: z.object({ users: z.array(z.unknown()).length(0), teams: z.array(z.unknown()).length(0), apps: z.array(z.unknown()).length(0) }).optional() }) }),
  }).safeParse(value);
  if (!controls.success || !controls.data.main.required_status_checks.contexts.includes('required') || !controls.data.environment.protection_rules.some(rule => rule.type === 'required_reviewers' && rule.prevent_self_review === true && (rule.reviewers?.length ?? 0) > 0)) throw Error('Protected release environment and main review/signature/status controls are missing or unverified.');
}
export function safeEvidence(value: unknown, source: unknown, identity: { sha: string; runId: string }) {
  const evidence = z.object({ status: z.enum(['VERIFIED', 'FAILED', 'NOT_VERIFIED']), rows: z.array(z.object({ name: z.string().regex(/^[a-z][a-z0-9-]{0,80}$/), exitCode: z.number().int().nullable(), durationMs: z.number().nonnegative() })) }).parse(value);
  const names = new Set<string>([...verificationSteps.map(step => step.name), 'source-freeze']);
  if (evidence.rows.some(row => !names.has(row.name)) || new Set(evidence.rows.map(row => row.name)).size !== evidence.rows.length) throw Error('Safe evidence contains unknown or repeated step identities.');
  const sources = z.array(z.object({ path: z.string().min(1), sha256: digest }).strict()).parse(source);
  return { commitSha: sha.parse(identity.sha), runId: z.string().regex(/^\d+$/).parse(identity.runId), status: evidence.status, rows: evidence.rows, sourceFileCount: sources.length };
}
type Mapping = Record<string, unknown>;
const mapping = (value: unknown): Mapping => value && typeof value === 'object' && !Array.isArray(value) ? value as Mapping : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export function validateWorkflows(ciText: string, releaseText: string): string[] {
  const issues: string[] = []; let ci: Mapping; let release: Mapping;
  try { ci = mapping(yaml.load(ciText)); release = mapping(yaml.load(releaseText)); } catch { return ['Workflow YAML is invalid.']; }
  for (const [index, flow] of [ci, release].entries()) {
    const trigger = mapping(flow.on);
    if (Object.hasOwn(trigger, 'pull_request_target') || list(flow.on).some(event => ['pull_request_target', 'workflow_run'].includes(String(event))) || index === 0 && Object.hasOwn(trigger, 'workflow_run')) issues.push('Privileged untrusted triggers are forbidden.');
    if (index === 1 && JSON.stringify(mapping(trigger.workflow_run)) !== JSON.stringify({ workflows: ['Cuevo verification'], types: ['completed'], branches: ['main'] })) issues.push('Automatic release must consume only completed canonical main verification.');
    if (mapping(flow.permissions).contents !== 'read') issues.push('Default contents permission must be read.');
    for (const jobValue of Object.values(mapping(flow.jobs))) for (const stepValue of list(mapping(jobValue).steps)) {
      const step = mapping(stepValue); const uses = String(step.uses ?? ''); const settings = mapping(step.with);
      if (uses && !/@[a-f0-9]{40}$/.test(uses)) issues.push('Actions require full commit SHA pins.');
      if (uses.startsWith('actions/checkout@') && settings['persist-credentials'] !== false) issues.push('Checkout credentials must not persist.');
      if (uses.startsWith('actions/upload-artifact@') && settings.path !== '.local/cicd-safe/') issues.push('Unsafe artifact path.');
      if (index === 1 && uses.startsWith('actions/download-artifact@')) issues.push('Release must not consume upstream untrusted artifacts.');
      if (index === 1 && step.run && String(step.run).includes('${{')) issues.push('Release shell cannot evaluate workflow expressions.');
      if (step.run && /curl.+\|\s*(?:sh|bash)|eval\s|pull_request_target/.test(String(step.run))) issues.push('Unreviewed executable workflow input.');
    }
  }
  const ciJobs = mapping(ci.jobs); const technical = mapping(ciJobs['technical-mvp']); const steps = list(technical.steps).map(mapping);
  if (typeof technical['timeout-minutes'] !== 'number' || technical['timeout-minutes'] < 90) issues.push('Technical verification budget is too short.');
  if (!steps.some(step => step.run === 'npx --no-install playwright install --with-deps chromium firefox webkit')) issues.push('All compatibility engines must be installed.');
  if (!steps.some(step => step.run === 'npm run verify:technical')) issues.push('Frozen technical gate is required.');
  if (!steps.some(step => step.if === 'always()' && step.run === 'node --import tsx scripts/verification/cicd-evidence.ts')) issues.push('Safe evidence must export even on failure.');
  if (JSON.stringify(ci).includes('secrets.')) issues.push('PR verification must not receive external secrets.');
  const required = mapping(ciJobs.required);
  if (JSON.stringify(required.needs) !== JSON.stringify(['fast-checks', 'technical-mvp', 'dependency-review', 'codeql', 'secret-scan']) || required.if !== 'always()') issues.push('Required status must include all verification jobs, including secret scan.');
  const secretScan = mapping(ciJobs['secret-scan']); const secretSteps = list(secretScan.steps).map(mapping);
  const secretCheckout = secretSteps.filter(step => String(step.uses ?? '').startsWith('actions/checkout@'));
  if (secretScan.if !== undefined || secretScan['continue-on-error'] !== undefined || secretScan['runs-on'] !== 'ubuntu-latest'
    || secretCheckout.length !== 1 || mapping(secretCheckout[0]?.with)['fetch-depth'] !== 0
    || !secretSteps.some(step => step.run === 'node --import tsx scripts/verification/secret-scan.ts')
    || secretSteps.some(step => step.if !== undefined || step['continue-on-error'] !== undefined)) issues.push('Required secret scan must run the pinned scanner on complete history without skip or waiver.');
  const aggregate = list(required.steps).map(mapping).find(step => step.name === 'Require every verification boundary');
  if (mapping(aggregate?.env).SECRET_SCAN !== '${{ needs.secret-scan.result }}' || !String(aggregate?.run).includes('[ "$SECRET_SCAN" != success ]')) issues.push('Required aggregate must fail unless secret scan succeeds.');
  if (mapping(release.concurrency)['cancel-in-progress'] !== false) issues.push('Unsafe release concurrency.');
  if (mapping(release.concurrency).group !== "cuevo-release-${{ github.event_name == 'workflow_run' && 'production' || inputs.environment }}") issues.push('Automatic and manual production must share release concurrency.');
  const releaseJobs = mapping(release.jobs);
  const releaseCondition = "github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || (github.event.workflow_run.event == 'push' && github.event.workflow_run.conclusion == 'success'))";
  for (const job of Object.values(releaseJobs).map(mapping)) if (job.if !== releaseCondition) issues.push('Release requires successful trusted main push CI.');
  const web = mapping(releaseJobs['web-release']);
  if (!releaseJobs['release-admission'] || !releaseJobs['web-release']) issues.push('Release admission and deployment jobs are required.');
  if (web.needs !== 'release-admission') issues.push('Deployment must depend on trusted CI admission.');
  if (mapping(web.environment).name !== '${{ needs.release-admission.outputs.environment }}') issues.push('Protected deployment environment is required.');
  const admission = mapping(releaseJobs['release-admission']);
  if (JSON.stringify(admission.outputs) !== JSON.stringify({ sha: '${{ steps.context.outputs.sha }}', 'ci-run-id': '${{ steps.context.outputs.ci-run-id }}', environment: '${{ steps.context.outputs.environment }}' })) issues.push('Release outputs must be validated event context.');
  const admissionSteps = list(admission.steps).map(mapping);
  const admissionCheckouts = admissionSteps.filter(step => String(step.uses ?? '').startsWith('actions/checkout@'));
  if (admissionCheckouts.length !== 1 || Object.hasOwn(mapping(admissionCheckouts[0]?.with), 'ref')) issues.push('Admission requires one trusted default-branch checkout.');
  if (!admissionSteps.some(step => step.id === 'context' && step.run === 'node --import tsx scripts/verification/cicd-release.ts context')) issues.push('Release requires validated event context.');
  if (!admissionSteps.some(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts controls' && mapping(step.env).RELEASE_ENVIRONMENT === '${{ steps.context.outputs.environment }}')) issues.push('Release requires existing protected environment and main controls.');
  const webSteps = list(web.steps).map(mapping);
  if (webSteps.filter(step => String(step.uses ?? '').startsWith('actions/checkout@')).length !== 1) issues.push('Deployment requires one admitted source checkout.');
  if (!webSteps.some(step => String(step.uses ?? '').startsWith('actions/checkout@') && mapping(step.with).ref === '${{ needs.release-admission.outputs.sha }}')) issues.push('Deployment checkout must use the admitted commit.');
  if (webSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts ci') < 0 || webSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts ci') >= webSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts manifest')) issues.push('Release must revalidate current main after environment approval.');
  for (const step of list(web.steps).map(mapping)) {
    const env = mapping(step.env);
    for (const [key, output] of [['RELEASE_SHA', 'sha'], ['CI_RUN_ID', 'ci-run-id'], ['RELEASE_ENVIRONMENT', 'environment']]) if (env[key] !== undefined && env[key] !== `\${{ needs.release-admission.outputs.${output} }}`) issues.push('Deployment identity must consume validated release admission.');
  }
  for (const [id, value] of Object.entries(releaseJobs)) if (id !== 'web-release' && JSON.stringify(value).includes('secrets.')) issues.push('Deployment credentials must be environment protected.');
  const commands = list(web.steps).map(mapping).map(step => step.run).filter((run): run is string => typeof run === 'string' && run.startsWith('node --import tsx scripts/verification/cicd-release.ts'));
  if (JSON.stringify(commands) !== JSON.stringify(['ci', 'manifest', 'build', 'deploy', 'verify'].map(command => `node --import tsx scripts/verification/cicd-release.ts ${command}`))) issues.push('Release must admit dependencies, build, deploy and verify in order.');
  return issues;
}
