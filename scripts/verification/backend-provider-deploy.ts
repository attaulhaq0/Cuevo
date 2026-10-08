import { createHash, randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { parseServerConfig } from '@cuevo/config';
import { hostedSyntheticRuntime, requireHostedSyntheticDatabase } from '@cuevo/config/synthetic-runtime';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson } from './release-review';
import { readBackendReleaseAdmission } from './backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from './backend-release-contracts';
import { createBackendPreviewTransport, backendPreviewHeaders } from './backend-preview-transport';
import { createHostedMigrationDatabase } from '../database/hosted-migration-database';
import {assertNativeSchemaRecoveryConsumption,type NativeReconciliationPermit} from '../database/hosted-migration-database';
import {canonicalHostedMigrationPlan,type HostedMigrationPlanV1} from '../database/hosted-migration-plan';
import { readHostedMigrationProvider, requireCurrentHostedMigrationEndpoint } from '../database/hosted-migration-provider';
import { providerDeploymentStateSchema, providerStateSha256, validateProviderDeploymentTransition, type ProviderDeploymentState, type ProviderDeploymentOperation, type ProviderDeploymentPhase } from '../database/hosted-provider-state';
import {readCanonicalMigrationSources} from '../database/hosted-migration-plan';
import {verifyHostedMigrationHistory} from '../database/hosted-migration-history';

