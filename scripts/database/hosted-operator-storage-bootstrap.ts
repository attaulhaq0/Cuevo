import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { types } from 'node:util';
import { z } from 'zod';
import {prepareNativeBackendReleaseAdmission,readNativeBackendReleaseAdmission,disposeNativeBackendReleaseAdmission,type NativeBackendAdmissionHandle} from '../verification/backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from '../verification/backend-release-contracts';
import { hostedOperatorStorageHeaders, validateHostedOperatorStoragePolicy } from './hosted-operator-storage-policy';
import { readHostedMigrationProvider } from './hosted-migration-provider';

const bucket = 'cuevo-release-operator', failure = () => Error('Operator Storage bootstrap source, approval or target requires review; contents withheld.');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const privateToken = z.string().min(20).max(4096).refine(value => [...value].every(character => character.charCodeAt(0) > 32 && character.charCodeAt(0) < 127) && !value.startsWith('sb_publishable_'));
const schema = z.object({ repoRoot: z.string(), preparedApproval: z.unknown(), expected: z.unknown(), operatorStoragePolicyPath: z.string(), githubToken: privateToken, providerToken: privateToken, journalStorageKey: privateToken }).strict();
const count = z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^(0|[1-9][0-9]*)$/).refine(value => Number.isSafeInteger(Number(value)))]).transform(Number);
const stateSchema = z.object({ authUsers: count, storageObjects: count, appSchemas: z.array(z.string()).max(3), runtimeRoles: z.array(z.string()).max(2), historyPresent: z.boolean(), bucketCount: count, recoveryCronPresent: z.boolean() }).strict();
const bucketSchema = z.object({ id: z.literal(bucket), name: z.literal(bucket), public: z.literal(false), type: z.literal('STANDARD'), file_size_limit: z.literal(49152), allowed_mime_types: z.array(z.literal('application/json')).length(1) });
const stateQuery = "/* CUEVO_OPERATOR_BOOTSTRAP_STATE */ select (select count(*) from auth.users) as \"authUsers\",(select count(*) from storage.objects) as \"storageObjects\",coalesce((select array_agg(nspname::text order by nspname) from pg_namespace where nspname in('app','internal','authorization')),array[]::text[]) as \"appSchemas\",coalesce((select array_agg(rolname::text order by rolname) from pg_roles where rolname in('cuevo_api','cuevo_worker')),array[]::text[]) as \"runtimeRoles\",to_regclass('supabase_migrations.schema_migrations') is not null as \"historyPresent\",(select count(*) from storage.buckets) as \"bucketCount\",to_regclass('cron.job') is not null as \"recoveryCronPresent\"";
const bucketQuery = "/* CUEVO_OPERATOR_BOOTSTRAP_BUCKET */ select id,name,public,type::text as type,file_size_limit,allowed_mime_types from storage.buckets where id='cuevo-release-operator'";
const cronQuery = "/* CUEVO_OPERATOR_BOOTSTRAP_CRON */ select not exists(select 1 from cron.job where active and(lower(coalesce(jobname,'')) like '%cuevo%' or command ~* '(request_worker_wake|configure_worker_dispatch|send_worker_wake)')) as inactive";
export type HostedOperatorStorageBootstrapResult = { status: 'CREATED_CONFIRMED' | 'EXISTING_CONFIRMED' | 'REQUIRES_REVIEW'; mutation: 'NOT_ATTEMPTED' | 'ATTEMPTED_UNKNOWN' | 'CONFIRMED'; mutationScope: 'ORIGINAL_OPERATION'; evidence: 'OPERATOR_BUCKET_METADATA_ONLY'; privateAuthorizationVerified: false; operationSha256: string; bucketMetadataSha256: string | null; observedAtMs: number | null };
export type HostedOperatorStorageBootstrap = { bootstrap(): Promise<HostedOperatorStorageBootstrapResult>; reconcile(): Promise<HostedOperatorStorageBootstrapResult> };
function own(value: unknown, depth = 0): unknown {
  if (depth > 15) throw failure(); if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure();
  if (Array.isArray(value) && (value.length > 1000 || Reflect.ownKeys(value).length !== value.length + 1)) throw failure(); const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
  for (const key of Reflect.ownKeys(value)) { if (Array.isArray(value) && key === 'length') continue; const field = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== 'string' || !field || !('value' in field) || !field.enumerable) throw failure(); Object.defineProperty(output, key, { value: own(field.value, depth + 1), enumerable: true }); } return output;
}
function fresh(at: number) { const now = Date.now(); if (!Number.isSafeInteger(at) || at > now || now - at > 30000) throw failure(); }

/** One fixed metadata-only bucket create, preceded by actual known backend
 * admission. No CLI entrypoint, bucket update/delete, RLS or key provisioning.
 * Reconciliation never repeats an uncertain mutating request. */
