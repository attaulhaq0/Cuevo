import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {canonicalReleaseReviewJson} from './release-review';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = 'a'.repeat(40), tree = 'b'.repeat(40), base = 'c'.repeat(40), ref = 'mqxdjvsyckzocokuikmx';
const now = Date.parse('2026-10-06T12:00:00Z');
const fingerprints = { sourceManifestSha256: '1'.repeat(64), diffSha256: '2'.repeat(64), migrationPlanSha256: '3'.repeat(64), migrationHistorySha256: '4'.repeat(64), migrationToolchainSha256: 'd'.repeat(64), migrationEndpointSha256:'e'.repeat(64),operatorStoragePolicySha256: 'f'.repeat(64), apiArtifactSha256: '5'.repeat(64), edgeArtifactSha256: '6'.repeat(64), denoLockSha256: '7'.repeat(64) };
const targets = { web: { teamId: 'team_Cuevo', projectId: 'prj_Web', origin: 'https://cuevo-web.vercel.app', target: 'preview' }, api: { teamId: 'team_Cuevo', projectId: 'prj_Api', origin: 'https://cuevo-api.vercel.app', target: 'preview' }, supabase: { projectRef: ref, authOrigin: `https://${ref}.supabase.co`, edgeOrigin: `https://${ref}.supabase.co/functions/v1/cuevo-worker` } };
const assignments = [{ category: 'source-spec-code', taskId: 'source-review', reportSha256: '8'.repeat(64), evidenceSha256: '9'.repeat(64) }, { category: 'qa-regression-operations', taskId: 'qa-review', reportSha256: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64) }];
const identity = { repository: 'attaulhaq0/Cuevo', releaseSha: sha, treeSha: tree, baseSha: base, ciRunId: '31', releaseRunId: '51', runAttempt: 1, environmentId: 123, environmentName: 'staging', deploymentEnvironment: 'synthetic-staging', canonicalRuntimeVerification:{runAttempt:2,jobsSha256:'e'.repeat(64)} };

test('version two database packages have no runtime artifact capability and historical version one digests remain valid',async()=>{
 const api=await subject(),body={...input(),version:2,executionScope:'schema-and-accounts',fingerprints:{...fingerprints,apiArtifactSha256:null,edgeArtifactSha256:null,denoLockSha256:null}},current={...expected(),executionScope:'schema-and-accounts',fingerprints:body.fingerprints};
 const prepared=api.prepareBackendReleaseIntent(body,current);assert.equal(api.validatePreparedBackendReleaseIntent(prepared,current).sha256,prepared.sha256);
 assert.throws(()=>api.readBackendRuntimeFingerprints(body.fingerprints));
 for(const scope of ['complete-backend','installed-runtime','pending-runtime-confirmation'])assert.throws(()=>api.prepareBackendReleaseIntent({...body,executionScope:scope},{...current,executionScope:scope}));
 for(const key of ['apiArtifactSha256','edgeArtifactSha256','denoLockSha256'] as const){const changed={...body.fingerprints,[key]:fingerprints[key]};assert.throws(()=>api.prepareBackendReleaseIntent({...body,fingerprints:changed},{...current,fingerprints:changed}));}
 const historical=api.prepareBackendReleaseIntent(input(),expected());assert.equal(api.validatePreparedBackendReleaseIntent(historical,expected()).sha256,historical.sha256);
 assert.throws(()=>api.prepareBackendReleaseIntent({...body,version:1},current));
});

test('runtime recovery binds a fresh executor to the exact original pending operation and cannot invent rollback bytes',async()=>{
 const api=await subject(),previous={generation:'1',sourceSha:base,treeSha:base,runtimeSha256:'1'.repeat(64),apiDeploymentId:'dpl_previous',apiUrl:'https://cuevo-previous.vercel.app',edgeId:'previous',edgeVersion:1,apiArtifactSha256:'2'.repeat(64),edgeArtifactSha256:'3'.repeat(64),denoLockSha256:'4'.repeat(64),activationReceiptSha256:'5'.repeat(64),stateSha256:'6'.repeat(64)},desired={generation:'2',sourceSha:sha,treeSha:tree,apiArtifactSha256:fingerprints.apiArtifactSha256,edgeArtifactSha256:fingerprints.edgeArtifactSha256,denoLockSha256:fingerprints.denoLockSha256,compatibilitySha256:'7'.repeat(64)},original={version:1,purpose:'CUEVO_ACTIVE_RUNTIME_ROLLOUT',previous,desired},operationSha256=createHash('sha256').update(canonicalReleaseReviewJson(original)).digest('hex'),runtimeRollout={version:2,purpose:'CUEVO_ACTIVE_RUNTIME_ROLLOUT',action:'RECOVER_ORIGINAL',previous,desired,operationSha256,executor:{sourceSha:sha,treeSha:tree,runId:'51',runAttempt:1},recoveryOriginal:{runId:'50',runAttempt:1,packageSha256:'8'.repeat(64),pendingStateSha256:'9'.repeat(64),compatibilitySha256:desired.compatibilitySha256,archiveSha256:'a'.repeat(64)},rollbackArtifacts:null},installedSource={sourceSha:base,treeSha:base,seedSha256:'8'.repeat(64),manifestSha256:'9'.repeat(64),migrationCount:231},body={...input(),version:2,executionScope:'runtime-rollout',runtimeRollout,installedSource},current={...expected(),executionScope:'runtime-rollout',runtimeRollout,installedSource};assert.doesNotThrow(()=>api.prepareBackendReleaseIntent(body,current));for(const patch of [{recoveryOriginal:null},{executor:{...runtimeRollout.executor,runId:'52'}},{operationSha256:'f'.repeat(64)},{rollbackArtifacts:{compatible:true}},{desired:{...desired,generation:'3'}}])assert.throws(()=>api.prepareBackendReleaseIntent({...body,runtimeRollout:{...runtimeRollout,...patch}},{...current,runtimeRollout:{...runtimeRollout,...patch}}));
});

