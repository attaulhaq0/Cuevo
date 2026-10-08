import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from '../verification/release-review';

const sha=z.string().regex(/^[a-f0-9]{40}$/),digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[1-9][0-9]*$/),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),timestamp=z.iso.datetime({offset:true}),ref=z.string().regex(/^[a-z]{20}$/);
const fail=()=>Error('Installed active runtime requires original native evidence and fresh approval; contents withheld.');
const hash=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
const identitySchema=z.object({sourceSha:sha,treeSha:sha,originalRunId:id,originalRunAttempt:positive,originalPackageSha256:digest,runtimeSha256:digest,apiDeploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),apiUrl:z.string().url(),edgeId:z.string().min(1).max(200),edgeVersion:positive,activationId:z.uuid(),vaultSecretName:z.string().regex(/^cuevo_worker_[a-f0-9]{32}$/),endpoint:z.string().url(),createdAt:timestamp}).strict();
const activationSchema=z.object({status:z.literal('ACTIVATED_SIGNED_SOURCE_VERIFIED'),sourceSha:sha,projectRef:ref,runId:id,runAttempt:positive,packageSha256:digest,runtimeSha256:digest,apiDeploymentId:z.string(),edgeVersion:positive,jobId:positive,sourceProcessed:z.literal(true),duplicateWakeDenied:z.literal(true),originalCommandReplayed:z.literal(true),recoveryScheduled:z.literal(true),scheduledRecoveryVerified:z.literal(true),configurationEvidenceObservedManual:z.literal(true),sessionsClosed:z.literal(true),keyOperation:z.literal('CONFIRMED'),dispatchOperation:z.literal('CONFIRMED'),probeEventId:z.uuid(),observedAt:timestamp}).passthrough();
const cleanupSchema=z.object({purpose:z.literal('CUEVO_HOSTED_WORKER_ACTIVATION_CLEANUP').optional(),status:z.literal('ACTIVATED_SIGNED_SOURCE_VERIFIED'),sourceSha:sha,projectRef:ref,runId:id,runAttempt:positive,lockReleased:z.literal(true),sessionsClosed:z.literal(true),resultSha256:digest,observedAt:timestamp}).strict();
export const publicActiveRuntimeStateSchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_PRIVATE_ACTIVE_RUNTIME_STATE'),projectRef:ref,phase:z.enum(['INTENT','CONFIGURED','CONFIRMED','REQUIRES_REVIEW']),identity:identitySchema,jobId:positive.nullable(),activation:activationSchema.nullable(),cleanup:cleanupSchema.nullable()}).strict();
export const activeRuntimeStateSchema=publicActiveRuntimeStateSchema.extend({wakeKey:digest,runtimeConfig:z.unknown().optional()}).strict();
export type ActiveRuntimeState=z.infer<typeof activeRuntimeStateSchema>;
export function activeRuntimePublicQuery(projectRef:string){ref.parse(projectRef);return `/* CUEVO_INSTALLED_ACTIVE_RUNTIME */ select (decrypted_secret::jsonb-'wakeKey'-'runtimeConfig') as state from vault.decrypted_secrets where name='cuevo_active_runtime_${projectRef}'`;}
export function activeRuntimeConfirmationPublicQuery(projectRef:string){return activeRuntimePublicQuery(projectRef).replace('CUEVO_INSTALLED_ACTIVE_RUNTIME','CUEVO_PENDING_ACTIVE_RUNTIME_CONFIRMATION');}
/** Independent export digests bind this public candidate; it is never ordinary
 * installed-runtime metadata or a native confirmation permit. */
export function readPendingRuntimeConfirmationMetadata(value:unknown,bindingValue:unknown,projectRef:string){
 try{const binding=z.object({configuredPublicStateSha256:digest,confirmedPublicStateSha256:digest}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(bindingValue))),rows=z.array(z.object({state:publicActiveRuntimeStateSchema}).strict()).length(1).parse(JSON.parse(canonicalReleaseExecutionJson(value))),state=rows[0].state;
 if(state.projectRef!==projectRef||!['CONFIGURED','CONFIRMED'].includes(state.phase)||binding.configuredPublicStateSha256===binding.confirmedPublicStateSha256)throw fail();const observedPublicStateSha256=hash(state);if(observedPublicStateSha256!==(state.phase==='CONFIGURED'?binding.configuredPublicStateSha256:binding.confirmedPublicStateSha256))throw fail();if(state.phase==='CONFIRMED')terminal(state);return{observedPhase:state.phase as 'CONFIGURED'|'CONFIRMED',observedPublicStateSha256,...binding};
 }catch{throw fail();}
}