const failure = () => Error('Backend provider artifact or runtime recipient requires review; contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/), privateValue = z.string().min(1).max(24576);
const execute = promisify(execFile);
const common = z.object({ NODE_ENV: z.literal('production'), CUEVO_DEPLOYMENT_ENVIRONMENT: z.literal('synthetic-staging'), CUEVO_SYNTHETIC_PROJECT_REF: z.string().regex(/^[a-z]{20}$/), CUEVO_SYNTHETIC_WEB_ORIGIN: z.string(), SUPABASE_URL: z.string(), POSTHOG_CAPTURE_MODE: z.literal('DISABLED') });
const apiRuntime = common.extend({ DATABASE_URL: privateValue, CUEVO_DATABASE_TLS_CA: privateValue, SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_').min(20), SUPABASE_SERVICE_ROLE_KEY: z.string().startsWith('sb_secret_').min(20), API_ALLOWED_ORIGIN: z.string(), AI_GENERATION_MODE: z.literal('FIXTURE'), AI_FIXTURE_ENABLED: z.literal('true') }).strict();
const edgeRuntime = common.extend({ CUEVO_WORKER_DATABASE_URL: privateValue, CUEVO_WORKER_TLS_CA: privateValue, CUEVO_WORKER_EXECUTION_MODE: z.literal('synthetic-staging'), CUEVO_WORKER_WAKE_KEY: z.literal('') }).strict();
const runtimeSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_HOSTED_RUNTIME_CONFIGURATION'), sourceSha: sha, projectRef: z.string().regex(/^[a-z]{20}$/), webOrigin: z.string(), api: apiRuntime, edge: edgeRuntime }).strict();
export type HostedRuntimeConfiguration = z.infer<typeof runtimeSchema>;
const artifactSchema = z.object({ schemaVersion: z.literal(1), service: z.enum(['api', 'cuevo-worker']), sourceLockSha256: digest, files: z.array(z.object({ path: z.string(), sha256: digest }).passthrough()).min(1).max(20000) }).passthrough();
type VerifiedArtifact = { root: string; sha256: string; manifest: z.infer<typeof artifactSchema>; files: { path: string; bytes: Uint8Array }[] };
async function physical(root: string, path: string, kind: 'file' | 'directory') {
  if (!isAbsolute(root) || resolve(root) !== root || !isAbsolute(path) || resolve(path) !== path) throw failure();
  const part = relative(root, path); if (isAbsolute(part) || part.split(/[\\/]/).some(piece => piece === '..')) throw failure();
  let current = root; const pieces = part.split(/[\\/]/).filter(Boolean);
  for (const [index, piece] of [...pieces, ''].entries()) { const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (index < pieces.length ? !stat.isDirectory() : kind === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) throw failure(); if (piece) current = join(current, piece); }
}
async function file(root: string, path: string, maximum: number) {
  await physical(root, path, 'file'); const before = await lstat(path); if (before.size > maximum) throw failure(); const bytes = await readFile(path), after = await lstat(path);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length > maximum) throw failure(); return bytes;
}
/** Existing source-owned runtime guards remain authoritative. The only recipients
 * returned here are API and an inactive Edge worker; no operator credential is accepted. */
export function prepareHostedRuntimeRecipients(value: unknown, expected: Pick<BackendReleaseExpected, 'releaseSha' | 'targets'>) {
  try {
    const runtime = runtimeSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))), project = expected.targets.supabase.projectRef;
    if (runtime.sourceSha !== expected.releaseSha || runtime.projectRef !== project || runtime.webOrigin !== expected.targets.web.origin) throw failure();
    for (const env of [runtime.api, runtime.edge]) if (env.CUEVO_SYNTHETIC_PROJECT_REF !== project || env.CUEVO_SYNTHETIC_WEB_ORIGIN !== runtime.webOrigin || env.SUPABASE_URL !== expected.targets.supabase.authOrigin) throw failure();
    if (runtime.api.API_ALLOWED_ORIGIN !== runtime.webOrigin || runtime.api.CUEVO_DATABASE_TLS_CA !== runtime.edge.CUEVO_WORKER_TLS_CA || !runtime.api.CUEVO_DATABASE_TLS_CA.includes('-----BEGIN CERTIFICATE-----')) throw failure();
    const api = parseServerConfig(runtime.api, 'api'), hosted = hostedSyntheticRuntime(runtime.edge); if (!hosted) throw failure(); requireHostedSyntheticDatabase(runtime.edge.CUEVO_WORKER_DATABASE_URL, hosted, 'cuevo_worker');
    if (api.deploymentEnvironment !== 'synthetic-staging' || !api.databaseTls || api.intelligence.mode !== 'FIXTURE' || api.analyticsEnabled) throw failure();
    if (new URL(runtime.api.DATABASE_URL).password === new URL(runtime.edge.CUEVO_WORKER_DATABASE_URL).password) throw failure();
    // Supabase injects SUPABASE_URL automatically and forbids setting that prefix.
    const { SUPABASE_URL: _supabaseUrl, ...edge } = runtime.edge;
    return { api: { ...runtime.api }, edge, edgeInjectedSupabaseOrigin: _supabaseUrl, runtimeSha256: hash(canonicalReleaseExecutionJson(runtime)) };
  } catch { throw failure(); }
}
async function artifact(repoRoot: string, root: string, expectedHash: string, service: 'api' | 'cuevo-worker'): Promise<VerifiedArtifact> {
  const expectedRoot = join(repoRoot, service === 'api' ? '.local/runtime-artifacts/api-vercel' : '.local/edge-artifacts/cuevo-worker'); if (root !== expectedRoot) throw failure();
  const bytes = await file(repoRoot, join(root, 'artifact.json'), 4 * 1024 * 1024), raw = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)), manifest = artifactSchema.parse(raw);
  if (manifest.service !== service || hash(JSON.stringify(raw)) !== expectedHash) throw failure();
  const gitEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
  const sourceLock = execFileSync('git', ['-C', repoRoot, 'show', 'HEAD:package-lock.json'], { env: gitEnv, timeout: 15000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] }); if (hash(sourceLock) !== manifest.sourceLockSha256) throw failure();
  const paths = new Set<string>(), files: VerifiedArtifact['files'] = []; let total = 0;
  for (const row of manifest.files) { if (row.path.startsWith('/') || row.path.includes('\\') || row.path === 'artifact.json' || row.path.split('/').some(part => !part || part === '.' || part === '..') || paths.has(row.path)) throw failure(); paths.add(row.path); const bytes = await file(repoRoot, join(root, row.path), 32 * 1024 * 1024); if (hash(bytes) !== row.sha256) throw failure(); total += bytes.length; if (total > 128 * 1024 * 1024) throw failure(); files.push({ path: row.path, bytes }); }
  const collect = async (directory: string): Promise<string[]> => { await physical(repoRoot, directory, 'directory'); const rows: string[] = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) rows.push(...await collect(path)); else { await physical(repoRoot, path, 'file'); rows.push(relative(root, path).replaceAll('\\', '/')); } } return rows; };
  const actualPaths = (await collect(root)).sort(), expectedPaths = ['artifact.json', ...paths].sort();
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((path, index) => path !== expectedPaths[index])) throw failure();
    if (service === 'api') {
    z.object({ delivery: z.literal('vercel-node-function'), node: z.literal('24'), entrypoint: z.literal('api/index.mjs'), prebuiltOutput: z.literal('.vercel/output'), prebuiltSha256: digest }).parse(manifest);
    const prebuilt = manifest.files.filter(row => row.path.startsWith('.vercel/output/')).map(row => ({ path: row.path, sha256: row.sha256 })); if (!prebuilt.length || hash(JSON.stringify(prebuilt)) !== manifest.prebuiltSha256) throw failure();
    const config = JSON.parse((await file(repoRoot, join(root, '.vercel/output/config.json'), 8192)).toString('utf8')); z.object({ version: z.literal(3) }).parse(config);
  } else { z.object({ runtime: z.literal('deno'), entrypoint: z.literal('index.ts'), denoLockSha256: digest, imports: z.array(z.literal('npm:pg@8.23.1')).length(1) }).parse(manifest); if (hash(await file(repoRoot, join(root, 'deno.lock'), 2 * 1024 * 1024)) !== manifest.denoLockSha256 || paths.size !== 3 || !paths.has('index.ts') || !paths.has('deno.json') || !paths.has('deno.lock')) throw failure(); }
  return { root, sha256: expectedHash, manifest, files };
}
export type BackendProviderPreparation = { status: 'PREPARED_ONLY'; purpose: 'CUEVO_BACKEND_PROVIDER_DEPLOYMENT'; apiArtifactSha256: string; edgeArtifactSha256: string; denoLockSha256: string; runtimeSha256: string; apiEnvironmentKeys: string[]; edgeEnvironmentKeys: string[]; apiTarget: 'preview'; edgeWorker: 'INACTIVE'; hostedAcceptance: false };
/** Physical-artifact/runtime preparation only. No provider environment or
 * deployment is changed; the actual consumers must repeat this before writing. */
