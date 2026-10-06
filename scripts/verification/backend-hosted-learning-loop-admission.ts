import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseReviewJson, canonicalReleaseExecutionJson, parseCanonicalReleaseReviewJson, validateOfficialFounderApproval } from './release-review';
import { validateCiRun, validateReleaseControls } from './cicd-contracts';
import { readBackendReleaseSourceEvidence } from './backend-release-admission';
import { hostedMigrationEndpointSchema } from '../database/hosted-migration-provider';

const purpose = 'CUEVO_HOSTED_LEARNING_LOOP_NATIVE' as const;
const workflow = '.github/workflows/hosted-learning-qa.yml';
const failure = () => Error('Current protected native learning-loop QA requires review; contents withheld.');
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/), uuid = z.uuid();
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const date = z.iso.datetime({ offset: true });
const repository = z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/).refine(value => !value.split('/').some(part => part === '.' || part === '..'));
const backendSchema = z.object({ runId: identifier, runAttempt: positive, artifactId: identifier, archiveSha256: digest, transferSha256: digest }).strict();
const origin = z.string().max(200).refine(value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.origin === value && /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname); } catch { return false; } });
const webSchema = z.object({ deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]{1,100}$/), origin, artifactSha256: digest, packageSha256: digest }).strict();
const uiSchema = z.object({ runId: identifier, runAttempt: positive, artifactId: identifier, archiveSha256: digest, commandManifestSha256: digest, journalHeadSha256: digest }).strict();
const scopeSchema = z.object({ projectRef: z.string().regex(/^[a-z]{20}$/), schoolId: uuid, adminId: uuid, teacherId: uuid, studentId: uuid, classId: uuid, subjectId: uuid, referenceId: uuid,
  sourceIds: z.array(uuid).min(1).max(32).refine(values => new Set(values).size === values.length) }).strict();
const selectionSchema = z.object({ repository, sourceSha: sha, treeSha: sha, baseSha: sha, ciRunId: identifier, qaRunId: identifier, qaRunAttempt: positive,
  environmentId: positive, environmentName: z.literal('staging'), sourceManifestSha256: digest, diffSha256: digest,
  migrationEndpoint:hostedMigrationEndpointSchema,migrationEndpointSha256:digest,
  backend: backendSchema, web: webSchema, ui: uiSchema, scope: scopeSchema, mode: z.enum(['FULL_LOOP', 'ORIGINAL_RECONCILIATION']),
  deadlineMs: z.number().int().min(1).max(60000), preparedAt: date, expiresAt: date }).strict();
