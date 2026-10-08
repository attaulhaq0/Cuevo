import {createHash} from 'node:crypto';
import {z} from 'zod';
import {canonicalReleaseExecutionJson} from './release-review';

const digest=z.string().regex(/^[a-f0-9]{64}$/),sha=z.string().regex(/^[a-f0-9]{40}$/),id=z.string().regex(/^[1-9][0-9]*$/),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const migration=z.object({name:z.string().regex(/^[0-9]{14}_[a-z0-9_]+\.sql$/),version:z.string().regex(/^[0-9]{14}$/),sha256:digest}).strict();
export const runtimeComponentContractSchema=z.object({sourceSha:sha,treeSha:sha,apiArtifactSha256:digest,edgeArtifactSha256:digest,denoLockSha256:digest,apiContractSha256:digest,workerContractSha256:digest,workerAdmissionProtocol:z.literal('GENERATION_V1'),migrations:z.array(migration).min(1).max(1000)}).strict();
const pair=z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:sha,treeSha:sha,runId:id,runAttempt:positive,jobsSha256:digest,previousContractSha256:digest,desiredContractSha256:digest,oldApiOnExpandedDbSha256:digest,newApiOnExpandedDbSha256:digest,oldWorkerOnExpandedDbSha256:digest,newWorkerOnExpandedDbSha256:digest,storedSourceVersionsSha256:digest,authorizationDenialsSha256:digest,decisionPath:z.string().regex(/^docs\/decisions\/[a-z0-9-]+\.md$/),decisionSha256:digest}).strict();
export const runtimeRolloutCompatibilitySchema=z.object({version:z.literal(1),purpose:z.literal('CUEVO_REVIEWED_RUNTIME_TRANSITION'),previous:runtimeComponentContractSchema,desired:runtimeComponentContractSchema,basis:z.enum(['IDENTICAL_COMPONENT_CONTRACTS','UNCHANGED_RUNTIME_CONTRACTS','PAIRED_RUNTIME_VERIFICATION']),pairedEvidence:pair.nullable(),rollback:z.enum(['RETAINED_PROVIDER_ARTIFACTS_ON_EXPANDED_SCHEMA','REQUIRES_REVIEW'])}).strict();
export const runtimeContractSha256=(value:unknown)=>createHash('sha256').update(canonicalReleaseExecutionJson(value)).digest('hex');
/** Structural proof only. Native admission must authenticate the producer and
 * read the named paired evidence bytes; JSON hashes never grant effect authority. */
export function validateRuntimeRolloutCompatibility(value:unknown,expected:{previousSourceSha:string;desiredSourceSha:string;desiredTreeSha:string;runId:string;runAttempt:number}){
 const result=runtimeRolloutCompatibilitySchema.parse(JSON.parse(canonicalReleaseExecutionJson(value))),{previous,desired}=result;
 if(previous.sourceSha!==expected.previousSourceSha||desired.sourceSha!==expected.desiredSourceSha||desired.treeSha!==expected.desiredTreeSha||previous.migrations.length>desired.migrations.length)throw Error('Runtime transition compatibility requires reviewed exact component evidence.');
 for(const rows of [previous.migrations,desired.migrations])if(new Set(rows.map(row=>row.version)).size!==rows.length||rows.some(row=>row.name.slice(0,14)!==row.version))throw Error('Migration identity requires review.');
 if(previous.migrations.some((row,index)=>runtimeContractSha256(row)!==runtimeContractSha256(desired.migrations[index])))throw Error('Applied migration history is immutable.');
 const components=(value:z.infer<typeof runtimeComponentContractSchema>)=>{const{sourceSha:_source,treeSha:_tree,...contract}=value;void _source;void _tree;return contract;};
 if(result.basis==='IDENTICAL_COMPONENT_CONTRACTS'){
  if(result.pairedEvidence!==null||runtimeContractSha256(components(previous))!==runtimeContractSha256(components(desired)))throw Error('Changed runtime requires paired execution evidence.');
 }else if(result.basis==='UNCHANGED_RUNTIME_CONTRACTS'){
  const contracts=(value:z.infer<typeof runtimeComponentContractSchema>)=>({apiContractSha256:value.apiContractSha256,workerContractSha256:value.workerContractSha256,workerAdmissionProtocol:value.workerAdmissionProtocol,denoLockSha256:value.denoLockSha256,migrations:value.migrations});
  if(result.pairedEvidence!==null||runtimeContractSha256(contracts(previous))!==runtimeContractSha256(contracts(desired)))throw Error('Changed database or public runtime contracts require compatibility verification.');
 }else{
  const proof=pair.parse(result.pairedEvidence);if(proof.sourceSha!==expected.desiredSourceSha||proof.treeSha!==expected.desiredTreeSha||proof.runId!==expected.runId||proof.runAttempt!==expected.runAttempt||proof.previousContractSha256!==runtimeContractSha256(previous)||proof.desiredContractSha256!==runtimeContractSha256(desired))throw Error('Paired runtime producer does not match this transition.');
 }
 return{manifest:result,sha256:runtimeContractSha256(result),pendingMigrations:desired.migrations.slice(previous.migrations.length),pairedEvidence:result.pairedEvidence,rollbackPermittedByContract:result.rollback==='RETAINED_PROVIDER_ARTIFACTS_ON_EXPANDED_SCHEMA'};
}