function terminal(state:z.infer<typeof publicActiveRuntimeStateSchema>){
 const a=state.activation,c=state.cleanup,i=state.identity;
 if(state.phase!=='CONFIRMED'||!a||!c||state.jobId!==a.jobId||a.sourceSha!==i.sourceSha||a.projectRef!==state.projectRef||a.runId!==i.originalRunId||a.runAttempt!==i.originalRunAttempt||a.packageSha256!==i.originalPackageSha256||a.runtimeSha256!==i.runtimeSha256||a.apiDeploymentId!==i.apiDeploymentId||a.edgeVersion!==i.edgeVersion||c.sourceSha!==i.sourceSha||c.projectRef!==state.projectRef||c.runId!==i.originalRunId||c.runAttempt!==i.originalRunAttempt||c.resultSha256!==hash(a)||Date.parse(a.observedAt)<Date.parse(i.createdAt)||Date.parse(c.observedAt)<Date.parse(a.observedAt)||i.endpoint!==`https://${state.projectRef}.supabase.co/functions/v1/cuevo-worker`||i.vaultSecretName!=='cuevo_worker_'+i.activationId.replaceAll('-','')||!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(i.apiUrl))throw fail();
}

/** Public package metadata contains hashes and original identities only. */
export function readInstalledRuntimeMetadata(value:unknown,projectRef:string){
 try{const rows=z.array(z.object({state:publicActiveRuntimeStateSchema}).strict()).length(1).parse(JSON.parse(canonicalReleaseExecutionJson(value))),state=rows[0].state;if(state.projectRef!==projectRef)throw fail();terminal(state);const{createdAt:_createdAt,...identity}=state.identity;void _createdAt;return{version:1 as const,purpose:'CUEVO_INSTALLED_ACTIVE_RUNTIME' as const,...identity,jobId:state.jobId!,activationReceiptSha256:hash(state.activation)};}catch{throw fail();}
}

/** Exact original evidence only; this candidate grants no installed-runtime authority. */
export function validateActiveRuntimeConfirmationCandidate(stateValue:unknown,originalValue:unknown,projectRef:string):ActiveRuntimeState{
 try{
  const state=activeRuntimeStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(stateValue))),original=z.object({identity:identitySchema,wakeKeySha256:digest,runtimeConfigSha256:digest,activation:activationSchema,cleanup:cleanupSchema}).strict().parse(JSON.parse(canonicalReleaseExecutionJson(originalValue)));
  if(state.projectRef!==projectRef||hash(state.identity)!==hash(original.identity)||createHash('sha256').update(state.wakeKey).digest('hex')!==original.wakeKeySha256||hash(state.runtimeConfig??null)!==original.runtimeConfigSha256||hash(state.activation)!==hash(original.activation)||state.jobId!==original.activation.jobId)throw fail();
  if(state.phase==='CONFIGURED'){
   if(state.cleanup!==null)throw fail();
   validateActiveRuntimeTransition(state,{...state,phase:'CONFIRMED',cleanup:original.cleanup},projectRef);
  }else if(state.phase==='CONFIRMED'){
   if(hash(state.cleanup)!==hash(original.cleanup))throw fail();
   terminal(state);
  }else throw fail();
  return state;
 }catch{throw fail();}
}

export function validateActiveRuntimeTransition(beforeValue:unknown|null,afterValue:unknown,projectRef:string):ActiveRuntimeState{
 try{const after=activeRuntimeStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(afterValue)));if(after.projectRef!==projectRef)throw fail();if(beforeValue===null){if(after.phase!=='INTENT'||after.jobId!==null||after.activation!==null||after.cleanup!==null)throw fail();return after;}
 const before=activeRuntimeStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(beforeValue)));if(before.projectRef!==projectRef||hash(before.identity)!==hash(after.identity)||before.wakeKey!==after.wakeKey||hash(before.runtimeConfig??null)!==hash(after.runtimeConfig??null))throw fail();
 if(before.phase===after.phase){if(hash(before)!==hash(after))throw fail();return after;}
 if(before.phase==='INTENT'&&after.phase==='CONFIGURED'){if(!after.activation||!after.jobId||after.cleanup!==null)throw fail();}
 else if(before.phase==='CONFIGURED'&&after.phase==='CONFIRMED'){terminal(after);if(hash(before.activation)!==hash(after.activation)||before.jobId!==after.jobId)throw fail();}
 else if(!['INTENT','CONFIGURED'].includes(before.phase)||after.phase!=='REQUIRES_REVIEW')throw fail();return after;
 }catch{throw fail();}
}

