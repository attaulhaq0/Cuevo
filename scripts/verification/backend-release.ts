import {validateSchemaRecoveryCompletionExport} from './backend-schema-completion-admission';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { prepareNativeBackendRelease } from './backend-release-prepare';
import { readBackendReleaseAdmission } from './backend-release-admission';
import { validatePreparedBackendReleaseIntent,readBackendRuntimeFingerprints } from './backend-release-contracts';
import {backendReleaseExecutionSchema,validateBackendReleaseDelivery} from './backend-release-delivery';
import {rolloutHostedRuntime} from './backend-runtime-rollout';
import {initializeHostedRuntimeGeneration} from './backend-runtime-initialize';
import {exportRuntimeRolloutRecovery} from './backend-runtime-recovery-export';
import {readOriginalRuntimeRecoveryAdmission,originalRuntimeRecoverySelectionSchema} from './backend-runtime-recovery-admission';
import { parseCanonicalReleaseReviewJson, parseReleaseExecutionJson } from './release-review';
import { createHostedOperatorStorageBootstrap } from '../database/hosted-operator-storage-bootstrap';
import { executeNativeHostedMigrations,executeNativeHostedMigrationStage } from '../database/hosted-migration-executor';
import { seedHostedSyntheticPopulation } from '../database/hosted-synthetic-population';
import { provisionHostedSyntheticAuth } from '../database/hosted-synthetic-auth';
import { createHostedMigrationDatabase } from '../database/hosted-migration-database';
import { deployBackendProviders } from './backend-provider-deploy';
import { verifyHostedBackendPrerequisites } from './backend-hosted-verification';
import { verifyHostedPrivateAccess } from './backend-hosted-private';
import { activateHostedWorker } from './backend-hosted-activation';
import {verifyNativeWorkerFaultRecovery} from './backend-hosted-fault-recovery-native';
import {prepareBackendWebHandover,prepareOperatingStagingHandoff} from './backend-web-handover';
import {verifyNativeHostedDatabaseRestore} from './backend-hosted-database-restore';
import {bindBackendApiOrigin,observeBackendApiOrigin} from './backend-api-origin';
import {configureBackendWebSettings} from './backend-web-settings';
import {exportBackendWebTransfer} from './backend-web-transfer';
import {canonicalReleaseExecutionJson} from './release-review';
import {readActiveRuntimeConfiguration,readCurrentRuntimeConfiguration,revalidateActiveRuntime,revalidateCurrentRuntime} from './backend-runtime-resume';
import {createBackendPreviewTransport} from './backend-preview-transport';
import {exportOriginalWorkerActivationExecution} from './backend-hosted-activation-export';
import {confirmPendingHostedWorkerActivation} from './backend-hosted-activation-confirmation';
import {canonicalHostedMigrationPlan,readCanonicalMigrationSources,type HostedMigrationPlanV1} from '../database/hosted-migration-plan';
import {validateOriginalWorkerActivationExecutionExport} from './backend-hosted-activation-export-contracts';