export async function prepareBackendProviderDeployment(value: { repoRoot: string; preparedApproval: PreparedBackendReleaseIntent; expected: BackendReleaseExpected; apiArtifactRoot: string; edgeArtifactRoot: string; githubToken: string; runtimeConfig: unknown }): Promise<BackendProviderPreparation> {
  try {
    const input = z.object({ repoRoot: z.string(), preparedApproval: z.unknown(), expected: z.unknown(), apiArtifactRoot: z.string(), edgeArtifactRoot: z.string(), githubToken: z.string().min(1), runtimeConfig: z.unknown() }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value))), expected = input.expected as BackendReleaseExpected;
    const prepared = validatePreparedBackendReleaseIntent(input.preparedApproval, { ...expected, now: Date.now() }), recipients = prepareHostedRuntimeRecipients(input.runtimeConfig, expected);
    await readBackendReleaseAdmission({ repoRoot: input.repoRoot, expected, prepared, githubToken: input.githubToken });
    const api = await artifact(input.repoRoot, input.apiArtifactRoot, expected.fingerprints.apiArtifactSha256, 'api'), edge = await artifact(input.repoRoot, input.edgeArtifactRoot, expected.fingerprints.edgeArtifactSha256, 'cuevo-worker');
    if (edge.manifest.denoLockSha256 !== expected.fingerprints.denoLockSha256) throw failure();
    await readBackendReleaseAdmission({ repoRoot: input.repoRoot, expected, prepared, githubToken: input.githubToken });
    return { status: 'PREPARED_ONLY', purpose: 'CUEVO_BACKEND_PROVIDER_DEPLOYMENT', apiArtifactSha256: api.sha256, edgeArtifactSha256: edge.sha256, denoLockSha256: expected.fingerprints.denoLockSha256, runtimeSha256: recipients.runtimeSha256, apiEnvironmentKeys: Object.keys(recipients.api).sort(), edgeEnvironmentKeys: Object.keys(recipients.edge).sort(), apiTarget: 'preview', edgeWorker: 'INACTIVE', hostedAcceptance: false };
  } catch { throw failure(); }
}