const packageSchema = selectionSchema.extend({ version: z.literal(1), purpose: z.literal(purpose) }).strict();
const preparedSchema = z.object({ status: z.literal('PREPARED_ONLY'), canonicalJson: z.string().max(48 * 1024), base64: z.string().max(64 * 1024), sha256: digest, comment: z.string().max(300) }).strict();
const inputSchema = z.object({ repoRoot: z.string().min(1).max(2048), githubToken: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/), prepared: preparedSchema }).strict();
const backendFacts = z.object({ backend: backendSchema, sourceSha: sha, treeSha: sha, ciRunId: identifier, expiresAt: date, provenance: z.literal('OFFICIAL_COMPLETED_BACKEND_ADMISSION') }).strict();
const webFacts = z.object({ web: webSchema, sourceSha: sha, expiresAt: date, provenance: z.literal('CURRENT_VERIFIED_WEB_DEPLOYMENT') }).strict();
const uiFacts = z.object({ ui: uiSchema, sourceSha: sha, treeSha: sha, scopeSha256: digest, status: z.enum(['UI_LOOP_VERIFIED', 'ORIGINALS_RETAINED']), expiresAt: date, provenance: z.literal('OFFICIAL_UI_ARTIFACT_ADMISSION') }).strict();
const currentRun = z.object({ id: positive, run_attempt: positive, repository: z.object({ full_name: repository }), head_sha: sha, head_branch: z.literal('main'), path: z.literal(workflow), event: z.literal('workflow_dispatch'), status: z.enum(['waiting', 'in_progress']), conclusion: z.null() });
const ciRun = z.object({ id: positive, repository: z.object({ full_name: repository }), head_sha: sha, head_branch: z.literal('main'), path: z.literal('.github/workflows/ci.yml'), event: z.literal('push'), status: z.literal('completed'), conclusion: z.literal('success') });
export type HostedLearningLoopNativePackage = z.infer<typeof packageSchema>;
export type PreparedHostedLearningLoopNativePackage = z.infer<typeof preparedSchema>;
export type HostedLearningLoopNativeAdmissionPorts = {
  readCompletedBackend(selection: HostedLearningLoopNativePackage): Promise<z.infer<typeof backendFacts>>;
  readCurrentWeb(selection: HostedLearningLoopNativePackage): Promise<z.infer<typeof webFacts>>;
  readOfficialUiArtifact(selection: HostedLearningLoopNativePackage): Promise<z.infer<typeof uiFacts>>;
};
function parse<T>(schema: z.ZodType<T>, value: unknown): T { return schema.parse(JSON.parse(canonicalReleaseExecutionJson(value))); }
const equal = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
const comment = (selection: z.infer<typeof selectionSchema>, digest: string) => `Cuevo hosted learning native QA approved: sha=${selection.sourceSha}; run=${selection.qaRunId}; attempt=${selection.qaRunAttempt}; package=sha256:${digest}`;
function selectionCheck(selection: z.infer<typeof selectionSchema>, now: number) {
  if(selection.migrationEndpoint.projectRef!==selection.scope.projectRef||hash(canonicalReleaseReviewJson(selection.migrationEndpoint))!==selection.migrationEndpointSha256)throw failure();
  if (!Number.isSafeInteger(now) || now < 0 || new Set([selection.scope.adminId, selection.scope.teacherId, selection.scope.studentId]).size !== 3
    || new Set([selection.qaRunId, selection.backend.runId, selection.ui.runId]).size !== 3 || selection.backend.artifactId === selection.ui.artifactId) throw failure();
  const prepared = Date.parse(selection.preparedAt), expires = Date.parse(selection.expiresAt);
  if (prepared > now || now - prepared > 86400000 || expires <= now || expires <= prepared || expires - prepared > 86400000) throw failure();
}

/** Pure package preparation; supplied facts are bound, never promoted to current
 * CI/provider/approval or native execution evidence by this function. */