const failure = () => Error('Backend release step requires review; private contents withheld.');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const bundleSchema=backendReleaseExecutionSchema;
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
async function record(root: string, filename: string, value: unknown, canonical = false) {
  const path = join(root, '.local/hosted-release', filename), handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(canonical ? canonicalReleaseExecutionJson(value) : JSON.stringify(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
}
/** The workflow owns credential recipients; native owners recheck current official
 * source/approval and provider state before their original operations. */
export async function runBackendReleasePhase({ mode, repoRoot, env }: { mode: 'prepare' | 'approval' | 'bootstrap-schema' | 'reconcile-prefix' | 'export-schema-completion' | 'provision' | 'deploy' | 'resume-runtime' | 'export-activation-execution' | 'confirm-pending-activation' | 'rollout-runtime' | 'initialize-runtime' | 'export-runtime-recovery' | 'verify' | 'verify-private' | 'activate' | 'verify-recovery' | 'verify-restore' | 'bind-api' | 'handover' | 'configure-web' | 'export-web-handover'; repoRoot: string; env: Record<string, string | undefined> }) {
  try {
    if (!['prepare','approval','bootstrap-schema','reconcile-prefix','export-schema-completion','provision','deploy','resume-runtime','export-activation-execution','confirm-pending-activation','rollout-runtime','initialize-runtime','export-runtime-recovery','verify','verify-private','activate','verify-recovery','verify-restore','bind-api','handover','configure-web','export-web-handover'].includes(mode)) throw failure();
    if (!isAbsolute(repoRoot) || resolve(repoRoot) !== repoRoot || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw failure();
    if (mode === 'prepare') {
      if (privateNames.some(key => !!env[key])) throw failure();
      const result = await prepareNativeBackendRelease({ repoRoot, eventPath: required(env, 'GITHUB_EVENT_PATH'), repository: required(env, 'GITHUB_REPOSITORY'), sha: required(env, 'GITHUB_SHA'), ref: required(env, 'GITHUB_REF'), eventName: required(env, 'GITHUB_EVENT_NAME'), runId: required(env, 'GITHUB_RUN_ID'), runAttempt: Number(required(env, 'GITHUB_RUN_ATTEMPT')), githubToken: required(env, 'GH_TOKEN'), providerToken: required(env, 'SUPABASE_ACCESS_TOKEN'), input: parseCanonicalReleaseReviewJson(required(env, 'CUEVO_BACKEND_RELEASE_INPUT_JSON')) });
      await writeFile(required(env, 'GITHUB_OUTPUT'), `bundle-path=${result.bundlePath}\nbundle-sha256=${result.bundleSha256}\n`, { flag: 'a' });
      await writeFile(required(env, 'GITHUB_STEP_SUMMARY'), `## Cuevo backend release package\n\nPrepared the exact source and phase delivery. Hosted changes begin only after the package is admitted.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(result.preparedApproval.canonicalJson), null, 2)}\n\`\`\`\n\nTo admit this exact schema package, use this comment when approving **staging**:\n\n\`${result.preparedApproval.comment}\`\n`, { flag: 'a' });
      return { status: 'PREPARED_ONLY' as const, hostedAcceptance: false };
    }
    const bundlePath = required(env, 'CUEVO_BACKEND_BUNDLE_PATH');
    if (bundlePath !== join(repoRoot, '.local/hosted-release/backend-bundle.json')) throw failure();
    const bytes = await ownedFile(repoRoot, bundlePath, 1024 * 1024);
    if (digest(bytes) !== required(env, 'CUEVO_BACKEND_BUNDLE_SHA256')) throw failure();
    const bundle = bundleSchema.parse(parseReleaseExecutionJson(new TextDecoder('utf8', { fatal: true }).decode(bytes)));
    // A focused database/account gate is never a provider deployment certificate.
    const scope = z.object({ stagingVerification: z.unknown().optional(), installedRuntime:z.unknown().optional(),currentRuntime:z.unknown().optional(), executionScope: z.enum(['schema-and-accounts', 'complete-backend','installed-runtime','reconcile-schema','pending-runtime-confirmation','runtime-rollout']).optional() }).parse(bundle.expected);
    const operating=z.object({handoff:z.enum(['operating-staging','customer-candidate']).optional()}).parse(bundle.expected).handoff==='operating-staging';
    const initialOrigin=mode==='bind-api'&&scope.executionScope==='complete-backend'&&operating;
    if(['bind-api','handover','configure-web','export-web-handover'].includes(mode)&&(bundle.version===2||scope.executionScope!==undefined)&&scope.executionScope!=='installed-runtime'&&!initialOrigin)throw failure();
    if(bundle.version===2){
      const initial=z.object({installedSource:z.unknown().optional(),installedSchema:z.unknown().optional()}).parse(bundle.expected);
      if(scope.executionScope==='complete-backend'&&(!operating||!initial.installedSource||initial.installedSchema)||scope.executionScope==='runtime-rollout'&&!operating||scope.executionScope==='installed-runtime'&&!operating&&!scope.currentRuntime)throw failure();
    }
    if(scope.executionScope==='runtime-rollout'&&!['approval','rollout-runtime','export-runtime-recovery'].includes(mode)||mode==='rollout-runtime'&&scope.executionScope!=='runtime-rollout')throw failure();
    const delivery=bundle.version===2?validateBackendReleaseDelivery(bundle.delivery,scope.executionScope??''):null;
    const deployedArtifacts=()=>{if(bundle.version===1)return bundle.artifacts;if(delivery?.kind!=='CI_RUNTIME_ARTIFACTS')throw failure();const expected=bundle.expected as import('./backend-release-contracts').BackendReleaseExpected,rollback=expected.runtimeRollout?.version===2&&expected.runtimeRollout.action==='ROLL_BACK',previous=bundle.runtimeRolloutEvidence?.previousRuntimeArtifacts;if(rollback){if(!previous||delivery.apiRoot!==previous.apiRoot||delivery.edgeRoot!==previous.edgeRoot)throw failure();}else if(delivery.apiRoot!==join(repoRoot,'.local/runtime-artifacts/api-vercel')||delivery.edgeRoot!==join(repoRoot,'.local/edge-artifacts/cuevo-worker'))throw failure();return{apiRoot:delivery.apiRoot,edgeRoot:delivery.edgeRoot};};
    if (scope.stagingVerification !== undefined && !['schema-and-accounts','reconcile-schema'].includes(scope.executionScope??'')) throw failure();
    if(scope.executionScope==='reconcile-schema'&&!['approval','reconcile-prefix','export-schema-completion'].includes(mode))throw failure();if(mode==='reconcile-prefix'&&scope.executionScope!=='reconcile-schema')throw failure();
    if ((scope.stagingVerification !== undefined || scope.executionScope === 'schema-and-accounts') && !['approval', 'bootstrap-schema', 'reconcile-prefix', 'export-schema-completion', 'provision'].includes(mode)) throw failure();
    if(scope.executionScope==='installed-runtime'&&(!(scope.installedRuntime||scope.currentRuntime)||!['approval','resume-runtime','verify','verify-private','verify-recovery','verify-restore','bind-api','handover','configure-web','export-web-handover'].includes(mode)))throw failure();
    if(mode==='resume-runtime'&&scope.executionScope!=='installed-runtime')throw failure();
    const identity = z.object({ repository: z.literal(required(env, 'GITHUB_REPOSITORY')), releaseSha: z.literal(required(env, 'GITHUB_SHA')), releaseRunId: z.literal(required(env, 'GITHUB_RUN_ID')), runAttempt: z.literal(Number(required(env, 'GITHUB_RUN_ATTEMPT'))), environmentName: z.literal('staging'), deploymentEnvironment: z.literal('synthetic-staging') }).parse(bundle.expected);
    if (bundle.repoRoot !== repoRoot || identity.runAttempt < 1) throw failure();
    if(mode==='export-activation-execution'){if(scope.executionScope!=='complete-backend'||privateNames.some(key=>!!env[key])||env.GH_TOKEN||env.SUPABASE_ACCESS_TOKEN)throw failure();return exportOriginalWorkerActivationExecution({repoRoot,bundlePath,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),repository:identity.repository,sourceSha:identity.releaseSha,runId:identity.releaseRunId,runAttempt:identity.runAttempt});}
    if(mode==='export-runtime-recovery'){if(scope.executionScope!=='runtime-rollout'||privateNames.some(key=>!!env[key])||env.GH_TOKEN||env.SUPABASE_ACCESS_TOKEN)throw failure();return exportRuntimeRolloutRecovery({repoRoot,bundlePath,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),publicStatePath:join(repoRoot,'.local/hosted-release/runtime-rollout-public-state.json')});}
    if(scope.executionScope==='pending-runtime-confirmation'&&!['approval','confirm-pending-activation'].includes(mode)||mode==='confirm-pending-activation'&&scope.executionScope!=='pending-runtime-confirmation')throw failure();
    const endpoint=bundle.migrationEndpoint;
    const endpointFingerprint=z.object({fingerprints:z.object({migrationEndpointSha256:z.literal(digest(canonicalReleaseExecutionJson(endpoint)))})}).parse(bundle.expected);if(!endpointFingerprint)throw failure();
    validatePreparedBackendReleaseIntent(bundle.preparedApproval, { ...bundle.expected as object, now: Date.now() });
    if(mode==='export-schema-completion'){
      if(scope.executionScope!=='reconcile-schema'||privateNames.some(key=>!!env[key])||env.GH_TOKEN||env.SUPABASE_ACCESS_TOKEN)throw failure();
      const result=z.object({status:z.literal('COMMITTED'),recoveryCompletion:z.unknown(),protocol:z.object({status:z.literal('COMMITTED'),commitment:z.literal('CONFIRMED'),primaryCode:z.null(),journalCode:z.null(),cleanupCode:z.null()})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/schema-result.json'),1024*1024)).toString('utf8')));
      const envelope={version:1,purpose:'CUEVO_BACKEND_SCHEMA_RECOVERY_COMPLETION_EXPORT',completion:result.recoveryCompletion,preparedApproval:bundle.preparedApproval,originalExpected:bundle.expected};
      validateSchemaRecoveryCompletionExport(envelope,Date.now());await record(repoRoot,'schema-recovery-completion.json',envelope,true);return{status:'RECOVERY_COMPLETION_EXPORTED',hostedAcceptance:false};
    }
    const shared = { repoRoot, expected: bundle.expected, preparedApproval: bundle.preparedApproval, githubToken: required(env, 'GH_TOKEN') };
    const recoveryInputs={...(bundle.schemaRecoveryExport?{schemaRecoveryExport:bundle.schemaRecoveryExport}:{}),...(bundle.schemaRecoverySelection?{schemaRecoverySelection:bundle.schemaRecoverySelection}:{})};
    const admitRecoveryConsumption=async(database:Awaited<ReturnType<typeof createHostedMigrationDatabase>>,consumption:'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER'):Promise<import('../database/hosted-migration-database').NativeSchemaRecoveryAction|undefined>=>{const expected=bundle.expected as import('./backend-release-contracts').BackendReleaseExpected;if(!expected.schemaRecovery)return undefined;if(!bundle.schemaRecoveryExport)throw failure();const permit=await database.admitSchemaContinuation({completionExport:bundle.schemaRecoveryExport,expected,prepared:bundle.preparedApproval,plan:bundle.plan,githubToken:shared.githubToken,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),storageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),consumption,...(bundle.schemaRecoverySelection?{selection:bundle.schemaRecoverySelection}:{})}),plan=bundle.plan as import('../database/hosted-migration-plan').HostedMigrationPlanV1,stage=bundle.stages.at(-1) as import('../database/hosted-migration-workdirs').HostedMigrationWorkdirs['stages'][number];return{permit,purpose:consumption,identity:{projectRef:endpoint.projectRef,sourceSha:expected.releaseSha,treeSha:expected.treeSha,planSha256:expected.fingerprints.migrationPlanSha256,stageId:'remaining',stageSha256:digest(JSON.stringify({included:plan.migrations,configSha256:stage.configSha256})),databaseUrl:`postgresql://${endpoint.kind==='session-pooler'?'postgres.'+endpoint.projectRef:'postgres'}@${endpoint.host}:5432/postgres?sslmode=verify-full`,approvalDigest:(bundle.preparedApproval as {sha256:string}).sha256,ciRunId:expected.ciRunId,certificateSha256:digest(required(env,'CUEVO_DATABASE_TLS_CA'))}};};
    await readBackendReleaseAdmission({ repoRoot, expected: bundle.expected, prepared: bundle.preparedApproval, githubToken: shared.githubToken, ...(scope.executionScope==='pending-runtime-confirmation'?{effectScope:'PENDING_RUNTIME_CONFIRMATION'}:scope.executionScope==='runtime-rollout'?{effectScope:'RUNTIME_ROLLOUT'}:['approval','bootstrap-schema','reconcile-prefix','export-schema-completion','provision'].includes(mode)?{effectScope:'SCHEMA_AND_SYNTHETIC_AUTH'}:{}) });
    if (mode === 'approval') return { status: 'ADMITTED' as const, hostedAcceptance: false };
    if(mode==='initialize-runtime'){
      if(scope.executionScope!=='complete-backend'||delivery?.kind!=='CI_RUNTIME_ARTIFACTS'||env.CUEVO_AUTH_PROVISIONING_KEY)throw failure();
      const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
      const ca=required(env,'CUEVO_DATABASE_TLS_CA'),certificatePath=join(repoRoot,'.local/hosted-release/ca.pem');try{await lstat(certificatePath);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();const file=await open(certificatePath,'wx',0o600);try{await file.writeFile(ca);await file.sync();}finally{await file.close();}}if(digest(await ownedFile(repoRoot,certificatePath,512*1024))!==digest(ca))throw failure();
      const runtimeConfig=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-private.json'),192*1024)).toString('utf8'));
      const result=await initializeHostedRuntimeGeneration({...shared,runtimeConfig,syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),operator:{databaseUrl:operator.toString(),password:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),certificate:{path:certificatePath,sha256:digest(ca)}}});await record(repoRoot,'runtime-initialization-result.json',result);if(result.status!=='INITIAL_RUNTIME_CONFIRMED'||!result.lockReleased||!result.sessionClosed||!result.operatingConfirmationSha256||!result.receiptSha256)throw failure();return result;
    }
    if(mode==='rollout-runtime'){
      if(!bundle.runtimeRolloutEvidence||delivery?.kind!=='CI_RUNTIME_ARTIFACTS'||scope.executionScope!=='runtime-rollout'||env.CUEVO_AUTH_PROVISIONING_KEY)throw failure();
      const expected=bundle.expected as import('./backend-release-contracts').BackendReleaseExpected,evidence=bundle.runtimeRolloutEvidence;
      if(expected.runtimeRollout?.version===2&&expected.runtimeRollout.action==='RECOVER_ORIGINAL'){
        const recovery=evidence.recoveryEvidence;if(!recovery||recovery.exportPath!==join(repoRoot,'.local/hosted-release/runtime-rollout-recovery.json')||recovery.selectionPath!==join(repoRoot,'.local/hosted-release/runtime-recovery-selection.json')||recovery.encryptedHistoryPath!==join(repoRoot,'.local/hosted-release/runtime-history-envelope-'+expected.runtimeRollout.operationSha256+'.json')||digest(await ownedFile(repoRoot,recovery.exportPath,512*1024))!==recovery.exportSha256||digest(await ownedFile(repoRoot,recovery.selectionPath,8192))!==recovery.selectionSha256||digest(await ownedFile(repoRoot,recovery.encryptedHistoryPath,49152))!==recovery.encryptedHistorySha256)throw failure();const selection=originalRuntimeRecoverySelectionSchema.parse(parseReleaseExecutionJson((await ownedFile(repoRoot,recovery.selectionPath,8192)).toString('utf8'))),original=await readOriginalRuntimeRecoveryAdmission({...selection,githubToken:shared.githubToken});if(original.jsonSha256!==recovery.exportSha256||original.operationSha256!==expected.runtimeRollout.operationSha256||original.pendingStateSha256!==expected.runtimeRollout.recoveryOriginal!.pendingStateSha256||original.envelope.encryptedHistorySha256!==expected.runtimeRollout.recoveryOriginal!.archiveSha256)throw failure();
      }
      if(evidence.compatibilityPath!==join(repoRoot,'.local/hosted-release/runtime-compatibility.json')||digest(await ownedFile(repoRoot,evidence.compatibilityPath,49152))!==evidence.compatibilitySha256||evidence.compatibilitySha256!==expected.runtimeRollout?.desired.compatibilitySha256)throw failure();
      const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
      const ca=required(env,'CUEVO_DATABASE_TLS_CA'),certificatePath=join(repoRoot,'.local/hosted-release/ca.pem');const file=await open(certificatePath,'wx',0o600);try{await file.writeFile(ca);await file.sync();}finally{await file.close();}
      const recovered=await readCurrentRuntimeConfiguration({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),operator:{databaseUrl:operator.toString(),password:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),certificate:{path:certificatePath,sha256:digest(ca)}}}),prior=z.object({sourceSha:z.string(),edge:z.record(z.string(),z.string())}).passthrough().parse(recovered.runtimeConfig),runtimeConfig=expected.runtimeRollout?.version===2&&expected.runtimeRollout.action==='RECOVER_ORIGINAL'?prior:{...prior,sourceSha:expected.runtimeRollout!.desired.sourceSha,edge:{...prior.edge,CUEVO_WORKER_RELEASE_GENERATION:expected.runtimeRollout!.desired.generation}};await record(repoRoot,'runtime-private.json',runtimeConfig);
      const certificateCopy=await open(join(repoRoot,'.local/hosted-release/database-ca.pem'),'wx',0o600);try{await certificateCopy.writeFile(ca);await certificateCopy.sync();}finally{await certificateCopy.close();}
      const result=await rolloutHostedRuntime({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),apiArtifactRoot:deployedArtifacts().apiRoot,edgeArtifactRoot:deployedArtifacts().edgeRoot,...(expected.runtimeRollout?.version===2&&expected.runtimeRollout.action==='ROLL_BACK'?{retainedArtifact:evidence.previousRuntimeArtifacts}:{}),compatibilityPath:evidence.compatibilityPath,compatibilitySha256:evidence.compatibilitySha256,journalStorageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),operator:{databaseUrl:operator.toString(),password:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),certificate:{path:certificatePath,sha256:digest(ca)}}});
      await record(repoRoot,'runtime-rollout-result.json',result);if(result.status!=='ROLLED_OUT_VERIFIED'||!result.lockReleased||!result.sessionClosed||!result.receiptSha256)throw failure();return result;
    }
    if(mode==='confirm-pending-activation'){
      if(!bundle.pendingActivationEvidence||env.CUEVO_SYNTHETIC_PILOT_PASSWORD||env.CUEVO_RELEASE_JOURNAL_STORAGE_KEY||env.CUEVO_AUTH_PROVISIONING_KEY)throw failure();const evidence=bundle.pendingActivationEvidence;if(evidence.exportPath!==join(repoRoot,'.local/hosted-release/worker-activation-execution-export.json')||evidence.selectionPath!==join(repoRoot,'.local/hosted-release/pending-activation-selection.json')||digest(await ownedFile(repoRoot,evidence.exportPath,256*1024))!==evidence.exportSha256||digest(await ownedFile(repoRoot,evidence.selectionPath,8192))!==evidence.selectionSha256)throw failure();
      const binding=(bundle.expected as import('./backend-release-contracts').BackendReleaseExpected).pendingRuntimeConfirmation;if(!binding||evidence.exportSha256!==binding.originalExportSha256)throw failure();const originalExport=validateOriginalWorkerActivationExecutionExport(JSON.parse((await ownedFile(repoRoot,evidence.exportPath,256*1024)).toString('utf8')),Date.now()),selection=z.object({repository:z.literal(identity.repository),sourceSha:z.literal(identity.releaseSha),originalRunId:z.literal(binding.original.runId),runAttempt:z.literal(binding.original.runAttempt),artifactId:z.literal(binding.originalArtifact.artifactId),exportJsonSha256:z.literal(binding.originalExportSha256)}).strict().parse(JSON.parse((await ownedFile(repoRoot,evidence.selectionPath,8192)).toString('utf8')));if(originalExport.originalExportSha256!==binding.originalExportSha256||originalExport.originalIdentityFileSha256!==binding.originalIdentityFileSha256||originalExport.originalActivationSha256!==binding.originalActivationSha256||originalExport.originalCleanupSha256!==binding.originalCleanupSha256||originalExport.originalIntentSha256!==binding.originalIntentSha256||originalExport.originalWakeKeySha256!==binding.originalWakeKeySha256||originalExport.originalRuntimeConfigurationSha256!==binding.originalRuntimeConfigurationSha256||!selection)throw failure();
      const expected=bundle.expected as import('./backend-release-contracts').BackendReleaseExpected,plan=bundle.plan as HostedMigrationPlanV1,sources=readCanonicalMigrationSources({repoRoot,sourceSha:expected.releaseSha,treeSha:expected.treeSha}).sources;if(!plan.runtimeOnly||plan.pending.length||plan.stages.some(stage=>stage.names.length)||plan.source.sha!==expected.releaseSha||plan.source.tree!==expected.treeSha||plan.projectRef!==endpoint.projectRef||canonicalHostedMigrationPlan(plan).sha256!==expected.fingerprints.migrationPlanSha256||plan.observedHistorySha256!==expected.fingerprints.migrationHistorySha256||plan.migrations.length!==sources.length||plan.migrations.some(row=>!sources.some(source=>source.name===row.name&&digest(source.bytes)===row.sha256))||plan.dispatch!=='DISABLED'||plan.seed!=='DISABLED'||plan.vault!=='DISABLED')throw failure();
      if(digest(await ownedFile(repoRoot,bundle.toolchainManifestPath,49152))!==expected.fingerprints.migrationToolchainSha256||digest(await ownedFile(repoRoot,bundle.operatorStoragePolicyPath,8192))!==expected.fingerprints.operatorStoragePolicySha256||bundle.stages.length!==4)throw failure();for(const stageValue of bundle.stages){const stage=z.object({included:z.array(z.object({name:z.string(),version:z.string(),sha256:z.string()})),pending:z.array(z.unknown()).length(0),workdir:z.string(),configSha256:z.string().regex(/^[a-f0-9]{64}$/),materialization:z.enum(['SQL_FILES','METADATA_ONLY']).optional()}).passthrough().parse(stageValue);if(canonicalReleaseExecutionJson(stage.included)!==canonicalReleaseExecutionJson(plan.migrations))throw failure();if(stage.materialization==='METADATA_ONLY'){try{await lstat(stage.workdir);throw failure();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw failure();}}else{if(digest(await ownedFile(repoRoot,join(stage.workdir,'supabase/config.toml'),8192))!==stage.configSha256)throw failure();for(const migration of stage.included)if(digest(await ownedFile(repoRoot,join(stage.workdir,'supabase/migrations',migration.name),2*1024*1024))!==migration.sha256)throw failure();}}
      if(bundle.version===1){const artifacts=deployedArtifacts(),fingerprints=readBackendRuntimeFingerprints(expected.fingerprints);for(const[artifactRoot,expectedHash]of [[artifacts.apiRoot,fingerprints.apiArtifactSha256],[artifacts.edgeRoot,fingerprints.edgeArtifactSha256]]){const raw=await ownedFile(repoRoot,join(artifactRoot,'artifact.json'),4*1024*1024),artifact=z.object({files:z.array(z.object({path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(20000)}).passthrough().parse(JSON.parse(raw.toString('utf8')));if(digest(JSON.stringify(artifact))!==expectedHash)throw failure();for(const entry of artifact.files){if(entry.path.split(/[\\/]/).some(piece=>!piece||piece==='.'||piece==='..')||digest(await ownedFile(repoRoot,join(artifactRoot,entry.path),32*1024*1024))!==entry.sha256)throw failure();}}}else if(delivery?.kind!=='RUNTIME_OBSERVATION'||delivery.apiArtifactSha256!==expected.fingerprints.apiArtifactSha256||delivery.edgeArtifactSha256!==expected.fingerprints.edgeArtifactSha256||delivery.denoLockSha256!==expected.fingerprints.denoLockSha256)throw failure();
      const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;const result=await confirmPendingHostedWorkerActivation({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),certificate:required(env,'CUEVO_DATABASE_TLS_CA')});await record(repoRoot,'worker-activation-reconciliation-result.json',{...result,canonicalReceipt:null},true);await record(repoRoot,'worker-activation-reconciliation-cleanup.json',{purpose:'CUEVO_WORKER_ACTIVATION_RECONCILIATION_CLEANUP',sourceSha:result.sourceSha,projectRef:result.projectRef,runId:result.runId,runAttempt:result.runAttempt,status:result.status,lockReleased:result.lockReleased,sessionClosed:result.sessionClosed,resultSha256:digest(canonicalReleaseExecutionJson({...result,canonicalReceipt:null})),observedAt:new Date().toISOString()},true);if(result.status!=='ORIGINAL_ACTIVATION_CONFIRMED'||!result.canonicalReceipt||!result.lockReleased||!result.sessionClosed||!result.original)throw failure();return result;
    }
    if(mode==='resume-runtime'){
      const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
      const ca=required(env,'CUEVO_DATABASE_TLS_CA');if(!ca.includes('-----BEGIN CERTIFICATE-----')||Buffer.byteLength(ca)>512*1024)throw failure();
      if(scope.currentRuntime){
        const path=join(repoRoot,'.local/hosted-release/database-ca.pem'),file=await open(path,'wx',0o600);try{await file.writeFile(ca);await file.sync();}finally{await file.close();}
        const native={...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),operator:{databaseUrl:operator.toString(),password:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),certificate:{path,sha256:digest(ca)}}},recovered=await readCurrentRuntimeConfiguration(native),proof=await revalidateCurrentRuntime({...native,vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig:recovered.runtimeConfig});if(proof.status!=='CURRENT_RUNTIME_REVALIDATED'||!proof.nativeExecutionVerified||!proof.lockReleased||!proof.sessionClosed||!proof.current)throw failure();
        await record(repoRoot,'runtime-private.json',recovered.runtimeConfig);await record(repoRoot,'runtime-resume-result.json',proof);const generation=proof.current.current;
        if(!proof.configurationObservation)throw failure();await record(repoRoot,'data-api-configuration.json',proof.configurationObservation.evidence);
        await record(repoRoot,'provider-result.json',{status:'DEPLOYED_ACTIVE_REVALIDATED',purpose:'CUEVO_BACKEND_PROVIDER_DEPLOYMENT',mutation:'NOT_ATTEMPTED',basis:'CURRENT_RUNTIME_REVALIDATION',api:{deploymentId:generation.apiDeploymentId,url:generation.apiUrl,artifactSha256:generation.apiArtifactSha256,metadataVerified:true,healthVerified:false},edge:{id:generation.edgeId,version:generation.edgeVersion,artifactSha256:generation.edgeArtifactSha256,denoLockSha256:generation.denoLockSha256,customAuthenticationVerified:false,state:'ACTIVE'},hostedAcceptance:false});
        const apiDeployment=z.object({id:z.string().regex(/^dpl_[A-Za-z0-9]+$/),url:z.string().url()}).strict().parse({id:generation.apiDeploymentId,url:generation.apiUrl});
        await createBackendPreviewTransport({repoRoot,expected:bundle.expected as Parameters<typeof createBackendPreviewTransport>[0]['expected'],prepared:bundle.preparedApproval as Parameters<typeof createBackendPreviewTransport>[0]['prepared'],apiDeployment,vercelToken:required(env,'VERCEL_TOKEN')},async()=>{await readBackendReleaseAdmission({repoRoot,expected:bundle.expected,prepared:bundle.preparedApproval,githubToken:shared.githubToken});});return proof;
      }
      const privateInputs={...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')};
      const recovered=await readActiveRuntimeConfiguration({...shared,operatorDatabaseUrl:operator.toString(),operatorPassword:privateInputs.operatorPassword,certificate:ca});
      const proof=await revalidateActiveRuntime({...privateInputs,runtimeConfig:recovered.runtimeConfig});if(proof.status!=='INSTALLED_RUNTIME_REVALIDATED'||!proof.nativeExecutionVerified||!proof.lockReleased||!proof.original)throw failure();
      await record(repoRoot,'runtime-private.json',recovered.runtimeConfig);const certificate=await open(join(repoRoot,'.local/hosted-release/database-ca.pem'),'wx',0o600);try{await certificate.writeFile(ca);await certificate.sync();}finally{await certificate.close();}
      // Keep original activation identity in its own receipt. Fresh verification
      // belongs to this package; it never becomes a new activation.
      if(!proof.configurationObservation)throw failure();await record(repoRoot,'data-api-configuration.json',proof.configurationObservation.evidence);
      await record(repoRoot,'runtime-resume-result.json',proof);
      await record(repoRoot,'provider-result.json',{status:'DEPLOYED_ACTIVE_REVALIDATED',purpose:'CUEVO_BACKEND_PROVIDER_DEPLOYMENT',mutation:'NOT_ATTEMPTED',basis:'ORIGINAL_ACTIVE_RUNTIME_REVALIDATION',api:{deploymentId:proof.original.apiDeploymentId,url:proof.original.apiUrl,artifactSha256:z.object({fingerprints:z.object({apiArtifactSha256:z.string()})}).parse(bundle.expected).fingerprints.apiArtifactSha256,metadataVerified:true,healthVerified:false},edge:{id:proof.original.edgeId,version:proof.original.edgeVersion,artifactSha256:z.object({fingerprints:z.object({edgeArtifactSha256:z.string()})}).parse(bundle.expected).fingerprints.edgeArtifactSha256,denoLockSha256:z.object({fingerprints:z.object({denoLockSha256:z.string()})}).parse(bundle.expected).fingerprints.denoLockSha256,customAuthenticationVerified:false,state:'ACTIVE'},hostedAcceptance:false});
      await createBackendPreviewTransport({repoRoot,expected:bundle.expected as Parameters<typeof createBackendPreviewTransport>[0]['expected'],prepared:bundle.preparedApproval as Parameters<typeof createBackendPreviewTransport>[0]['prepared'],apiDeployment:{id:proof.original.apiDeploymentId,url:proof.original.apiUrl},vercelToken:privateInputs.vercelToken},async()=>{await readBackendReleaseAdmission({repoRoot,expected:bundle.expected,prepared:bundle.preparedApproval,githubToken:shared.githubToken});});
      return proof;
    }
    if(mode==='export-web-handover'){
      const result=await exportBackendWebTransfer({repoRoot,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),githubToken:shared.githubToken,vercelToken:required(env,'VERCEL_TOKEN'),...(operating?{handoff:'operating-staging' as const,syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD')}:{}),...((z.object({installedSource:z.unknown().optional(),installedSchema:z.unknown().optional()}).parse(bundle.expected).installedSource??z.object({installedSchema:z.unknown().optional()}).parse(bundle.expected).installedSchema)?{installedOperator:{providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),journalStorageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),migrationPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')}}:{})});
      if(result.transferPath!==join(repoRoot,'.local/hosted-release/web-transfer.json')||!/^[a-f0-9]{64}$/.test(result.transferSha256)||!/^[a-f0-9]{64}$/.test(result.manifestSha256)||result.hostedAcceptance!==false)throw failure();
      await writeFile(required(env,'GITHUB_OUTPUT'),`transfer-sha256=${result.transferSha256}\nmanifest-sha256=${result.manifestSha256}\n`,{flag:'a'});
      return result;
    }
    if(mode==='handover'){
      if(operating){const result=await prepareOperatingStagingHandoff({repoRoot,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),githubToken:shared.githubToken,vercelToken:required(env,'VERCEL_TOKEN'),syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),installedOperator:{providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),journalStorageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),migrationPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')}});await record(repoRoot,'operating-handover-result.json',result);if(result.status!=='OPERATING_STAGING_PREPARED'||!result.handoffPath||!result.handoffSha256||!result.publicConfigurationPath)throw failure();return{...result,hostedAcceptance:false as const};}
      const state=z.object({installedSource:z.unknown().optional(),installedSchema:z.unknown().optional()}).parse(bundle.expected);void state;
      const result=await prepareBackendWebHandover({repoRoot,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),githubToken:shared.githubToken,vercelToken:required(env,'VERCEL_TOKEN'),installedOperator:{providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),journalStorageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),migrationPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')}});
      await record(repoRoot,'web-handover-result.json',result);
      if(result.status!=='PREPARED_STAGING_MANIFEST'||!result.manifestPath||!result.manifestSha256||!result.publicConfigurationPath)throw failure();
      return result;
    }
    if(mode==='configure-web'){
      const result=await configureBackendWebSettings({repoRoot,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),githubToken:shared.githubToken,vercelToken:required(env,'VERCEL_TOKEN'),...(operating?{handoff:'operating-staging' as const,syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD')}:{}),...((z.object({installedSource:z.unknown().optional(),installedSchema:z.unknown().optional()}).parse(bundle.expected).installedSource??z.object({installedSchema:z.unknown().optional()}).parse(bundle.expected).installedSchema)?{installedOperator:{providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),journalStorageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),migrationPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')}}:{})});
      if(result.status!=='WEB_PUBLIC_SETTINGS_CONFIRMED'||!result.canonicalReceipt||result.pendingGates.length)throw failure();
      return result;
    }
    if(mode==='bind-api'){
      const runtimeConfig=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release',operating&&scope.executionScope==='complete-backend'?'runtime-generation-private.json':'runtime-private.json'),192*1024)).toString('utf8'));
      const operator=new URL('postgresql://'+endpoint.host+':5432/postgres?sslmode=verify-full');operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
      if(scope.executionScope==='runtime-rollout'||scope.currentRuntime){
        const path=scope.currentRuntime?'runtime-resume-result.json':'runtime-rollout-result.json',saved=z.object({status:z.enum(['ROLLED_OUT_VERIFIED','CURRENT_RUNTIME_REVALIDATED']),current:z.object({current:z.object({apiDeploymentId:z.string(),apiUrl:z.string(),apiArtifactSha256:z.string()})})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release',path),49152)).toString('utf8'))).current.current;
        if(!operating){const state=await prepareBackendWebHandover({repoRoot,bundleSha256:required(env,'CUEVO_BACKEND_BUNDLE_SHA256'),githubToken:shared.githubToken,vercelToken:required(env,'VERCEL_TOKEN'),installedOperator:{providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),journalStorageKey:required(env,'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'),migrationPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')}});if(state.status!=='PREPARED_STAGING_MANIFEST'||state.pendingGates.length)throw failure();}
        const result=await observeBackendApiOrigin({...shared,runtimeConfig,vercelToken:required(env,'VERCEL_TOKEN'),syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),apiDeployment:{id:saved.apiDeploymentId,url:saved.apiUrl,artifactSha256:saved.apiArtifactSha256}});await record(repoRoot,'api-origin-observation.json',result);if(result.status!=='API_ORIGIN_OBSERVED'||!result.healthVerified||!result.currentActorVerified||!result.corsVerified||!result.sessionsClosed)throw failure();return result;
      }
      const result=await bindBackendApiOrigin({...shared,runtimeConfig,...(operating?{lane:'OPERATING_SYNTHETIC_STAGING' as const}:{}),vercelToken:required(env,'VERCEL_TOKEN'),syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),activeOperator:{providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD')}});
      if(result.status!=='API_ORIGIN_BOUND'||result.healthVerified!==true||result.currentActorVerified!==true||result.corsVerified!==true||result.sessionsClosed!==true||!result.canonicalReceipt)throw failure();
      return result;
    }
    if(mode==='verify-recovery'){
      const runtimeConfig=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-private.json'),192*1024)).toString('utf8'));
      const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
      const result=await verifyNativeWorkerFaultRecovery({...shared,runtimeConfig,operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD')});
      if(result.status!=='FAULT_RECOVERY_VERIFIED'||result.expiredLeaseRecoveryVerified!==true||result.eventRetryVerified!==true||result.dispatchBackoffVerified!==true||result.cleanupStatus!=='RELEASED'||result.sessionsClosed!==true||result.lockReleased!==true||result.ownedControlVerified!==true||!result.canonicalReceipt)throw failure();
      return result;
    }
    if(mode==='verify-restore'){
      const runtimeConfig=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-private.json'),192*1024)).toString('utf8'));
      const provider=z.object({status:z.enum(['DEPLOYED_INACTIVE','DEPLOYED_ACTIVE_REVALIDATED']),api:z.object({url:z.string().url(),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/)})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/provider-result.json'),48*1024)).toString('utf8')));
      const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
      const result=await verifyNativeHostedDatabaseRestore({...shared,runtimeConfig,operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),apiDeployment:{id:provider.api.deploymentId,url:provider.api.url}});
      if(result.status!=='VERIFIED'||result.recoveryVerified!==true||result.cleanupConfirmed!==true||result.sessionsClosed!==true||result.lockReleased!==true||!result.canonicalReceipt)throw failure();
      return result;
    }
    if(mode==='verify'||mode==='verify-private'||mode==='activate'){
      if(mode==='verify-private')z.object({status:z.literal('PREREQUISITES_OBSERVED'),apiReady:z.literal(true),roleSessions:z.literal(5),crossSchoolDenied:z.literal(true),worker:z.object({missingSignatureDenied:z.literal(true),malformedSignatureDenied:z.literal(true),staleSignatureDenied:z.literal(true)})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/prerequisites-result.json'),48*1024)).toString('utf8')));
      const runtimeConfig=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-private.json'),192*1024)).toString('utf8'));
      const provider=z.object({status:z.enum(['DEPLOYED_INACTIVE','DEPLOYED_ACTIVE_REVALIDATED']),api:z.object({url:z.string().url(),deploymentId:z.string().startsWith('dpl_')}),edge:z.object({id:z.string(),version:z.number().int().positive()})}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/provider-result.json'),48*1024)).toString('utf8')));
      if(mode==='activate'){
        const prerequisitesReceipt=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/prerequisites-result.json'),48*1024)).toString('utf8'));
        const privateReceipt=JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/private-access-result.json'),48*1024)).toString('utf8'));
        z.object({status:z.literal('PREREQUISITES_OBSERVED'),apiReady:z.literal(true),roleSessions:z.literal(5),crossSchoolDenied:z.literal(true)}).parse(prerequisitesReceipt);
        z.object({status:z.literal('PRIVATE_PROBES_CONFIRMED'),sessionsClosed:z.literal(true),restrictedDatabaseGrants:z.literal(true),privateStorage:z.literal(true),privateRealtime:z.literal(true)}).parse(privateReceipt);
        const operator=new URL(`postgresql://${endpoint.host}:5432/postgres?sslmode=verify-full`);operator.username=endpoint.kind==='direct'?'postgres':'postgres.'+endpoint.projectRef;
        const result=await activateHostedWorker({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,apiDeployment:{url:provider.api.url,id:provider.api.deploymentId},edgeDeployment:{id:provider.edge.id,version:provider.edge.version},syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),operatorDatabaseUrl:operator.toString(),operatorPassword:required(env,'CUEVO_MIGRATION_DATABASE_PASSWORD'),prerequisitesReceipt,privateReceipt});
        if(result.status!=='ACTIVATED_SIGNED_SOURCE_VERIFIED'||result.sourceProcessed!==true||result.duplicateWakeDenied!==true||result.originalCommandReplayed!==true||result.recoveryScheduled!==true||result.scheduledRecoveryVerified!==true||result.sessionsClosed!==true||!result.canonicalReceipt)throw failure();
        return result;
      }
      if(mode==='verify-private'){
        const result=await verifyHostedPrivateAccess({...shared,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,apiDeployment:{url:provider.api.url,id:provider.api.deploymentId},syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD'),...(scope.installedRuntime||scope.currentRuntime?{purpose:'PRE_ACTIVATION'}:{})});await record(repoRoot,'private-access-result.json',result);if(result.status!=='PRIVATE_PROBES_CONFIRMED'||result.restrictedDatabaseGrants!==true||result.privateStorage!==true||result.privateRealtime!==true||result.sessionsClosed!==true)throw failure();return result;
      }
      const result=await verifyHostedBackendPrerequisites({repoRoot,expected:bundle.expected,preparedApproval:bundle.preparedApproval,githubToken:shared.githubToken,providerToken:required(env,'SUPABASE_ACCESS_TOKEN'),vercelToken:required(env,'VERCEL_TOKEN'),runtimeConfig,apiDeployment:{url:provider.api.url,id:provider.api.deploymentId},edgeDeployment:{id:provider.edge.id,version:provider.edge.version},syntheticPassword:required(env,'CUEVO_SYNTHETIC_PILOT_PASSWORD')});await record(repoRoot,'prerequisites-result.json',result);if(result.status!=='PREREQUISITES_OBSERVED')throw failure();return result;
    }
    // Validate every needed input before the first provider mutation.
    const migrationPassword = required(env, 'CUEVO_MIGRATION_DATABASE_PASSWORD'), journalStorageKey = required(env, 'CUEVO_RELEASE_JOURNAL_STORAGE_KEY'), providerToken = required(env, 'SUPABASE_ACCESS_TOKEN'), ca = required(env, 'CUEVO_DATABASE_TLS_CA');
    if (!ca.includes('-----BEGIN CERTIFICATE-----') || Buffer.byteLength(ca) > 512 * 1024) throw failure();
    const certificatePath = join(repoRoot, '.local/hosted-release/database-ca.pem');
    if(mode==='deploy'){
      z.object({status:z.literal('CONFIRMED'),cleanup:z.literal('RELEASED')}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/reference-result.json'),8192)).toString('utf8')));
      z.object({status:z.literal('CONFIRMED'),confirmed:z.literal(133)}).parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/auth-result.json'),16384)).toString('utf8')));

      const db=await createHostedMigrationDatabase({repoRoot,projectRef:endpoint.projectRef,databaseUrl:`postgresql://${endpoint.kind==='session-pooler'?'postgres.'+endpoint.projectRef:'postgres'}@${endpoint.host}:5432/postgres?sslmode=verify-full`,certificate:{path:certificatePath,sha256:digest(ca)},password:migrationPassword});
      let recovered:{api:string;worker:string}|undefined;
      const runtimeLease=await db.withLock(`${endpoint.projectRef}:HOSTED_SCHEMA_MIGRATION`,async()=>{await readBackendReleaseAdmission({repoRoot,expected:bundle.expected,prepared:bundle.preparedApproval,githubToken:shared.githubToken});const recoveryAuthority=await admitRecoveryConsumption(db,'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');recovered=await db.prepareRuntimeCredentials(recoveryAuthority);});
      if(runtimeLease.kind!=='RELEASED'||!recovered)throw failure();
      await record(repoRoot,'runtime-role-passwords.json',{purpose:'INITIAL_RESTRICTED_RUNTIME_CREDENTIALS',sourceSha:identity.releaseSha,projectRef:endpoint.projectRef,...recovered});
      await record(repoRoot,'runtime-roles-result.json',{status:'CONFIRMED',apiLogin:true,workerLogin:true});
      const passwords=z.object({purpose:z.literal('INITIAL_RESTRICTED_RUNTIME_CREDENTIALS'),sourceSha:z.literal(identity.releaseSha),projectRef:z.string().regex(/^[a-z]{20}$/),api:z.string().regex(/^[a-f0-9]{64}$/),worker:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(JSON.parse((await ownedFile(repoRoot,join(repoRoot,'.local/hosted-release/runtime-role-passwords.json'),8192)).toString('utf8')));
      const targets=z.object({targets:z.object({web:z.object({origin:z.string()}),supabase:z.object({projectRef:z.literal(passwords.projectRef)})})}).parse(bundle.expected),projectRef=passwords.projectRef,webOrigin=targets.targets.web.origin,authOrigin=`https://${projectRef}.supabase.co`;
      const response=await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,{headers:{Authorization:'Bearer '+providerToken},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw failure();
      const keys=z.array(z.object({name:z.string(),type:z.string(),api_key:z.string()}).passthrough()).max(50).parse(await response.json());
      const publishable=keys.filter(key=>key.type==='publishable'&&key.name==='default'),storage=keys.filter(key=>key.type==='secret'&&key.name==='default');if(publishable.length!==1||storage.length!==1||storage[0].api_key===journalStorageKey)throw failure();
      const url=(role:string,password:string)=>{const db=new URL(`postgresql://${endpoint.kind==='session-pooler'?role+'.'+projectRef:role}@${endpoint.host}:5432/postgres`);db.password=password;return db.toString();};
      const common={NODE_ENV:'production',CUEVO_DEPLOYMENT_ENVIRONMENT:'synthetic-staging',CUEVO_SYNTHETIC_PROJECT_REF:projectRef,CUEVO_SYNTHETIC_WEB_ORIGIN:webOrigin,SUPABASE_URL:authOrigin,POSTHOG_CAPTURE_MODE:'DISABLED'};
      const runtimeConfig={version:1,purpose:'CUEVO_HOSTED_RUNTIME_CONFIGURATION',sourceSha:identity.releaseSha,projectRef,webOrigin,api:{...common,DATABASE_URL:url('cuevo_api',passwords.api),CUEVO_DATABASE_TLS_CA:ca,SUPABASE_PUBLISHABLE_KEY:publishable[0].api_key,SUPABASE_SERVICE_ROLE_KEY:storage[0].api_key,API_ALLOWED_ORIGIN:webOrigin,AI_GENERATION_MODE:'FIXTURE',AI_FIXTURE_ENABLED:'true'},edge:{...common,CUEVO_WORKER_DATABASE_URL:url('cuevo_worker',passwords.worker),CUEVO_WORKER_TLS_CA:ca,CUEVO_WORKER_EXECUTION_MODE:'synthetic-staging',CUEVO_WORKER_WAKE_KEY:''}};
      const handle=await open(join(repoRoot,'.local/hosted-release/runtime-private.json'),'wx',0o600);try{await handle.writeFile(JSON.stringify(runtimeConfig));await handle.sync();}finally{await handle.close();}
      const deployed=await deployBackendProviders({repoRoot,expected:bundle.expected as Parameters<typeof deployBackendProviders>[0]['expected'],preparedApproval:bundle.preparedApproval as Parameters<typeof deployBackendProviders>[0]['preparedApproval'],apiArtifactRoot:deployedArtifacts().apiRoot,edgeArtifactRoot:deployedArtifacts().edgeRoot,vercelToken:required(env,'VERCEL_TOKEN'),providerToken,githubToken:shared.githubToken,runtimeConfig,plan:bundle.plan,journalStorageKey,...recoveryInputs,operator:{databaseUrl:`postgresql://${endpoint.kind==='session-pooler'?'postgres.'+projectRef:'postgres'}@${endpoint.host}:5432/postgres?sslmode=verify-full`,password:migrationPassword,certificate:{path:certificatePath,sha256:digest(ca)}}});await record(repoRoot,'provider-result.json',deployed);if(deployed.status!=='DEPLOYED_INACTIVE')throw failure();return deployed;
    }
    if (mode === 'provision') {
      const syntheticPassword = required(env, 'CUEVO_SYNTHETIC_PILOT_PASSWORD');
      if(syntheticPassword.length<16||syntheticPassword.length>128||[...syntheticPassword].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))throw failure();
      const schemaBytes = await ownedFile(repoRoot, join(repoRoot, '.local/hosted-release/schema-result.json'), 1024 * 1024);
      z.object({ status: z.enum(['COMMITTED', 'NOOP']) }).parse(JSON.parse(schemaBytes.toString('utf8')));
      const certificate = { path: certificatePath, sha256: digest(ca) };
      const finalStage = bundle.stages.at(-1);
      const population = await seedHostedSyntheticPopulation({ ...shared,...recoveryInputs, providerToken, journalStorageKey, migrationPassword, certificate, plan: bundle.plan,endpoint, finalStage, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath });
      await record(repoRoot, 'population-result.json', population);
      if (!['POPULATED_CONFIRMED', 'NOOP'].includes(population.status)) throw failure();
      // This operator-only key serves private release receipts and initial Auth
      // provisioning. It is never sent to deployed browser/API/worker recipients.
      const privatePath = join(repoRoot, '.local/hosted-release/synthetic-access.json');
      const privateHandle = await open(privatePath, 'wx', 0o600);
      try { await privateHandle.writeFile(JSON.stringify({ purpose: 'SYNTHETIC_PILOT_ACCESS', sourceSha: identity.releaseSha, syntheticPassword })); await privateHandle.sync(); } finally { await privateHandle.close(); }
      const auth = await provisionHostedSyntheticAuth({ ...shared,...recoveryInputs,...(bundle.schemaRecoveryExport?{journalStorageKey}:{}), providerToken, migrationPassword, certificate, plan: bundle.plan,endpoint, finalStage, authProvisioningKey: journalStorageKey, syntheticPassword, originalKey: 'cuevo-initial-hosted-synthetic-auth' });
      await record(repoRoot, 'auth-result.json', auth);
      if (auth.status !== 'CONFIRMED') throw failure();
      const target = z.object({ targets: z.object({ supabase: z.object({ projectRef: z.string().regex(/^[a-z]{20}$/) }) }) }).parse(bundle.expected);
      const projectRef = target.targets.supabase.projectRef;
      const database = await createHostedMigrationDatabase({repoRoot,projectRef,databaseUrl:`postgresql://${endpoint.kind==='session-pooler'?'postgres.'+projectRef:'postgres'}@${endpoint.host}:5432/postgres?sslmode=verify-full`,certificate,password:migrationPassword});
      const referenceState: {status:'CONFIRMED'|'REQUIRES_REVIEW'} = {status:'REQUIRES_REVIEW'};
      const reference = await database.withLock(`${projectRef}:HOSTED_SCHEMA_MIGRATION`, async () => {
        await readBackendReleaseAdmission({repoRoot,expected:bundle.expected,prepared:bundle.preparedApproval,githubToken:shared.githubToken,effectScope:'SCHEMA_AND_SYNTHETIC_AUTH'});
        const recoveryAuthority=await admitRecoveryConsumption(database,'INSTALLED_SYNTHETIC_FOR_AUTH_OR_PROVIDER');await database.executeReferenceScenarioSource(recoveryAuthority); referenceState.status='CONFIRMED';
      });
      await record(repoRoot, 'reference-result.json', {status:referenceState.status,cleanup:reference.kind,hostedAcceptance:false});
      if(referenceState.status!=='CONFIRMED'||reference.kind!=='RELEASED')throw failure();
      return auth;
    }
    await mkdir(join(repoRoot, '.local/hosted-release'), { recursive: true });
    try{const certificateHandle = await open(certificatePath, 'wx', 0o600);try { await certificateHandle.writeFile(ca); await certificateHandle.sync(); } finally { await certificateHandle.close(); }}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST'||!(await ownedFile(repoRoot,certificatePath,512*1024)).equals(Buffer.from(ca)))throw failure();}
    const installed=z.object({installedSource:z.unknown().optional(),installedSchema:z.unknown().optional()}).parse(bundle.expected);if(!installed.installedSource&&!installed.installedSchema){
      const bootstrap = await createHostedOperatorStorageBootstrap({ ...shared, providerToken, journalStorageKey, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath });
      const bucket = await bootstrap.bootstrap(); await record(repoRoot, 'bucket-result.json', bucket);
      if (bucket.status === 'REQUIRES_REVIEW') throw failure();
    }
    // Installed targets are admitted through the complete read-only operator
    // inventory in the native executor; the empty-target bootstrap cannot run.
    const toolchainKeys = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ'];
    const toolchain = Object.fromEntries(toolchainKeys.filter(key => env[key] !== undefined).map(key => [key, env[key]!]));
    const executor=mode==='reconcile-prefix'?executeNativeHostedMigrationStage:executeNativeHostedMigrations; const result = await executor({ ...shared, providerToken, journalStorageKey, migrationPassword, plan: bundle.plan,endpoint,...(bundle.schemaRecoveryExport?{schemaRecoveryExport:bundle.schemaRecoveryExport}:{}),...(bundle.schemaRecoverySelection?{schemaRecoverySelection:bundle.schemaRecoverySelection}:{}),...(mode==='bootstrap-schema'&&bundle.version===2&&bundle.originalNativeIntentTemplate?{originalNativeIntentTemplate:bundle.originalNativeIntentTemplate,originalNativeIntentEvidence:bundle.originalNativeIntentEvidence}:{}), ...(mode==='reconcile-prefix'?{stage:bundle.stages[0]}:{stages:bundle.stages}), certificate: { path: certificatePath, sha256: digest(ca) }, toolchainManifestPath: bundle.toolchainManifestPath, operatorStoragePolicyPath: bundle.operatorStoragePolicyPath, toolchain });
    await record(repoRoot, 'schema-result.json', result);
    if (!['COMMITTED', 'NOOP'].includes(result.status)) throw failure();
    return result;
  } catch { throw failure(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2];
  if (!['prepare', 'approval', 'bootstrap-schema', 'reconcile-prefix', 'export-schema-completion', 'provision','deploy','resume-runtime','export-activation-execution','confirm-pending-activation','rollout-runtime','initialize-runtime','export-runtime-recovery','verify','verify-private','activate','verify-recovery','verify-restore','bind-api','handover','configure-web','export-web-handover'].includes(mode)) throw failure();
  try { const result = await runBackendReleasePhase({ mode: mode as 'prepare' | 'approval' | 'bootstrap-schema' | 'reconcile-prefix' | 'export-schema-completion' | 'provision'|'deploy'|'resume-runtime'|'verify'|'verify-private'|'activate'|'verify-recovery'|'verify-restore'|'bind-api'|'handover'|'configure-web'|'export-web-handover', repoRoot: process.cwd(), env: process.env }); console.log(JSON.stringify({ step: mode, status: 'status' in result ? result.status : 'EXPORTED_VERIFIED_BACKEND_HANDOVER', hostedAcceptance: false })); }
  catch { console.error('Cuevo backend step requires review. Inspect retained source-bound receipts; private contents withheld.'); process.exitCode = 1; }
}
