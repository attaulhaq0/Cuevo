import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseReviewJson, parseCanonicalReleaseReviewJson, validateOfficialFounderApproval } from './release-review';
import { backendVerificationRunSchema, validateBackendVerificationRun } from './staging-verification';

const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const repository = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/);
const category = z.enum(['source-spec-code', 'qa-regression-operations']);
const taskId = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./:-]+$/);
const timestamp = z.iso.datetime({ offset: true });
const origin = z.string().refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.origin === value && !url.search && !url.hash && !['localhost', '127.0.0.1'].includes(url.hostname); }
  catch { return false; }
});
const vercelTarget = z.object({ teamId: z.string().regex(/^team_[a-zA-Z0-9]+$/), projectId: z.string().regex(/^prj_[a-zA-Z0-9]+$/), origin, target: z.literal('preview') }).strict();
const targets = z.object({ web: vercelTarget, api: vercelTarget, supabase: z.object({ projectRef: z.string().regex(/^[a-z]{20}$/), authOrigin: origin, edgeOrigin: z.string().max(200) }).strict() }).strict();
const fingerprints = z.object({ sourceManifestSha256: digest, diffSha256: digest, migrationPlanSha256: digest, migrationHistorySha256: digest, migrationToolchainSha256: digest, migrationEndpointSha256:digest, operatorStoragePolicySha256: digest, apiArtifactSha256: digest, edgeArtifactSha256: digest, denoLockSha256: digest }).strict();
const installedSource=z.object({sourceSha:sha,treeSha:sha,seedSha256:digest,manifestSha256:digest,migrationCount:positive}).strict();
const installedSchema=z.object({sourceSha:sha,treeSha:sha,migrationCount:positive.max(1000)}).strict();
const reconciledPrefix=z.object({templateSha256:digest,originalOperationSha256:digest,originalChainSha256:digest,prefixCount:z.literal(120),stageCount:z.literal(123),cataloguePolicySha256:digest,catalogueSha256:digest}).strict();
const schemaRecovery=z.object({completionReceiptSha256:digest,completionExportSha256:digest}).strict();
const installedRuntime=z.object({version:z.literal(1),purpose:z.literal('CUEVO_INSTALLED_ACTIVE_RUNTIME'),sourceSha:sha,treeSha:sha,originalRunId:identifier,originalRunAttempt:positive,originalPackageSha256:digest,runtimeSha256:digest,apiDeploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),apiUrl:origin,edgeId:z.string().min(1).max(200),edgeVersion:positive,activationId:z.string().min(1).max(200),vaultSecretName:z.string().min(1).max(200),jobId:positive,endpoint:z.string().url(),activationReceiptSha256:digest}).strict();
const pendingOriginal=z.object({sourceSha:sha,treeSha:sha,runId:identifier,runAttempt:positive,packageSha256:digest,activationId:z.uuid(),runtimeSha256:digest,apiDeploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),apiUrl:origin,edgeId:z.string().min(1).max(200),edgeVersion:positive,endpoint:z.string().url(),vaultSecretName:z.string().regex(/^cuevo_worker_[a-f0-9]{32}$/),jobId:positive,createdAt:timestamp}).strict();
export const pendingRuntimeConfirmationBindingSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_PENDING_ORIGINAL_WORKER_CONFIRMATION'),original:pendingOriginal,originalExportSha256:digest,originalIdentityFileSha256:digest,originalIntentSha256:digest,originalActivationSha256:digest,originalCleanupSha256:digest,originalJournalPrefixSha256:digest,originalWakeKeySha256:digest,originalRuntimeConfigurationSha256:digest,configuredPublicStateSha256:digest,confirmedPublicStateSha256:digest,observedPhase:z.enum(['CONFIGURED','CONFIRMED']),observedPublicStateSha256:digest,originalArtifact:z.object({runId:identifier,runAttempt:positive,artifactId:identifier,archiveSha256:digest,jsonSha256:digest,jobsSha256:digest,expiresAt:timestamp}).strict()}).strict();
export type PendingRuntimeConfirmationBinding=z.infer<typeof pendingRuntimeConfirmationBindingSchema>;
const canonicalRuntimeVerification=z.object({runAttempt:positive,jobsSha256:digest}).strict();
const assignment = z.object({ category, taskId, reportSha256: digest, evidenceSha256: digest }).strict();
const review = assignment.extend({ releaseSha: sha, treeSha: sha, baseSha: sha, sourceManifestSha256: digest, diffSha256: digest, reviewedAt: timestamp }).strict();
const identity = z.object({ repository, releaseSha: sha, treeSha: sha, baseSha: sha, ciRunId: identifier, releaseRunId: identifier, runAttempt: positive, environmentId: positive,
  environmentName: z.literal('staging'), deploymentEnvironment: z.literal('synthetic-staging'), executionScope: z.enum(['schema-and-accounts', 'complete-backend','installed-runtime','reconcile-schema','pending-runtime-confirmation']).optional(), installedSource:installedSource.optional(),installedSchema:installedSchema.optional(),installedRuntime:installedRuntime.optional(),pendingRuntimeConfirmation:pendingRuntimeConfirmationBindingSchema.optional(),reconciledPrefix:reconciledPrefix.optional(),schemaRecovery:schemaRecovery.optional() }).strict();