const generation=z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n);
export const runtimeReleaseGenerationIdentitySchema=z.object({generation,sourceSha:sha,treeSha:sha,executorSourceSha:sha.optional(),executorTreeSha:sha.optional(),runId:id,runAttempt:positive,packageSha256:digest,runtimeSha256:digest,apiArtifactSha256:digest,edgeArtifactSha256:digest,denoLockSha256:digest,migrationSetSha256:digest,compatibilitySha256:digest,apiDeploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/).nullable(),apiUrl:z.string().url().nullable(),edgeId:z.string().min(1).max(200).nullable(),edgeVersion:positive.nullable()}).strict();
export const runtimeRolloutPhases=['INTENT','PAUSED','DRAINED','PROVIDERS_CONFIRMED','PRIVATE_VERIFIED','ALIAS_CONFIRMED','EXECUTION_ENABLED','CONFIRMED'] as const;
const phaseReceipt=z.object({phase:z.enum(runtimeRolloutPhases),sha256:digest,observedAt:timestamp}).strict();
const operatingEvidenceSchema=z.object({purpose:z.literal('CUEVO_RUNTIME_GENERATION_OPERATING_PROOF'),sourceSha:sha,generation,operationSha256:digest,positiveWakeVerified:z.literal(true),duplicateWakeDenied:z.literal(true),staleGenerationDenied:z.literal(true),generationFenceBasis:z.literal('APPLIED_SQL_AND_CURRENT_EXECUTION').optional(),originalSourcePreserved:z.literal(true),sourceProcessed:z.literal(true).optional(),scheduledRecoveryVerified:z.literal(true).optional(),observedAt:timestamp}).strict();
export const runtimeReleaseGenerationSchema=z.object({basis:z.enum(['ORIGINAL_ACTIVATION','ROLLOUT']),identity:runtimeReleaseGenerationIdentitySchema,operationSha256:digest,previousStateSha256:digest,phase:z.enum([...runtimeRolloutPhases,'REQUIRES_REVIEW']),receipts:z.array(phaseReceipt).max(8),runtimeConfigurationSha256:digest,confirmationEvidence:operatingEvidenceSchema.nullable().optional()}).strict();
const archiveHead=z.object({path:z.string().regex(/^runtime-history\/[a-z]{20}\/[1-9][0-9]{0,18}-[a-f0-9]{64}\.json$/),sha256:digest,previousSha256:digest.nullable(),generation,operationSha256:digest}).strict();
const publicOriginal=publicActiveRuntimeStateSchema;
export const publicRuntimeReleaseStateSchema=z.object({version:z.literal(2),purpose:z.literal('CUEVO_PRIVATE_ACTIVE_RUNTIME_STATE'),projectRef:ref,original:publicOriginal,current:runtimeReleaseGenerationSchema,pending:runtimeReleaseGenerationSchema.nullable(),historyHead:archiveHead.nullable()}).strict();
export const runtimeReleaseStateSchema=publicRuntimeReleaseStateSchema.extend({original:activeRuntimeStateSchema,currentRuntimeConfiguration:z.unknown(),pendingRuntimeConfiguration:z.unknown().nullable()}).strict();
export type RuntimeReleaseState=z.infer<typeof runtimeReleaseStateSchema>;
export type RuntimeReleaseGeneration=z.infer<typeof runtimeReleaseGenerationSchema>;
export const runtimeReleaseStateSha256=hash;
export function runtimeReleasePublicState(value:unknown){const state=runtimeReleaseStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),{wakeKey:_key,runtimeConfig:_config,...original}=state.original;void _key;void _config;return publicRuntimeReleaseStateSchema.parse({version:2,purpose:state.purpose,projectRef:state.projectRef,original,current:state.current,pending:state.pending,historyHead:state.historyHead});}
function checkGeneration(value:RuntimeReleaseGeneration,projectRef:string,confirmed=false){
 if((value.identity.executorSourceSha===undefined)!==(value.identity.executorTreeSha===undefined))throw fail();
 if(value.basis==='ORIGINAL_ACTIVATION'){if(value.identity.generation!=='1'||value.phase!=='CONFIRMED'||value.receipts.length!==1||value.receipts[0].phase!=='CONFIRMED')throw fail();}
 const index=runtimeRolloutPhases.indexOf(value.phase as typeof runtimeRolloutPhases[number]);
 if(value.basis==='ROLLOUT'&&(value.receipts.length!==new Set(value.receipts.map(row=>row.phase)).size||value.receipts.some((row,i)=>row.phase!==runtimeRolloutPhases[i]||i>0&&Date.parse(row.observedAt)<Date.parse(value.receipts[i-1].observedAt))))throw fail();
 if(value.basis==='ROLLOUT'&&value.phase!=='REQUIRES_REVIEW'&&(index<0||value.receipts.length!==index+1))throw fail();
 const i=value.identity,providerFields=[i.apiDeploymentId,i.apiUrl,i.edgeId,i.edgeVersion];
 if(index>=3||confirmed){if(providerFields.some(field=>field===null)||!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(i.apiUrl!))throw fail();}else if(providerFields.some(field=>field!==null)&&providerFields.some(field=>field===null))throw fail();
 if(confirmed&&value.phase!=='CONFIRMED'||!ref.safeParse(projectRef).success)throw fail();
 if(value.phase==='CONFIRMED'&&(value.basis==='ROLLOUT'||value.confirmationEvidence)){const proof=operatingEvidenceSchema.parse(value.confirmationEvidence);if(proof.sourceSha!==value.identity.sourceSha||proof.generation!==value.identity.generation||proof.operationSha256!==value.operationSha256||value.basis==='ROLLOUT'&&(hash(proof)!==value.receipts.at(-1)!.sha256||proof.observedAt!==value.receipts.at(-1)!.observedAt))throw fail();}else if(value.confirmationEvidence)throw fail();
}
function desiredIdentity(value:RuntimeReleaseGeneration){const{apiDeploymentId:_api,apiUrl:_url,edgeId:_edge,edgeVersion:_version,...identity}=value.identity;void _api;void _url;void _edge;void _version;return identity;}
/** Version two retains original activation and one current/pending projection.
 * Archives, provider receipts and native CAS remain the writer's obligations. */
