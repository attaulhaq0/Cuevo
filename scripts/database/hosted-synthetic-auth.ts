import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { seedSyntheticAuthIdentities, type SyntheticAuthSeedManifest, type SyntheticAuthSeedReceipt } from '../seed-auth';
import { readBackendReleaseAdmission } from '../verification/backend-release-admission';
import { validatePreparedBackendReleaseIntent, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from '../verification/backend-release-contracts';
import { canonicalReleaseExecutionJson, canonicalReleaseReviewJson } from '../verification/release-review';
import { canonicalHostedMigrationPlan, type HostedMigrationPlanV1 } from './hosted-migration-plan';
import { admitHostedMigrationStageFiles } from './hosted-migration-stage-files';
import { verifyHostedMigrationHistory } from './hosted-migration-history';
import { readHostedMigrationProvider, hostedMigrationEndpointSchema, requireCurrentHostedMigrationEndpoint } from './hosted-migration-provider';
import { prepareHostedMigrationConnection } from './hosted-migration-connection';
import { assertNativeSchemaRecoveryConsumption, type NativeReconciliationPermit } from './hosted-migration-database';
import { createHostedMigrationDatabase, type HostedSyntheticPopulationObservation, type SyntheticAuthAttemptIdentity } from './hosted-migration-database';
import { validateHostedReferencePopulation } from './hosted-reference-population';
import type { HostedMigrationWorkdirs } from './hosted-migration-workdirs';

const failure = () => Error('Hosted synthetic Auth source, original attempt or current target requires review; contents withheld.');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), secret = z.string().min(1).max(24576).refine(value => value.trim().length > 0 && [...value].every(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127));
const inputSchema = z.object({ repoRoot: z.string(), endpoint: hostedMigrationEndpointSchema, expected: z.unknown(), preparedApproval: z.unknown(), githubToken: secret, providerToken: secret, certificate: z.object({ path: z.string(), sha256: digest }).strict(), migrationPassword: secret, plan: z.unknown(), finalStage: z.unknown(), schemaRecoveryExport:z.unknown().optional(),schemaRecoverySelection:z.unknown().optional(),journalStorageKey:z.string().min(20).max(4096).optional(), authProvisioningKey: z.string().min(20).max(4096).regex(/^[\x21-\x7e]+$/).refine(value => !value.startsWith('sb_publishable_')), syntheticPassword: secret.min(12).max(4096), originalKey: z.string().min(8).max(180).regex(/^[A-Za-z0-9_.:-]+$/) }).strict();
const manifestSchema = z.object({ synthetic: z.literal(true), schoolId: z.uuid(), denialSchoolId: z.uuid(), actors: z.array(z.object({ actorId: z.uuid(), schoolId: z.uuid(), email: z.email(), role: z.enum(['admin', 'coordinator', 'teacher', 'student', 'parent']), displayName: z.string() }).strict()).length(133) }).strict();
const populationSchema = z.object({ observedAtMs: z.number().int().nonnegative(), population: z.record(z.string(), z.array(z.unknown())), authUsers: z.array(z.object({ id: z.uuid(), email: z.email(), emailConfirmedAt: z.string().nullable(), synthetic: z.boolean(), isAnonymous: z.boolean(), deletedAt: z.string().nullable(), bannedUntil: z.string().nullable() }).strict()).max(133) }).strict();
const same = (a: unknown, b: unknown) => canonicalReleaseExecutionJson(a) === canonicalReleaseExecutionJson(b);
function fresh(value: number) { if (!Number.isSafeInteger(value) || value > Date.now() || Date.now() - value > 30000) throw failure(); }
function git(root: string, args: string[]) {
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
  return execFileSync('git', ['-C', root, ...args], { env, timeout: 15000, maxBuffer: 16 * 1024 * 1024, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
}
async function manifest(root: string, sourceSha: string) {
  if (!isAbsolute(root) || resolve(root) !== root || await realpath(root) !== root) throw failure();
  for (const path of [root, join(root, 'supabase'), join(root, 'supabase/seed')]) { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw failure(); }
  const path = join(root, 'supabase/seed/identities.json'), before = await lstat(path); if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 48 * 1024 || await realpath(path) !== path) throw failure();
  const bytes = await readFile(path), after = await lstat(path), committed = git(root, ['show', sourceSha + ':supabase/seed/identities.json']);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || hash(bytes) !== '7464b3487adc3998d8f4ad4582ffd08ebafbdc8fd9a568433ddc687f4f03ac21' || !bytes.equals(committed)) throw failure();
  return { value: manifestSchema.parse(JSON.parse(bytes.toString('utf8'))), rawSha256: hash(bytes) };
}
function population(value: HostedSyntheticPopulationObservation, source: SyntheticAuthSeedManifest) {
  fresh(value.observedAtMs); validateHostedReferencePopulation(value, source);
  const ids = new Set<string>();
  for (const user of value.authUsers) {
    const actor = source.actors.find(row => row.actorId === user.id);
    if (!actor || ids.has(user.id) || user.email !== actor.email || !user.synthetic || user.isAnonymous || user.deletedAt !== null || !user.emailConfirmedAt || !z.iso.datetime({ offset: true }).safeParse(user.emailConfirmedAt).success || Date.parse(user.emailConfirmedAt) > Date.now() || user.bannedUntil !== null && (!z.iso.datetime({ offset: true }).safeParse(user.bannedUntil).success || Date.parse(user.bannedUntil) > Date.now())) throw failure();
    ids.add(user.id);
  }
  return value.authUsers.length;
}
async function boundedResponse(response: Response, signal: AbortSignal, maximum = 48 * 1024) {
  if (response.redirected || !response.body) throw failure(); const declared = response.headers.get('content-length'); if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw failure();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => { const abort = () => { signal.removeEventListener('abort', abort); reject(failure()); }; if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); void reader.read().then(chunk => { signal.removeEventListener('abort', abort); done(chunk); }, () => { signal.removeEventListener('abort', abort); reject(failure()); }); }); if (signal.aborted) throw failure(); if (part.done) break; size += part.value.byteLength; if (size > maximum) throw failure(); chunks.push(part.value); } return Buffer.concat(chunks); } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled pending reads retain cleanup. */ } }
}
export type HostedSyntheticAuthResult = { status: 'CONFIRMED' | 'OUTCOME_UNKNOWN' | 'REQUIRES_REVIEW'; evidence: 'NATIVE_HOSTED_SYNTHETIC_AUTH'; hostedAcceptance: false; created: number; confirmed: number; receiptSha256: string | null; cleanupCode: 'LOCK_RELEASE_UNCONFIRMED' | null };

