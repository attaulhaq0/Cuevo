import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';
import { z } from 'zod';
import { readBackendReleaseSourceEvidence } from './backend-release-admission';
import { prepareBackendReleaseIntent,pendingRuntimeConfirmationBindingSchema, type BackendReleaseExpected, type PreparedBackendReleaseIntent } from './backend-release-contracts';
import { validateReleaseControls } from './cicd-contracts';
import { validateBackendVerificationRun } from './staging-verification';
import { readStagingVerificationJobs } from './staging-verification-jobs';
import { createGithubCodeqlArtifactReader } from './staging-security';
import { readCanonicalRuntimeJobs } from './canonical-runtime-jobs';
import { canonicalReleaseReviewJson, canonicalReleaseExecutionJson, parseReleaseExecutionJson } from './release-review';
import { readHistoricalMigrationSources,createCanonicalPendingRuntimeConfirmationPlan, createCanonicalInstalledRuntimePlan, createCanonicalHostedMigrationPlan, canonicalHostedMigrationPlan, type HostedMigrationPlanV1 } from '../database/hosted-migration-plan';
import { createHostedMigrationWorkdirs, type HostedMigrationWorkdirs } from '../database/hosted-migration-workdirs';
import { readHostedMigrationProvider, type HostedMigrationEndpoint } from '../database/hosted-migration-provider';
import { prepareHostedOperatorStoragePolicy } from '../database/hosted-operator-storage-policy';
import { buildRuntimeArtifact } from '../runtime/build-artifacts';
import { buildEdgeArtifact } from '../runtime/build-edge-artifact';
import { readGitBinaryDiffDigest } from './git-source-digest';
import { installedSchemaStorageQuery, readInstalledSchemaReceipt, readInstalledMigrationReceipt, installedPopulationQuery,readInstalledPopulationReceipt,hostedSyntheticSeedSha256 } from '../database/hosted-installed-state';
import { verifyHostedMigrationHistory } from '../database/hosted-migration-history';
import { replayPlan } from '../database/replay-plan';
import { activeRuntimePublicQuery,activeRuntimeConfirmationPublicQuery,readPendingRuntimeConfirmationMetadata,readInstalledRuntimeMetadata } from '../database/hosted-active-runtime-state';
import {readOriginalWorkerActivationExecutionAdmission,type OriginalWorkerActivationExecutionEvidence} from './backend-hosted-activation-export-admission';
import {validateOriginalWorkerActivationExecutionExport} from './backend-hosted-activation-export-contracts';
import {createOriginalPrefixReconciliationTemplate,reconciliationTemplateFingerprint,type ReconciliationTemplate} from '../database/hosted-schema-reconciliation';
import {hostedSchemaCatalogueStructuralSql,hostedSchemaCatalogueAuthoritySql} from '../database/hosted-schema-catalogue';
import {readCompletedSchemaRecoveryAdmission,validateSchemaRecoveryCompletionExport} from './backend-schema-completion-admission';
import {unknownPrefixCataloguePolicySha256,unknownPrefixAbsencePolicySha256,verifyUnknownPrefixCataloguePolicy} from '../database/hosted-schema-reconciliation-policy';