type DeploymentInput = { repoRoot: string; preparedApproval: PreparedBackendReleaseIntent; expected: BackendReleaseExpected; apiArtifactRoot: string; edgeArtifactRoot: string; vercelToken: string; providerToken: string; githubToken: string; runtimeConfig: unknown; plan?:unknown;schemaRecoveryExport?:unknown;schemaRecoverySelection?:unknown;journalStorageKey?:string;operator: { databaseUrl: string; certificate: { path: string; sha256: string }; password: string } };
export type BackendProviderDeploymentResult = { status: 'DEPLOYED_INACTIVE' | 'REQUIRES_REVIEW'; purpose: 'CUEVO_BACKEND_PROVIDER_DEPLOYMENT'; api: { deploymentId: string; url: string; artifactSha256: string; metadataVerified: true; healthVerified: boolean } | null; edge: { id: string; version: number; artifactSha256: string; denoLockSha256: string; customAuthenticationVerified: boolean; state: 'INACTIVE' } | null; mutation: 'NOT_ATTEMPTED' | 'ATTEMPTED'; hostedAcceptance: false };
async function responseBytes(response: Response, signal: AbortSignal) {
  if (response.redirected || !response.body) throw failure(); const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 1024 * 1024)) throw failure();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { signal.removeEventListener('abort', abort); reject(failure()); }; if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(failure()); }); }); if (signal.aborted) throw failure(); if (part.done) break; size += part.value.byteLength; if (size > 1024 * 1024) throw failure(); chunks.push(part.value); } return Buffer.concat(chunks); } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Pending cancelled read owns cleanup. */ } }
}
async function providerRequest(url: string, token: string | null, method: 'GET' | 'POST', body?: string | FormData, allowFailure = false, transportHeaders: Record<string,string> = {}, parentSignal?: AbortSignal) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  const signal = parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal;
  try { const response = await fetch(url, { method, headers: { ...transportHeaders, ...(token === null ? {} : { Authorization: 'Bearer ' + token }), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) }, ...(body === undefined ? {} : { body }), redirect: 'error', credentials: 'omit', cache: 'no-store', signal }); if (signal.aborted || response.redirected || response.url && response.url !== url || !allowFailure && !response.ok) throw failure();
    // The official secrets-create endpoint confirms with bodyless 201. Its
    // immediate fixed GET verifies the values; other endpoints require JSON.
    const expectedEmpty = method === 'POST' && response.status === 201 && /^https:\/\/api\.supabase\.com\/v1\/projects\/[a-z]{20}\/secrets$/.test(url);
    if (expectedEmpty && !response.body) { const length = response.headers.get('content-length'); if (length !== null && length !== '0' || controller.signal.aborted) throw failure(); return { status: response.status, value: null }; }
    const bytes = await responseBytes(response, signal); if (!bytes.length && !expectedEmpty) throw failure(); return { status: response.status, value: bytes.length ? JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) as unknown : null }; } finally { clearTimeout(timer); controller.abort(); }
}
async function apiCli(root: string, artifact: VerifiedArtifact, expected: BackendReleaseExpected, token: string, operationSha256: string, signal: AbortSignal, admitLaunch:()=>void) {
  if (process.platform !== 'linux') throw failure();
  const scopedEnvironment = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TZ', 'TMP', 'TEMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), global = await execute('npm', ['root', '--global'], { env: scopedEnvironment, windowsHide: true, timeout: 15000, maxBuffer: 65536, shell: false });
  const globalRoot = resolve(global.stdout.trim()), cliRoot = join(globalRoot, 'vercel'), manifest = JSON.parse((await readFile(join(cliRoot, 'package.json'))).toString('utf8')) as { name?: string; version?: string; bin?: string | Record<string, string> }; if (manifest.name !== 'vercel' || manifest.version !== '62.1.0') throw failure();
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.vercel; if (!bin || bin.split(/[\\/]/).some(piece => piece === '..')) throw failure(); const cli = join(cliRoot, bin); if (!(await lstat(cli)).isFile()) throw failure();
  const delivery = join(root, '.local/hosted-release', 'api-delivery-' + randomUUID()); await mkdir(delivery, { mode: 0o700 }); await physical(root, delivery, 'directory');
  for (const row of artifact.files.filter(row => row.path.startsWith('.vercel/output/'))) { const path = join(delivery, row.path); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, row.bytes, { mode: 0o600 }); }
  await mkdir(join(delivery, '.vercel'), { recursive: true }); await writeFile(join(delivery, '.vercel/project.json'), JSON.stringify({ orgId: expected.targets.api.teamId, projectId: expected.targets.api.projectId }), { mode: 0o600 });
  admitLaunch();if(signal.aborted)throw failure();const result = await execute(process.execPath, [cli, 'deploy', '--prebuilt', '--yes', '--target=preview', '--meta', 'cuevoCommitSha=' + expected.releaseSha, '--meta', 'cuevoArtifactSha256=' + artifact.sha256, '--meta', 'cuevoProviderOperation=' + operationSha256, '--scope', expected.targets.api.teamId], { cwd: delivery, env: { ...scopedEnvironment, VERCEL_TOKEN: token, VERCEL_ORG_ID: expected.targets.api.teamId, VERCEL_PROJECT_ID: expected.targets.api.projectId, VERCEL_TELEMETRY_DISABLED: '1' }, shell: false, windowsHide: true, timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024, signal });
  const url = result.stdout.trim(); if (!/^https:\/\/[a-z0-9.-]+\.vercel\.app\/?$/.test(url) || url.includes(token)) throw failure(); return url.replace(/\/$/, '');
}
/** Provider phases retain original durable intent and confirmed receipts. A
 * current approval admits pending effects; it never recreates an unknown upload. */
