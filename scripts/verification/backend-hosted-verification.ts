import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { membershipSchema } from '@cuevo/contracts';
import { canonicalReleaseExecutionJson } from './release-review';
import {prepareNativeBackendReleaseAdmission,readNativeBackendReleaseAdmission,disposeNativeBackendReleaseAdmission,type NativeBackendAdmissionHandle} from './backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected } from './backend-release-contracts';
import { prepareHostedRuntimeRecipients,prepareHostedOperatingRecipients } from './backend-provider-deploy';
import { backendPreviewHeaders } from './backend-preview-transport';

const failure = () => Error('Hosted verification source or observed prerequisite requires review; contents withheld.');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const schema = z.object({ repoRoot: z.string(), expected: z.unknown(), preparedApproval: z.unknown(), githubToken: z.string().min(1), providerToken: z.string().min(20), vercelToken: z.string().min(20), runtimeConfig: z.unknown(), apiDeployment: z.object({ url: z.string().url(), id: z.string().startsWith('dpl_') }).strict(), edgeDeployment: z.object({ id: z.string(), version: z.number().int().positive() }).strict(), syntheticPassword: z.string().min(16).max(128) }).strict();
export type HostedBackendVerificationResult = { status: 'PREREQUISITES_OBSERVED' | 'REQUIRES_REVIEW'; purpose: 'CUEVO_HOSTED_PREREQUISITE_VERIFICATION'; apiReady: boolean | null; roleSessions: number; crossSchoolDenied: boolean | null; dataApi: { anonymousRestDenied: boolean | null; authenticatedRestDenied: boolean | null; serviceRestDenied: boolean | null; rpcDenied: boolean | null; graphqlDenied: boolean | null; configuration: 'REQUIRES_CURRENT_PROVIDER_CONFIGURATION_EVIDENCE' }; worker: { missingSignatureDenied: boolean | null; malformedSignatureDenied: boolean | null; staleSignatureDenied: boolean | null; activated: false }; privateStorage: 'NOT_VERIFIED'; privateRealtime: 'NOT_VERIFIED'; restrictedDatabaseGrants: 'NOT_VERIFIED'; activationAllowed: false; hostedAcceptance: false };
async function request(url: string, method: 'GET' | 'POST', headers: Record<string, string>, body?: unknown) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { method, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal }); if (response.redirected || response.url && response.url !== url) throw failure();
    if (!response.body && response.status === 204 && method === 'POST' && /^https:\/\/[a-z]{20}\.supabase\.co\/auth\/v1\/logout\?scope=local$/.test(url)) return { status: response.status, value: null };
    if (!response.body) throw failure();
    const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 65536)) throw failure(); const reader = response.body.getReader(), pieces: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }; if (controller.signal.aborted) return abort(); controller.signal.addEventListener('abort', abort, { once: true }); void reader.read().then(v => { controller.signal.removeEventListener('abort', abort); done(v); }, () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }); }); if (controller.signal.aborted) throw failure(); if (part.done) break; size += part.value.byteLength; if (size > 65536) throw failure(); pieces.push(part.value); } const text = new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(pieces)); return { status: response.status, value: JSON.parse(text) as unknown }; } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled pending read owns cleanup. */ } }
  } finally { clearTimeout(timer); controller.abort(); }
}
const denied = (value: { status: number }) => [401, 403, 404].includes(value.status);
/** Runs fixed hosted health/current-role and direct Data API/worker denial probes.
 * Missing provider configuration/private-flow proof always prevents activation. */