export function prepareHostedLearningLoopNativePackage(value: unknown, now: number): PreparedHostedLearningLoopNativePackage {
  try {
    const selection = parse(selectionSchema, value); selectionCheck(selection, now);
    const body = { ...selection, version: 1 as const, purpose }, canonicalJson = canonicalReleaseReviewJson(body), sha256 = hash(canonicalJson);
    return { status: 'PREPARED_ONLY', canonicalJson, base64: Buffer.from(canonicalJson, 'utf8').toString('base64'), sha256, comment: comment(selection, sha256) };
  } catch { throw failure(); }
}
export function validatePreparedHostedLearningLoopNativePackage(value: unknown, now: number): HostedLearningLoopNativePackage {
  try {
    const prepared = parse(preparedSchema, value), body = packageSchema.parse(parseCanonicalReleaseReviewJson(prepared.canonicalJson));
    const selection: Partial<HostedLearningLoopNativePackage> = { ...body }; delete selection.version; delete selection.purpose;
    selectionCheck(selectionSchema.parse(selection), now);
    const current = prepareHostedLearningLoopNativePackage(selection, now);
    if (!equal(prepared, current)) throw failure(); return body;
  } catch { throw failure(); }
}
function functions(value: unknown): HostedLearningLoopNativeAdmissionPorts {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const keys = ['readCompletedBackend', 'readCurrentWeb', 'readOfficialUiArtifact'];
  if (!equal(Reflect.ownKeys(value).sort(), [...keys].sort())) throw failure();
  for (const key of keys) { const property = Object.getOwnPropertyDescriptor(value, key); if (!property || !('value' in property) || !property.enumerable || typeof property.value !== 'function' || types.isProxy(property.value)) throw failure(); }
  return value as HostedLearningLoopNativeAdmissionPorts;
}
function runner(input: z.infer<typeof inputSchema>, selection: HostedLearningLoopNativePackage) {
  if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
    || process.env.GITHUB_WORKSPACE !== input.repoRoot || !isAbsolute(input.repoRoot) || resolve(input.repoRoot) !== input.repoRoot || !input.repoRoot.startsWith('/home/runner/work/')
    || process.env.GITHUB_REPOSITORY !== selection.repository || process.env.GITHUB_SHA !== selection.sourceSha || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_RUN_ID !== selection.qaRunId || process.env.GITHUB_RUN_ATTEMPT !== String(selection.qaRunAttempt)
    || process.env.GITHUB_JOB !== 'native-qa' || process.env.GITHUB_WORKFLOW_REF !== selection.repository + '/' + workflow + '@refs/heads/main'
    || process.env.GITHUB_SERVER_URL !== 'https://github.com' || process.env.GITHUB_API_URL !== 'https://api.github.com' || process.env.NODE_OPTIONS) throw failure();
}
async function body(response: Response, signal: AbortSignal) {
  if (response.status !== 200 || response.redirected || !response.body) throw failure();
  const length = response.headers.get('content-length'); if (length !== null && (!/^\d+$/.test(length) || Number(length) > 512 * 1024)) throw failure();
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) { const part = await abortable(reader.read(), signal); if (part.done) break; bytes += part.value.length; if (bytes > 512 * 1024) throw failure(); parts.push(part.value); }
    if (signal.aborted) throw failure(); return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(parts))) as unknown;
  } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Pending cancelled read owns cleanup. */ } }
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((done, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(failure()); }; if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true }); void promise.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(failure()); else done(value); }, () => { signal.removeEventListener('abort', abort); reject(failure()); });
  });
}

/** Current protected QA purpose only. Completed backend/UI producers are read
 * through separately admitted fixed ports; their runs are never relabeled as
 * the current waiting/in-progress QA run. Invoke again after native work. */