test('installed current generation binds exact version two provenance without borrowing legacy installed authority',async()=>{
 const api=await subject(),originalActivation={version:1,purpose:'CUEVO_INSTALLED_ACTIVE_RUNTIME',sourceSha:base,treeSha:base,originalRunId:'50',originalRunAttempt:1,originalPackageSha256:'1'.repeat(64),runtimeSha256:'2'.repeat(64),apiDeploymentId:'dpl_previous',apiUrl:'https://cuevo-previous.vercel.app',edgeId:'previous',edgeVersion:1,activationId:'10000000-0000-4000-8000-000000000001',vaultSecretName:'cuevo_worker_10000000000040008000000000000001',jobId:42,endpoint:targets.supabase.edgeOrigin,activationReceiptSha256:'3'.repeat(64)},currentRuntime={version:2,purpose:'CUEVO_CURRENT_ACTIVE_RUNTIME',originalActivation,current:{generation:'2',sourceSha:sha,treeSha:tree,runId:'51',runAttempt:1,packageSha256:'4'.repeat(64),runtimeSha256:'5'.repeat(64),apiArtifactSha256:fingerprints.apiArtifactSha256,edgeArtifactSha256:fingerprints.edgeArtifactSha256,denoLockSha256:fingerprints.denoLockSha256,migrationSetSha256:'6'.repeat(64),compatibilitySha256:'7'.repeat(64),apiDeploymentId:'dpl_current',apiUrl:'https://cuevo-current.vercel.app',edgeId:'current',edgeVersion:2},activationReceiptSha256:'8'.repeat(64),stateSha256:'9'.repeat(64)},installedSource={sourceSha:base,treeSha:base,seedSha256:'8'.repeat(64),manifestSha256:'9'.repeat(64),migrationCount:231},body={...input(),version:2,executionScope:'installed-runtime',currentRuntime,installedSource},context={...expected(),executionScope:'installed-runtime',currentRuntime,installedSource};assert.doesNotThrow(()=>api.prepareBackendReleaseIntent(body,context));assert.throws(()=>api.prepareBackendReleaseIntent({...body,installedRuntime:originalActivation},{...context,installedRuntime:originalActivation}));assert.throws(()=>api.prepareBackendReleaseIntent({...body,currentRuntime:{...currentRuntime,current:{...currentRuntime.current,sourceSha:base}}},{...context,currentRuntime:{...currentRuntime,current:{...currentRuntime.current,sourceSha:base}}}));assert.throws(()=>api.prepareBackendReleaseIntent({...body,currentRuntime:{...currentRuntime,current:{...currentRuntime.current,apiDeploymentId:null}}},{...context,currentRuntime:{...currentRuntime,current:{...currentRuntime.current,apiDeploymentId:null}}}));
});
test('runtime rollout binds exact previous generation and desired current source under a separate reviewed operation',async()=>{
 const api=await subject(),previous={generation:'1',sourceSha:base,treeSha:base,runtimeSha256:'1'.repeat(64),apiDeploymentId:'dpl_previous',apiUrl:'https://cuevo-previous.vercel.app',edgeId:'previous',edgeVersion:1,apiArtifactSha256:'2'.repeat(64),edgeArtifactSha256:'3'.repeat(64),denoLockSha256:'4'.repeat(64),activationReceiptSha256:'5'.repeat(64),stateSha256:'6'.repeat(64)},desired={generation:'2',sourceSha:sha,treeSha:tree,apiArtifactSha256:fingerprints.apiArtifactSha256,edgeArtifactSha256:fingerprints.edgeArtifactSha256,denoLockSha256:fingerprints.denoLockSha256,compatibilitySha256:'7'.repeat(64)},operation={version:1,purpose:'CUEVO_ACTIVE_RUNTIME_ROLLOUT',previous,desired},runtimeRollout={...operation,operationSha256:createHash('sha256').update(canonicalReleaseReviewJson(operation)).digest('hex')},installedSource={sourceSha:base,treeSha:base,seedSha256:'8'.repeat(64),manifestSha256:'9'.repeat(64),migrationCount:231},body={...input(),version:2,executionScope:'runtime-rollout',runtimeRollout,installedSource},current={...expected(),executionScope:'runtime-rollout',runtimeRollout,installedSource};
 assert.equal(api.prepareBackendReleaseIntent(body,current).status,'PREPARED_ONLY');
 for(const patch of [{operationSha256:'f'.repeat(64)},{previous:{...previous,generation:'0'}},{desired:{...desired,generation:'3'}},{desired:{...desired,sourceSha:base}}])assert.throws(()=>api.prepareBackendReleaseIntent({...body,runtimeRollout:{...runtimeRollout,...patch}},{...current,runtimeRollout:{...runtimeRollout,...patch}}));
 assert.throws(()=>api.prepareBackendReleaseIntent({...body,executionScope:'complete-backend'},{...current,executionScope:'complete-backend'}));
});

