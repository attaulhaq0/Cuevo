import {z} from 'zod';
import {canonicalReleaseExecutionJson} from './release-review';
import {hostedMigrationEndpointSchema} from '../database/hosted-migration-provider';

const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[1-9][0-9]{0,19}$/),positive=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),date=z.iso.datetime({offset:true});
export const backendRuntimeArtifactProvenanceSchema=z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),sourceSha:z.string().regex(/^[a-f0-9]{40}$/),treeSha:z.string().regex(/^[a-f0-9]{40}$/),runId:id,runAttempt:positive,artifactId:id,archiveSha256:digest,receiptSha256:digest,sourceLockSha256:digest,producerJobId:id,producerJobsSha256:digest,observedAt:date,expiresAt:date}).strict();
export const previousRuntimeArtifactsSchema=z.object({apiRoot:z.string().min(1),edgeRoot:z.string().min(1),receiptPath:z.string().min(1),contractManifestPath:z.string().min(1),archivePath:z.string().min(1),provenance:backendRuntimeArtifactProvenanceSchema}).strict();
export type PreviousRuntimeArtifacts=z.infer<typeof previousRuntimeArtifactsSchema>;
export const backendReleaseDeliverySchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('DATABASE_ONLY'),apiRoot:z.null(),edgeRoot:z.null()}).strict(),
 z.object({kind:z.literal('RUNTIME_OBSERVATION'),apiRoot:z.null(),edgeRoot:z.null(),apiArtifactSha256:digest,edgeArtifactSha256:digest,denoLockSha256:digest}).strict(),
 z.object({kind:z.literal('CI_RUNTIME_ARTIFACTS'),apiRoot:z.string().min(1),edgeRoot:z.string().min(1),provenance:backendRuntimeArtifactProvenanceSchema}).strict(),
]);
export type BackendReleaseDelivery=z.infer<typeof backendReleaseDeliverySchema>;
const backendExecutionCommon=z.object({purpose:z.literal('CUEVO_BACKEND_RELEASE_EXECUTION'),repoRoot:z.string(),expected:z.unknown(),preparedApproval:z.unknown(),plan:z.unknown(),runtimeRecoveryExport:z.object({path:z.string(),sha256:digest}).strict().optional(),runtimeRolloutEvidence:z.object({compatibilityPath:z.string(),compatibilitySha256:digest,previousArtifactProvenance:backendRuntimeArtifactProvenanceSchema.optional(),previousRuntimeArtifacts:previousRuntimeArtifactsSchema.optional(),recoveryEvidence:z.object({exportPath:z.string(),exportSha256:digest,selectionPath:z.string(),selectionSha256:digest,encryptedHistoryPath:z.string(),encryptedHistorySha256:digest}).strict().optional()}).strict().optional(),schemaRecoveryExport:z.unknown().optional(),schemaRecoverySelection:z.unknown().optional(),pendingActivationEvidence:z.object({exportPath:z.string(),exportSha256:digest,selectionPath:z.string(),selectionSha256:digest}).strict().optional(),migrationEndpoint:hostedMigrationEndpointSchema,stages:z.array(z.unknown()).max(4),toolchainManifestPath:z.string(),operatorStoragePolicyPath:z.string()}).strict();
/** One execution envelope owner for the workflow and downstream consumers.
 * Capability validation remains separate from immutable historical decoding. */
export const backendReleaseExecutionSchema=z.discriminatedUnion('version',[backendExecutionCommon.extend({version:z.literal(1),artifacts:z.object({apiRoot:z.string(),edgeRoot:z.string()}).strict()}).strict(),backendExecutionCommon.extend({version:z.literal(2),delivery:backendReleaseDeliverySchema}).strict()]);
export function validateBackendReleaseDelivery(value:unknown,scope:string):BackendReleaseDelivery{
 const result=backendReleaseDeliverySchema.parse(JSON.parse(canonicalReleaseExecutionJson(value)));if(result.kind==='DATABASE_ONLY'?!['schema-and-accounts','reconcile-schema'].includes(scope):result.kind==='RUNTIME_OBSERVATION'?!['installed-runtime','pending-runtime-confirmation'].includes(scope):!['complete-backend','runtime-rollout'].includes(scope))throw Error('Backend delivery capability does not match its reviewed scope.');return result;
}