export async function createHostedOperatorStorageBootstrap(value: unknown,borrowedAdmission?:NativeBackendAdmissionHandle): Promise<HostedOperatorStorageBootstrap> {
  let input: z.infer<typeof schema>; try { input = schema.parse(own(value)); } catch { throw failure(); }
  const expected = input.expected as BackendReleaseExpected, prepared = input.preparedApproval as PreparedBackendReleaseIntent;
  const currentPackage = (current: BackendReleaseExpected) => {
    const validated = validatePreparedBackendReleaseIntent(prepared, { ...current, now: Date.now() });
    if (validated.sha256 !== prepared.sha256 || validated.canonicalJson !== prepared.canonicalJson) throw failure();
  };
  let lastAuthority: BackendReleaseExpected | undefined;
  let attempted = false, confirmed = false, uncertain = false, active = false;
  const operationSha256 = hash(JSON.stringify({ projectRef: expected.targets?.supabase?.projectRef, sourceSha: expected.releaseSha, treeSha: expected.treeSha, approvalDigest: prepared.sha256, policySha256: expected.fingerprints?.operatorStoragePolicySha256, purpose: 'CUEVO_OPERATOR_BUCKET_BOOTSTRAP' }));
  const unknown = (): HostedOperatorStorageBootstrapResult => ({ status: 'REQUIRES_REVIEW', mutation: confirmed ? 'CONFIRMED' : attempted ? 'ATTEMPTED_UNKNOWN' : 'NOT_ATTEMPTED', mutationScope: 'ORIGINAL_OPERATION', evidence: 'OPERATOR_BUCKET_METADATA_ONLY', privateAuthorizationVerified: false, operationSha256, bucketMetadataSha256: null, observedAtMs: null });
  const policy = async () => {
    const root = input.repoRoot, path = input.operatorStoragePolicyPath, releaseRoot = join(root, '.local/hosted-release'), part = relative(releaseRoot, path);
    if (!isAbsolute(root) || resolve(root) !== root || await realpath(root) !== root || !isAbsolute(path) || resolve(path) !== path || !part || isAbsolute(part) || part.split(/[\\/]/).some(piece => !piece || piece === '.' || piece === '..')) throw failure();
    let current = root; for (const [index, piece] of relative(root, path).split(/[\\/]/).entries()) { current = join(current, piece); const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (index === relative(root, path).split(/[\\/]/).length - 1 ? !stat.isFile() || stat.nlink !== 1 || stat.size > 8192 : !stat.isDirectory())) throw failure(); }
    const environment = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null'], ['GIT_NO_REPLACE_OBJECTS', '1']])); const relativePath = relative(root, path).replaceAll('\\', '/');
    const git = (args: string[], stdin?: string) => execFileSync('git', ['-C', root, ...args], { input: stdin, env: environment, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000 });
    if (git(['check-ignore', '--no-index', '--stdin'], relativePath + '\n').toString().trim() !== relativePath || git(['ls-files', '--cached', '--', relativePath]).length) throw failure(); const before = await lstat(path), bytes = await readFile(path), after = await lstat(path); if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length > 8192 || hash(bytes) !== expected.fingerprints.operatorStoragePolicySha256) throw failure(); return validateHostedOperatorStoragePolicy(new TextDecoder('utf8', { fatal: true }).decode(bytes), { sourceSha: expected.releaseSha, treeSha: expected.treeSha, projectRef: expected.targets.supabase.projectRef });
  };
  const admissionBinding={effectScope:'SCHEMA_AND_SYNTHETIC_AUTH' as const,repoRoot:input.repoRoot,prepared,expected};
  const authority = async (handle:NativeBackendAdmissionHandle) => { const admission = await readNativeBackendReleaseAdmission(handle,admissionBinding); if (admission.provenance !== 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' || admission.approval.packageSha256 !== prepared.sha256 || admission.expected.releaseSha !== expected.releaseSha || admission.expected.treeSha !== expected.treeSha) throw failure(); const selectedPolicy = await policy(), provider = await readHostedMigrationProvider({ projectRef: selectedPolicy.policy.projectRef, boundProjectRef: expected.targets.supabase.projectRef, providerToken: input.providerToken }); lastAuthority = admission.expected; currentPackage(admission.expected); const officialAt = Date.parse(admission.observedAt); fresh(officialAt); fresh(provider.observedAtMs); if (provider.projectRef !== selectedPolicy.policy.projectRef || provider.projectStatus !== 'ACTIVE_HEALTHY' || provider.projectName.toLowerCase() !== 'cuevo') throw failure(); return { policy: selectedPolicy, observedAtMs: Math.min(officialAt, provider.observedAtMs) }; };
  const request = async (management: boolean, path: string, method: 'GET' | 'POST', body?: string) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try { const url = management ? `https://api.supabase.com/v1/projects/${expected.targets.supabase.projectRef}/database/query` : `https://${expected.targets.supabase.projectRef}.supabase.co/storage/v1/${path}`, response = await fetch(url, { method, headers: { ...(management ? { Authorization: 'Bearer ' + input.providerToken } : hostedOperatorStorageHeaders(input.journalStorageKey)), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body }), cache: 'no-store', redirect: 'error', signal: controller.signal }); if (!response.ok || response.redirected || response.url && response.url !== url || !response.body) throw failure(); const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 65536)) throw failure(); reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0; while (true) { const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }; if (controller.signal.aborted) return abort(); controller.signal.addEventListener('abort', abort, { once: true }); void reader!.read().then(value => { controller.signal.removeEventListener('abort', abort); done(value); }, () => { controller.signal.removeEventListener('abort', abort); reject(failure()); }); }); if (controller.signal.aborted) throw failure(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 65536) throw failure(); chunks.push(chunk.value); } return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown; } finally { clearTimeout(timer); controller.abort(); if (reader) { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* The cancelled stream retains pending cleanup. */ } } }
  };
  const management = (query: string) => request(true, '', 'POST', JSON.stringify({ query }));
  const observe = async () => {
    const startedAt = Date.now(), current = stateSchema.parse(z.array(z.unknown()).length(1).parse(await management(stateQuery))[0]), rows = z.array(bucketSchema).max(1).parse(await management(bucketQuery));
    if (current.authUsers !== 0 || current.storageObjects !== 0 || current.appSchemas.length || current.runtimeRoles.length || current.historyPresent || current.bucketCount !== rows.length) throw failure();
    if (current.recoveryCronPresent && !z.object({ inactive: z.literal(true) }).parse(z.array(z.unknown()).length(1).parse(await management(cronQuery))[0])) throw failure();
    if (rows.length) { const storage = bucketSchema.extend({ type: z.literal('STANDARD').optional() }).parse(await request(false, `bucket/${bucket}`, 'GET')); const withoutType = (value: typeof storage) => ({ id: value.id, name: value.name, public: value.public, file_size_limit: value.file_size_limit, allowed_mime_types: value.allowed_mime_types }); if (JSON.stringify(withoutType(rows[0])) !== JSON.stringify(withoutType(storage))) throw failure(); }
    fresh(startedAt); return { exists: rows.length === 1, metadata: rows[0] ?? null, startedAt };
  };
  const run = async (readOnly: boolean): Promise<HostedOperatorStorageBootstrapResult> => {
    if (active) { uncertain = true; return unknown(); } if (uncertain && !readOnly) return unknown(); active = true;
    let admissionHandle:NativeBackendAdmissionHandle|undefined;
    try {
      admissionHandle=borrowedAdmission===undefined?await prepareNativeBackendReleaseAdmission({...admissionBinding,githubToken:input.githubToken}):borrowedAdmission;const currentAuthority=()=>authority(admissionHandle!);
      await currentAuthority(); let before = await observe();
      if (!before.exists) {
        if (readOnly || attempted) return unknown(); const admittedAuthority = await currentAuthority(); before = await observe(); await policy(); currentPackage(lastAuthority!); fresh(admittedAuthority.observedAtMs); fresh(before.startedAt);
        if (!before.exists) { if (uncertain) throw failure(); attempted = true;
        const reply = z.object({ name: z.literal(bucket) }).parse(await request(false, 'bucket', 'POST', JSON.stringify({ id: bucket, name: bucket, public: false, type: 'STANDARD', file_size_limit: 49152, allowed_mime_types: ['application/json'] }))); if (reply.name !== bucket) throw failure();
        }
      }
      // Finish expensive source/approval work before re-reading actual metadata.
      const finalAuthority = await currentAuthority(), after = await observe(); if (!after.exists || after.metadata === null) throw failure(); await policy(); currentPackage(lastAuthority!); fresh(finalAuthority.observedAtMs); fresh(after.startedAt); if (uncertain && !readOnly) throw failure(); if (attempted && !readOnly) confirmed = true; return { status: before.exists ? 'EXISTING_CONFIRMED' : 'CREATED_CONFIRMED', mutation: confirmed ? 'CONFIRMED' : attempted ? 'ATTEMPTED_UNKNOWN' : 'NOT_ATTEMPTED', mutationScope: 'ORIGINAL_OPERATION', evidence: 'OPERATOR_BUCKET_METADATA_ONLY', privateAuthorizationVerified: false, operationSha256, bucketMetadataSha256: hash(JSON.stringify(after.metadata)), observedAtMs: after.startedAt };
    } catch { uncertain = true; return unknown(); } finally {try{if(admissionHandle&&borrowedAdmission===undefined)disposeNativeBackendReleaseAdmission(admissionHandle);}finally{active = false;}}
  };
  return { bootstrap: () => run(false), reconcile: () => run(true) };
}