const stagingVerification = z.object({ scope: z.literal('SCHEMA_AND_SYNTHETIC_AUTH'), runAttempt: positive, jobsSha256: digest }).strict();
const intentSchema = identity.extend({ version: z.literal(1), purpose: z.literal('BACKEND_SYNTHETIC_STAGING'), targets, fingerprints, stagingVerification: stagingVerification.optional(),canonicalRuntimeVerification:canonicalRuntimeVerification.optional(), preparedAt: timestamp, expiresAt: timestamp, reviews: z.array(review).length(2) }).strict();
const backendRun = z.object({ id: positive, run_attempt: positive, head_sha: sha, head_branch: z.literal('main'), event: z.literal('workflow_dispatch'), status: z.enum(['waiting', 'in_progress']), conclusion: z.null(), path: z.literal('.github/workflows/backend-release.yml'), repository: z.object({ full_name: repository }).strict() }).strict();
const expectedSchema = identity.extend({ targets, fingerprints, stagingVerification: stagingVerification.optional(),canonicalRuntimeVerification:canonicalRuntimeVerification.optional(), reviews: z.array(assignment).length(2), now: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currentMainSha: sha, ciRun: backendVerificationRunSchema, backendRun }).strict();
const preparedSchema = z.object({ status: z.literal('PREPARED_ONLY'), canonicalJson: z.string().max(48 * 1024), base64: z.string().max(64 * 1024), sha256: digest, comment: z.string().max(300) }).strict();
export type BackendReleaseIntent = z.infer<typeof intentSchema>;
export type BackendReleaseExpected = z.infer<typeof expectedSchema>;
export type PreparedBackendReleaseIntent = z.infer<typeof preparedSchema>;
const fail = (): never => { throw Error('Backend staging intent, source or review requires verification; contents withheld.'); };
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { const result = schema.safeParse(JSON.parse(canonicalReleaseReviewJson(value))); if (!result.success) return fail(); return result.data; }
  catch { return fail(); }
}
function checkIntent(input: BackendReleaseIntent, expected: BackendReleaseExpected) {
  if(canonicalReleaseReviewJson(input.schemaRecovery??null)!==canonicalReleaseReviewJson(expected.schemaRecovery??null))fail();if(input.schemaRecovery&&(!['schema-and-accounts','complete-backend','installed-runtime','pending-runtime-confirmation'].includes(input.executionScope??'')||input.reconciledPrefix||input.executionScope==='installed-runtime'&&!input.installedRuntime))fail();
  if(canonicalReleaseReviewJson(input.reconciledPrefix??null)!==canonicalReleaseReviewJson(expected.reconciledPrefix??null))fail();
  if(input.executionScope==='reconcile-schema'){if(!input.reconciledPrefix||input.installedSource||input.installedRuntime)fail();}else if(input.reconciledPrefix)fail();
  for (const key of ['repository', 'releaseSha', 'treeSha', 'baseSha', 'ciRunId', 'releaseRunId', 'runAttempt', 'environmentId', 'environmentName', 'deploymentEnvironment', 'executionScope'] as const) if (input[key] !== expected[key]) fail();
  if(canonicalReleaseReviewJson(input.installedSource??null)!==canonicalReleaseReviewJson(expected.installedSource??null))fail();
  if(input.installedSource&&input.installedSchema||expected.installedSource&&expected.installedSchema||canonicalReleaseReviewJson(input.installedSchema??null)!==canonicalReleaseReviewJson(expected.installedSchema??null))fail();
  if(canonicalReleaseReviewJson(input.installedRuntime??null)!==canonicalReleaseReviewJson(expected.installedRuntime??null))fail();
  if(canonicalReleaseReviewJson(input.pendingRuntimeConfirmation??null)!==canonicalReleaseReviewJson(expected.pendingRuntimeConfirmation??null))fail();
  if(input.executionScope==='pending-runtime-confirmation'){
   const pending=pendingRuntimeConfirmationBindingSchema.parse(input.pendingRuntimeConfirmation);if(!input.installedSource||input.installedSchema||input.installedRuntime||input.reconciledPrefix||input.stagingVerification||!input.canonicalRuntimeVerification)fail();const original=pending.original,artifact=pending.originalArtifact;
   if(original.sourceSha!==input.releaseSha||original.treeSha!==input.treeSha||original.runId===input.releaseRunId||original.endpoint!==input.targets.supabase.edgeOrigin||original.vaultSecretName!=='cuevo_worker_'+original.activationId.replaceAll('-','')||original.apiUrl===input.targets.api.origin||Date.parse(original.createdAt)>expected.now||artifact.runId!==original.runId||artifact.runAttempt!==original.runAttempt||artifact.jsonSha256!==pending.originalExportSha256||Date.parse(artifact.expiresAt)<=expected.now||pending.observedPublicStateSha256!==(pending.observedPhase==='CONFIGURED'?pending.configuredPublicStateSha256:pending.confirmedPublicStateSha256)||pending.configuredPublicStateSha256===pending.confirmedPublicStateSha256)fail();
  }else if(input.pendingRuntimeConfirmation||expected.pendingRuntimeConfirmation)fail();
  if(input.executionScope==='installed-runtime'){
   if(!input.installedRuntime||!input.installedSource||input.installedSchema||input.installedRuntime.sourceSha!==input.releaseSha||input.installedRuntime.treeSha!==input.treeSha||input.installedRuntime.endpoint!==input.targets.supabase.edgeOrigin||input.installedRuntime.apiUrl===input.targets.api.origin)fail();
  }else if(input.installedRuntime||expected.installedRuntime)fail();
  if (expected.currentMainSha !== input.releaseSha || expected.backendRun.id.toString() !== input.releaseRunId || expected.backendRun.run_attempt !== input.runAttempt
    || expected.backendRun.head_sha !== input.releaseSha || expected.backendRun.repository.full_name !== input.repository) fail();
  try { validateBackendVerificationRun(expected.ciRun, { sha: input.releaseSha, repository: input.repository, ciRunId: input.ciRunId }); } catch { fail(); }
  if (expected.ciRun.path === '.github/workflows/staging-verification.yml') {
    if (input.canonicalRuntimeVerification||expected.canonicalRuntimeVerification||!['schema-and-accounts','reconcile-schema'].includes(input.executionScope??'') || !input.stagingVerification || !expected.stagingVerification || input.stagingVerification.runAttempt !== expected.ciRun.run_attempt
      || canonicalReleaseReviewJson(input.stagingVerification) !== canonicalReleaseReviewJson(expected.stagingVerification)) fail();
  } else if (input.stagingVerification || expected.stagingVerification||!input.canonicalRuntimeVerification||!expected.canonicalRuntimeVerification||canonicalReleaseReviewJson(input.canonicalRuntimeVerification)!==canonicalReleaseReviewJson(expected.canonicalRuntimeVerification)) fail();
  if (canonicalReleaseReviewJson(input.targets) !== canonicalReleaseReviewJson(expected.targets) || canonicalReleaseReviewJson(input.fingerprints) !== canonicalReleaseReviewJson(expected.fingerprints)) fail();
  const binding = input.targets;
  if (binding.web.projectId === binding.api.projectId || binding.web.origin === binding.api.origin || binding.web.teamId !== binding.api.teamId
    || binding.supabase.authOrigin !== `https://${binding.supabase.projectRef}.supabase.co` || binding.supabase.edgeOrigin !== `${binding.supabase.authOrigin}/functions/v1/cuevo-worker`) fail();
  const prepared = Date.parse(input.preparedAt), expires = Date.parse(input.expiresAt);
  if (prepared > expected.now || expected.now - prepared > 86400000 || expires <= expected.now || expires <= prepared || expires - prepared > 86400000) fail();
  for (const rows of [input.reviews, expected.reviews]) if (new Set(rows.map(row => row.category)).size !== 2 || new Set(rows.map(row => row.taskId)).size !== 2) fail();
  for (const row of input.reviews) {
    const assigned = expected.reviews.find(value => value.category === row.category), time = Date.parse(row.reviewedAt);
    if (!assigned || canonicalReleaseReviewJson(assigned) !== canonicalReleaseReviewJson({ category: row.category, taskId: row.taskId, reportSha256: row.reportSha256, evidenceSha256: row.evidenceSha256 })
      || row.releaseSha !== input.releaseSha || row.treeSha !== input.treeSha || row.baseSha !== input.baseSha || row.sourceManifestSha256 !== input.fingerprints.sourceManifestSha256
      || row.diffSha256 !== input.fingerprints.diffSha256 || time > expected.now || expected.now - time > 86400000 || time > prepared) fail();
  }
}
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const comment = (intent: BackendReleaseIntent, sha256: string) => `Cuevo backend staging admission approved: sha=${intent.releaseSha}; run=${intent.releaseRunId}; attempt=${intent.runAttempt}; package=sha256:${sha256}`;

