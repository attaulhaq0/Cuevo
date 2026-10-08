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