const builderRepoRoot = resolve(import.meta.dirname, '../..');
const failure = () => Error('Native backend preparation requires review; contents withheld.');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{40}$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[1-9][0-9]{0,19}$/).refine(value => Number.isSafeInteger(Number(value)));
const repositoryName = z.string().regex(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/);
const secret = z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/);
const review = z.object({ category: z.enum(['source-spec-code', 'qa-regression-operations']), taskId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_./:-]+$/), reportSha256: hash, evidenceSha256: hash, releaseSha: sha, treeSha: sha, baseSha: sha, sourceManifestSha256: hash, diffSha256: hash, reviewedAt: z.iso.datetime({ offset: true }) }).strict();
const recoverySelectionSchema=z.object({repository:z.literal('attaulhaq0/Cuevo'),sourceSha:sha,recoveryRunId:identifier,runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),artifactId:identifier,completionJsonSha256:hash}).strict();
const pendingSelectionSchema=z.object({repository:z.literal('attaulhaq0/Cuevo'),sourceSha:sha,originalRunId:identifier,runAttempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),artifactId:identifier,exportJsonSha256:hash}).strict();
const inputSchema = z.object({ repoRoot: z.string(), eventPath: z.string(), repository: repositoryName, sha, ref: z.literal('refs/heads/main'), eventName: z.literal('workflow_dispatch'), runId: identifier, runAttempt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), githubToken: secret, providerToken: secret, input: z.object({ targets: z.unknown(), baseSha: sha, ciRunId: identifier, reviews: z.array(review).length(2),schemaRecoverySelection:recoverySelectionSchema.optional(),pendingActivationSelection:pendingSelectionSchema.optional() }).strict() }).strict();
const eventSchema = z.object({ ref: z.literal('refs/heads/main'), inputs: z.object({ commit_sha: sha, ci_run_id: identifier, scope: z.enum(['schema-and-accounts', 'complete-backend','installed-runtime','reconcile-schema','pending-runtime-confirmation']) }), repository: z.object({ full_name: repositoryName }) });
const runSchema = z.object({ id: z.number().int().positive(), run_attempt: z.number().int().positive(), head_sha: sha, head_branch: z.literal('main'), event: z.literal('workflow_dispatch'), status: z.enum(['waiting', 'in_progress']), conclusion: z.null(), path: z.literal('.github/workflows/backend-release.yml'), repository: z.object({ full_name: repositoryName }) });
const zero = z.union([z.literal(0), z.literal('0')]).transform(() => 0 as const);
const emptySchema = z.array(z.object({ authUsers: zero, storageObjects: zero, appSchemas: z.array(z.string()).length(0), runtimeRoles: z.array(z.string()).length(0), historyPresent: z.literal(false), recoveryCronPresent: z.boolean() }).strict()).length(1);
const targetQuery = `/* CUEVO_BACKEND_EMPTY_PREPARATION */ select (select count(*) from auth.users) as "authUsers", (select count(*) from storage.objects) as "storageObjects", coalesce((select jsonb_agg(nspname order by nspname) from pg_namespace where nspname in ('app','internal','authorization')),'[]'::jsonb) as "appSchemas", coalesce((select jsonb_agg(rolname order by rolname) from pg_roles where rolname in ('cuevo_api','cuevo_worker')),'[]'::jsonb) as "runtimeRoles", to_regclass('supabase_migrations.schema_migrations') is not null as "historyPresent", to_regclass('cron.job') is not null as "recoveryCronPresent"`;
const cronQuery = "/* CUEVO_BACKEND_PREPARATION_CRON */ select not exists(select 1 from cron.job where active and(lower(coalesce(jobname,'')) like '%cuevo%' or command ~* '(request_worker_wake|configure_worker_dispatch|send_worker_wake)')) as inactive";
type NativePreparationInput = z.infer<typeof inputSchema>;
export type PreparedNativeBackendRelease = { version: 1; purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION'; repoRoot: string; expected: BackendReleaseExpected; preparedApproval: PreparedBackendReleaseIntent; plan: HostedMigrationPlanV1;migrationEndpoint:HostedMigrationEndpoint; stages: HostedMigrationWorkdirs['stages']; toolchainManifestPath: string; operatorStoragePolicyPath: string; artifacts: { apiRoot: string; edgeRoot: string }; bundlePath: string; bundleSha256: string;schemaRecoveryExport?:unknown;schemaRecoverySelection?:z.infer<typeof recoverySelectionSchema>;pendingActivationEvidence?:{exportPath:string;exportSha256:string;selectionPath:string;selectionSha256:string} };
const same = (left: unknown, right: unknown) => canonicalReleaseExecutionJson(left) === canonicalReleaseExecutionJson(right);
function git(root: string, args: string[], input?: string) {
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]).concat([['GIT_NO_REPLACE_OBJECTS', '1'], ['GIT_CONFIG_NOSYSTEM', '1'], ['GIT_CONFIG_GLOBAL', process.platform === 'win32' ? 'NUL' : '/dev/null']]));
  return execFileSync('git', ['-C', root, ...args], { input, env, timeout: 15000, maxBuffer: 192 * 1024 * 1024, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
}
async function physical(root: string, path: string, kind: 'file' | 'directory') {
  if (!isAbsolute(root) || resolve(root) !== root || !isAbsolute(path) || resolve(path) !== path) throw failure();
  const part = relative(root, path); if (isAbsolute(part) || part.split(/[\\/]/).some(piece => piece === '..')) throw failure();
  let current = root;
  for (const piece of [...part.split(/[\\/]/).filter(Boolean), '']) {
    const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (piece ? !stat.isDirectory() : kind === 'file' ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())) throw failure();
    if (piece) current = join(current, piece);
  }
}
async function file(root: string, path: string, maximum: number) {
  await physical(root, path, 'file'); const before = await lstat(path); if (before.size > maximum) throw failure();
  const bytes = await readFile(path), after = await lstat(path);
  if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length > maximum) throw failure();
  return bytes;
}
async function boundedJson(response: Response, signal: AbortSignal,maximum=512*1024) {
  if (!response.ok || response.redirected || !response.body) throw failure();
  const declared = response.headers.get('content-length'); if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) throw failure();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await new Promise<ReadableStreamReadResult<Uint8Array>>((done, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(failure()); }; if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        void reader.read().then(value => { signal.removeEventListener('abort', abort); done(value); }, () => { signal.removeEventListener('abort', abort); reject(failure()); });
      });
      if (signal.aborted) throw failure(); if (chunk.done) break; size += chunk.value.byteLength; if (size > maximum) throw failure(); chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
  } finally { void reader.cancel().catch(() => undefined); try { reader.releaseLock(); } catch { /* Cancelled pending reads retain cleanup. */ } }
}
async function request(url: string, token: string, query?: string,maximum=512*1024) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { method: query === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(query === undefined ? { 'X-GitHub-Api-Version': '2022-11-28' } : { 'Content-Type': 'application/json' }) }, ...(query === undefined ? {} : { body: JSON.stringify({ query }) }), redirect: 'error', signal: controller.signal });
    if (response.url && response.url !== url) throw failure(); return await boundedJson(response, controller.signal,maximum);
  } finally { clearTimeout(timer); controller.abort(); }
}
async function authority(input: NativePreparationInput, treeSha: string) {
  const github = (path: string) => request(`https://api.github.com/repos/${input.repository}${path ? '/' + path : ''}`, input.githubToken);
  const [repository, mainRaw, ciRaw, runRaw, environment, branches, main, signatures, commit] = await Promise.all([github(''), github('git/ref/heads/main'), github('actions/runs/' + input.input.ciRunId), github('actions/runs/' + input.runId), github('environments/staging'), github('environments/staging/deployment-branch-policies'), github('branches/main/protection'), github('branches/main/protection/required_signatures'), github('git/commits/' + input.sha)]);
  const ci = validateBackendVerificationRun(ciRaw, { sha: input.sha, repository: input.repository, ciRunId: input.input.ciRunId }), backend = runSchema.parse(runRaw), mainSha = z.object({ object: z.object({ type: z.literal('commit'), sha }) }).parse(mainRaw).object.sha;
  const focusedJobs = await readStagingVerificationJobs(ci, github, createGithubCodeqlArtifactReader(input.repository,input.githubToken));
  const canonicalRuntimeVerification=ci.path==='.github/workflows/ci.yml'?await readCanonicalRuntimeJobs(ciRaw,github):undefined;
  validateReleaseControls({ repository, environment, branches, main, signatures }, { repository: input.repository, environment: 'staging' });
  const environmentId = z.object({ id: z.number().int().positive(), name: z.literal('staging') }).parse(environment).id;
  z.object({ total_count: z.literal(1) }).parse(branches);
  z.object({ sha: z.literal(input.sha), tree: z.object({ sha: z.literal(treeSha) }), verification: z.object({ verified: z.literal(true), reason: z.literal('valid'), signature: z.string().min(1), payload: z.string().min(1) }) }).parse(commit);
  if (mainSha !== input.sha || String(backend.id) !== input.runId || backend.run_attempt !== input.runAttempt || backend.head_sha !== input.sha || backend.repository.full_name !== input.repository) throw failure();
  return { currentMainSha: mainSha, environmentId, ciRun: ci, ...(canonicalRuntimeVerification?{canonicalRuntimeVerification}:{}), ...(focusedJobs ? { stagingVerification: { scope: 'SCHEMA_AND_SYNTHETIC_AUTH' as const, ...focusedJobs } } : {}), backendRun: { ...backend, repository: { full_name: backend.repository.full_name } } };
}
async function emptyTarget(input: NativePreparationInput, projectRef: string) {
  const provider = await readHostedMigrationProvider({ projectRef, boundProjectRef: projectRef, providerToken: input.providerToken });
  const rows = emptySchema.parse(await request(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, input.providerToken, targetQuery));
  if (rows[0].recoveryCronPresent) z.array(z.object({ inactive: z.literal(true) }).strict()).length(1).parse(await request(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, input.providerToken, cronQuery));
  if (provider.observedAtMs > Date.now() || Date.now() - provider.observedAtMs > 30000) throw failure();
  return { projectRef, boundProjectRef: projectRef, projectName: provider.projectName, projectStatus: provider.projectStatus, deploymentEnvironment: 'synthetic-staging' as const, observedAt: new Date().toISOString(), authUsers: rows[0].authUsers, storageObjects: rows[0].storageObjects, appSchemas: [], migrationVersions: [], dispatchDisabled: true as const, population: 'EMPTY' as const };
}
async function installedTarget(input:NativePreparationInput,projectRef:string,mode:'INACTIVE_INSTALL'|'CONFIRMED_RUNTIME'|'PENDING_CONFIRMATION'='INACTIVE_INSTALL',reconciliationTemplate?:ReconciliationTemplate,pendingEvidence?:OriginalWorkerActivationExecutionEvidence){
 const activeRuntime=mode!=='INACTIVE_INSTALL';
 const started=Date.now(),provider=await readHostedMigrationProvider({projectRef,boundProjectRef:projectRef,providerToken:input.providerToken});
 const query=(sql:string)=>request('https://api.supabase.com/v1/projects/'+projectRef+'/database/query',input.providerToken,sql,sql.includes('CUEVO_INSTALLED_HISTORY')?16*1024*1024:512*1024);
 const rows=z.array(z.object({authUsers:z.coerce.number().int().min(0).max(133),storageObjects:z.coerce.number().int().nonnegative(),appSchemas:z.array(z.enum(['app','internal','authorization'])).length(3),runtimeRoles:z.array(z.enum(['cuevo_api','cuevo_worker'])).length(2),historyPresent:z.literal(true),recoveryCronPresent:z.boolean()})).length(1).parse(await query(targetQuery));
 if(new Set(rows[0].appSchemas).size!==3||new Set(rows[0].runtimeRoles).size!==2)throw failure();
 if(rows[0].recoveryCronPresent&&!activeRuntime)z.array(z.object({inactive:z.literal(true)})).length(1).parse(await query(cronQuery));
 const pending=mode==='PENDING_CONFIRMATION'?readPendingRuntimeConfirmationMetadata(await query(activeRuntimeConfirmationPublicQuery(projectRef)),{configuredPublicStateSha256:pendingEvidence?.configuredPublicStateSha256,confirmedPublicStateSha256:pendingEvidence?.confirmedPublicStateSha256},projectRef):undefined;
 const installedRuntime=mode==='CONFIRMED_RUNTIME'?readInstalledRuntimeMetadata(await query(activeRuntimePublicQuery(projectRef)),projectRef):undefined,runtime=installedRuntime??(pendingEvidence&&pending?{...pendingEvidence.original,jobId:pendingEvidence.envelope.originalActivation.jobId}:undefined);
 if(runtime&&(runtime.sourceSha!==input.sha||git(input.repoRoot,['rev-parse',input.sha+'^{tree}']).toString().trim()!==runtime.treeSha))throw failure();
 const populationRows=z.array(z.unknown()).max(1).parse(await query(installedPopulationQuery)),receipt=populationRows.length?readInstalledPopulationReceipt(populationRows,projectRef):undefined;
 const completed=readInstalledMigrationReceipt(await query("/* CUEVO_INSTALLED_MIGRATION_SOURCE */ select decrypted_secret from vault.decrypted_secrets where name='cuevo_schema_"+projectRef+"'"),projectRef);
 const partial=receipt?null:readInstalledSchemaReceipt(await query("/* CUEVO_INSTALLED_SCHEMA_STAGE */ select decrypted_secret from vault.decrypted_secrets where name='cuevo_schema_stage_"+projectRef+"'"),projectRef);
 const migrationSource=receipt?(completed??receipt):(partial??completed??(reconciliationTemplate?{sourceSha:reconciliationTemplate.originalIdentity.sourceSha,treeSha:reconciliationTemplate.originalIdentity.treeSha,migrationCount:120,migrations:reconciliationTemplate.prefixRows.map(({version,sha256})=>({version,sha256}))}:undefined));if(!migrationSource)throw failure();
 const dispatchPresent=z.array(z.object({present:z.boolean()}).strict()).length(1).parse(await query("/* CUEVO_INSTALLED_DISPATCH_PRESENCE */ select to_regclass('internal.worker_dispatch_control') is not null as present"))[0].present;
 const dispatch=dispatchPresent?(runtime?z.array(z.object({enabled:z.literal(true),endpoint:z.literal(runtime.endpoint),vault_secret_name:z.literal(runtime.vaultSecretName),allow_local:z.literal(false)}).strict()).length(1).parse(await query('/* CUEVO_INSTALLED_DISPATCH_INACTIVE */ select enabled,endpoint,vault_secret_name,allow_local from internal.worker_dispatch_control where singleton')):z.array(z.object({enabled:z.literal(false),endpoint:z.null(),vault_secret_name:z.null(),allow_local:z.literal(false)}).strict()).length(1).parse(await query('/* CUEVO_INSTALLED_DISPATCH_INACTIVE */ select enabled,endpoint,vault_secret_name,allow_local from internal.worker_dispatch_control where singleton'))):[];
 if(runtime){if(!receipt||!completed||rows[0].authUsers!==133||!dispatchPresent)throw failure();z.array(z.object({jobid:z.literal(runtime.jobId),jobname:z.literal('cuevo-worker-recovery'),schedule:z.literal('* * * * *'),command:z.literal('select internal.request_worker_wake();'),database:z.literal('postgres'),username:z.literal('postgres'),active:z.literal(true)}).strict()).length(1).parse(await query("/* CUEVO_INSTALLED_RUNTIME_CRON */ select jobid,jobname,schedule,command,database,username,active from cron.job where jobname='cuevo-worker-recovery' or(active and(command ilike '%request_worker_wake%' or jobname ilike 'cuevo%'))"));}
 if(pending){const manifestBytes=await file(input.repoRoot,join(input.repoRoot,'supabase/seed/identities.json'),131072);if(digest(manifestBytes)!=='7464b3487adc3998d8f4ad4582ffd08ebafbdc8fd9a568433ddc687f4f03ac21')throw failure();const manifest=z.object({actors:z.array(z.object({actorId:z.uuid(),schoolId:z.uuid(),role:z.string(),email:z.string().email()}).passthrough()).length(133)}).passthrough().parse(JSON.parse(manifestBytes.toString('utf8')));z.array(z.object({peopleMatching:z.literal(true),authMatching:z.literal(true),currentMemberships:z.literal(true),transportPrivate:z.literal(true),runtimeRoles:z.literal(true),analyticsDisabled:z.literal(true)}).strict()).length(1).parse(await query(`/* CUEVO_PENDING_PREPARATION_SOURCE */ select not exists(select 1 from app.people p full join jsonb_to_recordset('${JSON.stringify(manifest.actors.map(({actorId,schoolId})=>({actorId,schoolId})))}'::jsonb)e("actorId"uuid,"schoolId"uuid)on p.actor_id=e."actorId"and p.school_id=e."schoolId"where p.actor_id is null or e."actorId"is null or p.synthetic is distinct from true) as "peopleMatching",not exists(select 1 from auth.users u full join jsonb_to_recordset('${JSON.stringify(manifest.actors.map(({actorId,email})=>({actorId,email})))}'::jsonb)e("actorId"uuid,email text)on u.id=e."actorId"where u.id is null or e."actorId"is null or u.email is distinct from e.email or u.email_confirmed_at is null or u.deleted_at is not null or u.is_anonymous or u.banned_until>now()or u.raw_user_meta_data->'synthetic' is distinct from 'true'::jsonb) as "authMatching",not exists(select 1 from jsonb_to_recordset('${JSON.stringify(manifest.actors.map(({actorId,schoolId,role})=>({actorId,schoolId,role})))}'::jsonb)e("actorId"uuid,"schoolId"uuid,role text)where not exists(select 1 from app.memberships m where m.actor_id=e."actorId"and m.school_id=e."schoolId"and m.role=e.role and m.status='active'and m.effective_from<=now()and(m.effective_to is null or m.effective_to>now()))) as "currentMemberships",internal.worker_transport_private() as "transportPrivate",not exists(select 1 from pg_roles where rolname in('cuevo_api','cuevo_worker')and(not rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit)) as "runtimeRoles",not exists(select 1 from internal.posthog_school_activation where enabled) as "analyticsDisabled"`));}
 if(receipt){if(!dispatchPresent||receipt.seedSha256!==hostedSyntheticSeedSha256||receipt.manifestSha256!==digest(canonicalReleaseExecutionJson(JSON.parse(await readFile(join(input.repoRoot,'supabase/seed/identities.json'),'utf8')))))throw failure();git(input.repoRoot,['merge-base','--is-ancestor',receipt.sourceSha,input.sha]);if(git(input.repoRoot,['rev-parse',receipt.sourceSha+'^{tree}']).toString().trim()!==receipt.treeSha)throw failure();}
 else{if(rows[0].authUsers!==0)throw failure();z.array(z.object({schools:z.literal(0),people:z.literal(0)}).strict()).length(1).parse(await query('/* CUEVO_INSTALLED_SCHEMA_EMPTY */ select (select count(*)::integer from app.schools) as schools,(select count(*)::integer from app.people) as people'));}
 git(input.repoRoot,['merge-base','--is-ancestor',migrationSource.sourceSha,input.sha]);if(git(input.repoRoot,['rev-parse',migrationSource.sourceSha+'^{tree}']).toString().trim()!==migrationSource.treeSha)throw failure();
 const originalSources=readHistoricalMigrationSources(input.repoRoot,migrationSource.sourceSha,migrationSource.treeSha),originalReplay=replayPlan(originalSources),originalOrder=[...originalReplay.before,originalReplay.prerequisite,...originalReplay.remaining];
 const count=receipt?(completed?.migrationCount??originalOrder.length):('migrationCount'in migrationSource?migrationSource.migrationCount:0);if(!count)throw failure();
 const priorRows=originalOrder.slice(0,count).map(name=>({version:name.slice(0,14),sha256:digest(originalSources.find(row=>row.name===name)!.bytes)}));
 if('migrations'in migrationSource&&!same(migrationSource.migrations,priorRows))throw failure();
 const history=z.array(z.object({version:z.string(),name:z.string(),statements:z.array(z.string())})).max(1000).parse(await query('/* CUEVO_INSTALLED_HISTORY */ select version,name,statements from supabase_migrations.schema_migrations order by version'));if(history.length!==count)throw failure();
 if(!same(await query(targetQuery),rows)||dispatchPresent&&!same(await query('/* CUEVO_INSTALLED_DISPATCH_INACTIVE */ select enabled,endpoint,vault_secret_name,allow_local from internal.worker_dispatch_control where singleton'),dispatch)||!same(await query(installedPopulationQuery),populationRows)||Date.now()-started>30000||Date.now()-provider.observedAtMs>30000)throw failure();
 const prior={projectRef,sourceSha:migrationSource.sourceSha,treeSha:migrationSource.treeSha,migrations:priorRows,...(receipt?{completedSourceMigrationCount:count}:{})};
 return{target:{projectRef,boundProjectRef:projectRef,projectName:provider.projectName,projectStatus:provider.projectStatus,deploymentEnvironment:'synthetic-staging' as const,observedAt:new Date().toISOString(),authUsers:rows[0].authUsers,storageObjects:rows[0].storageObjects,appSchemas:rows[0].appSchemas,migrationVersions:history.map(row=>row.version),dispatchDisabled:!runtime,population:runtime?'ACTIVE_SYNTHETIC' as const:receipt?'GUARDED_SYNTHETIC' as const:'SCHEMA_ONLY' as const},prior,history,receipt,runtime:installedRuntime,pending,schema:receipt?undefined:{sourceSha:migrationSource.sourceSha,treeSha:migrationSource.treeSha,migrationCount:count}};
}