test('reconciliation schema scope requires its explicit immutable template fingerprint and refuses deployment scope borrowing',async()=>{
 const api=await subject(),reconciledPrefix={templateSha256:'a'.repeat(64),originalOperationSha256:'b'.repeat(64),originalChainSha256:'c'.repeat(64),prefixCount:120,stageCount:123,cataloguePolicySha256:'d'.repeat(64),catalogueSha256:'e'.repeat(64)};
 const body={...input(),executionScope:'reconcile-schema',reconciledPrefix},current={...expected(),executionScope:'reconcile-schema',reconciledPrefix};
 assert.doesNotThrow(()=>api.prepareBackendReleaseIntent(body,current));
 assert.throws(()=>api.prepareBackendReleaseIntent({...body,reconciledPrefix:undefined},current));
 assert.throws(()=>api.prepareBackendReleaseIntent({...body,executionScope:'complete-backend'},{...current,executionScope:'complete-backend'}));
 assert.throws(()=>api.prepareBackendReleaseIntent(body,{...current,reconciledPrefix:{...reconciledPrefix,templateSha256:'f'.repeat(64)}}));
});
function input() { return { version: 1, purpose: 'BACKEND_SYNTHETIC_STAGING', ...identity, targets: structuredClone(targets), fingerprints: { ...fingerprints }, preparedAt: '2026-10-06T11:00:00Z', expiresAt: '2026-10-07T11:00:00Z', reviews: assignments.map(row => ({ ...row, releaseSha: sha, treeSha: tree, baseSha: base, sourceManifestSha256: fingerprints.sourceManifestSha256, diffSha256: fingerprints.diffSha256, reviewedAt: '2026-10-06T10:00:00Z' })) }; }
test('original native intent fingerprint admits only an exact 123 database continuation and binds the same current approval bytes',async()=>{
 const api=await subject(),originalNativeIntentRecovery={version:1,purpose:'CUEVO_ORIGINAL_NATIVE_INTENT_RECOVERY',templateSha256:'1'.repeat(64),selectionSha256:'2'.repeat(64),originalOperationSha256:'24d8416b27727c7918c2f4cd3210801d25756c43ee48c305f2500e5e3a4f941d',originalOwnerSha256:'13492280bc30cc12d7f0e80ab308ed03419e93d9d7a809000e896d7e7a5f2f75',originalRecord1Sha256:'6fe0a86bf815efcb637a20e766af2a73bf7b97e2d561c1e868d85de7215ede56',originalIntentSha256:'d2c71da1e1eaefebeec488d244e1886a8e8bb6b3afdc4265513cf1c3f208ba50',beforeCount:123,afterCount:124,pendingSourceSha256:'52066e47c55d0529d9a5bd3e2295fdceaffad64ecd40a71366c426d087872bac'},installedSchema={sourceSha:base,treeSha:base,migrationCount:123},schemaRecovery={completionReceiptSha256:'3'.repeat(64),completionExportSha256:'4'.repeat(64)},databaseFingerprints={...fingerprints,apiArtifactSha256:null,edgeArtifactSha256:null,denoLockSha256:null},body={...input(),version:2,executionScope:'schema-and-accounts',fingerprints:databaseFingerprints,installedSchema,schemaRecovery,originalNativeIntentRecovery},context={...expected(),executionScope:body.executionScope,fingerprints:databaseFingerprints,installedSchema,schemaRecovery,originalNativeIntentRecovery};assert.equal(api.prepareBackendReleaseIntent(body,context).status,'PREPARED_ONLY');
 for(const patch of [{installedSchema:{...installedSchema,migrationCount:124}},{executionScope:'reconcile-schema'},{schemaRecovery:undefined},{installedSource:{sourceSha:base,treeSha:base,seedSha256:'5'.repeat(64),manifestSha256:'6'.repeat(64),migrationCount:123}},{originalNativeIntentRecovery:{...originalNativeIntentRecovery,effectAuthority:true}}])assert.throws(()=>api.prepareBackendReleaseIntent({...body,...patch},{...context,...patch}));assert.throws(()=>api.prepareBackendReleaseIntent({...body,version:1},context));assert.throws(()=>api.prepareBackendReleaseIntent(body,{...context,originalNativeIntentRecovery:{...originalNativeIntentRecovery,templateSha256:'f'.repeat(64)}}));
});
test('child144 recovery binding keeps the installed marker124 and permits only a separately reviewed database package',async()=>{
 const api=await subject(),t=(await import('../database/hosted-original-child-recovery.fixture')).originalChildRecoveryFixture(),originalChildRecovery={...(await import('../database/hosted-original-child-recovery')).originalChildRecoveryFingerprint(t),catalogueReferenceSha256:'3'.repeat(64)},installedSchema={sourceSha:t.originalIdentity.sourceSha,treeSha:t.originalIdentity.treeSha,migrationCount:124},schemaRecovery={completionReceiptSha256:'4'.repeat(64),completionExportSha256:'5'.repeat(64)},databaseFingerprints={...fingerprints,apiArtifactSha256:null,edgeArtifactSha256:null,denoLockSha256:null},body={...input(),version:2,executionScope:'schema-and-accounts',fingerprints:databaseFingerprints,installedSchema,schemaRecovery,originalChildRecovery},context={...expected(),executionScope:body.executionScope,fingerprints:databaseFingerprints,installedSchema,schemaRecovery,originalChildRecovery};assert.equal(api.prepareBackendReleaseIntent(body,context).status,'PREPARED_ONLY');
 for(const patch of [{installedSchema:{...installedSchema,migrationCount:144}},{executionScope:'complete-backend'},{schemaRecovery:undefined},{originalChildRecovery:{...originalChildRecovery,effectAuthority:true}},{releaseRunId:'38025787883'},{installedSource:{sourceSha:base,treeSha:base,seedSha256:'6'.repeat(64),manifestSha256:'7'.repeat(64),migrationCount:144}}])assert.throws(()=>api.prepareBackendReleaseIntent({...body,...patch},{...context,...patch}));assert.throws(()=>api.prepareBackendReleaseIntent({...body,version:1},context));assert.throws(()=>api.prepareBackendReleaseIntent(body,{...context,originalChildRecovery:{...originalChildRecovery,catalogueReferenceSha256:'f'.repeat(64)}}));
});
function expected() { return { ...identity, targets: structuredClone(targets), fingerprints: { ...fingerprints }, reviews: structuredClone(assignments), now, currentMainSha: sha,
  ciRun: { id: 31, head_sha: sha, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', repository: { full_name: 'attaulhaq0/Cuevo' } },
  backendRun: { id: 51, run_attempt: 1, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', status: 'waiting', conclusion: null, path: '.github/workflows/backend-release.yml', repository: { full_name: 'attaulhaq0/Cuevo' } } }; }

test('canonical database proof permits only schema effects while unrelated runtime is unfinished or failed',async()=>{
 const api=await subject();
 for(const runState of [{status:'in_progress',conclusion:null},{status:'completed',conclusion:'failure'}]){
  const body={...input(),executionScope:'schema-and-accounts',canonicalRuntimeVerification:undefined,canonicalSchemaVerification:{runAttempt:2,jobsSha256:'e'.repeat(64)}},current={...expected(),executionScope:body.executionScope,canonicalRuntimeVerification:undefined,canonicalSchemaVerification:body.canonicalSchemaVerification,ciRun:{...expected().ciRun,run_attempt:2,...runState}};
  delete(body as Record<string,unknown>).canonicalRuntimeVerification;delete(current as Record<string,unknown>).canonicalRuntimeVerification;
  const prepared=api.prepareBackendReleaseIntent(body,current);assert.equal(api.validatePreparedBackendReleaseIntent(prepared,current).status,'PREPARED_ONLY');
  for(const scope of ['complete-backend','installed-runtime','pending-runtime-confirmation'])assert.throws(()=>api.prepareBackendReleaseIntent({...body,executionScope:scope},{...current,executionScope:scope}));
  assert.throws(()=>api.prepareBackendReleaseIntent(body,{...current,canonicalSchemaVerification:{runAttempt:3,jobsSha256:'e'.repeat(64)}}));
 }
});

test('fresh pending confirmation package binds the original same-source evidence without borrowing ordinary runtime authority',async()=>{const api=await subject(),original={sourceSha:sha,treeSha:tree,runId:'40',runAttempt:1,packageSha256:'4'.repeat(64),activationId:'10000000-0000-4000-8000-000000000002',runtimeSha256:'5'.repeat(64),apiDeploymentId:'dpl_fixture',apiUrl:'https://cuevo-generated.vercel.app',edgeId:'edge',edgeVersion:1,endpoint:targets.supabase.edgeOrigin,vaultSecretName:'cuevo_worker_10000000000040008000000000000002',jobId:42,createdAt:'2026-10-05T12:00:00Z'},binding={version:1,purpose:'CUEVO_PENDING_ORIGINAL_WORKER_CONFIRMATION',original,originalExportSha256:'1'.repeat(64),originalIdentityFileSha256:'2'.repeat(64),originalIntentSha256:'3'.repeat(64),originalActivationSha256:'4'.repeat(64),originalCleanupSha256:'5'.repeat(64),originalJournalPrefixSha256:'6'.repeat(64),originalWakeKeySha256:'7'.repeat(64),originalRuntimeConfigurationSha256:'8'.repeat(64),configuredPublicStateSha256:'9'.repeat(64),confirmedPublicStateSha256:'a'.repeat(64),observedPhase:'CONFIGURED',observedPublicStateSha256:'9'.repeat(64),originalArtifact:{runId:'40',runAttempt:1,artifactId:'70',archiveSha256:'b'.repeat(64),jsonSha256:'1'.repeat(64),jobsSha256:'c'.repeat(64),expiresAt:'2026-10-10T12:00:00Z'}},installedSource={sourceSha:sha,treeSha:tree,seedSha256:'d'.repeat(64),manifestSha256:'e'.repeat(64),migrationCount:230},body={...input(),executionScope:'pending-runtime-confirmation',installedSource,pendingRuntimeConfirmation:binding},current={...expected(),executionScope:'pending-runtime-confirmation',installedSource,pendingRuntimeConfirmation:binding};const prepared=api.prepareBackendReleaseIntent(body,current);assert.equal(api.validatePreparedBackendReleaseIntent(prepared,current).status,'PREPARED_ONLY');for(const altered of[{...binding,original:{...original,sourceSha:'f'.repeat(40)}},{...binding,original:{...original,runId:'51'}},{...binding,observedPublicStateSha256:'f'.repeat(64)},{...binding,originalArtifact:{...binding.originalArtifact,expiresAt:'2026-01-01T00:00:00Z'}}])assert.throws(()=>api.prepareBackendReleaseIntent({...body,pendingRuntimeConfirmation:altered},{...current,pendingRuntimeConfirmation:altered}));assert.throws(()=>api.prepareBackendReleaseIntent({...body,executionScope:'complete-backend'},{...current,executionScope:'complete-backend'}));assert.throws(()=>api.prepareBackendReleaseIntent({...body,pendingRuntimeConfirmation:undefined},current));});

test('focused staging binds complete job proof to schema and fictional accounts without authorizing production', async () => {
  const api = await subject(), proof = { scope: 'SCHEMA_AND_SYNTHETIC_AUTH', runAttempt: 1, jobsSha256: 'e'.repeat(64) };
  const body = { ...input(), executionScope: 'schema-and-accounts', stagingVerification: proof }; delete (body as Record<string,unknown>).canonicalRuntimeVerification;
  const current = { ...expected(), executionScope: 'schema-and-accounts', stagingVerification: proof, ciRun: { ...expected().ciRun, path: '.github/workflows/staging-verification.yml', event: 'workflow_dispatch', run_attempt: 1 } };
  delete (current as Record<string,unknown>).canonicalRuntimeVerification;
  const prepared = api.prepareBackendReleaseIntent(body, current);
  assert.match(prepared.canonicalJson, /SCHEMA_AND_SYNTHETIC_AUTH/);
  assert.equal(api.validatePreparedBackendReleaseIntent(prepared, current).status, 'PREPARED_ONLY');
  assert.throws(() => api.prepareBackendReleaseIntent(input(), current));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, { ...current, stagingVerification: { ...proof, jobsSha256: '0'.repeat(64) } }));
  assert.throws(() => api.prepareBackendReleaseIntent(body, { ...current, ciRun: { ...current.ciRun, run_attempt: 2 } }));
  assert.throws(() => api.prepareBackendReleaseIntent(body, { ...current, environmentName: 'production' }));
  assert.throws(() => api.prepareBackendReleaseIntent(body, { ...expected(), stagingVerification: proof }));
  assert.throws(() => api.prepareBackendReleaseIntent({ ...body, executionScope: 'complete-backend' }, { ...current, executionScope: 'complete-backend' }));
});

test('canonical backend intent requires immutable exact runtime job attempt proof and separates installed schema from population',async()=>{
 const api=await subject(),proof={runAttempt:2,jobsSha256:'e'.repeat(64)},body={...input(),canonicalRuntimeVerification:proof},current={...expected(),canonicalRuntimeVerification:proof};
 const prepared=api.prepareBackendReleaseIntent(body,current);assert.match(prepared.canonicalJson,/canonicalRuntimeVerification/);
 const missingBody=input(),missingExpected=expected();delete (missingBody as Record<string,unknown>).canonicalRuntimeVerification;delete (missingExpected as Record<string,unknown>).canonicalRuntimeVerification;assert.throws(()=>api.prepareBackendReleaseIntent(missingBody,missingExpected));
 for(const replacement of [{runAttempt:3,jobsSha256:proof.jobsSha256},{runAttempt:2,jobsSha256:'0'.repeat(64)}])assert.throws(()=>api.validatePreparedBackendReleaseIntent(prepared,{...current,canonicalRuntimeVerification:replacement}));
 const installedSchema={sourceSha:base,treeSha:tree,migrationCount:123};assert.doesNotThrow(()=>api.prepareBackendReleaseIntent({...body,installedSchema},{...current,installedSchema}));
 const installedSource={sourceSha:base,treeSha:tree,migrationCount:230,seedSha256:'f'.repeat(64),manifestSha256:'d'.repeat(64)};
 assert.throws(()=>api.prepareBackendReleaseIntent({...body,installedSchema,installedSource},{...current,installedSchema,installedSource}));
});

test('installed runtime binds original activation receipt and permits only the exact current source with installed population',async()=>{
 const api=await subject(),installedSource={sourceSha:base,treeSha:tree,migrationCount:230,seedSha256:'f'.repeat(64),manifestSha256:'d'.repeat(64)},installedRuntime={version:1,purpose:'CUEVO_INSTALLED_ACTIVE_RUNTIME',sourceSha:sha,treeSha:tree,originalRunId:'50',originalRunAttempt:1,originalPackageSha256:'e'.repeat(64),runtimeSha256:'f'.repeat(64),apiDeploymentId:'dpl_Api',apiUrl:'https://cuevo-api-source.vercel.app',edgeId:'edge-original',edgeVersion:1,activationId:'original-activation',vaultSecretName:'cuevo_worker_original',jobId:42,endpoint:targets.supabase.edgeOrigin,activationReceiptSha256:'d'.repeat(64)};
 const body={...input(),executionScope:'installed-runtime',installedSource,installedRuntime},current={...expected(),executionScope:'installed-runtime',installedSource,installedRuntime};
 const prepared=api.prepareBackendReleaseIntent(body,current);assert.match(prepared.canonicalJson,/CUEVO_INSTALLED_ACTIVE_RUNTIME/);
 for(const fields of [{installedSource:undefined},{installedSchema:{sourceSha:base,treeSha:tree,migrationCount:123}},{executionScope:'complete-backend'},{installedRuntime:{...installedRuntime,sourceSha:base}},{installedRuntime:{...installedRuntime,endpoint:targets.supabase.edgeOrigin+'/other'}}])assert.throws(()=>api.prepareBackendReleaseIntent({...body,...fields},{...current,...fields}));
 assert.throws(()=>api.validatePreparedBackendReleaseIntent(prepared,{...current,installedRuntime:{...installedRuntime,activationReceiptSha256:'0'.repeat(64)}}));
});
async function subject() { let module: Record<string, unknown> = {}; try { module = await import(pathToFileURL(resolve(import.meta.dirname, 'backend-release-contracts.ts')).href); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error; } assert.equal(typeof module.prepareBackendReleaseIntent, 'function', 'backend intent preparation exists'); return module as typeof import('./backend-release-contracts'); }

test('the selected migration endpoint is bound before approval and cannot be removed or replaced',async()=>{const api=await subject(),body=input(),current=expected();const removed=structuredClone(body);delete (removed.fingerprints as Record<string,string>).migrationEndpointSha256;assert.throws(()=>api.prepareBackendReleaseIntent(removed,current));const prepared=api.prepareBackendReleaseIntent(body,current);assert.throws(()=>api.validatePreparedBackendReleaseIntent(prepared,{...current,fingerprints:{...current.fingerprints,migrationEndpointSha256:'0'.repeat(64)}}));});

test('backend approval binds the migration toolchain artifact and cannot admit omitted or substituted installer evidence', async () => {
  const api = await subject(), body = input(), current = expected();
  const withoutToolchain = structuredClone(body), expectedWithout = structuredClone(current);
  delete (withoutToolchain.fingerprints as Record<string, string>).migrationToolchainSha256;
  delete (expectedWithout.fingerprints as Record<string, string>).migrationToolchainSha256;
  assert.throws(() => api.prepareBackendReleaseIntent(withoutToolchain, expectedWithout));
  (body.fingerprints as Record<string, string>).migrationToolchainSha256 = 'd'.repeat(64);
  (current.fingerprints as Record<string, string>).migrationToolchainSha256 = 'd'.repeat(64);

  const prepared = api.prepareBackendReleaseIntent(body, current);
  assert.match(prepared.canonicalJson, /migrationToolchainSha256/);
  (current.fingerprints as Record<string, string>).migrationToolchainSha256 = 'e'.repeat(64);
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, current));
});

