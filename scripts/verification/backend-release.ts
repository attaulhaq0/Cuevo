import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { prepareNativeBackendRelease } from './backend-release-prepare';
import { readBackendReleaseAdmission } from './backend-release-admission';
import { validatePreparedBackendReleaseIntent } from './backend-release-contracts';
import { parseCanonicalReleaseReviewJson, parseReleaseExecutionJson } from './release-review';
import { createHostedOperatorStorageBootstrap } from '../database/hosted-operator-storage-bootstrap';
import { executeNativeHostedMigrations } from '../database/hosted-migration-executor';
import { seedHostedSyntheticPopulation } from '../database/hosted-synthetic-population';
import { provisionHostedSyntheticAuth } from '../database/hosted-synthetic-auth';
import { createHostedMigrationDatabase } from '../database/hosted-migration-database';
import { deployBackendProviders } from './backend-provider-deploy';
import { verifyHostedBackendPrerequisites } from './backend-hosted-verification';
import { verifyHostedPrivateAccess } from './backend-hosted-private';
import { activateHostedWorker } from './backend-hosted-activation';
import {hostedMigrationEndpointSchema} from '../database/hosted-migration-provider';
import {canonicalReleaseExecutionJson} from './release-review';

const failure = () => Error('Backend release step requires review; private contents withheld.');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const bundleSchema = z.object({ version: z.literal(1), purpose: z.literal('CUEVO_BACKEND_RELEASE_EXECUTION'), repoRoot: z.string(), expected: z.unknown(), preparedApproval: z.unknown(), plan: z.unknown(),migrationEndpoint:hostedMigrationEndpointSchema, stages: z.array(z.unknown()).max(4), toolchainManifestPath: z.string(), operatorStoragePolicyPath: z.string(), artifacts: z.object({ apiRoot: z.string(), edgeRoot: z.string() }).strict() }).strict();
const privateNames = ['CUEVO_MIGRATION_DATABASE_PASSWORD', 'CUEVO_DATABASE_TLS_CA', 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY', 'CUEVO_AUTH_PROVISIONING_KEY', 'CUEVO_SYNTHETIC_PILOT_PASSWORD', 'VERCEL_TOKEN'];
function required(env: Record<string, string | undefined>, key: string) { const value = env[key]; if (!value?.trim()) throw failure(); return value; }
async function ownedFile(root: string, path: string, maxBytes: number) {
  if (!isAbsolute(path) || resolve(path) !== path || await realpath(root) !== root) throw failure();
  const part = relative(root, path); if (!part || isAbsolute(part) || part.split(/[\\/]/).some(piece => !piece || piece === '.' || piece === '..')) throw failure();
  let current = root;
  for (const [index, piece] of part.split(/[\\/]/).entries()) { current = join(current, piece); const stat = await lstat(current); if (stat.isSymbolicLink() || await realpath(current) !== current || (index === part.split(/[\\/]/).length - 1 ? !stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes : !stat.isDirectory())) throw failure(); }
  const before = await lstat(path), bytes = await readFile(path), after = await lstat(path);
  if (bytes.length > maxBytes || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw failure();
  return bytes;
}
async function record(root: string, filename: string, value: unknown) {
  const path = join(root, '.local/hosted-release', filename), handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
/** The workflow owns credential recipients; native owners recheck current official
 * source/approval and provider state before their original operations. */
export async function runBackendReleasePhase({ mode, repoRoot, env }: { mode: 'prepare' | 'approval' | 'bootstrap-schema' | 'provision' | 'deploy' | 'verify' | 'verify-private' | 'activate'; repoRoot: string; env: Record<string, string | undefined> }) {
  try {
    if (!isAbsolute(repoRoot) || resolve(repoRoot) !== repoRoot || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw failure();
    if (mode === 'prepare') {
      if (privateNames.some(key => !!env[key])) throw failure();
      const result = await prepareNativeBackendRelease({ repoRoot, eventPath: required(env, 'GITHUB_EVENT_PATH'), repository: required(env, 'GITHUB_REPOSITORY'), sha: required(env, 'GITHUB_SHA'), ref: required(env, 'GITHUB_REF'), eventName: required(env, 'GITHUB_EVENT_NAME'), runId: required(env, 'GITHUB_RUN_ID'), runAttempt: Number(required(env, 'GITHUB_RUN_ATTEMPT')), githubToken: required(env, 'GH_TOKEN'), providerToken: required(env, 'SUPABASE_ACCESS_TOKEN'), input: parseCanonicalReleaseReviewJson(required(env, 'CUEVO_BACKEND_RELEASE_INPUT_JSON')) });
      await writeFile(required(env, 'GITHUB_OUTPUT'), `bundle-path=${result.bundlePath}\nbundle-sha256=${result.bundleSha256}\n`, { flag: 'a' });
      await writeFile(required(env, 'GITHUB_STEP_SUMMARY'), `## Cuevo backend schema package\n\nPrepared source and artifacts; no schema, accounts, worker or deployment changed.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(result.preparedApproval.canonicalJson), null, 2)}\n\`\`\`\n\nTo admit this exact schema package, use this comment when approving **staging**:\n\n\`${result.preparedApproval.comment}\`\n`, { flag: 'a' });
      return { status: 'PREPARED_ONLY' as const, hostedAcceptance: false };
    }
    const bundlePath = required(env, 'CUEVO_BACKEND_BUNDLE_PATH');
    if (bundlePath !== join(repoRoot, '.local/hosted-release/backend-bundle.json')) throw failure();
    const bytes = await ownedFile(repoRoot, bundlePath, 1024 * 1024);
    if (digest(bytes) !== required(env, 'CUEVO_BACKEND_BUNDLE_SHA256')) throw failure();
    const bundle = bundleSchema.parse(parseReleaseExecutionJson(new TextDecoder('utf8', { fatal: true }).decode(bytes)));
    const identity = z.object({ repository: z.literal(required(env, 'GITHUB_REPOSITORY')), releaseSha: z.literal(required(env, 'GITHUB_SHA')), releaseRunId: z.literal(required(env, 'GITHUB_RUN_ID')), runAttempt: z.literal(Number(required(env, 'GITHUB_RUN_ATTEMPT'))), environmentName: z.literal('staging'), deploymentEnvironment: z.literal('synthetic-staging') }).parse(bundle.expected);
    if (bundle.repoRoot !== repoRoot || identity.runAttempt < 1) throw failure();
    const endpoint=bundle.migrationEndpoint;
    const endpointFingerprint=z.object({fingerprints:z.object({migrationEndpointSha256:z.literal(digest(canonicalReleaseExecutionJson(endpoint)))})}).parse(bundle.expected);if(!endpointFingerprint)throw failure();
    validatePreparedBackendReleaseIntent(bundle.preparedApproval, { ...bundle.expected as object, now: Date.now() });
    const shared = { repoRoot, expected: bundle.expected, preparedApproval: bundle.preparedApproval, githubToken: required(env, 'GH_TOKEN') };
    await readBackendReleaseAdmission({ repoRoot, expected: bundle.expected, prepared: bundle.preparedApproval, githubToken: shared.githubToken });
    if (mode === 'approval') return { status: 'ADMITTED' as const, hostedAcceptance: false };
    if(mode==='verify'||mode==='verify-private'||mode==='activate'){
      if(mode==='verify-private')z.object({status:z.literal('PREREQUISITES_OBSERVED'),apiReady:z.literal(true),roleSessions:z.literal(5),crossSchoolDenied:z.literal(true),worker:z.object({missingSignatureDenied:z.literal(true),malformedSignatureDenied:z.literal(true),staleSignatureDenied:z.literal(true)})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/prerequisites-result.json'),48*1024)).toString('utf8')));
      const runtimeConfig=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-private.json'),192*1024)).toString('utf8'));
      const provider=z.object({status:z.literal('DEPLOYED_INACTIVE'),api:z.object({url:z.string().url(),deploymentId:z.string().startsWith('dpl_')}),edge:z.object({id:z.string(),version:z.number().int().positive()})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/provider-result.json'),48*1024)).toString('utf8')));
      if(mode==='activate'){
        const prerequisitesReceipt=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/prerequisites-result.json'),48*1024)).toString('utf8'));
        const privateReceipt=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/private-access-result.json'),48*1024)).toString('utf8'));
        z.object({status:z.literal('PREREQUISITES_OBSERVED'),apiReady:z.literal(true),roleSessions:z.literal(5),crossSchoolDenied:z.literal(true)}).parse(prerequisitesReceipt);
        z.object({status:z.literal('PRIVATE_PROBES_CONFIRMED'),sessionsClosed:z.literal(true),restrictedDatabaseGrants:z.literal(true),privateStorage:z.literal(true),privateRealtime:z.literal(true)}).parse(privateReceipt);
        const configuration=z.object({sourceSha:z.literal(identity.releaseSha),dataApi:z.literal('DISABLED'),observer:z.string().min(1),status:z.literal('OBSERVED_PROVIDER_UI'),visibleText:z.literal('Data API is disabled'),observedAt:z.iso.datetime({offset:true}),projectRef:z.literal(endpoint.projectRef),source:z.literal(`https://supabase.com/dashboard/project/${endpoint.projectRef}/integrations/data_api/settings`)}).strict().parse(parseCanonicalReleaseReviewJson(required(env,'CUEVO_DATA_API_CONFIGURATION_EVIDENCE_JSON')));
        if(Date.parse(configuration.observedAt)>Date.now()||Date.now()-Date.parse(configuration.observedAt)>3600000)throw failure();
        const configurationPath=join(repoRoot,'.local/hosted-release/data-api-configuration.json');await record(repoRoot,'data-api-configuration.json',configuration);
        const configurationBytes=await ownedFile(repoRoot,configurationPath,16384);
        const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
        const result=await activateHostedWorker({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,apiDeployment:{url:provider.api.url,id:provider.api.deploymentId},edgeDeployment:{id:provider.edge.id,version:provider.edge.version},syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),prerequisitesReceipt,privateReceipt,dataApiConfigurationEvidence:{source:'AUTHENTICATED_DASHBOARD',enabled:false,projectRef:configuration.projectRef,url:configuration.source,artifactPath:configurationPath,evidenceSha256:digest(configurationBytes),observedAt:configuration.observedAt}});
        if(result.status!=='ACTIVATED_SIGNED_SOURCE_VERIFIED'||result.sourceProcessed!==true||result.duplicateWakeDenied!==true||result.originalCommandReplayed!==true||result.recoveryScheduled!==true||result.scheduledRecoveryVerified!==true||result.sessionsClosed!==true||!result.canonicalReceipt)throw failure();
        return result;
      }
      if(mode==='verify-private'){
        const result=await verifyHostedPrivateAccess({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,apiDeployment:{url:provider.api.url,id:provider.api.deploymentId},syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD')});await record(repoRoot,'private-access-result.json',result);if(result.status!=='PRIVATE_PROBES_CONFIRMED'||result.restrictedDatabaseGrants!==true||result.privateStorage!==true||result.privateRealtime!==true||result.sessionsClosed!==true)throw failure();return result;
      }
      const result=await verifyHostedBackendPrerequisites({repoRoot,expected:bundle.expected,preparedApproval:bundle.preparedApproval,githubToken:shared.githubToken,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,apiDeployment:{url:provider.api.url,id:provider.api.deploymentId},edgeDeployment:{id:provider.edge.id,version:provider.edge.version},syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD')});await record(repoRoot,'prerequisites-result.json',result);if(result.status!=='PREREQUISITES_OBSERVED')throw failure();return result;
    }
    // Validate every needed input before the first provider mutation.
    const migrationPassword = required(env, 'CUEVO_MIGRATION_DATABASE_PASSWORD'), journalStorageKey = required(env, 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'), providerToken = required(env, 'SUPABASE_ACCESS_TOKEN'), ca = required(env, 'CUEVO_DATABASE_TLS_CA');
    if (!ca.includes('-----BEGIN CERTIFICATE-----') || Buffer.byteLength(ca) > 512 * 1024) throw failure();
    const certificatePath = join(repoRoot, '.local/hosted-release/database-ca.pem');
    if(mode==='deploy'){
      z.object({status:z.literal('CONFIRMED'),apiLogin:z.literal(true),workerLogin:z.literal(true)}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-roles-result.json'),8192)).toString('utf8')));
      z.object({status:z.literal('CONFIRMED'),cleanup:z.literal('RELEASED')}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/reference-result.json'),8192)).toString('utf8')));
      const passwords=z.object({purpose:z.literal('INITIAL_RESTRICTED_RUNTIME_CREDENTIALS'),sourceSha:z.literal(identity.releaseSha),projectRef:z.string().regex(/^[a-z]{20}$/),api:z.string().regex(/^[a-f0-9]{64}$/),worker:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-role-passwords.json'),8192)).toString('utf8')));
      const targets=z.object({targets:z.object({web:z.object({origin:z.string()}),supabase:z.object({projectRef:z.literal(passwords.projectRef)})})}).parse(bundle.expected),projectRef=passwords.projectRef,webOrigin=targets.targets.web.origin,authOrigin=`https://${projectRef}.supabase.co`;
      const response=await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,{headers:{Authorization:'Bearer '+providerToken},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw failure();
      const keys=z.array(z.object({name:z.string(),type:z.string(),api_key:z.string()}).passthrough()).max(50).parse(await response.json());
      const publishable=keys.filter(key=>key.type==='publishable'&&key.name==='default'),storage=keys.filter(key=>key.type==='secret'&&key.name==='default');if(publishable.length!==1||storage.length!==1||storage[0].api_key===journalStorageKey)throw failure();
      const url=(role:string,password:string)=>{const db=new URL(`postgresql://${endpoint.kind==='session-pooler'?role+'.'+projectRef:role}@${endpoint.host}:5432/postgres`);db.password=password;return db.toString();};
      const common={NODE_ENV:'production',CUEVO_DEPLOYMENT_ENVIRONMENT:'synthetic-staging',CUEVO_SYNTHETIC_PROJECT_REF:projectRef,CUEVO_SYNTHETIC_WEB_ORIGIN:webOrigin,SUPABASE_URL:authOrigin,POSTHOG_CAPTURE_MODE:'DISABLED'};
      const runtimeConfig={version:1,purpose:'CUEVO_HOSTED_RUNTIME_CONFIGURATION',sourceSha:identity.releaseSha,projectRef,webOrigin,api:{...common,DATABASE_URL:url('cuevo_api',passwords.api),CUEVO_DATABASE_TLS_CA:ca,SUPABASE_PUBLISHABLE_KEY:publishable[0].api_key,SUPABASE_SERVICE_ROLE_KEY:storage[0].api_key,API_ALLOWED_ORIGIN:webOrigin,AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'},edge:{...common,CUEVO_WORKER_DATABASE_URL:url('cuevo_worker',passwords.worker),CUEVO_WORKER_TLS_CA:ca,CUEVO_WORKER_EXECUTION_MODE:'synthetic-staging',CUEVO_WORKER_WAKE_KEY:''}};
      const handle=await open(join(repoRoot,'.local/hosted-release/runtime-private.json'),'wx',0o600);try{await handle.writeFile(JSON.stringify(runtimeConfig));await handle.sync();}finally{await handle.close();}
      const deployed=await deployBackendProviders({repoRoot,expected:bundle.expected as Parameters<typeof deployBackendProviders>[0]['expected'],preparedApproval:bundle.preparedApproval as Parameters<typeof deployBackendProviders>[0]['preparedApproval'],apiArtifactRoot:bundle.artifacts.apiRoot,edgeArtifactRoot:bundle.artifacts.edgeRoot,vercelToken:required(env,'VERCEL_TOKEN'),providerToken,githubToken:shared.githubToken,runtimeConfig});await record(repoRoot,'provider-result.json',deployed);if(deployed.status!=='DEPLOYED_INACTIVE')throw failure();return deployed;
    }
    if (mode === 'provision') {
      const syntheticPassword = required(env, 'CUEVO_SYNTHETIC_PILOT_PASSWORD');
      if(syntheticPassword.length<16||syntheticPassword.length>128||[...syntheticPassword].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))throw failure();
      const schemaBytes = await ownedFile(repoRoot, join(repoRoot, '.local/hosted-release/schema-result.json'), 1024 * 1024);
      z.object({ status: z.enum(['COMMITTED', 'NOOP']) }).parse(JSON.parse(schemaBytes.toString('utf8')));
      const certificate = { path: certificatePath, sha256: digest(ca) };
      const finalStage = bundle.stages.at(-1);
      const population = await seedHostedSyntheticPopulation({ ...shared, providerToken, journalStorageKey, migrationPassword, certificate, plan: bundle.plan,endpoint, finalStage, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath });
      await record(repoRoot, 'population-result.json', population);
      if (!['POPULATED_CONFIRMED', 'NOOP'].includes(population.status)) throw failure();
      // This operator-only key serves private release receipts and initial Auth
      // provisioning. It is never sent to deployed browser/API/worker recipients.
      const privatePath = join(repoRoot, '.local/hosted-release/synthetic-access.json');
      const privateHandle = await open(privatePath, 'wx', 0o600);
      try { await privateHandle.writeFile(JSON.stringify({ purpose: 'SYNTHETIC_PILOT_ACCESS', sourceSha: identity.releaseSha, syntheticPassword })); await privateHandle.sync(); } finally { await privateHandle.close(); }
      const auth = await provisionHostedSyntheticAuth({ ...shared, providerToken, migrationPassword, certificate, plan: bundle.plan,endpoint, finalStage, authProvisioningKey: journalStorageKey, syntheticPassword, originalKey: 'cuevo-initial-hosted-synthetic-auth' });
      await record(repoRoot, 'auth-result.json', auth);
      if (auth.status !== 'CONFIRMED') throw failure();
      const target = z.object({ targets: z.object({ supabase: z.object({ projectRef: z.string().regex(/^[a-z]{20}$/) }) }) }).parse(bundle.expected);
      const projectRef = target.targets.supabase.projectRef;
      const runtimePasswords={api:randomBytes(32).toString('hex'),worker:randomBytes(32).toString('hex')};
      const runtimePasswordHandle=await open(join(repoRoot,'.local/hosted-release/runtime-role-passwords.json'),'wx',0o600);
      try{await runtimePasswordHandle.writeFile(JSON.stringify({purpose:'INITIAL_RESTRICTED_RUNTIME_CREDENTIALS',sourceSha:identity.releaseSha,projectRef,...runtimePasswords}));await runtimePasswordHandle.sync();}finally{await runtimePasswordHandle.close();}
      const database = await createHostedMigrationDatabase({repoRoot,projectRef,databaseUrl:`postgresql://${endpoint.kind==='session-pooler'?'postgres.'+projectRef:'postgres'}@${endpoint.host}:5432/postgres?sslmode=verify-full`,certificate,password:migrationPassword});
      const referenceState: {status:'CONFIRMED'|'REQUIRES_REVIEW'} = {status:'REQUIRES_REVIEW'};
      const reference = await database.withLock(`${projectRef}:HOSTED_SCHEMA_MIGRATION`, async () => {
        await readBackendReleaseAdmission({repoRoot,expected:bundle.expected,prepared:bundle.preparedApproval,githubToken:shared.githubToken});
        const roles=await database.provisionInitialRuntimeRoles({apiPassword64hex:runtimePasswords.api,workerPassword64hex:runtimePasswords.worker});
        await record(repoRoot,'runtime-roles-result.json',roles);if(roles.status!=='CONFIRMED'||!roles.apiLogin||!roles.workerLogin)throw failure();
        await database.executeReferenceScenarioSource(); referenceState.status='CONFIRMED';
      });
      await record(repoRoot, 'reference-result.json', {status:referenceState.status,cleanup:reference.kind,hostedAcceptance:false});
      if(referenceState.status!=='CONFIRMED'||reference.kind!=='RELEASED')throw failure();
      return auth;
    }
    await mkdir(join(repoRoot, '.local/hosted-release'), { recursive: true });
    const certificateHandle = await open(certificatePath, 'wx', 0o600);
    try { await certificateHandle.writeFile(ca); await certificateHandle.sync(); } finally { await certificateHandle.close(); }
    const bootstrap = await createHostedOperatorStorageBootstrap({ ...shared, providerToken, journalStorageKey, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath });
    const bucket = await bootstrap.bootstrap(); await record(repoRoot, 'bucket-result.json', bucket);
    if (bucket.status === 'REQUIRES_REVIEW') throw failure();
    const toolchainKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ'];
    const toolchain = Object.fromEntries(toolchainKeys.filter(key => env[key] !== undefined).map(key => [key, env[key]!]));
    const result = await executeNativeHostedMigrations({ ...shared, providerToken, journalStorageKey, migrationPassword, plan: bundle.plan,endpoint, stages: bundle.stages, certificate: { path: certificatePath, sha256: digest(ca) }, toolchainManifestPath: bundle.toolchainManifestPath, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath, toolchain });
    await record(repoRoot, 'schema-result.json', result);
    if (!['COMMITTED', 'NOOP'].includes(result.status)) throw failure();
    return result;
  } catch { throw failure(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2];
  if (!['prepare', 'approval', 'bootstrap-schema', 'provision','deploy','verify','verify-private','activate'].includes(mode)) throw failure();
  try { const result = await runBackendReleasePhase({ mode: mode as 'prepare' | 'approval' | 'bootstrap-schema' | 'provision'|'deploy'|'verify'|'verify-private'|'activate', repoRoot: process.cwd(), env: process.env }); console.log(JSON.stringify({ step: mode, status: result.status, hostedAcceptance: false })); }
  catch { console.error('Cuevo backend step requires review. Inspect retained source-bound receipts; private contents withheld.'); process.exitCode = 1; }
}