/** Handover only observes the original completed Auth ledger and current identities.
 * It has no Auth admin key or password and cannot create an account or checkpoint. */
export async function revalidateInstalledSyntheticAuth(value:unknown):Promise<HostedSyntheticAuthResult>{
 const result:HostedSyntheticAuthResult={status:'REQUIRES_REVIEW',evidence:'NATIVE_HOSTED_SYNTHETIC_AUTH',hostedAcceptance:false,created:0,confirmed:0,receiptSha256:null,cleanupCode:null};
 try{
  const input=inputSchema.omit({authProvisioningKey:true,syntheticPassword:true}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(value))),expected=input.expected as BackendReleaseExpected;
  if(!expected.installedSource||input.originalKey!=='cuevo-initial-hosted-synthetic-auth')throw failure();const prepared=validatePreparedBackendReleaseIntent(input.preparedApproval,{...expected,now:Date.now()}),plan=input.plan as HostedMigrationPlanV1;
  if(plan.source.sha!==expected.releaseSha||plan.source.tree!==expected.treeSha||plan.projectRef!==expected.targets.supabase.projectRef||canonicalHostedMigrationPlan(plan).sha256!==expected.fingerprints.migrationPlanSha256)throw failure();
  git(input.repoRoot,['merge-base','--is-ancestor',expected.installedSource.sourceSha,expected.releaseSha]);if(git(input.repoRoot,['rev-parse',expected.installedSource.sourceSha+'^{tree}']).toString().trim()!==expected.installedSource.treeSha)throw failure();
  const source=await manifest(input.repoRoot,expected.installedSource.sourceSha),manifestSha256=hash(canonicalReleaseReviewJson(source.value));if(manifestSha256!==expected.installedSource.manifestSha256)throw failure();
  const identity:SyntheticAuthAttemptIdentity={projectRef:plan.projectRef,sourceSha:expected.installedSource.sourceSha,treeSha:expected.installedSource.treeSha,originalKey:input.originalKey,manifestSha256,fingerprint:hash(canonicalReleaseReviewJson({purpose:'CUEVO_HOSTED_INITIAL_SYNTHETIC_AUTH',projectRef:plan.projectRef,sourceSha:expected.installedSource.sourceSha,treeSha:expected.installedSource.treeSha,manifestSha256,rawManifestSha256:source.rawSha256,originalKey:input.originalKey}))};
  await readBackendReleaseAdmission({repoRoot:input.repoRoot,expected,prepared,githubToken:input.githubToken});const provider=await readHostedMigrationProvider({projectRef:plan.projectRef,boundProjectRef:plan.projectRef,providerToken:input.providerToken});fresh(provider.observedAtMs);const endpoint=requireCurrentHostedMigrationEndpoint(input.endpoint,provider,expected.fingerprints.migrationEndpointSha256);
  const connection=prepareHostedMigrationConnection({projectRef:plan.projectRef,repoRoot:input.repoRoot,endpoint:{...endpoint,provenance:'CALLER_SUPPLIED_PROVIDER_METADATA'},password:input.migrationPassword,certificate:{path:input.certificate.path,provenance:'CALLER_SUPPLIED_OWNED_PATH'},toolchain:{}});
  const db=await createHostedMigrationDatabase({repoRoot:input.repoRoot,projectRef:plan.projectRef,databaseUrl:connection.publicRecipe.databaseUrl,password:input.migrationPassword,certificate:input.certificate});
  const released=await db.withLock(`${plan.projectRef}:HOSTED_SCHEMA_MIGRATION`,async()=>{
   let readRecoveryPermit:NativeReconciliationPermit|undefined;if(expected.schemaRecovery){if(!input.schemaRecoveryExport||!input.journalStorageKey)throw failure();readRecoveryPermit=await db.admitSchemaContinuation({completionExport:input.schemaRecoveryExport,expected,prepared,plan,githubToken:input.githubToken,providerToken:input.providerToken,storageKey:input.journalStorageKey,consumption:(expected.installedRuntime||expected.currentRuntime)?'INSTALLED_SYNTHETIC_RUNTIME_READ_ONLY':'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER',...(input.schemaRecoverySelection?{selection:input.schemaRecoverySelection}:{})});}
   const observed=await db.observe();if(observed.tls.kind!=='PEER_VERIFIED'||observed.tls.host!==endpoint.host||observed.tls.certificateSha256!==input.certificate.sha256||observed.operator!=='postgres'||observed.database!=='postgres')throw failure();
   const files=await admitHostedMigrationStageFiles({repoRoot:input.repoRoot,sourceSha:expected.releaseSha,treeSha:expected.treeSha,plan,stage:input.finalStage as HostedMigrationWorkdirs['stages'][number]});verifyHostedMigrationHistory({sources:files.sources,included:plan.migrations,expectedVersions:plan.migrations.map(row=>row.version).sort(),history:observed.historyPresent?observed.history:null});
   const initial=await db.readAuthSeedAttempt(identity);if(!initial||initial.status!=='CONFIRMED'||initial.actors.length!==133||initial.originalKey!==identity.originalKey||initial.manifestSha256!==manifestSha256||initial.actors.some((row,index)=>row.state!=='CONFIRMED'||row.actorId!==source.value.actors[index].actorId||row.emailSha256!==hash(source.value.actors[index].email)))throw failure();
   if(population(populationSchema.parse(await db.observeSyntheticPopulation()),source.value)!==133)throw failure();
   await readBackendReleaseAdmission({repoRoot:input.repoRoot,expected,prepared,githubToken:input.githubToken});if(!same(await db.readAuthSeedAttempt(identity),initial))throw failure();
   if(readRecoveryPermit){const finalStage=input.finalStage as HostedMigrationWorkdirs['stages'][number],currentIdentity={projectRef:plan.projectRef,sourceSha:expected.releaseSha,treeSha:expected.treeSha,planSha256:canonicalHostedMigrationPlan(plan).sha256,stageId:'remaining' as const,stageSha256:hash(JSON.stringify({included:finalStage.included,configSha256:finalStage.configSha256})),databaseUrl:connection.publicRecipe.databaseUrl,approvalDigest:prepared.sha256,ciRunId:expected.ciRunId,certificateSha256:input.certificate.sha256};assertNativeSchemaRecoveryConsumption(readRecoveryPermit,currentIdentity,(expected.installedRuntime||expected.currentRuntime)?'INSTALLED_SYNTHETIC_RUNTIME_READ_ONLY':'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');}result.status='CONFIRMED';result.confirmed=133;result.receiptSha256=hash(canonicalReleaseReviewJson(initial));
  });if(released.kind!=='RELEASED'){result.status='OUTCOME_UNKNOWN';result.cleanupCode='LOCK_RELEASE_UNCONFIRMED';}return result;
 }catch{return result;}
}