test('backend approval binds operator journal policy separately from toolchain and runtime artifacts', async () => {
  const api = await subject(), body = input(), current = expected();
  const absent = structuredClone(body), absentExpected = structuredClone(current);
  delete (absent.fingerprints as Record<string, string>).operatorStoragePolicySha256;
  delete (absentExpected.fingerprints as Record<string, string>).operatorStoragePolicySha256;
  assert.throws(() => api.prepareBackendReleaseIntent(absent, absentExpected));
  (body.fingerprints as Record<string, string>).operatorStoragePolicySha256 = 'f'.repeat(64);
  (current.fingerprints as Record<string, string>).operatorStoragePolicySha256 = 'f'.repeat(64);

  const prepared = api.prepareBackendReleaseIntent(body, current);
  assert.match(prepared.canonicalJson, /operatorStoragePolicySha256/);
  (current.fingerprints as Record<string, string>).operatorStoragePolicySha256 = 'e'.repeat(64);
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, current));
});

test('prepared backend intent binds staging source targets fingerprints reviews and exact run without claiming approval', async () => {
  const api = await subject(), prepared = api.prepareBackendReleaseIntent(input(), expected());
  assert.equal(prepared.status, 'PREPARED_ONLY'); assert.equal(prepared.sha256, createHash('sha256').update(prepared.canonicalJson).digest('hex'));
  assert.equal(Buffer.from(prepared.base64, 'base64').toString(), prepared.canonicalJson);
  assert.equal(prepared.comment, `Cuevo backend staging admission approved: sha=${sha}; run=51; attempt=1; package=sha256:${prepared.sha256}`);
  assert.doesNotMatch(prepared.canonicalJson, /approvedAt|founderVerified|healthVerified|credentials|success/);
  assert.deepEqual(api.validatePreparedBackendReleaseIntent(prepared, { ...expected(), now: now + 3600000 }), prepared);
});