async function recoveryCompletion(input:NativePreparationInput,projectRef:string,scope:string,plan:HostedMigrationPlanV1,migrationEndpoint:HostedMigrationEndpoint){
 const selection=input.input.schemaRecoverySelection;if(!selection&&plan.applied.length<123)return null;if(!['schema-and-accounts','complete-backend','installed-runtime','pending-runtime-confirmation'].includes(scope)){if(selection)throw failure();return null;}
 let exported:unknown;if(selection){if(selection.repository!==input.repository)throw failure();const admitted=await readCompletedSchemaRecoveryAdmission({...selection,githubToken:input.githubToken});exported=admitted.envelope;if(digest(canonicalReleaseExecutionJson(exported))!==selection.completionJsonSha256)throw failure();}
 else{
  const name='cuevo_recovery_completion_'+projectRef+'_'+'32646f1e492ed99fdaca88b3fe34250d56825791593b877c9fdc390aac89a465',rows=z.array(z.object({decrypted_secret:z.string().max(49152)}).strict()).max(1).parse(await request('https://api.supabase.com/v1/projects/'+projectRef+'/database/query',input.providerToken,"/* CUEVO_PREPARATION_RECOVERY_COMPLETION */ select decrypted_secret from vault.decrypted_secrets where name='"+name+"'"));if(!rows.length)return null;exported=JSON.parse(rows[0].decrypted_secret);
 }
 const admitted=validateSchemaRecoveryCompletionExport(exported,Date.now()),completion=admitted.completion;git(input.repoRoot,['merge-base','--is-ancestor',completion.sourceSha,input.sha]);if(git(input.repoRoot,['rev-parse',completion.sourceSha+'^{tree}']).toString().trim()!==completion.treeSha||completion.projectRef!==projectRef||selection&&(completion.sourceSha!==selection.sourceSha||completion.recoveryRunId!==selection.recoveryRunId||completion.runAttempt!==selection.runAttempt)||plan.applied.length<123||!same(completion.migrations,plan.migrations.slice(0,123))||completion.recoveryIdentity.databaseUrl!==('postgresql://postgres.'+projectRef+'@'+migrationEndpoint.host+':5432/postgres?sslmode=verify-full'))throw failure();
 const historical=readHistoricalMigrationSources(input.repoRoot,completion.sourceSha,completion.treeSha);for(const row of completion.migrations){const source=historical.find(source=>source.name===row.name);if(!source||digest(source.bytes)!==row.sha256)throw failure();}
 return{exported,...(selection?{selection}:{}),schemaRecovery:{completionReceiptSha256:completion.receiptSha256,completionExportSha256:digest(canonicalReleaseExecutionJson(exported))}};
}

