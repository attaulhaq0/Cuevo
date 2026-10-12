import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import { canonicalReleaseReviewJson, canonicalReleaseExecutionJson, parseCanonicalReleaseReviewJson, validateOfficialFounderApproval } from './release-review';
import { validateCiRun, validateReleaseControls } from './cicd-contracts';
import { readBackendReleaseSourceEvidenceAndGuard } from './backend-release-admission';
import { hostedMigrationEndpointSchema } from '../database/hosted-migration-provider';
import { validateHostedCommunityQaWorkflow } from './hosted-community-qa-workflow';

const purpose = 'CUEVO_HOSTED_COMMUNITY_NATIVE' as const;
const workflow = '.github/workflows/hosted-community-qa.yml';
const failure = () => Error('Current protected native Community QA requires review; contents withheld.');
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
const scopeSchema = z.object({ projectRef: z.string().regex(/^[a-z]{20}$/), synthetic:z.literal(true), schoolId:z.literal('10000000-0000-4000-8000-000000000001'), classId:z.literal('30000000-0000-4000-8000-000000000001'), teacherActorId:z.literal('20000000-0000-4000-8000-000000000004'), studentActorId:z.literal('20000000-0000-4000-8000-000000000012'), peerActorId:z.literal('20000000-0000-4000-8000-000000000018'), parentActorId:z.literal('20000000-0000-4000-8000-000000000072'), group:z.object({id:uuid,revision:positive}).strict().nullable(),postIds:z.array(uuid).max(3),announcement:z.object({id:uuid,revision:positive}).strict().nullable(), sourceIds:z.array(uuid).min(1).max(32).refine(values=>new Set(values).size===values.length) }).strict();
const selectionSchema = z.object({ repository, sourceSha: sha, treeSha: sha, baseSha: sha, ciRunId: identifier, qaRunId: identifier, qaRunAttempt: positive,
  environmentId: positive, environmentName: z.literal('staging'), sourceManifestSha256: digest, diffSha256: digest,
  migrationEndpoint:hostedMigrationEndpointSchema,migrationEndpointSha256:digest,
  backend: backendSchema, web: webSchema, ui: uiSchema, scope: scopeSchema, mode: z.enum(['FULL_RECIPE', 'ORIGINAL_RECONCILIATION']),
  nativeSelectionSha256:digest,originalCount:z.number().int().min(1).max(18),deadlineMs: z.number().int().min(1).max(30000), preparedAt: date, expiresAt: date }).strict();