export async function verifyHostedBackendPrerequisites(value: unknown,borrowed?:NativeBackendAdmissionHandle): Promise<HostedBackendVerificationResult> {
  const result: HostedBackendVerificationResult = { status: 'REQUIRES_REVIEW', purpose: 'CUEVO_HOSTED_PREREQUISITE_VERIFICATION', apiReady: null, roleSessions: 0, crossSchoolDenied: null, dataApi: { anonymousRestDenied: null, authenticatedRestDenied: null, serviceRestDenied: null, rpcDenied: null, graphqlDenied: null, configuration: 'REQUIRES_CURRENT_PROVIDER_CONFIGURATION_EVIDENCE' }, worker: { missingSignatureDenied: null, malformedSignatureDenied: null, staleSignatureDenied: null, activated: false }, privateStorage: 'NOT_VERIFIED', privateRealtime: 'NOT_VERIFIED', restrictedDatabaseGrants: 'NOT_VERIFIED', activationAllowed: false, hostedAcceptance: false };
  let admissionHandle:NativeBackendAdmissionHandle|undefined;
  try {
    const input = schema.parse(JSON.parse(canonicalReleaseExecutionJson(value))), expected = input.expected as BackendReleaseExpected, prepared = validatePreparedBackendReleaseIntent(input.preparedApproval, { ...expected, now: Date.now() }), runtime = z.object({edge:z.object({CUEVO_WORKER_RELEASE_GENERATION:z.string()}).passthrough()}).passthrough().safeParse(input.runtimeConfig).success?prepareHostedOperatingRecipients(input.runtimeConfig,expected):prepareHostedRuntimeRecipients(input.runtimeConfig, expected);
    const componentSha=expected.runtimeRollout?.desired.sourceSha??expected.currentRuntime?.current.sourceSha??expected.releaseSha,active=expected.currentRuntime?.current;
    if(active&&((active.executorSourceSha??active.sourceSha)!==expected.releaseSha||(active.executorTreeSha??active.treeSha)!==expected.treeSha||active.apiDeploymentId!==input.apiDeployment.id||active.apiUrl!==input.apiDeployment.url||active.edgeId!==input.edgeDeployment.id||active.edgeVersion!==input.edgeDeployment.version||active.apiArtifactSha256!==expected.fingerprints.apiArtifactSha256||active.edgeArtifactSha256!==expected.fingerprints.edgeArtifactSha256||active.denoLockSha256!==expected.fingerprints.denoLockSha256))throw failure();
    const apiUrl = new URL(input.apiDeployment.url); if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash || !apiUrl.hostname.endsWith('.vercel.app')) throw failure();
    const preview={repoRoot:input.repoRoot,expected,prepared,apiDeployment:input.apiDeployment};
    const requestApi=async(url:string,method:'GET'|'POST',headers:Record<string,string>,body?:unknown)=>request(url,method,{...await backendPreviewHeaders({...preview,url}),...headers},body);
    const auth = expected.targets.supabase.authOrigin, project = expected.targets.supabase.projectRef, manifestBytes = await readFile(join(input.repoRoot, 'supabase/seed/identities.json')); if (hash(manifestBytes) !== '7464b3487adc3998d8f4ad4582ffd08ebafbdc8fd9a568433ddc687f4f03ac21') throw failure();
    const manifest = z.object({ schoolId: z.uuid(), denialSchoolId: z.uuid(), actors: z.array(z.object({ actorId: z.uuid(), schoolId: z.uuid(), role: z.string(), email: z.email() }).passthrough()).length(133) }).parse(JSON.parse(manifestBytes.toString('utf8')));
    const admissionBinding={repoRoot:input.repoRoot,expected,prepared,effectScope:expected.executionScope==='runtime-rollout'?'RUNTIME_ROLLOUT' as const:'COMPLETE_BACKEND' as const};admissionHandle=borrowed===undefined?await prepareNativeBackendReleaseAdmission({...admissionBinding,githubToken:input.githubToken}):borrowed;const admission=()=>readNativeBackendReleaseAdmission(admissionHandle,admissionBinding);
    await admission();
    const vercelUrl = `https://api.vercel.com/v13/deployments/${input.apiDeployment.id}?teamId=${expected.targets.api.teamId}`;
    const deployment = z.object({ id: z.literal(input.apiDeployment.id), projectId: z.literal(expected.targets.api.projectId), ownerId: z.literal(expected.targets.api.teamId), url: z.literal(apiUrl.hostname), readyState: z.literal('READY'), target: z.null().or(z.literal('preview')), meta: z.object({ cuevoCommitSha: z.literal(componentSha),...(active||expected.runtimeRollout?{cuevoArtifactSha256:z.literal(expected.fingerprints.apiArtifactSha256)}:{}) }) }).parse((await request(vercelUrl, 'GET', { Authorization: 'Bearer ' + input.vercelToken })).value); if (deployment.id !== input.apiDeployment.id) throw failure();
    const edge = z.object({ id: z.literal(input.edgeDeployment.id), slug: z.literal('cuevo-worker'), status: z.literal('ACTIVE'), version: z.literal(input.edgeDeployment.version), verify_jwt: z.literal(false) }).parse((await request(`https://api.supabase.com/v1/projects/${project}/functions/cuevo-worker`, 'GET', { Authorization: 'Bearer ' + input.providerToken })).value); if (edge.version !== input.edgeDeployment.version) throw failure();
    const ready = await requestApi(apiUrl.origin + '/health/ready', 'GET', {}); result.apiReady = ready.status === 200 && z.object({ status: z.literal('ready'), database: z.literal(true), authentication: z.literal(true) }).safeParse(ready.value).success; if (!result.apiReady) throw failure();
    const publishable = runtime.api.SUPABASE_PUBLISHABLE_KEY, service = runtime.api.SUPABASE_SERVICE_ROLE_KEY, anonymous = { apikey: publishable }, serviceHeaders = { apikey: service };
    result.dataApi.anonymousRestDenied = denied(await request(auth + '/rest/v1/', 'GET', anonymous));
    result.dataApi.serviceRestDenied = denied(await request(auth + '/rest/v1/', 'GET', serviceHeaders));
    result.dataApi.rpcDenied = denied(await request(auth + '/rest/v1/rpc/__cuevo_readonly_probe', 'POST', serviceHeaders, {}));
    result.dataApi.graphqlDenied = denied(await request(auth + '/graphql/v1', 'POST', serviceHeaders, { query: '{ __typename }' }));
    for (const role of ['admin', 'coordinator', 'teacher', 'student', 'parent']) {
      const actor = manifest.actors.find(row => row.schoolId === manifest.schoolId && row.role === role); if (!actor) throw failure();
      const login = await request(auth + '/auth/v1/token?grant_type=password', 'POST', anonymous, { email: actor.email, password: input.syntheticPassword }); if (login.status !== 200) throw failure();
      const token = z.object({ access_token: z.string().min(20).max(24576).regex(/^[\x21-\x7e]+$/) }).parse(login.value).access_token;
      let operationFailed = false, logoutConfirmed = false;
      try {
        const account = z.object({ access_token: z.literal(token), refresh_token: z.string().min(1), user: z.object({ id: z.literal(actor.actorId), email: z.literal(actor.email), is_anonymous: z.literal(false) }) }).parse(login.value), headers = { Authorization: 'Bearer ' + account.access_token, 'X-School-Id': manifest.schoolId };
        const current = await requestApi(apiUrl.origin + '/v1/me', 'GET', headers), member = membershipSchema.parse(current.value); if (current.status !== 200 || member.userId !== actor.actorId || member.role !== actor.role || member.schoolId !== manifest.schoolId) throw failure(); result.roleSessions++;
        const cross = await requestApi(apiUrl.origin + '/v1/me', 'GET', { ...headers, 'X-School-Id': manifest.denialSchoolId }); if (cross.status !== 403) throw failure(); result.crossSchoolDenied = true;
        if (role === 'admin') result.dataApi.authenticatedRestDenied = denied(await request(auth + '/rest/v1/', 'GET', { apikey: publishable, Authorization: 'Bearer ' + account.access_token }));
      } catch { operationFailed = true; }
      finally { try { const logout = await request(auth + '/auth/v1/logout?scope=local', 'POST', { apikey: publishable, Authorization: 'Bearer ' + token }, {}); logoutConfirmed = [200, 204].includes(logout.status); } catch { logoutConfirmed = false; } }
      if (operationFailed || !logoutConfirmed) throw failure();
    }
    const body = { version: 1, wakeId: '00000000-0000-4000-8000-000000000000' }, endpoint = expected.targets.supabase.edgeOrigin, base = { 'Content-Type': 'application/json' };
    const workerDenied = async (headers: Record<string, string>) => { const response = await request(endpoint, 'POST', headers, body); return response.status === 401 && z.object({ code: z.literal('WORKER_AUTH_REQUIRED') }).strict().safeParse(response.value).success; };
    result.worker.missingSignatureDenied = await workerDenied(base); result.worker.malformedSignatureDenied = await workerDenied({ ...base, 'x-cuevo-wake-time': 'not-time', 'x-cuevo-wake-signature': 'invalid' }); result.worker.staleSignatureDenied = await workerDenied({ ...base, 'x-cuevo-wake-time': '1', 'x-cuevo-wake-signature': '0'.repeat(64) });
    await admission();
    if (result.roleSessions !== 5 || result.crossSchoolDenied !== true || [result.dataApi.anonymousRestDenied, result.dataApi.authenticatedRestDenied, result.dataApi.serviceRestDenied, result.dataApi.rpcDenied, result.dataApi.graphqlDenied, result.worker.missingSignatureDenied, result.worker.malformedSignatureDenied, result.worker.staleSignatureDenied].some(value => value !== true)) throw failure();
    result.status = 'PREREQUISITES_OBSERVED'; return result;
  } catch { return result; }
  finally{if(admissionHandle&&borrowed===undefined)disposeNativeBackendReleaseAdmission(admissionHandle);}
}