test('backend intent refuses foreign source current main CI run and ambiguous backend attempt', async () => {
  const api = await subject();
  for (const patch of [{ releaseSha: base }, { treeSha: base }, { ciRunId: '99' }, { releaseRunId: '52' }, { runAttempt: 2 }, { environmentId: 124 }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
  for (const patch of [{ currentMainSha: base }, { ciRun: { ...expected().ciRun, event: 'pull_request' } }, { ciRun: { ...expected().ciRun, conclusion: 'cancelled' } }, { ciRun: { ...expected().ciRun, repository: { full_name: 'fork/Cuevo' } } }, { backendRun: { ...expected().backendRun, run_attempt: 2 } }, { backendRun: { ...expected().backendRun, status: 'completed', conclusion: 'success' } }, { backendRun: { ...expected().backendRun, path: '.github/workflows/release.yml' } }]) assert.throws(() => api.prepareBackendReleaseIntent(input(), { ...expected(), ...patch }));
});

test('backend intent rejects cross-project origins production modes and mismatched artifact history', async () => {
  const api = await subject();
  for (const patch of [{ environmentName: 'production' }, { deploymentEnvironment: 'production' }, { purpose: 'PREBUILD_RELEASE_ADMISSION' }, { fingerprints: { ...fingerprints, migrationPlanSha256: '0'.repeat(64) } }, { targets: { ...targets, api: targets.web } }, { targets: { ...targets, api: { ...targets.api, origin: 'https://other.vercel.app' } } }, { targets: { ...targets, supabase: { ...targets.supabase, authOrigin: 'https://other.supabase.co' } } }, { targets: { ...targets, supabase: { ...targets.supabase, edgeOrigin: `https://${ref}.supabase.co/functions/v1/other` } } }, { targets: { ...targets, web: { ...targets.web, origin: 'https://cuevo-web.vercel.app/path' } } }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
});

test('backend intent requires fresh two independent assigned reviews and bounded package expiry', async () => {
  const api = await subject();
  for (const patch of [{ preparedAt: '2026-10-05T10:00:00Z' }, { preparedAt: '2026-10-06T13:00:00Z' }, { expiresAt: '2026-10-06T11:30:00Z' }, { expiresAt: '2026-10-08T11:00:00Z' }, { reviews: [] }, { reviews: [input().reviews[0], input().reviews[0]] }, { reviews: input().reviews.map(row => ({ ...row, reviewedAt: '2026-10-04T12:00:00Z' })) }, { reviews: input().reviews.map(row => ({ ...row, reportSha256: '0'.repeat(64) })) }, { reviews: input().reviews.map(row => ({ ...row, treeSha: base })) }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
});

test('backend intent rejects secrets unknown fields accessors and proxies without invoking them', async () => {
  const api = await subject();
  for (const patch of [{ credentials: { SUPABASE_ACCESS_TOKEN: 'private' } }, { approved: true }, { success: true }, { fingerprint: 'extra' }]) assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), ...patch }, expected()));
  let calls = 0;
  const getter = { ...input(), get releaseSha() { calls++; return sha; } };
  const proxy = new Proxy(input(), { get(target, key, receiver) { calls++; return Reflect.get(target, key, receiver); } });
  assert.throws(() => api.prepareBackendReleaseIntent(getter, expected())); assert.throws(() => api.prepareBackendReleaseIntent(proxy, expected())); assert.equal(calls, 0);
});

test('saved prepared backend intent cannot change its canonical bytes digest comment or attempt on readmission', async () => {
  const api = await subject(), prepared = api.prepareBackendReleaseIntent(input(), expected());
  for (const patch of [{ canonicalJson: prepared.canonicalJson + ' ' }, { sha256: '0'.repeat(64) }, { base64: Buffer.from('{}').toString('base64') }, { comment: 'Ship it' }, { status: 'APPROVED' }]) assert.throws(() => api.validatePreparedBackendReleaseIntent({ ...prepared, ...patch }, expected()));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, { ...expected(), now: now + 86400000 }));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(prepared, { ...expected(), runAttempt: 2 }));
});