/** One source-bound initial Auth consumer. The fixed database owner retains
 * original attempts; Auth creation stays in the accepted seed core. */
export async function provisionHostedSyntheticAuth(value: unknown): Promise<HostedSyntheticAuthResult> {
  const result: HostedSyntheticAuthResult = { status: 'REQUIRES_REVIEW', evidence: 'NATIVE_HOSTED_SYNTHETIC_AUTH', hostedAcceptance: false, created: 0, confirmed: 0, receiptSha256: null, cleanupCode: null };
  let attempted = false;
  try {
    const input = inputSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))), root = input.repoRoot, expected = input.expected as BackendReleaseExpected, prepared = validatePreparedBackendReleaseIntent(input.preparedApproval, { ...expected, now: Date.now() }) as PreparedBackendReleaseIntent;
    const plan = JSON.parse(canonicalHostedMigrationPlan(input.plan as HostedMigrationPlanV1).json) as HostedMigrationPlanV1, finalStage = input.finalStage as HostedMigrationWorkdirs['stages'][number], projectRef = expected.targets.supabase.projectRef;
    if ((plan.mode !== 'EMPTY_INITIAL' && (plan.mode!=='INCREMENTAL'||!(expected.installedSource||expected.installedSchema))) || plan.source.sha !== expected.releaseSha || plan.source.tree !== expected.treeSha || plan.projectRef !== projectRef || canonicalHostedMigrationPlan(plan).sha256 !== expected.fingerprints.migrationPlanSha256 || finalStage.id !== 'remaining' || finalStage.included.length !== plan.migrations.length || !same(finalStage.included, plan.migrations)) throw failure();
    await admitHostedMigrationStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage: finalStage });
    const originalSource=expected.installedSource??{sourceSha:expected.releaseSha,treeSha:expected.treeSha};
    if(expected.installedSource){if(input.originalKey!=='cuevo-initial-hosted-synthetic-auth')throw failure();git(root,['merge-base','--is-ancestor',originalSource.sourceSha,expected.releaseSha]);if(git(root,['rev-parse',originalSource.sourceSha+'^{tree}']).toString().trim()!==originalSource.treeSha)throw failure();}
    const source = await manifest(root, originalSource.sourceSha), manifestSha256 = hash(canonicalReleaseReviewJson(source.value));
    if(expected.installedSource&&manifestSha256!==expected.installedSource.manifestSha256)throw failure();
    const identity: SyntheticAuthAttemptIdentity = { projectRef, sourceSha: originalSource.sourceSha, treeSha: originalSource.treeSha, originalKey: input.originalKey, manifestSha256, fingerprint: hash(canonicalReleaseReviewJson({ purpose: 'CUEVO_HOSTED_INITIAL_SYNTHETIC_AUTH', projectRef, sourceSha: originalSource.sourceSha, treeSha: originalSource.treeSha, manifestSha256, rawManifestSha256: source.rawSha256, originalKey: input.originalKey })) };
    let officialAt = 0;
    const official = async () => { const admission = await readBackendReleaseAdmission({effectScope:'SCHEMA_AND_SYNTHETIC_AUTH', repoRoot: root, expected, prepared, githubToken: input.githubToken }); if (admission.provenance !== 'OFFICIAL_GITHUB_AND_VERIFIED_GIT_SOURCE' || admission.approval.packageSha256 !== prepared.sha256 || !same(admission.expected.fingerprints, expected.fingerprints)) throw failure(); officialAt = Date.now(); };
    await official(); let provider = await readHostedMigrationProvider({ projectRef, boundProjectRef: projectRef, providerToken: input.providerToken }); fresh(provider.observedAtMs);
    const connection = prepareHostedMigrationConnection({ projectRef, repoRoot: root, endpoint: { ...requireCurrentHostedMigrationEndpoint(input.endpoint,provider,expected.fingerprints.migrationEndpointSha256), provenance: 'CALLER_SUPPLIED_PROVIDER_METADATA' }, password: input.migrationPassword, certificate: { path: input.certificate.path, provenance: 'CALLER_SUPPLIED_OWNED_PATH' }, toolchain: {} });
    const database = await createHostedMigrationDatabase({ repoRoot: root, projectRef, databaseUrl: connection.publicRecipe.databaseUrl, password: input.migrationPassword, certificate: input.certificate });
    let held = false, uncertain = false, currentReceipt: SyntheticAuthSeedReceipt | null = null;
    const live = () => { if (!held || database.signal.aborted || uncertain) throw failure(); fresh(officialAt); };
    const quickSource = async () => { if (git(root, ['rev-parse', 'HEAD']).toString().trim() !== expected.releaseSha || git(root, ['status', '--porcelain', '--untracked-files=all']).length) throw failure(); const current = await manifest(root, expected.releaseSha); if (current.rawSha256 !== source.rawSha256) throw failure(); };
    const refresh = async (checkSource = true) => { live();if(Date.now()-provider.observedAtMs>=15000)provider=await readHostedMigrationProvider({projectRef,boundProjectRef:projectRef,providerToken:input.providerToken});fresh(provider.observedAtMs);requireCurrentHostedMigrationEndpoint(input.endpoint,provider,expected.fingerprints.migrationEndpointSha256); if (Date.now() - officialAt >= 15000) await official(); if (checkSource) await quickSource(); live(); };
    const managementQuery = `/* CUEVO_HOSTED_SYNTHETIC_AUTH_COUNTS */ select count(*)::integer as "authUsers" from auth.users`;
    const observe = async () => {
      live(); const observed = populationSchema.parse(await database.observeSyntheticPopulation()), count = population(observed, source.value); live();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000), signal = AbortSignal.any([database.signal, controller.signal]);
      try { const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`, response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + input.providerToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: managementQuery }), redirect: 'error', signal }); if (!response.ok || response.url && response.url !== url) throw failure(); const counted = z.array(z.object({ authUsers: z.number().int().min(0).max(133) }).strict()).length(1).parse(JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(await boundedResponse(response, signal)))); if (counted[0].authUsers !== count) throw failure(); } finally { clearTimeout(timer); controller.abort(); }
      live(); return count;
    };
    let recoveryPermit:NativeReconciliationPermit|undefined;const recoveryIdentity={projectRef,sourceSha:expected.releaseSha,treeSha:expected.treeSha,planSha256:canonicalHostedMigrationPlan(plan).sha256,stageId:'remaining' as const,stageSha256:hash(JSON.stringify({included:finalStage.included,configSha256:finalStage.configSha256})),databaseUrl:connection.publicRecipe.databaseUrl,approvalDigest:prepared.sha256,ciRunId:expected.ciRunId,certificateSha256:input.certificate.sha256};
    const recoveryAdmission=async()=>{if(expected.schemaRecovery){if(!input.schemaRecoveryExport||!input.journalStorageKey)throw failure();recoveryPermit=await database.admitSchemaContinuation({completionExport:input.schemaRecoveryExport,expected,prepared,plan,githubToken:input.githubToken,providerToken:input.providerToken,storageKey:input.journalStorageKey,consumption:'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER',...(input.schemaRecoverySelection?{selection:input.schemaRecoverySelection}:{})});}};
    const history = async () => { live();await recoveryAdmission(); const files = await admitHostedMigrationStageFiles({ repoRoot: root, sourceSha: expected.releaseSha, treeSha: expected.treeSha, plan, stage: finalStage }); if(!held||database.signal.aborted||uncertain)throw failure(); if(Date.now()-officialAt>=15000)await official(); provider=await readHostedMigrationProvider({projectRef,boundProjectRef:projectRef,providerToken:input.providerToken});fresh(provider.observedAtMs);requireCurrentHostedMigrationEndpoint(input.endpoint,provider,expected.fingerprints.migrationEndpointSha256);live(); const observed = await database.observe(); if (observed.tls.kind !== 'PEER_VERIFIED' || observed.tls.host !== input.endpoint.host || observed.tls.certificateSha256 !== input.certificate.sha256 || observed.operator !== 'postgres' || observed.database !== 'postgres') throw failure(); verifyHostedMigrationHistory({ sources: files.sources, included: plan.migrations, expectedVersions: plan.migrations.map(row => row.version).sort(), history: observed.historyPresent ? observed.history : null }); const stage = await database.observeStage({ stageId: 'remaining', expectedAfterVersions: plan.migrations.map(row => row.version).sort() }); fresh(stage.observedAtMs); if (Object.values(stage.checks).some(v => v !== true)) throw failure(); live(); };
    const release = await database.withLock(`${projectRef}:HOSTED_SCHEMA_MIGRATION`, async () => {
      held = true;
      try {
        if(expected.installedSchema){const installed=await database.readInstalledPopulation();if(installed.sourceSha!==expected.releaseSha||installed.treeSha!==expected.treeSha||installed.manifestSha256!==manifestSha256||input.originalKey!=='cuevo-initial-hosted-synthetic-auth')throw failure();}
        await history(); await observe(); currentReceipt = await database.readAuthSeedAttempt(identity); live();
        const originalConfirmed = currentReceipt?.status === 'CONFIRMED' ? structuredClone(currentReceipt) : null;
        const authFetch: typeof fetch = async (raw, options) => {
          live(); const url = new URL(String(raw)), method = options?.method ?? 'GET';
          if (url.origin !== expected.targets.supabase.authOrigin || url.search || url.hash || url.username || url.password) throw failure();
          if (method === 'GET') { if (!source.value.actors.some(actor => url.pathname === '/auth/v1/admin/users/' + actor.actorId) || options?.body !== undefined) throw failure(); }
          else if (method === 'POST') {
            await refresh();await recoveryAdmission();
            if (url.pathname !== '/auth/v1/admin/users' || typeof options?.body !== 'string' || !currentReceipt) throw failure();
            const body = JSON.parse(options.body) as { id?: string }, actor = source.value.actors.find(row => row.actorId === body.id), attempt = currentReceipt.actors.find(row => row.actorId === body.id);
            if (!actor || attempt?.state !== 'INTENT' || !same(body, { id: actor.actorId, email: actor.email, password: input.syntheticPassword, email_confirm: true, user_metadata: { synthetic: true } })) throw failure();
            await observe(); live();if(expected.schemaRecovery){if(!recoveryPermit)throw failure();assertNativeSchemaRecoveryConsumption(recoveryPermit,recoveryIdentity,'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');} attempted = true;
          } else throw failure();
          const headers = new Headers(options?.headers); headers.set('apikey', input.authProvisioningKey); if (input.authProvisioningKey.startsWith('sb_secret_')) headers.delete('Authorization'); else headers.set('Authorization', 'Bearer ' + input.authProvisioningKey);
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000), signal = AbortSignal.any([database.signal, controller.signal]);
          try { const response = await fetch(url.href, { ...options, headers, redirect: 'error', credentials: 'omit', cache: 'no-store', signal }); if (response.url && response.url !== url.href) throw failure(); const bytes = await boundedResponse(response, signal); live(); const responseHeaders = new Headers({ 'Content-Type': 'application/json' }), apiVersion = response.headers.get('X-Supabase-Api-Version'); if (apiVersion !== null) { if (!/^\d{4}-\d{2}-\d{2}$/.test(apiVersion)) throw failure(); responseHeaders.set('X-Supabase-Api-Version', apiVersion); } return new Response(bytes, { status: response.status, headers: responseHeaders }); } finally { clearTimeout(timer); controller.abort(); }
        };
        const client = createClient(expected.targets.supabase.authOrigin, input.authProvisioningKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: authFetch } });
        const receipt = await seedSyntheticAuthIdentities(client, { manifest: source.value, password: input.syntheticPassword, originalKey: input.originalKey, ...(currentReceipt === null ? {} : { prior: currentReceipt }) }, { persistAttempt: async next => {
          await refresh(false); await observe();
          if (originalConfirmed) { if (!same({ ...next, created: originalConfirmed.created }, originalConfirmed) || !same(await database.readAuthSeedAttempt(identity), originalConfirmed)) throw failure(); return; }
          try { await database.persistAuthSeedAttempt(identity, next); live(); const retained = await database.readAuthSeedAttempt(identity); if (!same(retained, next)) throw failure(); currentReceipt = retained; } catch { uncertain = true; throw failure(); }
        } });
        const retainedReceipt = originalConfirmed && receipt.status === 'CONFIRMED' ? originalConfirmed : receipt;
        result.created = receipt.created; result.confirmed = receipt.actors.filter(actor => actor.state === 'CONFIRMED').length; result.receiptSha256 = hash(canonicalReleaseReviewJson(retainedReceipt)); result.status = receipt.status;
        if (receipt.status !== 'CONFIRMED' || uncertain) return;
        await refresh(); await history(); if (await observe() !== 133) throw failure(); await official(); await quickSource(); live();
        const retained = await database.readAuthSeedAttempt(identity); if (!same(retained, retainedReceipt)) throw failure();
      } finally { held = false; }
    });
    if (release.kind !== 'RELEASED') { result.cleanupCode = 'LOCK_RELEASE_UNCONFIRMED'; result.status = 'OUTCOME_UNKNOWN'; }
    return result;
  } catch { result.status = attempted ? 'OUTCOME_UNKNOWN' : 'REQUIRES_REVIEW'; return result; }
}