export async function deployBackendProviders(value: DeploymentInput): Promise<BackendProviderDeploymentResult> {
  const result: BackendProviderDeploymentResult = { status: 'REQUIRES_REVIEW', purpose: 'CUEVO_BACKEND_PROVIDER_DEPLOYMENT', api: null, edge: null, mutation: 'NOT_ATTEMPTED', hostedAcceptance: false };
  try {
    const input = z.object({ repoRoot: z.string(), preparedApproval: z.unknown(), expected: z.unknown(), apiArtifactRoot: z.string(), edgeArtifactRoot: z.string(), vercelToken: z.string().min(20).max(4096).regex(/^[\x21-\x7e]+$/), providerToken: z.string().min(20).max(4096).regex(/^[\x21-\x7e]+$/), githubToken: z.string().min(1), runtimeConfig: z.unknown(),plan:z.unknown().optional(),schemaRecoveryExport:z.unknown().optional(),schemaRecoverySelection:z.unknown().optional(),journalStorageKey:z.string().min(20).max(4096).optional(), operator: z.object({ databaseUrl: z.string().max(400), password: privateValue, certificate: z.object({ path: z.string(), sha256: digest }).strict() }).strict() }).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value)));
    const expected = input.expected as BackendReleaseExpected, prepared = validatePreparedBackendReleaseIntent(input.preparedApproval, { ...expected, now: Date.now() }), recipients = prepareHostedRuntimeRecipients(input.runtimeConfig, expected), root = input.repoRoot;
    const admission = async () => { await readBackendReleaseAdmission({ repoRoot: root, expected, prepared, githubToken: input.githubToken }); };
    const artifacts = async () => { const api = await artifact(root, input.apiArtifactRoot, expected.fingerprints.apiArtifactSha256, 'api'), edge = await artifact(root, input.edgeArtifactRoot, expected.fingerprints.edgeArtifactSha256, 'cuevo-worker'); if (edge.manifest.denoLockSha256 !== expected.fingerprints.denoLockSha256) throw failure(); return { api, edge }; };
    await admission(); let built = await artifacts();
    const team = expected.targets.api.teamId, project = expected.targets.api.projectId, projectRef = expected.targets.supabase.projectRef, query = '?teamId=' + team;
    const operatorUrl = new URL(input.operator.databaseUrl), endpoint = { projectRef, kind: operatorUrl.hostname === `db.${projectRef}.supabase.co` ? 'direct' as const : 'session-pooler' as const, host: operatorUrl.hostname, port: 5432 as const, database: 'postgres' as const };
    requireCurrentHostedMigrationEndpoint(endpoint, await readHostedMigrationProvider({ projectRef, boundProjectRef: projectRef, providerToken: input.providerToken }), expected.fingerprints.migrationEndpointSha256);
    const database = await createHostedMigrationDatabase({ repoRoot: root, projectRef, ...input.operator });
    const migrationSources=readCanonicalMigrationSources({repoRoot:root,sourceSha:expected.releaseSha,treeSha:expected.treeSha}).sources;
    const included=migrationSources.map(source=>({name:source.name,version:source.name.slice(0,14),sha256:hash(source.bytes)})),versions=included.map(row=>row.version).sort();
    const released = await database.withLock(`${projectRef}:HOSTED_SCHEMA_MIGRATION`, async () => {
      let recoveryPermit:NativeReconciliationPermit|undefined;const recoveryPlan=input.plan as HostedMigrationPlanV1|undefined,recoveryIdentity=recoveryPlan?{projectRef,sourceSha:expected.releaseSha,treeSha:expected.treeSha,planSha256:canonicalHostedMigrationPlan(recoveryPlan).sha256,stageId:'remaining' as const,stageSha256:hash(JSON.stringify({included:recoveryPlan.migrations,configSha256:hash('project_id = "cuevo"\n\n[db]\nmajor_version = 17\n\n[db.migrations]\nenabled = true\n\n[db.seed]\nenabled = false\n')})),databaseUrl:input.operator.databaseUrl,approvalDigest:prepared.sha256,ciRunId:expected.ciRunId,certificateSha256:input.operator.certificate.sha256}:undefined;
      const recoveryLive=()=>{if(expected.schemaRecovery){if(!recoveryPermit||!recoveryIdentity)throw failure();assertNativeSchemaRecoveryConsumption(recoveryPermit,recoveryIdentity,'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');}};
      const live = () => { if (database.signal.aborted) throw failure(); };
      const inactive=async()=>{
       if(expected.schemaRecovery){if(!input.plan||!input.schemaRecoveryExport||!input.journalStorageKey)throw failure();recoveryPermit=await database.admitSchemaContinuation({completionExport:input.schemaRecoveryExport,expected,prepared,plan:input.plan,githubToken:input.githubToken,providerToken:input.providerToken,storageKey:input.journalStorageKey,consumption:'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER',...(input.schemaRecoverySelection?{selection:input.schemaRecoverySelection}:{})});}
       live();const observed=await database.observe(),post=await database.observeStage({stageId:'remaining',expectedAfterVersions:versions});
       if(observed.operator!=='postgres'||observed.database!=='postgres'||observed.tls.kind!=='PEER_VERIFIED'||observed.tls.host!==endpoint.host||observed.tls.certificateSha256!==input.operator.certificate.sha256||post.observedAtMs>Date.now()||Date.now()-post.observedAtMs>30000||Object.values(post.checks).some(value=>value!==true))throw failure();
       verifyHostedMigrationHistory({sources:migrationSources,included,expectedVersions:versions,history:observed.historyPresent?observed.history:null});live();recoveryLive();
      };
      await inactive();
      const vercel = async (path: string, method: 'GET' | 'POST' = 'GET', body?: string) => { live();if(method==='POST')recoveryLive(); const response = await providerRequest('https://api.vercel.com' + path, input.vercelToken, method, body, false, {}, database.signal); live(); return response; };
      const supabase = async (path: string, method: 'GET' | 'POST' = 'GET', body?: string | FormData) => { live();if(method==='POST')recoveryLive(); const response = await providerRequest(`https://api.supabase.com/v1/projects/${projectRef}/` + path, input.providerToken, method, body, false, {}, database.signal); live(); return response; };
      z.object({ id: z.literal(project), accountId: z.literal(team) }).parse((await vercel('/v9/projects/' + project + query)).value);
      const identity: ProviderDeploymentOperation['identity'] = { sourceSha: expected.releaseSha, treeSha: expected.treeSha, apiArtifactSha256: built.api.sha256, edgeArtifactSha256: built.edge.sha256, denoLockSha256: expected.fingerprints.denoLockSha256, runtimeSha256: recipients.runtimeSha256, teamId: team, projectId: project, originalRunId: expected.releaseRunId, originalRunAttempt: expected.runAttempt, originalPackageSha256: prepared.sha256 };
      const same = (left: unknown, right: unknown) => canonicalReleaseReviewJson(left) === canonicalReleaseReviewJson(right);
      const currentFacts = (id: ProviderDeploymentOperation['identity']) => ({ sourceSha: id.sourceSha, treeSha: id.treeSha, apiArtifactSha256: id.apiArtifactSha256, edgeArtifactSha256: id.edgeArtifactSha256, denoLockSha256: id.denoLockSha256, runtimeSha256: id.runtimeSha256, teamId: id.teamId, projectId: id.projectId });
      const raw = await database.readProviderDeploymentState();
      let saved: ProviderDeploymentState | null = raw === null ? null : providerDeploymentStateSchema.parse(raw);
      if (saved && saved.projectRef !== projectRef) throw failure();
      let state = saved === null ? null : structuredClone(saved), operation = state?.operations.at(-1);
      const previous = operation && !same(currentFacts(operation.identity), currentFacts(identity)) ? operation : state && state.operations.length > 1 ? state.operations.at(-2) : undefined;
      if (operation && !same(currentFacts(operation.identity), currentFacts(identity))) {
        if (operation.identity.sourceSha === identity.sourceSha || operation.identity.projectId !== project || operation.identity.teamId !== team || operation.phases.length !== 4 || operation.phases.some(row => row.state !== 'CONFIRMED')) throw failure();
        operation = undefined;
      }
      const persist = async () => {
        if (!state) throw failure(); live(); validateProviderDeploymentTransition(saved, state, projectRef);
        await database.persistProviderDeploymentState({ expectedSha256: saved === null ? null : providerStateSha256(saved), value: state });
        const retained = providerDeploymentStateSchema.parse(await database.readProviderDeploymentState()); if (!same(retained, state)) throw failure(); saved = structuredClone(retained); live();
      };
      const envPath = '/v10/projects/' + project + '/env' + query;
      const envs = async () => z.object({ envs: z.array(z.object({ key: z.string(), id: z.string(), value: z.string(), target: z.array(z.string()), type: z.string(), comment: z.string().optional(), gitBranch: z.string().nullable().optional() }).passthrough()).max(100) }).parse((await vercel(envPath + '&decrypt=true')).value).envs;
      const edgeSecrets = async () => z.array(z.object({ name: z.string(), value: z.string() }).passthrough()).max(100).parse((await supabase('secrets')).value);
      const envReceipt = async (): Promise<ProviderDeploymentPhase['receipt']> => {
        const rows = await envs(), keys = Object.keys(recipients.api).sort();
        if (!same(rows.map(row => row.key).sort(), keys) || new Set(rows.map(row => row.id)).size !== rows.length) return null;
        if (rows.some(row => row.type !== 'encrypted' || !same(row.target, ['preview']) || row.gitBranch || row.comment !== 'Cuevo source-bound synthetic runtime ' + expected.releaseSha || row.value !== recipients.api[row.key as keyof typeof recipients.api])) return null;
        return { kind: 'API_ENVIRONMENT', keysSha256: hash(canonicalReleaseReviewJson(keys)), valuesSha256: hash(canonicalReleaseReviewJson(recipients.api)), variables: rows.map(row => ({ key: row.key, id: row.id, valueSha256: hash(row.value) })).sort((a, b) => a.key.localeCompare(b.key)) };
      };
      const secretReceipt = async (): Promise<ProviderDeploymentPhase['receipt']> => {
        const rows = await edgeSecrets(), variables = Object.entries(recipients.edge).map(([name, value]) => ({ name, valueSha256: hash(value) })).sort((a, b) => a.name.localeCompare(b.name));
        if (variables.some(variable => { const matching = rows.filter(row => row.name === variable.name); return matching.length !== 1 || matching[0].value !== variable.valueSha256; })) return null;
        return { kind: 'EDGE_SECRETS', valuesSha256: hash(canonicalReleaseReviewJson(recipients.edge)), variables };
      };
      const priorReceipt = (name: ProviderDeploymentPhase['name']) => previous?.phases.find(row => row.name === name)?.receipt;
      const guardEnvironment = async () => {
        const rows = await envs(), prior = priorReceipt('API_ENVIRONMENT');
        if (!previous) { if (rows.length) throw failure(); return; }
        if (prior?.kind !== 'API_ENVIRONMENT' || rows.length !== prior.variables.length || prior.variables.some(variable => !rows.some(row => row.key === variable.key && row.id === variable.id && hash(row.value) === variable.valueSha256 && row.type === 'encrypted' && same(row.target, ['preview']) && !row.gitBranch && row.comment === 'Cuevo source-bound synthetic runtime ' + previous.identity.sourceSha))) throw failure();
      };
      const guardSecrets = async () => {
        const rows = await edgeSecrets(), prior = priorReceipt('EDGE_SECRETS');
        if (!previous) { if (rows.some(row => Object.hasOwn(recipients.edge, row.name))) throw failure(); return; }
        if (prior?.kind !== 'EDGE_SECRETS' || prior.variables.some(variable => { const matching = rows.filter(row => row.name === variable.name); return matching.length !== 1 || matching[0].value !== variable.valueSha256; })) throw failure();
      };
      const guardFunction = async () => {
        const rows = z.array(z.object({ slug: z.string(), id: z.string().optional(), version: z.number().optional() }).passthrough()).max(100).parse((await supabase('functions')).value), prior = priorReceipt('EDGE_DEPLOYMENT');
        if (!previous) { if (rows.length) throw failure(); return; }
        if (prior?.kind !== 'EDGE_DEPLOYMENT' || rows.length !== 1 || rows[0].slug !== 'cuevo-worker' || rows[0].id !== prior.id || rows[0].version !== prior.version) throw failure();
      };
      // Admit the whole original target before changing the first setting.
      // Later phase guards repeat these checks immediately before their effects.
      if (!operation) { await guardEnvironment(); await guardSecrets(); await guardFunction(); }
      const phase = async (name: ProviderDeploymentPhase['name'], observe: () => Promise<ProviderDeploymentPhase['receipt']>, effect: () => Promise<void>, guard: () => Promise<void>, reconcileIntent: boolean) => {
        await inactive();live(); const original = operation?.phases.find(row => row.name === name);
        if (original) {
          if (original.state === 'INTENT' && !reconcileIntent) throw failure();
          const receipt = await observe(); if (!receipt || original.state === 'CONFIRMED' && !same(original.receipt, receipt)) throw failure();
          if (original.state === 'INTENT') { original.state = 'CONFIRMED'; original.receipt = receipt; await persist(); }
          return receipt;
        }
        await admission(); built = await artifacts(); await guard(); live();
        if (!state) state = { version: 1, purpose: 'CUEVO_PRIVATE_PROVIDER_DEPLOYMENT_STATE', projectRef, operations: [] };
        if (!operation) { operation = { identity, phases: [] }; state.operations.push(operation); }
        const next: ProviderDeploymentPhase = { name, state: 'INTENT', receipt: null }; operation.phases.push(next); await persist();
        result.mutation = 'ATTEMPTED'; await admission(); built = await artifacts();await inactive(); live();recoveryLive(); await effect(); live();
        const receipt = await observe(); if (!receipt) throw failure(); next.state = 'CONFIRMED'; next.receipt = receipt; await persist(); return receipt;
      };
      await phase('API_ENVIRONMENT', envReceipt, async () => {
        const body = Object.entries(recipients.api).map(([key, value]) => ({ key, value, type: 'encrypted', target: ['preview'], comment: 'Cuevo source-bound synthetic runtime ' + expected.releaseSha }));
        const created = (await vercel(envPath + (previous ? '&upsert=true' : ''), 'POST', JSON.stringify(body))).value;
        z.object({ failed: z.array(z.unknown()).length(0) }).parse(created);
      }, guardEnvironment, true);
      let apiUrl: string | null = null;
      const operationSha256 = providerStateSha256(operation!.identity);
      const apiReceipt = await phase('API_DEPLOYMENT', async () => {
        const prior = operation?.phases.find(row => row.name === 'API_DEPLOYMENT')?.receipt;
        const selectedUrl = apiUrl ?? (prior?.kind === 'API_DEPLOYMENT' ? prior.url : null); if (!selectedUrl) return null;
        const deployment = z.object({ id: z.string().regex(/^dpl_[A-Za-z0-9]+$/), projectId: z.literal(project), ownerId: z.literal(team), url: z.literal(new URL(selectedUrl).hostname), readyState: z.literal('READY'), target: z.null().or(z.literal('preview')), meta: z.object({ cuevoCommitSha: z.literal(expected.releaseSha), cuevoArtifactSha256: z.literal(built.api.sha256), cuevoProviderOperation: z.literal(operationSha256) }) }).parse((await vercel('/v13/deployments/' + (prior?.kind === 'API_DEPLOYMENT' ? prior.deploymentId : new URL(selectedUrl).hostname) + query)).value);
        return { kind: 'API_DEPLOYMENT', deploymentId: deployment.id, url: selectedUrl };
      }, async () => { apiUrl = await apiCli(root, built.api, expected, input.vercelToken, operationSha256, database.signal,()=>{live();recoveryLive();validatePreparedBackendReleaseIntent(prepared,{...expected,now:Date.now()});}); }, async () => undefined, false);
      if (apiReceipt?.kind !== 'API_DEPLOYMENT') throw failure();
      const preview = { repoRoot: root, expected, prepared, apiDeployment: { id: apiReceipt.deploymentId, url: apiReceipt.url } };
      await createBackendPreviewTransport({ ...preview, vercelToken: input.vercelToken }, admission);
      const health = await providerRequest(apiReceipt.url + '/health/live', null, 'GET', undefined, false, await backendPreviewHeaders({ ...preview, url: apiReceipt.url + '/health/live' }), database.signal);
      const healthy = z.object({ status: z.literal('ok'), service: z.literal('cuevo-api') }).safeParse(health.value).success;
      result.api = { deploymentId: apiReceipt.deploymentId, url: apiReceipt.url, artifactSha256: built.api.sha256, metadataVerified: true, healthVerified: healthy }; if (!healthy) throw failure();
      await phase('EDGE_SECRETS', secretReceipt, async () => { await supabase('secrets', 'POST', JSON.stringify(Object.entries(recipients.edge).map(([name, value]) => ({ name, value })))); }, guardSecrets, true);
      let deployedEdge: { id: string; version: number } | null = null;
      const edgeReceipt = await phase('EDGE_DEPLOYMENT', async () => {
        const prior = operation?.phases.find(row => row.name === 'EDGE_DEPLOYMENT')?.receipt, selected = deployedEdge ?? (prior?.kind === 'EDGE_DEPLOYMENT' ? prior : null); if (!selected) return null;
        z.object({ id: z.literal(selected.id), slug: z.literal('cuevo-worker'), status: z.literal('ACTIVE'), version: z.literal(selected.version), verify_jwt: z.literal(false) }).parse((await supabase('functions/cuevo-worker')).value);
        return { kind: 'EDGE_DEPLOYMENT', id: selected.id, version: selected.version };
      }, async () => {
        const body = new FormData(); for (const row of built.edge.files) body.append('file', new Blob([Uint8Array.from(row.bytes).buffer]), row.path); body.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', import_map_path: 'deno.json', verify_jwt: false, name: 'cuevo-worker' }));
        deployedEdge = z.object({ id: z.string().min(1), slug: z.literal('cuevo-worker'), status: z.literal('ACTIVE'), version: z.number().int().positive(), verify_jwt: z.literal(false) }).parse((await supabase('functions/deploy?slug=cuevo-worker', 'POST', body)).value);
      }, guardFunction, false);
      if (edgeReceipt?.kind !== 'EDGE_DEPLOYMENT') throw failure();
      const denial = await providerRequest(`https://${projectRef}.supabase.co/functions/v1/cuevo-worker`, null, 'POST', JSON.stringify({ version: 1, wakeId: '00000000-0000-4000-8000-000000000000' }), true, {}, database.signal);
      const authenticated = denial.status === 401 && z.object({ code: z.literal('WORKER_AUTH_REQUIRED') }).strict().safeParse(denial.value).success;
      await inactive();result.edge = { id: edgeReceipt.id, version: edgeReceipt.version, artifactSha256: built.edge.sha256, denoLockSha256: expected.fingerprints.denoLockSha256, customAuthenticationVerified: authenticated, state: 'INACTIVE' }; if (!authenticated) throw failure();
      await admission(); live();
    });
    if (released.kind !== 'RELEASED') throw failure(); result.status = 'DEPLOYED_INACTIVE'; return result;
  } catch { return result; }
}