async function outputDirectory(root: string) {
  for (const path of [join(root, '.local'), join(root, '.local/hosted-release')]) { try { await mkdir(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw failure(); } await physical(root, path, 'directory'); }
  const probe = '.local/hosted-release/backend-bundle.json'; if (git(root, ['check-ignore', '--no-index', '--stdin'], probe + '\n').toString().trim() !== probe || git(root, ['ls-files', '--cached', '--', '.local/hosted-release']).length) throw failure();
}
async function persist(root: string, path: string, bytes: string) {
  await physical(root, join(root, '.local/hosted-release'), 'directory');
  const handle = await open(path, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  if (!(await file(root, path, 1024 * 1024)).equals(Buffer.from(bytes))) throw failure();
}
async function toolchain(root: string, sourceSha: string, treeSha: string) {
  const lockBytes = git(root, ['show', sourceSha + ':package-lock.json']), lock = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(lockBytes)) as { lockfileVersion: number; packages?: Record<string, { version?: string; integrity?: string; resolved?: string }> };
  if (!['win32', 'linux', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) throw failure();
  const platform = process.platform === 'win32' ? 'windows' : process.platform, cliRoot = join(root, 'node_modules/supabase'), packageRoot = join(root, `node_modules/@supabase/cli-${platform}-${process.arch}`), suffix = process.platform === 'win32' ? '.exe' : '';
  for (const path of ['node_modules/supabase', `node_modules/@supabase/cli-${platform}-${process.arch}`]) { const row = lock.packages?.[path]; if (lock.lockfileVersion !== 3 || row?.version !== '2.119.0' || !row.integrity?.startsWith('sha512-') || !row.resolved?.startsWith('https://registry.npmjs.org/')) throw failure(); }
  const cli = z.object({ name: z.literal('supabase'), version: z.literal('2.119.0'), type: z.literal('module') }).parse(JSON.parse((await file(root, join(cliRoot, 'package.json'), 65536)).toString('utf8')));
  z.object({ name: z.literal(`@supabase/cli-${platform}-${process.arch}`), version: z.literal(cli.version) }).parse(JSON.parse((await file(root, join(packageRoot, 'package.json'), 65536)).toString('utf8')));
  return { version: 1, purpose: 'CUEVO_HOSTED_MIGRATION_TOOLCHAIN', sourceSha, treeSha, sourceLockSha256: digest(lockBytes), cliVersion: cli.version, platform: `${process.platform}-${process.arch}`, cli: { shimSha256: digest(await file(root, join(cliRoot, 'dist/supabase.js'), 2 * 1024 * 1024)), binarySha256: digest(await file(root, join(packageRoot, 'bin/supabase' + suffix), 192 * 1024 * 1024)), sidecarSha256: digest(await file(root, join(packageRoot, 'bin/supabase-go' + suffix), 192 * 1024 * 1024)) } };
}
async function artifact(root: string, directory: string, built: unknown, service: 'api' | 'cuevo-worker') {
  const bytes = await file(root, join(directory, 'artifact.json'), 4 * 1024 * 1024), parsed = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) as { schemaVersion: number; service: string; files: { path: string; sha256: string }[]; denoLockSha256?: string };
  if (JSON.stringify(parsed) !== JSON.stringify(built) || parsed.schemaVersion !== 1 || parsed.service !== service || !Array.isArray(parsed.files) || !parsed.files.length || parsed.files.length > 20000) throw failure();
  const paths = new Set<string>();
  for (const row of parsed.files) { if (!row || typeof row.path !== 'string' || row.path.includes('\\') || row.path.startsWith('/') || row.path.split('/').some(piece => !piece || piece === '.' || piece === '..') || row.path === 'artifact.json' || paths.has(row.path) || !hash.safeParse(row.sha256).success) throw failure(); paths.add(row.path); if (digest(await file(root, join(directory, row.path), 32 * 1024 * 1024)) !== row.sha256) throw failure(); }
  const collect = async (path: string): Promise<string[]> => { await physical(root, path, 'directory'); const rows: string[] = []; for (const entry of await readdir(path, { withFileTypes: true })) { const next = join(path, entry.name); if (entry.isDirectory()) rows.push(...await collect(next)); else { await physical(root, next, 'file'); rows.push(relative(directory, next).replaceAll('\\', '/')); } } return rows; };
  const actualPaths=(await collect(directory)).sort(),expectedPaths=['artifact.json',...paths].sort();
  if(actualPaths.length!==expectedPaths.length||actualPaths.some((path,index)=>path!==expectedPaths[index]))throw failure();
  if (service === 'cuevo-worker' && (!hash.safeParse(parsed.denoLockSha256).success || !paths.has('deno.lock') || digest(await file(root, join(directory, 'deno.lock'), 2 * 1024 * 1024)) !== parsed.denoLockSha256)) throw failure();
  return { sha256: digest(JSON.stringify(parsed)), ...(parsed.denoLockSha256 === undefined ? {} : { denoLockSha256: parsed.denoLockSha256 }) };
}
async function workdirs(root: string, work: HostedMigrationWorkdirs, plan: HostedMigrationPlanV1) {
  if (work.projectRef !== plan.projectRef || work.sourceSha !== plan.source.sha || work.treeSha !== plan.source.tree || work.planSha256 !== canonicalHostedMigrationPlan(plan).sha256 || work.execution !== 'NOT_EXECUTED' || work.stages.length !== 4) throw failure();
  const contained = relative(join(root, '.local/hosted-release'), work.root); if (!contained || isAbsolute(contained) || contained.split(/[\\/]/).some(piece => piece === '..')) throw failure();
  await physical(root, work.root, 'directory'); let boundary = plan.applied.length;
  for (const [index, stage] of work.stages.entries()) {
    const before = boundary; boundary += plan.stages[index].names.length;
    const included = plan.migrations.slice(0, boundary), pending = included.filter(row => plan.stages[index].names.includes(row.name));
    if (stage.id !== plan.stages[index].id || stage.workdir !== join(work.root, stage.id) || !same(stage.included, included) || !same(stage.pending, pending) || !same(stage.expectedBeforeVersions, plan.migrations.slice(0, before).map(row => row.version).sort()) || !same(stage.expectedAfterVersions, included.map(row => row.version).sort())) throw failure();
    const supabase = join(stage.workdir, 'supabase'), migrations = join(supabase, 'migrations');
    if (!same((await readdir(stage.workdir)).sort(), ['supabase']) || !same((await readdir(supabase)).sort(), ['config.toml', 'migrations']) || !same((await readdir(migrations)).sort(), included.map(row => row.name).sort())) throw failure();
    if (digest(await file(root, join(supabase, 'config.toml'), 8192)) !== stage.configSha256) throw failure();
    for (const row of included) if (digest(await file(root, join(migrations, row.name), 2 * 1024 * 1024)) !== row.sha256) throw failure();
  }
  if (boundary !== plan.migrations.length || !same((await readdir(work.root)).sort(), ['builder-state.json', ...work.stages.map(stage => stage.id)].sort())) throw failure();
}

/** Fixed native source/provider reads and local builders only. This package never grants approval or hosted readiness. */
export async function prepareNativeBackendRelease(value: unknown): Promise<PreparedNativeBackendRelease> {
  let stage='source-and-authority';
  try {
    const input = inputSchema.parse(JSON.parse(canonicalReleaseReviewJson(value))), root = input.repoRoot;
    if (root !== builderRepoRoot) throw failure(); await physical(root, root, 'directory');
    const event = eventSchema.parse(JSON.parse((await file(parse(input.eventPath).root, input.eventPath, 48 * 1024)).toString('utf8')));
    if (event.inputs.commit_sha !== input.sha || event.inputs.ci_run_id !== input.input.ciRunId || event.repository.full_name !== input.repository) throw failure();
    const pendingScope=event.inputs.scope==='pending-runtime-confirmation',pendingSelection=input.input.pendingActivationSelection;if(pendingScope?!pendingSelection:pendingSelection!==undefined)throw failure();
    const treeSha = sha.parse(git(root, ['rev-parse', input.sha + '^{tree}']).toString().trim()), sourceManifestSha256 = digest(git(root, ['ls-tree', '-r', '-z', input.sha])), diffSha256 = (await readGitBinaryDiffDigest({ repoRoot: root, baseSha: input.input.baseSha, sourceSha: input.sha })).sha256;
    const source = { releaseSha: input.sha, treeSha, baseSha: input.input.baseSha, fingerprints: { sourceManifestSha256, diffSha256 } };
    await readBackendReleaseSourceEvidence(root, source as Parameters<typeof readBackendReleaseSourceEvidence>[1]);
    const current = await authority(input, treeSha), placeholder = '0'.repeat(64), now = Date.now();
    const common = { repository: input.repository, releaseSha: input.sha, treeSha, baseSha: input.input.baseSha, ciRunId: input.input.ciRunId, releaseRunId: input.runId, runAttempt: input.runAttempt, environmentName: 'staging' as const, deploymentEnvironment: 'synthetic-staging' as const, executionScope: event.inputs.scope, targets: input.input.targets as BackendReleaseExpected['targets'], reviews: input.input.reviews.map(({ category, taskId, reportSha256, evidenceSha256 }) => ({ category, taskId, reportSha256, evidenceSha256 })) };
    const trial: BackendReleaseExpected = { ...common, ...current, now, fingerprints: { sourceManifestSha256, diffSha256, migrationPlanSha256: placeholder, migrationHistorySha256: placeholder, migrationToolchainSha256: placeholder,migrationEndpointSha256:placeholder, operatorStoragePolicySha256: placeholder, apiArtifactSha256: placeholder, edgeArtifactSha256: placeholder, denoLockSha256: placeholder } };
    const intent = (expected: BackendReleaseExpected) => ({ ...common, environmentId: expected.environmentId, version: 1, purpose: 'BACKEND_SYNTHETIC_STAGING', fingerprints: expected.fingerprints, ...(expected.reconciledPrefix?{reconciledPrefix:expected.reconciledPrefix}:{}),...(expected.schemaRecovery?{schemaRecovery:expected.schemaRecovery}:{}), ...(expected.installedSource?{installedSource:expected.installedSource}:{}), ...(expected.installedSchema?{installedSchema:expected.installedSchema}:{}), ...(expected.installedRuntime?{installedRuntime:expected.installedRuntime}:{}),...(expected.pendingRuntimeConfirmation?{pendingRuntimeConfirmation:expected.pendingRuntimeConfirmation}:{}), ...(expected.canonicalRuntimeVerification?{canonicalRuntimeVerification:expected.canonicalRuntimeVerification}:{}), ...(expected.stagingVerification ? { stagingVerification: expected.stagingVerification } : {}), preparedAt: new Date(expected.now).toISOString(), expiresAt: new Date(expected.now + 3600000).toISOString(), reviews: input.input.reviews });
    if(!['installed-runtime','reconcile-schema','pending-runtime-confirmation'].includes(event.inputs.scope))prepareBackendReleaseIntent(intent(trial), trial);
    const pendingEvidence=pendingSelection?await readOriginalWorkerActivationExecutionAdmission({...pendingSelection,githubToken:input.githubToken}):undefined;
    if(pendingEvidence){const proof=validateOriginalWorkerActivationExecutionExport(pendingEvidence.envelope,Date.now()),original=proof.original;if(!same(proof.original,pendingEvidence.original)||proof.originalExportSha256!==pendingSelection!.exportJsonSha256||pendingEvidence.exportJsonSha256!==proof.originalExportSha256||pendingEvidence.artifactId!==pendingSelection!.artifactId||original.sourceSha!==input.sha||original.treeSha!==treeSha||original.originalRunId!==pendingSelection!.originalRunId||original.originalRunAttempt!==pendingSelection!.runAttempt||original.originalRunId===input.runId||pendingEvidence.envelope.originalIntent.projectRef!==trial.targets.supabase.projectRef||pendingEvidence.envelope.originalExpected.fingerprints.sourceManifestSha256!==sourceManifestSha256||!same(pendingEvidence.envelope.originalExpected.targets,trial.targets)||Date.parse(pendingEvidence.artifactExpiresAt)<=Date.now())throw failure();}
    stage='empty-target-and-migration-plan';
    const projectRef = trial.targets.supabase.projectRef;
    z.array(z.object({available:z.literal(true)}).strict()).length(1).parse(await request('https://api.supabase.com/v1/projects/'+projectRef+'/database/query',input.providerToken,installedSchemaStorageQuery));
    const targetStatus=z.array(z.object({authUsers:z.coerce.number().int().nonnegative(),historyPresent:z.boolean()})).length(1).parse(await request(`https://api.supabase.com/v1/projects/${projectRef}/database/query`,input.providerToken,targetQuery))[0];
    let reconciliationTemplate:ReconciliationTemplate|undefined;
    if(event.inputs.scope==='reconcile-schema'){
      if(!targetStatus.historyPresent||targetStatus.authUsers!==0)throw failure();
      const originals=readHistoricalMigrationSources(root,'d87455114cac2d22d63d040ce5b13e6b2e74e743','1e85393d46beb4f5356e07277a13a7ef33cc67d9'),replay=replayPlan(originals),stageRows=replay.before.map(name=>({name,version:name.slice(0,14),sha256:digest(originals.find(row=>row.name===name)!.bytes)}));
      const endpoint=(await readHostedMigrationProvider({projectRef,boundProjectRef:projectRef,providerToken:input.providerToken})).sessionEndpoint;
      const query=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL search_path TO pg_catalog; SET LOCAL DateStyle TO 'ISO, YMD'; SET LOCAL IntervalStyle TO 'postgres'; SET LOCAL TimeZone TO 'UTC'; SELECT jsonb_agg(row_to_json(c)) as rows,current_setting('server_version_num')::integer as "serverVersion" FROM (SELECT * FROM (${hostedSchemaCatalogueStructuralSql}) s UNION ALL SELECT * FROM (${hostedSchemaCatalogueAuthoritySql}) a) c; ROLLBACK;`;
      const response=z.array(z.object({rows:z.array(z.unknown()),serverVersion:z.literal(170011)}).strict()).length(1).parse(await request('https://api.supabase.com/v1/projects/'+projectRef+'/database/query',input.providerToken,query,32*1024*1024));
      const catalogue=verifyUnknownPrefixCataloguePolicy(response[0].rows,response[0].serverVersion);
      reconciliationTemplate=createOriginalPrefixReconciliationTemplate({recoverySource:{sourceSha:input.sha,treeSha,ciRunId:input.input.ciRunId,releaseRunId:input.runId,runAttempt:input.runAttempt},stageRows,historySha256:digest(canonicalReleaseExecutionJson(stageRows.slice(0,120).map(({version,sha256})=>({version,sourceReceiptSha256:sha256})))),cataloguePolicySha256:unknownPrefixCataloguePolicySha256,catalogueSha256:catalogue.catalogueSha256,absencePolicySha256:unknownPrefixAbsencePolicySha256,endpointSha256:digest(canonicalReleaseExecutionJson(endpoint))});
      trial.reconciledPrefix=reconciliationTemplateFingerprint(reconciliationTemplate);
    }
    const targetMode=pendingScope?'PENDING_CONFIRMATION' as const:event.inputs.scope==='installed-runtime'?'CONFIRMED_RUNTIME' as const:'INACTIVE_INSTALL' as const,installed=targetStatus.historyPresent?await installedTarget(input,projectRef,targetMode,reconciliationTemplate,pendingEvidence):undefined;if(event.inputs.scope==='installed-runtime'&&!installed?.runtime||pendingScope&&!installed?.pending)throw failure();
    const target=installed?.target??await emptyTarget(input,projectRef),planned=pendingScope&&installed?createCanonicalPendingRuntimeConfirmationPlan({repoRoot:root,sourceSha:input.sha,treeSha,target,priorReceipt:installed.prior,operation:'PENDING_RUNTIME_CONFIRMATION',now:Date.now()}):installed?.runtime?createCanonicalInstalledRuntimePlan({repoRoot:root,sourceSha:input.sha,treeSha,target,priorReceipt:installed.prior,operation:'INSTALLED_RUNTIME_READ_ONLY',now:Date.now()}):createCanonicalHostedMigrationPlan({repoRoot:root,sourceSha:input.sha,treeSha,target,...(installed?{priorReceipt:installed.prior}:{}),...(reconciliationTemplate?{reconciliationTemplate}:{}),now:Date.now()});
    if(installed){if(installed.receipt)trial.installedSource={sourceSha:installed.receipt.sourceSha,treeSha:installed.receipt.treeSha,seedSha256:installed.receipt.seedSha256,manifestSha256:installed.receipt.manifestSha256,migrationCount:installed.prior.migrations.length};else trial.installedSchema=installed.schema!;if(installed.runtime)trial.installedRuntime=installed.runtime;
      verifyHostedMigrationHistory({sources:readHistoricalMigrationSources(root,input.sha,treeSha),included:planned.plan.migrations.slice(0,planned.plan.applied.length),expectedVersions:planned.plan.applied.map(row=>row.version),history:installed.history});}
    if(pendingEvidence&&installed?.pending){const o=pendingEvidence.original;trial.pendingRuntimeConfirmation=pendingRuntimeConfirmationBindingSchema.parse({version:1,purpose:'CUEVO_PENDING_ORIGINAL_WORKER_CONFIRMATION',original:{sourceSha:o.sourceSha,treeSha:o.treeSha,runId:o.originalRunId,runAttempt:o.originalRunAttempt,packageSha256:o.originalPackageSha256,activationId:o.activationId,runtimeSha256:o.runtimeSha256,apiDeploymentId:o.apiDeploymentId,apiUrl:o.apiUrl,edgeId:o.edgeId,edgeVersion:o.edgeVersion,endpoint:o.endpoint,vaultSecretName:o.vaultSecretName,jobId:pendingEvidence.envelope.originalActivation.jobId,createdAt:o.createdAt},originalExportSha256:pendingEvidence.originalExportSha256,originalIdentityFileSha256:pendingEvidence.originalIdentityFileSha256,originalIntentSha256:pendingEvidence.originalIntentSha256,originalActivationSha256:pendingEvidence.originalActivationSha256,originalCleanupSha256:pendingEvidence.originalCleanupSha256,originalJournalPrefixSha256:pendingEvidence.originalJournalPrefixSha256,originalWakeKeySha256:pendingEvidence.originalWakeKeySha256,originalRuntimeConfigurationSha256:pendingEvidence.originalRuntimeConfigurationSha256,configuredPublicStateSha256:pendingEvidence.configuredPublicStateSha256,confirmedPublicStateSha256:pendingEvidence.confirmedPublicStateSha256,observedPhase:installed.pending.observedPhase,observedPublicStateSha256:installed.pending.observedPublicStateSha256,originalArtifact:{runId:pendingSelection!.originalRunId,runAttempt:pendingSelection!.runAttempt,artifactId:pendingEvidence.artifactId,archiveSha256:pendingEvidence.artifactSha256,jsonSha256:pendingEvidence.exportJsonSha256,jobsSha256:pendingEvidence.jobsSha256,expiresAt:pendingEvidence.artifactExpiresAt}});}
    // This route is selected before approval after the observed GitHub IPv6
    // refusal. A later execution never switches endpoints after an intent.
    const migrationEndpoint=(await readHostedMigrationProvider({projectRef,boundProjectRef:projectRef,providerToken:input.providerToken})).sessionEndpoint;
    if(pendingEvidence&&pendingEvidence.envelope.originalExpected.fingerprints.migrationEndpointSha256!==digest(canonicalReleaseExecutionJson(migrationEndpoint)))throw failure();
    const plan = planned.plan,recovery=await recoveryCompletion(input,projectRef,event.inputs.scope,plan,migrationEndpoint);if(recovery)trial.schemaRecovery=recovery.schemaRecovery; if (planned.sourceProvenance.kind !== 'VERIFIED_GIT_BLOBS' || (!installed&&(plan.mode!=='EMPTY_INITIAL'||plan.applied.length)) || plan.dispatch !== 'DISABLED' || plan.seed !== 'DISABLED' || plan.vault !== 'DISABLED') throw failure();
    stage='toolchain-and-migration-delivery';
    await outputDirectory(root);
    const toolchainManifestPath = join(root, '.local/hosted-release/migration-toolchain.json'), operatorStoragePolicyPath = join(root, '.local/hosted-release/operator-storage-policy.json'), bundlePath = join(root, '.local/hosted-release/backend-bundle.json');
    const manifest = await toolchain(root, input.sha, treeSha), manifestBytes = canonicalReleaseReviewJson(manifest), policy = prepareHostedOperatorStoragePolicy({ sourceSha: input.sha, treeSha, projectRef });
    await persist(root, toolchainManifestPath, manifestBytes); await persist(root, operatorStoragePolicyPath, policy.canonicalJson);
    const work = await createHostedMigrationWorkdirs({ repoRoot: root, sourceSha: input.sha, treeSha, plan, outputRoot: join(root, '.local/hosted-release') }); await workdirs(root, work, plan);
    const apiRoot = join(root, '.local/runtime-artifacts/api-vercel'), edgeRoot = join(root, '.local/edge-artifacts/cuevo-worker');
    for (const directory of [join(root, '.local/runtime-artifacts'), join(root, '.local/edge-artifacts')]) { try { await mkdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw failure(); } await physical(root, directory, 'directory'); }
    stage='api-artifact-build';
    const builtApi = await buildRuntimeArtifact('api-vercel');
    stage='api-artifact-verification';
    const api = await artifact(root, apiRoot, builtApi, 'api');
    stage='edge-artifact-build-and-verification';
    const builtEdge = await buildEdgeArtifact(), edge = await artifact(root, edgeRoot, builtEdge, 'cuevo-worker');
    if(pendingEvidence&&(pendingEvidence.envelope.originalExpected.fingerprints.apiArtifactSha256!==api.sha256||pendingEvidence.envelope.originalExpected.fingerprints.edgeArtifactSha256!==edge.sha256||pendingEvidence.envelope.originalExpected.fingerprints.denoLockSha256!==edge.denoLockSha256))throw failure();
    stage='final-source-authority-and-artifacts';
    await readBackendReleaseSourceEvidence(root, source as Parameters<typeof readBackendReleaseSourceEvidence>[1]);
    const finalAuthority = await authority(input, treeSha); if (!same(finalAuthority, current)) throw failure();
    if(pendingEvidence){const finalEvidence=await readOriginalWorkerActivationExecutionAdmission({...pendingSelection!,githubToken:input.githubToken});if(!same(finalEvidence,pendingEvidence))throw failure();}
    if(installed){const final=await installedTarget(input,projectRef,targetMode,reconciliationTemplate,pendingEvidence);if(!same(final.runtime??null,installed.runtime??null)||!same(final.pending??null,installed.pending??null)||!same(final.receipt??null,installed.receipt??null)||!same(final.schema??null,installed.schema??null)||digest(JSON.stringify(final.history))!==digest(JSON.stringify(installed.history)))throw failure();}else await emptyTarget(input, projectRef);
    await workdirs(root, work, plan); if (!same(await toolchain(root, input.sha, treeSha), manifest) || !(await file(root, toolchainManifestPath, 48 * 1024)).equals(Buffer.from(manifestBytes)) || !(await file(root, operatorStoragePolicyPath, 8192)).equals(Buffer.from(policy.canonicalJson)) || !same(await artifact(root, apiRoot, builtApi, 'api'), api) || !same(await artifact(root, edgeRoot, builtEdge, 'cuevo-worker'), edge)) throw failure();
    const confirmedRecovery=await recoveryCompletion(input,projectRef,event.inputs.scope,plan,migrationEndpoint);if(!same(confirmedRecovery??null,recovery??null))throw failure();
    if(!same((await readHostedMigrationProvider({projectRef,boundProjectRef:projectRef,providerToken:input.providerToken})).sessionEndpoint,migrationEndpoint))throw failure();
    stage='package-encoding-and-persistence';
    const expected: BackendReleaseExpected = { ...trial, ...finalAuthority, now: Date.now(), fingerprints: { sourceManifestSha256, diffSha256, migrationPlanSha256: canonicalHostedMigrationPlan(plan).sha256, migrationHistorySha256: plan.observedHistorySha256, migrationToolchainSha256: digest(manifestBytes),migrationEndpointSha256:digest(canonicalReleaseExecutionJson(migrationEndpoint)), operatorStoragePolicySha256: policy.sha256, apiArtifactSha256: api.sha256, edgeArtifactSha256: edge.sha256, denoLockSha256: edge.denoLockSha256! } }, preparedApproval = prepareBackendReleaseIntent(intent(expected), expected);
    let pendingActivationEvidence:PreparedNativeBackendRelease['pendingActivationEvidence'];if(pendingEvidence){const exportPath=join(root,'.local/hosted-release/worker-activation-execution-export.json'),selectionPath=join(root,'.local/hosted-release/pending-activation-selection.json'),exportBytes=canonicalReleaseExecutionJson(pendingEvidence.envelope),selectionBytes=canonicalReleaseExecutionJson(pendingSelection);await persist(root,exportPath,exportBytes);await persist(root,selectionPath,selectionBytes);pendingActivationEvidence={exportPath,exportSha256:digest(exportBytes),selectionPath,selectionSha256:digest(selectionBytes)};}
    const bundle = { version: 1 as const, purpose: 'CUEVO_BACKEND_RELEASE_EXECUTION' as const, repoRoot: root, expected, preparedApproval, plan,migrationEndpoint, stages: work.stages, toolchainManifestPath, operatorStoragePolicyPath, artifacts: { apiRoot, edgeRoot },...(pendingActivationEvidence?{pendingActivationEvidence}:{}),...(recovery?{schemaRecoveryExport:recovery.exported,...(recovery.selection?{schemaRecoverySelection:recovery.selection}:{})}:{}) }, bytes = canonicalReleaseExecutionJson(bundle); parseReleaseExecutionJson(bytes);
    if (bytes.includes(input.githubToken) || bytes.includes(input.providerToken)) throw failure();
    await readBackendReleaseSourceEvidence(root, source as Parameters<typeof readBackendReleaseSourceEvidence>[1]);
    await persist(root, bundlePath, bytes); return { ...bundle, bundlePath, bundleSha256: digest(bytes) };
  } catch { console.error('Backend preparation failed at '+stage+'; private contents withheld.'); throw failure(); }
}