test('independent assignments and exact targets cannot mutually replace evidence with duplicate tasks or a shared origin', async () => {
  const api = await subject();
  const duplicate = input(); duplicate.reviews[1].taskId = duplicate.reviews[0].taskId;
  const duplicateExpected = expected(); duplicateExpected.reviews[1].taskId = duplicateExpected.reviews[0].taskId;
  assert.throws(() => api.prepareBackendReleaseIntent(duplicate, duplicateExpected));
  const shared = { ...targets, api: { ...targets.api, origin: targets.web.origin } };
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), targets: shared }, { ...expected(), targets: shared }));
  const wrongTeam = { ...targets, api: { ...targets.api, teamId: 'team_Other' } };
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), targets: wrongTeam }, { ...expected(), targets: wrongTeam }));
  const foreign = { ...targets, supabase: { ...targets.supabase, projectRef: 'c'.repeat(20) } };
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), targets: foreign }, { ...expected(), targets: foreign }));
});

test('canonical preparation orders independent reviews and re-admits exact lifetime boundary without inventing a receipt', async () => {
  const api = await subject();
  const original = api.prepareBackendReleaseIntent(input(), expected());
  const reordered = { ...input(), reviews: [...input().reviews].reverse() };
  assert.deepEqual(api.prepareBackendReleaseIntent(reordered, expected()), original);
  const expires = Math.min(Date.parse(input().expiresAt), Date.parse(input().reviews[0].reviewedAt) + 86400000);
  assert.equal(api.validatePreparedBackendReleaseIntent(original, { ...expected(), now: expires - 1 }).status, 'PREPARED_ONLY');
  assert.throws(() => api.validatePreparedBackendReleaseIntent(original, { ...expected(), now: expires + 1 }));
  assert.throws(() => api.validatePreparedBackendReleaseIntent(original, { ...expected(), now: Date.parse(input().expiresAt) }));
  let traps = 0; const array = new Proxy(input().reviews, { get(target, key, receiver) { traps++; return Reflect.get(target, key, receiver); } });
  assert.throws(() => api.prepareBackendReleaseIntent({ ...input(), reviews: array }, expected())); assert.equal(traps, 0);
});