/** Exact caller-supplied context is bound, not fetched: no provider/CI/Git or founder approval is performed. */
export function prepareBackendReleaseIntent(value: unknown, expectedValue: unknown): PreparedBackendReleaseIntent {
  const expected = parse(expectedSchema, expectedValue), input = parse(intentSchema, value);
  checkIntent(input, expected);
  const body = { ...input, reviews: [...input.reviews].sort((a, b) => a.category.localeCompare(b.category)) };
  const canonicalJson = canonicalReleaseReviewJson(body), sha256 = hash(canonicalJson);
  return { status: 'PREPARED_ONLY', canonicalJson, base64: Buffer.from(canonicalJson, 'utf8').toString('base64'), sha256, comment: comment(input, sha256) };
}

/** Readmit immutable package bytes at a new clock. Actual official approval is a separate future gate. */
export function validatePreparedBackendReleaseIntent(value: unknown, expectedValue: unknown): PreparedBackendReleaseIntent {
  const prepared = parse(preparedSchema, value);
  let body: unknown;
  try { body = parseCanonicalReleaseReviewJson(prepared.canonicalJson); } catch { return fail(); }
  const current = prepareBackendReleaseIntent(body, expectedValue);
  if (canonicalReleaseReviewJson(current) !== canonicalReleaseReviewJson(prepared)) fail();
  return prepared;
}

/** Backend purpose is independently prepared and re-admitted; a web approval cannot authorize this package. No official network read occurs here. */
export function validateFounderBackendApproval(preparedValue:PreparedBackendReleaseIntent,rawRun:unknown,rawApprovals:unknown,expectedValue:unknown){
 const expected=parse(expectedSchema,expectedValue),prepared=validatePreparedBackendReleaseIntent(preparedValue,expected);
 const receipt=validateOfficialFounderApproval(rawRun,rawApprovals,{purpose:'BACKEND_SYNTHETIC_STAGING',repository:expected.repository,releaseSha:expected.releaseSha,releaseRunId:expected.releaseRunId,runAttempt:expected.runAttempt,environmentId:expected.environmentId,environmentName:expected.environmentName,packageSha256:prepared.sha256,comment:prepared.comment});
 return{purpose:'BACKEND_SYNTHETIC_STAGING' as const,...receipt};
}