export function validateRuntimeReleaseTransition(beforeValue:unknown|null,afterValue:unknown,projectRef:string):RuntimeReleaseState{
 try{const after=runtimeReleaseStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(afterValue)));if(after.projectRef!==projectRef||after.original.projectRef!==projectRef)throw fail();terminal(after.original);checkGeneration(after.current,projectRef,true);if(hash(after.currentRuntimeConfiguration)!==after.current.runtimeConfigurationSha256||after.current.identity.runtimeSha256!==after.current.runtimeConfigurationSha256)throw fail();
  if(after.pending){checkGeneration(after.pending,projectRef);if(after.pending.basis!=='ROLLOUT'||after.pendingRuntimeConfiguration===null||hash(after.pendingRuntimeConfiguration)!==after.pending.runtimeConfigurationSha256||BigInt(after.pending.identity.generation)!==BigInt(after.current.identity.generation)+1n)throw fail();}else if(after.pendingRuntimeConfiguration!==null)throw fail();
  if(beforeValue===null){if(after.current.basis!=='ORIGINAL_ACTIVATION'||after.current.identity.generation!=='1'||after.pending||after.historyHead||after.current.receipts[0].sha256!==hash(after.original.activation)||after.current.identity.sourceSha!==after.original.identity.sourceSha||after.current.identity.treeSha!==after.original.identity.treeSha||after.current.identity.apiDeploymentId!==after.original.identity.apiDeploymentId||after.current.identity.apiUrl!==after.original.identity.apiUrl||after.current.identity.edgeId!==after.original.identity.edgeId||after.current.identity.edgeVersion!==after.original.identity.edgeVersion)throw fail();return after;}
  const before=runtimeReleaseStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(beforeValue)));if(before.projectRef!==projectRef||hash(before.original)!==hash(after.original))throw fail();
  if(hash(before)===hash(after))return after;
  if(before.current.basis==='ORIGINAL_ACTIVATION'&&!before.current.confirmationEvidence&&after.current.confirmationEvidence&&hash(Object.fromEntries(Object.entries(after.current).filter(([key])=>key!=='confirmationEvidence')))===hash(Object.fromEntries(Object.entries(before.current).filter(([key])=>key!=='confirmationEvidence')))&&hash(before.currentRuntimeConfiguration)===hash(after.currentRuntimeConfiguration)&&hash(before.pending)===hash(after.pending)&&hash(before.historyHead)===hash(after.historyHead))return after;
  if(hash(before.current)===hash(after.current)){
   if(hash(before.currentRuntimeConfiguration)!==hash(after.currentRuntimeConfiguration)||hash(before.historyHead)!==hash(after.historyHead))throw fail();
   if(!before.pending){if(!after.pending||after.pending.phase!=='INTENT'||after.pending.previousStateSha256!==hash(runtimeReleasePublicState(before)))throw fail();return after;}
   if(!after.pending||hash(desiredIdentity(before.pending))!==hash(desiredIdentity(after.pending))||before.pending.operationSha256!==after.pending.operationSha256||before.pending.previousStateSha256!==after.pending.previousStateSha256||before.pending.runtimeConfigurationSha256!==after.pending.runtimeConfigurationSha256||hash(before.pendingRuntimeConfiguration)!==hash(after.pendingRuntimeConfiguration)||after.pending.receipts.length<before.pending.receipts.length||after.pending.receipts.length>before.pending.receipts.length+1)throw fail();
   if(before.pending.receipts.some((row,index)=>hash(row)!==hash(after.pending!.receipts[index])))throw fail();
   const a=runtimeRolloutPhases.indexOf(before.pending.phase as typeof runtimeRolloutPhases[number]),b=runtimeRolloutPhases.indexOf(after.pending.phase as typeof runtimeRolloutPhases[number]);if(after.pending.phase!=='REQUIRES_REVIEW'&&(a<0||b!==a+1))throw fail();
   if(before.pending.identity.apiDeploymentId!==null&&hash(before.pending.identity)!==hash(after.pending.identity))throw fail();return after;
  }
  if(!before.pending||before.pending.phase!=='CONFIRMED'||after.pending!==null||hash(after.current)!==hash(before.pending)||hash(after.currentRuntimeConfiguration)!==hash(before.pendingRuntimeConfiguration)||!after.historyHead||after.historyHead.generation!==before.current.identity.generation||after.historyHead.operationSha256!==before.pending.operationSha256||after.historyHead.path!==`runtime-history/${projectRef}/${before.current.identity.generation}-${before.pending.operationSha256}.json`||after.historyHead.previousSha256!==(before.historyHead?.sha256??null))throw fail();
  return after;
 }catch{throw fail();}
}
export function readCurrentRuntimeMetadata(value:unknown,projectRef:string){
 try{const rows=z.array(z.object({state:publicRuntimeReleaseStateSchema}).strict()).length(1).parse(JSON.parse(canonicalReleaseExecutionJson(value))),state=rows[0].state;if(state.projectRef!==projectRef||state.original.projectRef!==projectRef||state.pending)throw fail();terminal(state.original);checkGeneration(state.current,projectRef,true);return{version:2 as const,purpose:'CUEVO_CURRENT_ACTIVE_RUNTIME' as const,originalActivation:readInstalledRuntimeMetadata([{state:state.original}],projectRef),current:state.current.identity,activationReceiptSha256:state.current.receipts.at(-1)!.sha256,stateSha256:hash(state)};}catch{throw fail();}
}
/** Public recovery evidence retains all original generation invariants while
 * omitting the private configuration and signing material by construction. */
export function validateRuntimeReleasePublicState(value:unknown,projectRef:string){const state=publicRuntimeReleaseStateSchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));if(state.projectRef!==projectRef||state.original.projectRef!==projectRef)throw fail();terminal(state.original);checkGeneration(state.current,projectRef,true);if(state.pending){checkGeneration(state.pending,projectRef);if(state.pending.basis!=='ROLLOUT'||BigInt(state.pending.identity.generation)!==BigInt(state.current.identity.generation)+1n)throw fail();}return state;}
export function runtimeReleasePublicQuery(projectRef:string){ref.parse(projectRef);return `/* CUEVO_CURRENT_RUNTIME_RELEASE */ select (decrypted_secret::jsonb-'currentRuntimeConfiguration'-'pendingRuntimeConfiguration')#-'{original,wakeKey}'#-'{original,runtimeConfig}' as state from vault.decrypted_secrets where name='cuevo_active_runtime_${projectRef}'`;}