const backendApprovals=(comment:string)=>[{environments:[{id:123,name:'staging'}],state:'approved',user:{id:95836629,login:'attaulhaq0',type:'User'},comment}];
test('backend official approval is separate from preparation and binds exact package run environment and founder',async()=>{const api=await subject();assert.equal(typeof api.validateFounderBackendApproval,'function');const prepared=api.prepareBackendReleaseIntent(input(),expected());const receipt=api.validateFounderBackendApproval(prepared,expected().backendRun,backendApprovals(prepared.comment),expected());assert.equal(receipt.purpose,'BACKEND_SYNTHETIC_STAGING');assert.equal(receipt.state,'approved');assert.equal(receipt.packageSha256,prepared.sha256);assert.equal(receipt.founderId,95836629);assert.equal('approvedAt'in receipt,false);assert.equal('approvalId'in receipt,false);});

test('backend approval refuses old web crosspurpose source attempt environment and ambiguous official history',async()=>{const api=await subject(),prepared=api.prepareBackendReleaseIntent(input(),expected()),entry=backendApprovals(prepared.comment)[0];for(const rows of[[],[entry,entry],[{...entry,state:'rejected'}],[{...entry,state:'pending'}],[{...entry,user:{...entry.user,type:'Bot'}}],[{...entry,user:{...entry.user,id:1}}],[{...entry,user:{...entry.user,login:'other'}}],[{...entry,environments:[{id:124,name:'staging'}]}],[{...entry,environments:[{id:123,name:'production'}]}],[{...entry,comment:prepared.comment.replace('backend staging','release')}],[{...entry,comment:prepared.comment.replace('attempt=1','attempt=2')}],[{...entry,comment:'Task approved'}]])assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,rows,expected()));for(const patch of[{path:'.github/workflows/release.yml'},{event:'workflow_run'},{run_attempt:2},{id:52},{head_sha:base},{head_branch:'feature'},{repository:{full_name:'fork/Cuevo'}}])assert.throws(()=>api.validateFounderBackendApproval(prepared,{...expected().backendRun,...patch},backendApprovals(prepared.comment),expected()));});

