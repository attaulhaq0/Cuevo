import {dataApiConfigurationObservationSchema,validateDisabledDataApiConfigurationEvidence} from './data-api-configuration';
import { createRequire } from 'node:module';
import { z } from 'zod';
import {validateCiRuntimeJobs,validateCiSourceJobs,runtimeLaneArtifactStep,runtimeDeliveryArtifactStep,ciDatabaseJob,ciRequiredJob,ciSourceJobs,ciRuntimeJobs} from './verification-workflows';
import { canonicalReleaseReviewJson } from './release-review';
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
const legacyDataApiPosture = z.object({state:z.literal('DISABLED'),projectRef,commitSha:sha,verifiedAt:z.iso.datetime(),configurationVerified:z.literal(true),anonymousRestDenied:z.literal(true),authenticatedRestDenied:z.literal(true),serviceRestDenied:z.literal(true),graphqlDenied:z.literal(true),rpcDenied:z.literal(true),evidenceUrl:secureUrl}).strict();
const dataApiPosture=z.union([legacyDataApiPosture,legacyDataApiPosture.extend({version:z.literal(2),configurationObservation:dataApiConfigurationObservationSchema}).strict()]);
const manifestSchema = z.object({
  version: z.literal(2), environment: z.enum(['staging', 'production']), commitSha: sha, ciRunId: z.string().regex(/^\d+$/), verifiedAt: z.iso.datetime(),
  api: apiDependency, worker: workerDependency,
  database: z.object({ projectRef, migrations: z.array(migration).min(1), grantsVerified: z.literal(true), rlsVerified: z.literal(true), privateStorageVerified: z.literal(true), privateRealtimeVerified: z.literal(true), recoveryVerified: z.literal(true), evidenceUrl: secureUrl, dataApi:dataApiPosture }).strict(),
  approval: z.object({ reviewer: z.string().min(1).max(100), basis: z.enum(['SYNTHETIC_STAGING', 'PRODUCTION_APPROVED']), evidenceUrl: secureUrl }).strict(),
  publicConfig: z.object({ apiUrl: origin, supabaseUrl: origin, supabasePublishableKey: z.string().startsWith('sb_publishable_').min(20) }).strict(),
}).strict();
export function validateReleaseManifest(value: unknown, expected: { sha: string; environment: string; ciRunId: string; now: number; migrations: { version: string; sha256: string }[] }) {
  const result = manifestSchema.parse(value); const verifiedAt = Date.parse(result.verifiedAt);
  if (result.commitSha !== expected.sha || result.api.commitSha !== expected.sha || result.worker.commitSha !== expected.sha || result.environment !== expected.environment || result.ciRunId !== expected.ciRunId) throw Error('Release identity is not the verified dependency commit.');
  if (verifiedAt > expected.now || expected.now - verifiedAt > 86400000) throw Error('Release dependency evidence must be current within 24 hours.');
  const exposure=result.database.dataApi;if('version'in exposure)validateDisabledDataApiConfigurationEvidence(exposure.configurationObservation.evidence,{projectRef:exposure.projectRef,sourceSha:exposure.commitSha,treeSha:exposure.configurationObservation.evidence.treeSha,now:expected.now});const exposureVerifiedAt=Date.parse(exposure.verifiedAt);
  if(exposure.projectRef!==result.database.projectRef||exposure.commitSha!==expected.sha||exposureVerifiedAt>expected.now||expected.now-exposureVerifiedAt>86400000)throw Error('Data API disabled posture must bind current exact-project source and observed endpoint denials.');
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
export function releaseContext(value: unknown, expected: { sha: string; ref: string; repository: string; eventName: string }): { sha: string; ciRunId: string; environment: 'staging' | 'production'; fullVerificationRunId?: string } {
  if (expected.ref !== 'refs/heads/main') throw Error('Release requires the current trusted main checkout.');
  const sourceSha = sha.parse(expected.sha);
  if (expected.eventName === 'workflow_dispatch') {
    const event = z.object({ inputs: z.object({ environment: z.enum(['staging', 'production']), commit_sha: sha, ci_run_id: z.string().regex(/^[1-9]\d*$/), full_verification_run_id: z.string().optional() }) }).parse(value);
    if (event.inputs.commit_sha !== sourceSha) throw Error('Manual release must match the current main checkout.');
    const fullId = event.inputs.full_verification_run_id;
    if (event.inputs.environment === 'production') {
      if (!fullId || !/^[1-9]\d*$/.test(fullId) || !Number.isSafeInteger(Number(fullId)) || fullId === event.inputs.ci_run_id) throw Error('Production requires its separate full customer-candidate run.');
      return { sha: sourceSha, ciRunId: event.inputs.ci_run_id, environment: 'production', fullVerificationRunId: fullId };
    }
    if (fullId) throw Error('Staging cannot consume a production candidate input.');
    return { sha: sourceSha, ciRunId: event.inputs.ci_run_id, environment: 'staging' };
  }
  throw Error('Untrusted release event.');
}
export function validateReleaseControls(value: unknown, expected: { environment: string; repository?: string }) {
  if (!['staging', 'production'].includes(expected.environment)) throw Error('Unknown protected release environment.');
  const repositoryName=z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).safeParse(expected.repository);
  const dataField=(object:unknown,key:string):unknown=>{if(!object||typeof object!=='object')return undefined;const field=Object.getOwnPropertyDescriptor(object,key);return field&&'value'in field?field.value:undefined;};
  const rawRepository=dataField(value,'repository'),rawOwner=dataField(rawRepository,'owner');
  const repository= z.object({full_name:z.string(),name:z.string().min(1),owner:z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),login:z.string().min(1),type:z.enum(['User','Organization'])})}).safeParse({full_name:dataField(rawRepository,'full_name'),name:dataField(rawRepository,'name'),owner:{id:dataField(rawOwner,'id'),login:dataField(rawOwner,'login'),type:dataField(rawOwner,'type')}});
  if(!repositoryName.success||!repository.success||repository.data.full_name!==repositoryName.data||`${repository.data.owner.login}/${repository.data.name}`!==repositoryName.data)throw Error('Release controls require the exact current repository identity and owner capability.');
  const bypass=z.object({users:z.array(z.unknown()).length(0),teams:z.array(z.unknown()).length(0),apps:z.array(z.unknown()).length(0)});
  const originalReviews=dataField(dataField(value,'main'),'required_pull_request_reviews');
  if(!originalReviews||typeof originalReviews!=='object')throw Error('Main pull-request controls are missing or unverified.');
  if(![Object.prototype,null].includes(Object.getPrototypeOf(originalReviews)))throw Error('Main pull-request control metadata must be an official JSON object.');
  const present=Object.hasOwn(originalReviews,'bypass_pull_request_allowances');
  if(present){const field=Object.getOwnPropertyDescriptor(originalReviews,'bypass_pull_request_allowances');if(!field||!('value'in field)||!bypass.safeParse({users:dataField(field.value,'users'),teams:dataField(field.value,'teams'),apps:dataField(field.value,'apps')}).success)throw Error('Explicit PR bypass metadata must confirm no permitted user, team or app.');}
  else if(repository.data.owner.type!=='User')throw Error('Organization PR bypass controls are missing or unverified.');
  const reviewer = z.object({ type: z.literal('User'), reviewer: z.object({ id: z.literal(95836629), login: z.literal('attaulhaq0'), type: z.literal('User') }) });
  const rule = z.discriminatedUnion('type', [
    z.object({ type: z.literal('required_reviewers'), prevent_self_review: z.literal(false), reviewers: z.array(reviewer).length(1) }),
    z.object({ type: z.literal('branch_policy') }),
    z.object({ type: z.literal('wait_timer'), wait_timer: z.number().int().min(0).max(43200) }),
  ]);
  const controls = z.object({
    environment: z.object({ name: z.literal(expected.environment), can_admins_bypass: z.literal(false), protection_rules: z.array(rule), deployment_branch_policy: z.object({ protected_branches: z.literal(false), custom_branch_policies: z.literal(true) }) }),
    branches: z.object({ branch_policies: z.array(z.object({ name: z.literal('main'), type: z.literal('branch') })).length(1) }),
    signatures: z.object({ enabled: z.literal(true) }),
    main: z.object({ enforce_admins: z.object({ enabled: z.literal(true) }), required_status_checks: z.object({ strict: z.literal(true), contexts: z.array(z.string()) }), allow_force_pushes: z.object({ enabled: z.literal(false) }), allow_deletions: z.object({ enabled: z.literal(false) }), required_pull_request_reviews: z.object({ dismiss_stale_reviews: z.literal(true), require_code_owner_reviews: z.literal(false), required_approving_review_count: z.literal(0), require_last_push_approval: z.literal(false), bypass_pull_request_allowances: bypass.optional() }) }),
  }).safeParse(value);
  if (!controls.success || controls.data.main.required_status_checks.contexts.filter(context => context === 'required').length !== 1 || controls.data.environment.protection_rules.filter(rule => rule.type === 'required_reviewers').length !== 1 || controls.data.environment.protection_rules.filter(rule => rule.type === 'branch_policy').length > 1 || controls.data.environment.protection_rules.filter(rule => rule.type === 'wait_timer').length > 1) throw Error('Founder release environment and main PR/signature/status controls are missing or unverified.');
  return {repository:repositoryName.data,ownerType:repository.data.owner.type,prBypass:present?'EXPLICIT_EMPTY' as const:'NON_CONFIGURABLE_PERSONAL_REPOSITORY' as const};
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
  const ciTrigger = mapping(ci.on), pushTrigger = mapping(ciTrigger.push);
  const codeqlReceiptStep = { name:'Retain original processed CodeQL receipt',uses:'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',with:{name:'cuevo-codeql-${{ github.run_id }}-${{ github.run_attempt }}',path:'.local/codeql-receipt/receipt.json','include-hidden-files':true,'if-no-files-found':'error','retention-days':90} };
  if (Object.keys(ciTrigger).sort().join(',') !== 'pull_request,push,workflow_dispatch'
    || Object.keys(pushTrigger).join(',') !== 'branches' || JSON.stringify(pushTrigger.branches) !== JSON.stringify(['main'])
    || ciTrigger.pull_request !== null || ciTrigger.workflow_dispatch !== null) {
    issues.push('CI must verify every PR, main push and manual dispatch without duplicate feature-branch pushes.');
  }
  for (const [index, flow] of [ci, release].entries()) {
    const trigger = mapping(flow.on);
    if (Object.hasOwn(trigger, 'pull_request_target') || list(flow.on).some(event => ['pull_request_target', 'workflow_run'].includes(String(event))) || index === 0 && Object.hasOwn(trigger, 'workflow_run')) issues.push('Privileged untrusted triggers are forbidden.');
    if (index === 1 && (Object.keys(trigger).join(',') !== 'workflow_dispatch' || !Object.hasOwn(mapping(mapping(trigger.workflow_dispatch).inputs), 'full_verification_run_id'))) issues.push('Release must be manual and retain separate routine and full-candidate run inputs.');
    if (mapping(flow.permissions).contents !== 'read') issues.push('Default contents permission must be read.');
    for (const [jobName,jobValue] of Object.entries(mapping(flow.jobs))) for (const stepValue of list(mapping(jobValue).steps)) {
      const step = mapping(stepValue); const uses = String(step.uses ?? ''); const settings = mapping(step.with);
      if (uses && !/@[a-f0-9]{40}$/.test(uses)) issues.push('Actions require full commit SHA pins.');
      if (uses.startsWith('actions/checkout@') && settings['persist-credentials'] !== false) issues.push('Checkout credentials must not persist.');
      const stagingEvidencePath=['web-deployment-result.json','web-origin-intent.json','web-origin-protection-intent.json','web-origin-result.json','protected-preview-web-intent.json','protected-preview-web-result.json','hosted-browser-intent.json','hosted-browser-result.json','hosted-browser-cleanup.json'].map(name=>'.local/cicd-release/'+name).join('\n')+'\n';
      const stagingEvidence=index===1&&settings.path===stagingEvidencePath&&settings.name==='cuevo-web-staging-evidence-${{ github.run_id }}-${{ github.run_attempt }}'&&settings['include-hidden-files']===true&&settings['if-no-files-found']==='warn'&&settings['retention-days']===14&&step.if==="always() && needs.release-admission.outputs.backend-selection-base64 != ''"&&step['continue-on-error']===undefined;
      const learningEvidence=index===1&&settings.path==='.local/cicd-release/hosted-learning-loop/\n.local/cicd-release/hosted-learning-loop-ui/\n'&&settings.name==='cuevo-learning-loop-ui-${{ github.run_id }}-${{ github.run_attempt }}'&&settings['include-hidden-files']===true&&settings['if-no-files-found']==='warn'&&settings['retention-days']===14&&step.if==="always() && needs.release-admission.outputs.backend-selection-base64 != '' && inputs.backend_handoff != 'operating-staging'"&&step['continue-on-error']===undefined;
      const codeqlReceipt=index===0&&jobName==='codeql'&&canonicalReleaseReviewJson(step)===canonicalReleaseReviewJson(codeqlReceiptStep);
      const runtimeLane=index===0&&(['backend','browser','database'] as const).some(lane=>jobName===(lane==='database'?'database-checks':`runtime-${lane}`)&&canonicalReleaseReviewJson(step)===canonicalReleaseReviewJson(runtimeLaneArtifactStep(lane)));
      const runtimeDelivery=index===0&&jobName==='runtime-backend'&&canonicalReleaseReviewJson(step)===canonicalReleaseReviewJson(runtimeDeliveryArtifactStep);
      const sourceContracts=index===0&&Object.hasOwn(ciSourceJobs,jobName)&&list(mapping(ciSourceJobs[jobName as keyof typeof ciSourceJobs]).steps).some(required=>mapping(required).uses==='actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'&&canonicalReleaseReviewJson(step)===canonicalReleaseReviewJson(required));
      const partitionRuntime=index===0&&Object.hasOwn(ciRuntimeJobs,jobName)&&list(mapping(ciRuntimeJobs[jobName as keyof typeof ciRuntimeJobs]).steps).some(required=>mapping(required).uses==='actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'&&canonicalReleaseReviewJson(step)===canonicalReleaseReviewJson(required));
      if (uses.startsWith('actions/upload-artifact@') && settings.path !== '.local/cicd-safe/' && !partitionRuntime && !sourceContracts && !runtimeDelivery && !runtimeLane && !codeqlReceipt && !stagingEvidence && !learningEvidence && !(index === 1 && settings.path === '.local/cicd-release/web-deployment-result.json'
        && settings.name === 'cuevo-web-deployment-${{ github.run_id }}-${{ github.run_attempt }}' && settings['include-hidden-files'] === true && settings['if-no-files-found'] === 'error'
        && settings['retention-days'] === 2 && step.if === undefined && step['continue-on-error'] === undefined)) issues.push('Unsafe artifact path.');
      if (index === 1 && uses.startsWith('actions/download-artifact@')) issues.push('Release must not consume upstream untrusted artifacts.');
      if (index === 1 && step.run && String(step.run).includes('${{')) issues.push('Release shell cannot evaluate workflow expressions.');
      if (step.run && /curl.+\|\s*(?:sh|bash)|eval\s|pull_request_target/.test(String(step.run))) issues.push('Unreviewed executable workflow input.');
    }
  }
  const ciJobs = mapping(ci.jobs); const technical = mapping(ciJobs['technical-mvp']); const steps = list(technical.steps).map(mapping);
  for (const owner of ['fast-checks','source-contracts','source-fixtures-native','source-fixtures-contracts','source-fixtures-delivery','technical-mvp','runtime-backend','runtime-browser']) {
    const checkouts = list(mapping(ciJobs[owner]).steps).map(mapping).filter(step => String(step.uses ?? '').startsWith('actions/checkout@'));
    if (checkouts.length !== 1 || mapping(checkouts[0]?.with)['fetch-depth'] !== 0 || checkouts[0]?.if !== undefined || checkouts[0]?.['continue-on-error'] !== undefined) issues.push(`${owner} verification requires one unconditional complete-history checkout for canonical source checks.`);
  }
  issues.push(...validateCiRuntimeJobs(ciJobs));
  issues.push(...validateCiSourceJobs(ciJobs));
  if(canonicalReleaseReviewJson(ciJobs['database-checks'])!==canonicalReleaseReviewJson(ciDatabaseJob))issues.push('Canonical database verification must retain its exact isolated replay, grants and advisor owner.');
  if (!steps.some(step => step.if === 'always()' && step.run === 'node --import tsx scripts/verification/cicd-evidence.ts')) issues.push('Safe evidence must export even on failure.');
  if (JSON.stringify(ci).includes('secrets.')) issues.push('PR verification must not receive external secrets.');
  const codeql = mapping(ciJobs.codeql), codeqlSteps = list(codeql.steps).map(mapping);
  const receiptSteps=codeqlSteps.filter(step=>step.name==='Retain original processed CodeQL receipt');
  if(canonicalReleaseReviewJson(codeql.concurrency??null)!==canonicalReleaseReviewJson({group:'cuevo-codeql-${{ github.ref }}','cancel-in-progress':false,queue:'max'}))issues.push('CodeQL processed uploads must serialize per original ref without cancelling queued security proof.');
  if(receiptSteps.length!==1||canonicalReleaseReviewJson(receiptSteps[0])!==canonicalReleaseReviewJson(codeqlReceiptStep)
    ||codeqlSteps.indexOf(receiptSteps[0])!==codeqlSteps.findIndex(step=>step.run==='node --import tsx scripts/verification/codeql-alerts.ts')+1)issues.push('CodeQL must retain exactly its minimized same-job processed receipt after the threshold gate.');
  const analyzerIndex = codeqlSteps.findIndex(step => String(step.uses ?? '').startsWith('github/codeql-action/analyze@'));
  const alertIndex = codeqlSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/codeql-alerts.ts');
  if (analyzerIndex < 0 || alertIndex <= analyzerIndex || codeqlSteps[analyzerIndex]?.id !== 'codeql-analyze'
    || mapping(codeqlSteps[analyzerIndex]?.with)['wait-for-processing'] !== true || codeqlSteps[alertIndex]?.if !== undefined || codeqlSteps[alertIndex]?.['continue-on-error'] !== undefined
    || mapping(codeqlSteps[alertIndex]?.env).GH_TOKEN !== '${{ github.token }}' || mapping(codeqlSteps[alertIndex]?.env).CUEVO_CODEQL_SARIF_ID !== '${{ steps.codeql-analyze.outputs.sarif-id }}') issues.push('CodeQL must gate current processed same-job security findings without skips.');
  const required = mapping(ciJobs.required);
  if(canonicalReleaseReviewJson(required)!==canonicalReleaseReviewJson(ciRequiredJob))issues.push('Required status must preserve the exact aggregate execution and original job results.');
  if (JSON.stringify(required.needs) !== JSON.stringify(['fast-checks','source-contracts','database-checks','technical-mvp','dependency-review','codeql','secret-scan']) || required.if !== 'always()') issues.push('Required status must include all verification jobs, including source contracts, database and secret scan.');
  const secretScan = mapping(ciJobs['secret-scan']); const secretSteps = list(secretScan.steps).map(mapping);
  const secretCheckout = secretSteps.filter(step => String(step.uses ?? '').startsWith('actions/checkout@'));
  if (secretScan.if !== undefined || secretScan['continue-on-error'] !== undefined || secretScan['runs-on'] !== 'ubuntu-latest'
    || secretCheckout.length !== 1 || mapping(secretCheckout[0]?.with)['fetch-depth'] !== 0
    || !secretSteps.some(step => step.run === 'node --import tsx scripts/verification/secret-scan.ts')
    || secretSteps.some(step => step.if !== undefined || step['continue-on-error'] !== undefined)) issues.push('Required secret scan must run the pinned scanner on complete history without skip or waiver.');
  const aggregate = list(required.steps).map(mapping).find(step => step.name === 'Require every verification boundary');
  if (mapping(aggregate?.env).SOURCE_CONTRACTS !== '${{ needs.source-contracts.result }}' || !String(aggregate?.run).includes('[ "$SOURCE_CONTRACTS" != success ]')) issues.push('Required aggregate must fail unless source contracts succeed.');
  if (mapping(aggregate?.env).DATABASE !== '${{ needs.database-checks.result }}' || !String(aggregate?.run).includes('[ "$DATABASE" != success ]')) issues.push('Required aggregate must fail unless database verification succeeds.');
  if (mapping(aggregate?.env).SECRET_SCAN !== '${{ needs.secret-scan.result }}' || !String(aggregate?.run).includes('[ "$SECRET_SCAN" != success ]')) issues.push('Required aggregate must fail unless secret scan succeeds.');
  if (mapping(release.concurrency)['cancel-in-progress'] !== false) issues.push('Unsafe release concurrency.');
  if (mapping(release.concurrency).group !== 'cuevo-release-${{ inputs.environment }}') issues.push('Manual releases must serialize by protected environment.');
  const releaseJobs = mapping(release.jobs);
  if(Object.entries(release).some(([key,value])=>key!=='jobs'&&JSON.stringify(value).includes('secrets.')))issues.push('Release secrets must never be inherited from workflow-level configuration.');
  for(const value of Object.values(releaseJobs)){const job=mapping(value);if(Object.entries(job).some(([key,field])=>key!=='steps'&&JSON.stringify(field).includes('secrets.')))issues.push('Release secrets must never be inherited from job-level configuration.');}
  const releaseCondition = "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'";
  for (const job of Object.values(releaseJobs).map(mapping)) if (job.if !== releaseCondition) issues.push('Release requires successful trusted main manual customer-candidate verification.');
  const web = mapping(releaseJobs['web-release']);
  if(web['timeout-minutes']!==60)issues.push('The reviewed hosted UI loop requires its bounded 60-minute source and browser budget.');
  if (!releaseJobs['release-admission'] || !releaseJobs['web-release']) issues.push('Release admission and deployment jobs are required.');
  if (web.needs !== 'release-admission') issues.push('Deployment must depend on trusted CI admission.');
  if (mapping(web.environment).name !== '${{ needs.release-admission.outputs.environment }}') issues.push('Protected deployment environment is required.');
  const admission = mapping(releaseJobs['release-admission']);
  if (JSON.stringify(admission.outputs) !== JSON.stringify({ sha: '${{ steps.context.outputs.sha }}', 'ci-run-id': '${{ steps.context.outputs.ci-run-id }}', 'full-run-id':'${{ steps.context.outputs.full-run-id }}', environment: '${{ steps.context.outputs.environment }}', 'review-base64':'${{ steps.review.outputs.review-base64 }}','review-digest':'${{ steps.review.outputs.review-digest }}','environment-id':'${{ steps.review.outputs.environment-id }}',
    'backend-selection-base64':'${{ steps.context.outputs.backend-selection-base64 }}','backend-manifest-base64':'${{ steps.review.outputs.backend-manifest-base64 }}','backend-bridge-base64':'${{ steps.review.outputs.backend-bridge-base64 }}' })) issues.push('Release outputs must be validated event context and same-run review package.');
  const admissionSteps = list(admission.steps).map(mapping);
  const metadataSecret='${{ secrets.CUEVO_GITHUB_RELEASE_METADATA_TOKEN }}';
  const metadataOnly=(step:Mapping)=>Object.entries(mapping(step.env)).every(([key,value])=>!JSON.stringify(value).includes('secrets.')||key==='GH_TOKEN'&&value===metadataSecret);
  for(const step of admissionSteps){if(!metadataOnly(step))issues.push('Only the scoped metadata credential may reach release admission.');if(String(step.run??'').startsWith('node --import tsx scripts/verification/cicd-release.ts ')&&step.run!=='node --import tsx scripts/verification/cicd-release.ts context'&&mapping(step.env).GH_TOKEN!==metadataSecret)issues.push('Release controls require the scoped GitHub metadata token.');}
  const admissionCheckouts = admissionSteps.filter(step => String(step.uses ?? '').startsWith('actions/checkout@'));
  if (admissionCheckouts.length !== 1 || Object.hasOwn(mapping(admissionCheckouts[0]?.with), 'ref')) issues.push('Admission requires one trusted default-branch checkout.');
  if(mapping(admissionCheckouts[0]?.with)['fetch-depth']!==0)issues.push('Release review requires complete immutable source ancestry.');
  if (!admissionSteps.some(step => step.id === 'context' && step.run === 'node --import tsx scripts/verification/cicd-release.ts context')) issues.push('Release requires validated event context.');
  if (!admissionSteps.some(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts controls' && mapping(step.env).RELEASE_ENVIRONMENT === '${{ steps.context.outputs.environment }}')) issues.push('Release requires existing protected environment and main controls.');
  const preparation=admissionSteps.find(step=>step.id==='review'&&step.run==='node --import tsx scripts/verification/cicd-release.ts prepare');
  if(!preparation||mapping(preparation.env).CUEVO_RELEASE_REVIEW_INPUT_JSON!=='${{ vars.CUEVO_RELEASE_REVIEW_INPUT_JSON }}'||mapping(preparation.env).CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON!=='${{ vars.CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON }}'||!metadataOnly(preparation))issues.push('Release requires provider-credential-free review preparation before environment approval.');
  const dispatchInputs = mapping(mapping(mapping(release.on).workflow_dispatch).inputs);
  for (const field of ['backend_run_id','backend_run_attempt','backend_artifact_id','backend_transfer_sha256']) if (mapping(dispatchInputs[field]).type !== 'string' || mapping(dispatchInputs[field]).required !== false) issues.push('Backend bridge requires four optional typed manual inputs with runtime all-or-none staging admission.');
  if(mapping(dispatchInputs.backend_handoff).type!=='string'||mapping(dispatchInputs.backend_handoff).required!==false||mapping(dispatchInputs.backend_handoff).default!==undefined)issues.push('Backend purpose must remain optional without an injected default; selected staging artifacts require explicit runtime purpose.');
  if (mapping(preparation?.env).BACKEND_SELECTION_BASE64 !== '${{ steps.context.outputs.backend-selection-base64 }}') issues.push('Backend selection must consume validated release context before preparation.');
  const webSteps = list(web.steps).map(mapping);
  const credentialCommands=new Set(['build','deploy','verify','bind-staging-origin','verify-browser','verify-learning-loop'].map(mode=>`node --import tsx scripts/verification/cicd-release.ts ${mode}`));
  const stagingCondition="needs.release-admission.outputs.backend-selection-base64 != ''";
  const stagingCommands=new Set(['bind-staging-origin','verify-browser','verify-learning-loop'].map(mode=>`node --import tsx scripts/verification/cicd-release.ts ${mode}`));
  for(const step of webSteps){const command=String(step.run??'');const env=mapping(step.env);
    if(Object.entries(env).some(([key,value])=>JSON.stringify(value).includes('secrets.')&&!(key==='GH_TOKEN'&&value===metadataSecret)&&!(credentialCommands.has(command)&&key==='VERCEL_TOKEN'&&value==='${{ secrets.VERCEL_TOKEN }}')&&!(['node --import tsx scripts/verification/cicd-release.ts verify-browser','node --import tsx scripts/verification/cicd-release.ts verify-learning-loop'].includes(command)&&key==='CUEVO_SYNTHETIC_PILOT_PASSWORD'&&value==='${{ secrets.CUEVO_SYNTHETIC_PILOT_PASSWORD }}')))issues.push('Deployment credentials may reach only the reviewed release owner after official approval.');
    if(command.startsWith('node --import tsx scripts/verification/cicd-release.ts ')&&env.GH_TOKEN!==metadataSecret)issues.push('Release controls require the scoped GitHub metadata token.');
    if(/\bvercel\s+(?:deploy|promote|alias|rollback|build|pull)\b/.test(command))issues.push('Provider actions must use the reviewed release owner.');
    const expectedCondition=command.endsWith('verify-learning-loop')?stagingCondition+" && inputs.backend_handoff != 'operating-staging'":stagingCommands.has(command)?stagingCondition:undefined;
    if(credentialCommands.has(command)&&step.if!==expectedCondition||command==='node --import tsx scripts/verification/cicd-release.ts approval'&&step.if!==undefined)issues.push('Required release consumers and approval cannot be conditionally skipped.');
  }
  for(const step of [...admissionSteps.filter(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts prepare'),...webSteps.filter(step=>['approval','build','deploy','verify','bind-staging-origin','verify-browser','verify-learning-loop'].some(mode=>step.run===`node --import tsx scripts/verification/cicd-release.ts ${mode}`))])for(const key of ['VERCEL_ORG_ID','VERCEL_PROJECT_ID'])if(mapping(step.env)[key]!==`\${{ vars.${key} }}`)issues.push('The public web sink must consume fixed reviewed variables at every boundary.');
  if (webSteps.filter(step => String(step.uses ?? '').startsWith('actions/checkout@')).length !== 1) issues.push('Deployment requires one admitted source checkout.');
  if (!webSteps.some(step => String(step.uses ?? '').startsWith('actions/checkout@') && mapping(step.with).ref === '${{ needs.release-admission.outputs.sha }}')) issues.push('Deployment checkout must use the admitted commit.');
  if(!webSteps.some(step=>String(step.uses??'').startsWith('actions/checkout@')&&mapping(step.with)['fetch-depth']===0))issues.push('Deployment review requires complete immutable source ancestry.');
  if (webSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts ci') < 0 || webSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts ci') >= webSteps.findIndex(step => step.run === 'node --import tsx scripts/verification/cicd-release.ts approval')) issues.push('Release must revalidate current main after environment approval.');
  const approval=webSteps.find(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts approval');
  if(!approval||!metadataOnly(approval))issues.push('Official founder approval must be validated without deployment credentials.');
  for (const step of list(web.steps).map(mapping)) {
    const env = mapping(step.env);
    for (const [key, output] of [['RELEASE_SHA', 'sha'], ['CI_RUN_ID', 'ci-run-id'], ['FULL_VERIFICATION_RUN_ID','full-run-id'], ['RELEASE_ENVIRONMENT', 'environment']]) if (env[key] !== undefined && env[key] !== `\${{ needs.release-admission.outputs.${output} }}`) issues.push('Deployment identity must consume validated release admission.');
    if(['ci','approval','build','deploy','verify','bind-staging-origin','verify-browser','verify-learning-loop'].some(mode=>step.run===`node --import tsx scripts/verification/cicd-release.ts ${mode}`)&&env.FULL_VERIFICATION_RUN_ID!== '${{ needs.release-admission.outputs.full-run-id }}')issues.push('Every web boundary must preserve the separate full customer-candidate identity.');
    for(const[key,output]of[['REVIEW_BASE64','review-base64'],['REVIEW_DIGEST','review-digest'],['RELEASE_ENVIRONMENT_ID','environment-id']])if(env[key]!==undefined&&env[key]!==`\${{ needs.release-admission.outputs.${output} }}`)issues.push('Review identity must consume the same validated release package.');
    for (const [key, output] of [['BACKEND_SELECTION_BASE64','backend-selection-base64'],['BACKEND_MANIFEST_BASE64','backend-manifest-base64'],['BACKEND_BRIDGE_BASE64','backend-bridge-base64']]) if (['approval','build','deploy','verify','bind-staging-origin','verify-browser','verify-learning-loop'].some(mode => step.run === `node --import tsx scripts/verification/cicd-release.ts ${mode}`) && env[key] !== `\${{ needs.release-admission.outputs.${output} }}`) issues.push('Every web boundary must re-admit the exact completed backend selection and manifest outputs.');
    if(['approval','build','deploy','verify','bind-staging-origin','verify-browser','verify-learning-loop'].some(mode=>step.run===`node --import tsx scripts/verification/cicd-release.ts ${mode}`)&&(['REVIEW_BASE64','REVIEW_DIGEST','RELEASE_ENVIRONMENT_ID','RELEASE_MANIFEST','CUEVO_RELEASE_REVIEW_ASSIGNMENTS_JSON','GH_TOKEN','CI_RUN_ID'].some(key=>env[key]===undefined)))issues.push('Every credential boundary must re-admit official approval and current dependencies.');
  }
  for (const [id, value] of Object.entries(releaseJobs)) if (id !== 'web-release' && list(mapping(value).steps).map(mapping).some(step=>!metadataOnly(step))) issues.push('Deployment credentials must be environment protected.');
  const commands = list(web.steps).map(mapping).map(step => step.run).filter((run): run is string => typeof run === 'string' && run.startsWith('node --import tsx scripts/verification/cicd-release.ts'));
  if (JSON.stringify(commands) !== JSON.stringify(['ci', 'approval', 'build', 'deploy', 'verify','bind-staging-origin','verify-browser','verify-learning-loop'].map(command => `node --import tsx scripts/verification/cicd-release.ts ${command}`))) issues.push('Release must admit official approval, build, deploy and verify in order.');
  if(!webSteps.some(step=>step.run==='npx --no-install playwright install --with-deps chromium'&&step.if===stagingCondition))issues.push('Completed-backend staging must install its actual browser runtime.');
  const learningUploads=webSteps.map((step,index)=>({step,index})).filter(({step})=>mapping(step.with).name==='cuevo-learning-loop-ui-${{ github.run_id }}-${{ github.run_attempt }}');
  const learningIndex=webSteps.findIndex(step=>step.run==='node --import tsx scripts/verification/cicd-release.ts verify-learning-loop');
  if(learningUploads.length!==1||learningUploads[0].index<=learningIndex)issues.push('Learning-loop original evidence must be retained exactly once after its consumer.');
  return issues;
}