const packageSchema = selectionSchema.extend({ version: z.literal(1), purpose: z.literal(purpose) }).strict();
const preparedSchema = z.object({ status: z.literal('PREPARED_ONLY'), canonicalJson: z.string().max(48 * 1024), base64: z.string().max(64 * 1024), sha256: digest, comment: z.string().max(300) }).strict();
const inputSchema = z.object({ repoRoot: z.string().min(1).max(2048), githubToken: z.string().min(1).max(24576).regex(/^[\x21-\x7e]+$/), prepared: preparedSchema }).strict();
const backendFacts = z.object({ backend: backendSchema, sourceSha: sha, treeSha: sha, ciRunId: identifier, expiresAt: date, provenance: z.literal('OFFICIAL_COMPLETED_BACKEND_ADMISSION') }).strict();
const webFacts = z.object({ web: webSchema, sourceSha: sha, expiresAt: date, provenance: z.literal('CURRENT_VERIFIED_WEB_DEPLOYMENT') }).strict();
const uiFacts = z.object({ ui: uiSchema, sourceSha: sha, treeSha: sha, scopeSha256: digest,nativeSelectionSha256:digest,originalCount:z.number().int().min(1).max(18), status: z.enum(['UI_RECIPE_VERIFIED_NATIVE_PENDING', 'ORIGINALS_RETAINED_REQUIRES_REVIEW']), expiresAt: date, provenance: z.literal('OFFICIAL_UI_ARTIFACT_ADMISSION') }).strict();
const currentRun = z.object({ id: positive, run_attempt: positive, repository: z.object({ full_name: repository }), head_sha: sha, head_branch: z.literal('main'), path: z.literal(workflow), event: z.literal('workflow_dispatch'), status: z.enum(['waiting', 'in_progress']), conclusion: z.null() });
const ciRun = z.object({ id: positive, repository: z.object({ full_name: repository }), head_sha: sha, head_branch: z.literal('main'), path: z.literal('.github/workflows/ci.yml'), event: z.literal('push'), status: z.literal('completed'), conclusion: z.literal('success') });
export type HostedCommunityNativePackage = z.infer<typeof packageSchema>;
export type PreparedHostedCommunityNativePackage = z.infer<typeof preparedSchema>;
export type HostedCommunityNativeAdmissionPorts = {
  readCompletedBackend(selection: HostedCommunityNativePackage): Promise<z.infer<typeof backendFacts>>;
  readCurrentWeb(selection: HostedCommunityNativePackage): Promise<z.infer<typeof webFacts>>;
  readOfficialUiArtifact(selection: HostedCommunityNativePackage): Promise<z.infer<typeof uiFacts>>;
};
declare const nativeQaAdmissionGuardBrand:unique symbol;
export type HostedCommunityNativeAdmissionGuard={readCurrentAdmission:()=>Promise<HostedCommunityNativeAdmission>;assertOriginalValidity:()=>void;dispose:()=>void;readonly[nativeQaAdmissionGuardBrand]:true};
export type HostedCommunityNativeAdmission={purpose:typeof purpose;status:'NATIVE_QA_ADMITTED';selection:HostedCommunityNativePackage;packageSha256:string;approval:ReturnType<typeof validateOfficialFounderApproval>;facts:{backend:z.infer<typeof backendFacts>;web:z.infer<typeof webFacts>;ui:z.infer<typeof uiFacts>};observedAt:string;provenance:'OFFICIAL_CURRENT_PROTECTED_QA_AND_SUPPLIED_ADMITTED_CONSUMER_FACTS';nativeExecutionVerified:false;hostedAcceptance:false;customerReady:false};
const nativeQaGuards=new WeakMap<object,{binding:string;ports:HostedCommunityNativeAdmissionPorts;assert:()=>void;invalidate:()=>void}>();
export function consumeHostedCommunityNativeAdmissionGuard(value:unknown,expected:unknown,rawPorts:unknown){
  if(!value||typeof value!=='object'||types.isProxy(value))throw failure();const held=nativeQaGuards.get(value);if(!held)throw failure();
  try{const input=parse(inputSchema.omit({githubToken:true}),expected),ports=functions(rawPorts);if(canonicalReleaseExecutionJson(input)!==held.binding||Object.keys(held.ports).some(key=>ports[key as keyof typeof ports]!==held.ports[key as keyof typeof ports]))throw failure();held.assert();return value as HostedCommunityNativeAdmissionGuard;}catch{held.invalidate();throw failure();}
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T { return schema.parse(JSON.parse(canonicalReleaseExecutionJson(value))); }
const equal = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
const comment = (selection: z.infer<typeof selectionSchema>, digest: string) => `Cuevo hosted community native QA approved: sha=${selection.sourceSha}; run=${selection.qaRunId}; attempt=${selection.qaRunAttempt}; package=sha256:${digest}`;
function selectionCheck(selection: z.infer<typeof selectionSchema>, now: number) {
  if(selection.migrationEndpoint.projectRef!==selection.scope.projectRef||hash(canonicalReleaseReviewJson(selection.migrationEndpoint))!==selection.migrationEndpointSha256)throw failure();
  if (!Number.isSafeInteger(now) || now < 0 || selection.mode==='FULL_RECIPE' && selection.originalCount!==18
    || new Set([selection.qaRunId, selection.backend.runId, selection.ui.runId]).size !== 3 || selection.backend.artifactId === selection.ui.artifactId) throw failure();
  const prepared = Date.parse(selection.preparedAt), expires = Date.parse(selection.expiresAt);
  if (prepared > now || now - prepared > 3600000 || expires <= now || expires <= prepared || expires - prepared > 3600000) throw failure();
}

/** Pure package preparation; supplied facts are bound, never promoted to current
 * CI/provider/approval or native execution evidence by this function. */
export function prepareHostedCommunityNativePackage(value: unknown, now: number): PreparedHostedCommunityNativePackage {
  try {
    const selection = parse(selectionSchema, value); selectionCheck(selection, now);
    const body = { ...selection, version: 1 as const, purpose }, canonicalJson = canonicalReleaseReviewJson(body), sha256 = hash(canonicalJson);
    return { status: 'PREPARED_ONLY', canonicalJson, base64: Buffer.from(canonicalJson, 'utf8').toString('base64'), sha256, comment: comment(selection, sha256) };
  } catch { throw failure(); }
}
export function validatePreparedHostedCommunityNativePackage(value: unknown, now: number): HostedCommunityNativePackage {
  try {
    const prepared = parse(preparedSchema, value), body = packageSchema.parse(parseCanonicalReleaseReviewJson(prepared.canonicalJson));
    const selection: Partial<HostedCommunityNativePackage> = { ...body }; delete selection.version; delete selection.purpose;
    selectionCheck(selectionSchema.parse(selection), now);
    const current = prepareHostedCommunityNativePackage(selection, now);
    if (!equal(prepared, current)) throw failure(); return body;
  } catch { throw failure(); }
}
function functions(value: unknown): HostedCommunityNativeAdmissionPorts {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  const keys = ['readCompletedBackend', 'readCurrentWeb', 'readOfficialUiArtifact'];
  if (!equal(Reflect.ownKeys(value).sort(), [...keys].sort())) throw failure();
  for (const key of keys) { const property = Object.getOwnPropertyDescriptor(value, key); if (!property || !('value' in property) || !property.enumerable || typeof property.value !== 'function' || types.isProxy(property.value)) throw failure(); }
  return value as HostedCommunityNativeAdmissionPorts;
}
function runner(input: z.infer<typeof inputSchema>, selection: HostedCommunityNativePackage) {
  if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
    || process.env.GITHUB_WORKSPACE !== input.repoRoot || !isAbsolute(input.repoRoot) || resolve(input.repoRoot) !== input.repoRoot || !input.repoRoot.startsWith('/home/runner/work/')
    || process.env.GITHUB_REPOSITORY !== selection.repository || process.env.GITHUB_SHA !== selection.sourceSha || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_RUN_ID !== selection.qaRunId || process.env.GITHUB_RUN_ATTEMPT !== String(selection.qaRunAttempt)
    || process.env.GITHUB_JOB !== 'native-qa' || process.env.GITHUB_WORKFLOW_REF !== selection.repository + '/' + workflow + '@refs/heads/main'
    || process.env.GITHUB_SERVER_URL !== 'https://github.com' || process.env.GITHUB_API_URL !== 'https://api.github.com' || process.env.RELEASE_ENVIRONMENT!=='staging'|| process.env.NODE_OPTIONS) throw failure();
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
export async function readHostedCommunityNativeAdmissionAndGuard(value: unknown, rawPorts: unknown):Promise<HostedCommunityNativeAdmissionGuard> {
  try {
    const input = parse(inputSchema, value), ports = functions(rawPorts), selection = validatePreparedHostedCommunityNativePackage(input.prepared, Date.now()); runner(input, selection);
    const envNames=['GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_WORKSPACE','GITHUB_REPOSITORY','GITHUB_SHA','GITHUB_REF','GITHUB_EVENT_NAME','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_JOB','GITHUB_WORKFLOW_REF','GITHUB_SERVER_URL','GITHUB_API_URL','RELEASE_ENVIRONMENT','NODE_OPTIONS'],envSnapshot=JSON.stringify(envNames.map(name=>process.env[name]??null)),originalPorts={...ports};
    const source = { releaseSha: selection.sourceSha, treeSha: selection.treeSha, baseSha: selection.baseSha, fingerprints: { sourceManifestSha256: selection.sourceManifestSha256, diffSha256: selection.diffSha256 } };
    const sourceGuard=await readBackendReleaseSourceEvidenceAndGuard(input.repoRoot, source);
    const gitEnvironment=Object.fromEntries(['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LANG','LC_ALL'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS','1'],['GIT_CONFIG_NOSYSTEM','1'],['GIT_CONFIG_GLOBAL',process.platform==='win32'?'NUL':'/dev/null']]));
    const workflowSource=execFileSync('git',['-C',input.repoRoot,'show',selection.sourceSha+':'+workflow],{shell:false,windowsHide:true,timeout:15000,maxBuffer:48*1024,env:gitEnvironment}).toString('utf8');
    if(validateHostedCommunityQaWorkflow(workflowSource).length)throw failure();
    runner(input,selection);if(JSON.stringify(envNames.map(name=>process.env[name]??null))!==envSnapshot)throw failure();const capturedPorts=functions(rawPorts);for(const key of Object.keys(originalPorts) as (keyof HostedCommunityNativeAdmissionPorts)[])if(capturedPorts[key]!==originalPorts[key])throw failure();
    const controller = new AbortController(),deadlineAtMs=Date.now()+180000, timer = setTimeout(() => controller.abort(), 180000), base = 'https://api.github.com/repos/' + selection.repository;let invalid=false,busy=false,disposed=false;
    const invalidate=()=>{invalid=true;controller.abort();};
    const assertOriginalValidity=()=>{try{if(invalid||disposed||controller.signal.aborted||Date.now()>=deadlineAtMs||JSON.stringify(envNames.map(name=>process.env[name]??null))!==envSnapshot)throw failure();runner(input,selection);const currentPorts=functions(rawPorts);for(const key of Object.keys(originalPorts) as (keyof HostedCommunityNativeAdmissionPorts)[])if(currentPorts[key]!==originalPorts[key])throw failure();validatePreparedHostedCommunityNativePackage(input.prepared,Date.now());sourceGuard.finalPhysical();validatePreparedHostedCommunityNativePackage(input.prepared,Date.now());if(controller.signal.aborted||Date.now()>=deadlineAtMs)throw failure();}catch{invalidate();throw failure();}};
    const get = async (path: string) => {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), url = base + (path ? '/' + path : '');
      const response = await abortable(fetch(url, { method: 'GET', headers: { Authorization: 'Bearer ' + input.githubToken, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal, redirect: 'error', cache: 'no-store', credentials: 'omit' }), signal);
      return JSON.parse(canonicalReleaseExecutionJson(await body(response, signal))) as unknown;
    };
    const consumerFacts = async () => {
      const requested = structuredClone(selection);
      const reads:(()=>Promise<unknown>)[]=[()=>originalPorts.readCompletedBackend(requested),()=>originalPorts.readCurrentWeb(structuredClone(selection)),()=>originalPorts.readOfficialUiArtifact(structuredClone(selection))];
      const observed=await Promise.allSettled(reads.map(read=>Promise.resolve().then(read).then(raw=>JSON.parse(canonicalReleaseExecutionJson(raw)) as unknown)));
      if(observed.some(row=>row.status!=='fulfilled')||controller.signal.aborted)throw failure();const[backendRaw,webRaw,uiRaw]=observed.map(row=>(row as PromiseFulfilledResult<unknown>).value);
      const backend = parse(backendFacts, backendRaw), web = parse(webFacts, webRaw), ui = parse(uiFacts, uiRaw), now = Date.now();
      if (!equal(backend.backend, selection.backend) || backend.sourceSha !== selection.sourceSha || backend.treeSha !== selection.treeSha || backend.ciRunId !== selection.ciRunId
        || !equal(web.web, selection.web) || web.sourceSha !== selection.sourceSha || !equal(ui.ui, selection.ui) || ui.sourceSha !== selection.sourceSha || ui.treeSha !== selection.treeSha
        || ui.nativeSelectionSha256!==selection.nativeSelectionSha256||ui.originalCount!==selection.originalCount|| ui.scopeSha256 !== hash(canonicalReleaseReviewJson(selection.scope)) || selection.mode === 'FULL_RECIPE' && ui.status !== 'UI_RECIPE_VERIFIED_NATIVE_PENDING') throw failure();
      for (const fact of [backend, web, ui]) if (Date.parse(fact.expiresAt) <= now || Date.parse(fact.expiresAt) - now > 86400000 || Date.parse(selection.expiresAt) > Date.parse(fact.expiresAt)) throw failure();
      validatePreparedHostedCommunityNativePackage(input.prepared, now); return { backend, web, ui };
    };
    const official = async () => {
      const paths = ['', 'git/ref/heads/main', 'actions/runs/' + selection.ciRunId, 'actions/runs/' + selection.qaRunId, 'environments/staging', 'environments/staging/deployment-branch-policies', 'branches/main/protection', 'branches/main/protection/required_signatures', 'git/commits/' + selection.sourceSha, 'actions/runs/' + selection.qaRunId + '/approvals'];
      const observed=await Promise.allSettled(paths.map(get));if(observed.some(row=>row.status!=='fulfilled')||controller.signal.aborted)throw failure();const [repo, main, ciRaw, qaRaw, environment, branches, protection, signatures, commit, approvals]=observed.map(row=>(row as PromiseFulfilledResult<unknown>).value);
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
    const readCurrentAdmission=async():Promise<HostedCommunityNativeAdmission>=>{
      if(busy){invalidate();throw failure();}busy=true;
      try {assertOriginalValidity();
      const initial = await official(), facts = await consumerFacts(); sourceGuard.finalPhysical();
      const finalFacts = await consumerFacts(), final = await official(); if (!equal(initial, final) || !equal(facts, finalFacts)) throw failure();
      assertOriginalValidity(); const finalNow = Date.now(); validatePreparedHostedCommunityNativePackage(input.prepared, finalNow);
      for (const fact of [finalFacts.backend, finalFacts.web, finalFacts.ui]) if (Date.parse(fact.expiresAt) <= finalNow) throw failure();
      if (controller.signal.aborted) throw failure();
      return structuredClone({ purpose, status: 'NATIVE_QA_ADMITTED' as const, selection, packageSha256: input.prepared.sha256, approval: final.approval, facts: finalFacts, observedAt: new Date().toISOString(),
        provenance: 'OFFICIAL_CURRENT_PROTECTED_QA_AND_SUPPLIED_ADMITTED_CONSUMER_FACTS' as const, nativeExecutionVerified: false as const, hostedAcceptance: false as const, customerReady: false as const });
      }catch{invalidate();throw failure();}finally{busy=false;}
    };
    const guard=Object.freeze({readCurrentAdmission,assertOriginalValidity:()=>{if(busy){invalidate();throw failure();}assertOriginalValidity();},dispose:()=>{disposed=true;invalidate();clearTimeout(timer);}}) as HostedCommunityNativeAdmissionGuard;
    const{githubToken:_token,...binding}=input;void _token;nativeQaGuards.set(guard,{binding:canonicalReleaseExecutionJson(binding),ports:originalPorts,assert:()=>{if(busy){invalidate();throw failure();}assertOriginalValidity();},invalidate});return guard;
  } catch { throw failure(); }
}
/** One independent admission keeps its original data shape and closes its source lifetime. */
export async function readHostedCommunityNativeAdmission(value:unknown,rawPorts:unknown):Promise<HostedCommunityNativeAdmission>{const guard=await readHostedCommunityNativeAdmissionAndGuard(value,rawPorts);try{return await guard.readCurrentAdmission();}finally{guard.dispose();}}