export async function readHostedLearningLoopNativeAdmission(value: unknown, rawPorts: unknown) {
  try {
    const input = parse(inputSchema, value), ports = functions(rawPorts), selection = validatePreparedHostedLearningLoopNativePackage(input.prepared, Date.now()); runner(input, selection);
    const source = { releaseSha: selection.sourceSha, treeSha: selection.treeSha, baseSha: selection.baseSha, fingerprints: { sourceManifestSha256: selection.sourceManifestSha256, diffSha256: selection.diffSha256 } };
    await readBackendReleaseSourceEvidence(input.repoRoot, source);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000), base = 'https://api.github.com/repos/' + selection.repository;
    const get = async (path: string) => {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), url = base + (path ? '/' + path : '');
      const response = await abortable(fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal, redirect: 'error', cache: 'no-store', credentials: 'omit' }), signal);
      return body(response, signal);
    };
    const consumerFacts = async () => {
      const requested = structuredClone(selection);
      const [backendRaw, webRaw, uiRaw] = await abortable(Promise.all([ports.readCompletedBackend(requested), ports.readCurrentWeb(structuredClone(selection)), ports.readOfficialUiArtifact(structuredClone(selection))]), controller.signal);
      const backend = parse(backendFacts, backendRaw), web = parse(webFacts, webRaw), ui = parse(uiFacts, uiRaw), now = Date.now();
      if (!equal(backend.backend, selection.backend) || backend.sourceSha !== selection.sourceSha || backend.treeSha !== selection.treeSha || backend.ciRunId !== selection.ciRunId
        || !equal(web.web, selection.web) || web.sourceSha !== selection.sourceSha || !equal(ui.ui, selection.ui) || ui.sourceSha !== selection.sourceSha || ui.treeSha !== selection.treeSha
        || ui.scopeSha256 !== hash(canonicalReleaseReviewJson(selection.scope)) || selection.mode === 'FULL_LOOP' && ui.status !== 'UI_LOOP_VERIFIED') throw failure();
      for (const fact of [backend, web, ui]) if (Date.parse(fact.expiresAt) <= now || Date.parse(fact.expiresAt) - now > 86400000 || Date.parse(selection.expiresAt) > Date.parse(fact.expiresAt)) throw failure();
      validatePreparedHostedLearningLoopNativePackage(input.prepared, now); return { backend, web, ui };
    };
    const official = async () => {
      const paths = ['', 'git/ref/heads/main', 'actions/runs/' + selection.ciRunId, 'actions/runs/' + selection.qaRunId, 'environments/staging', 'environments/staging/deployment-branch-policies', 'branches/main/protection', 'branches/main/protection/required_signatures', 'git/commits/' + selection.sourceSha, 'actions/runs/' + selection.qaRunId + '/approvals'];
      const [repo, main, ciRaw, qaRaw, environment, branches, protection, signatures, commit, approvals] = await Promise.all(paths.map(get));
      const ci = parse(ciRun, ciRaw), qa = parse(currentRun, qaRaw); validateCiRun(ci, { sha: selection.sourceSha, repository: selection.repository, ciRunId: selection.ciRunId });
      if (String(qa.id) !== selection.qaRunId || qa.run_attempt !== selection.qaRunAttempt || qa.head_sha !== selection.sourceSha || qa.repository.full_name !== selection.repository) throw failure();
      z.object({ object: z.object({ type: z.literal('commit'), sha: z.literal(selection.sourceSha) }) }).parse(main);
      validateReleaseControls({ repository: repo, environment, branches, main: protection, signatures }, { environment: 'staging', repository: selection.repository });
      z.object({ total_count: z.literal(1) }).parse(branches); z.object({ id: z.literal(selection.environmentId), name: z.literal('staging') }).parse(environment);
      z.object({ sha: z.literal(selection.sourceSha), tree: z.object({ sha: z.literal(selection.treeSha) }), verification: z.object({ verified: z.literal(true), reason: z.literal('valid'), signature: z.string().min(1), payload: z.string().min(1) }) }).parse(commit);
      const approval = validateOfficialFounderApproval(qaRaw, approvals, { purpose, repository: selection.repository, releaseSha: selection.sourceSha, releaseRunId: selection.qaRunId, runAttempt: selection.qaRunAttempt,
        environmentId: selection.environmentId, environmentName: 'staging', packageSha256: input.prepared.sha256, comment: input.prepared.comment });
      return { qa, ci, repo, main, environment, branches, protection, signatures, approval };
    };
    try {
      const initial = await official(), facts = await consumerFacts(); await readBackendReleaseSourceEvidence(input.repoRoot, source);
      const finalFacts = await consumerFacts(), final = await official(); if (!equal(initial, final) || !equal(facts, finalFacts)) throw failure();
      runner(input, selection); const finalNow = Date.now(); validatePreparedHostedLearningLoopNativePackage(input.prepared, finalNow);
      for (const fact of [finalFacts.backend, finalFacts.web, finalFacts.ui]) if (Date.parse(fact.expiresAt) <= finalNow) throw failure();
      if (controller.signal.aborted) throw failure();
      return { purpose, status: 'NATIVE_QA_ADMITTED' as const, selection, packageSha256: input.prepared.sha256, approval: final.approval, facts: finalFacts, observedAt: new Date().toISOString(),
        provenance: 'OFFICIAL_CURRENT_PROTECTED_QA_AND_SUPPLIED_ADMITTED_CONSUMER_FACTS' as const, nativeExecutionVerified: false as const, hostedAcceptance: false as const, customerReady: false as const };
    } finally { clearTimeout(timer); controller.abort(); }
  } catch { throw failure(); }
}