test('backend official approval cannot borrow inherited or accessor comments and malformed unrelated evidence remains refused',async()=>{const api=await subject(),prepared=api.prepareBackendReleaseIntent(input(),expected()),target=backendApprovals(prepared.comment)[0];let reads=0;const getter={...target,get comment(){reads++;return prepared.comment;}};assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[getter],expected()));const proxy=new Proxy(target,{get(){reads++;return prepared.comment;}});assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[proxy],expected()));const missing:Record<string,unknown>={...target};delete missing.comment;const original=Object.getOwnPropertyDescriptor(Object.prototype,'comment');try{Object.defineProperty(Object.prototype,'comment',{configurable:true,get(){reads++;return prepared.comment;}});assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[missing],expected()));}finally{if(original)Object.defineProperty(Object.prototype,'comment',original);else delete(Object.prototype as Record<string,unknown>).comment;}assert.equal(reads,0);const other={...target,state:'rejected',environments:[{id:124,name:'production'}],comment:'Other reviewed environment'};assert.equal(api.validateFounderBackendApproval(prepared,expected().backendRun,[other,target],expected()).state,'approved');assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,[{...other,state:'UNKNOWN'},target],expected()));});

test('backend approval repeats immutable package current main CI and artifact bindings before accepting official comments',async()=>{const api=await subject(),prepared=api.prepareBackendReleaseIntent(input(),expected()),rows=backendApprovals(prepared.comment);for(const patch of[{sha256:'0'.repeat(64)},{base64:Buffer.from('{}').toString('base64')},{canonicalJson:prepared.canonicalJson+' '},{comment:prepared.comment+' '}])assert.throws(()=>api.validateFounderBackendApproval({...prepared,...patch},expected().backendRun,rows,expected()));for(const patch of[{currentMainSha:base},{ciRun:{...expected().ciRun,conclusion:'failure'}},{treeSha:base},{fingerprints:{...fingerprints,edgeArtifactSha256:'0'.repeat(64)}}])assert.throws(()=>api.validateFounderBackendApproval(prepared,expected().backendRun,rows,{...expected(),...patch}));assert.equal(api.validateFounderBackendApproval(prepared,{...expected().backendRun,status:'in_progress'},rows,expected()).state,'approved');});


test('canonical fingerprint validation preserves exact database-only capability and strict runtime digests',async()=>{const api=await subject(),database={...fingerprints,apiArtifactSha256:null,edgeArtifactSha256:null,denoLockSha256:null};for(const executionScope of ['schema-and-accounts','reconcile-schema'])assert.deepEqual(api.validateBackendReleaseFingerprints(database,{version:2,executionScope}),database);assert.deepEqual(api.validateBackendReleaseFingerprints(fingerprints,{version:1,executionScope:'schema-and-accounts'}),fingerprints);for(const executionScope of ['complete-backend','installed-runtime','pending-runtime-confirmation','runtime-rollout',undefined]){assert.deepEqual(api.validateBackendReleaseFingerprints(fingerprints,{version:2,...(executionScope===undefined?{}:{executionScope})}),fingerprints);assert.throws(()=>api.validateBackendReleaseFingerprints(database,{version:2,...(executionScope===undefined?{}:{executionScope})}));}for(const key of Object.keys(database)){const missing={...database};delete missing[key as keyof typeof missing];assert.throws(()=>api.validateBackendReleaseFingerprints(missing,{version:2,executionScope:'schema-and-accounts'}));}for(const key of ['sourceManifestSha256','diffSha256','migrationPlanSha256','migrationHistorySha256','migrationToolchainSha256','migrationEndpointSha256','operatorStoragePolicySha256'])assert.throws(()=>api.validateBackendReleaseFingerprints({...database,[key]:null},{version:2,executionScope:'schema-and-accounts'}));for(const changed of[{...database,unknownSha256:'1'.repeat(64)},{...database,migrationPlanSha256:null},{...database,migrationHistorySha256:'bad'},{...database,apiArtifactSha256:'5'.repeat(64)}])assert.throws(()=>api.validateBackendReleaseFingerprints(changed,{version:2,executionScope:'schema-and-accounts'}));assert.throws(()=>api.validateBackendReleaseFingerprints(database,{version:1,executionScope:'schema-and-accounts'}));assert.throws(()=>api.validateBackendReleaseFingerprints(database,{version:3,executionScope:'schema-and-accounts'}));});
