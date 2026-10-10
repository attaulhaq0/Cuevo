import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalReleaseReviewJson } from '../verification/release-review';

const sha = z.string().regex(/^[a-f0-9]{40}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const identity = z.object({ sourceSha: sha, treeSha: sha, apiArtifactSha256: digest, edgeArtifactSha256: digest, denoLockSha256: digest, runtimeSha256: digest,
  teamId: z.string().regex(/^team_[A-Za-z0-9]+$/), projectId: z.string().regex(/^prj_[A-Za-z0-9]+$/), originalRunId: z.string().regex(/^[1-9][0-9]*$/), originalRunAttempt: positive, originalPackageSha256: digest,releaseGeneration:z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n).optional(),operationSha256:digest.optional(),executorSourceSha:sha.optional(),executorTreeSha:sha.optional() }).strict();
export const preparedEdgeContentBindingSchema=z.object({artifactVersion:z.literal(2),rawEszipSha256:digest,ezbrSha256:digest,rawByteSize:z.number().int().min(9).max(32*1024*1024),entrypoint:z.literal('edge/index.ts')}).strict();
export type PreparedEdgeContentBinding=z.infer<typeof preparedEdgeContentBindingSchema>;
const receipts = z.union([
  z.object({ kind: z.literal('API_ENVIRONMENT'), keysSha256: digest, valuesSha256: digest, variables: z.array(z.object({ key: z.string().min(1).max(100), id: z.string().min(1).max(200), valueSha256: digest }).strict()).min(1).max(100) }).strict(),
  z.object({ kind: z.literal('API_DEPLOYMENT'), deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/), url: z.string().url().refine(value => { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname); }),createdAtMs:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }).strict(),
  z.object({ kind: z.literal('EDGE_SECRETS'), valuesSha256: digest, variables: z.array(z.object({ name: z.string().min(1).max(100), valueSha256: digest }).strict()).min(1).max(100) }).strict(),
  z.object({ kind: z.literal('EDGE_DEPLOYMENT'), id: z.string().min(1).max(200), version: positive }).strict(),
  z.object({kind:z.literal('EDGE_DEPLOYMENT'),id:z.string().min(1).max(200),version:positive,artifactVersion:z.literal(2),rawEszipSha256:digest,ezbrSha256:digest,rawByteSize:z.number().int().min(9).max(32*1024*1024),entrypoint:z.literal('edge/index.ts')}).strict(),
]);
export const providerPhaseOrder = ['API_ENVIRONMENT', 'API_DEPLOYMENT', 'EDGE_SECRETS', 'EDGE_DEPLOYMENT'] as const;
const phase = z.object({ name: z.enum(providerPhaseOrder), state: z.enum(['INTENT', 'CONFIRMED']), receipt: receipts.nullable() }).strict();
export const providerDeploymentStateSchema = z.object({ version: z.union([z.literal(1),z.literal(2)]), purpose: z.literal('CUEVO_PRIVATE_PROVIDER_DEPLOYMENT_STATE'), projectRef: z.string().regex(/^[a-z]{20}$/), operations: z.array(z.object({ identity, phases: z.array(phase).min(1).max(4) }).strict()).min(1).max(20) }).strict().superRefine((state, context) => {
  const legacy=state.operations.filter(row=>row.identity.operationSha256===undefined),modern=state.operations.filter(row=>row.identity.operationSha256!==undefined);if(state.operations.some(row=>(row.identity.operationSha256===undefined)!==(row.identity.releaseGeneration===undefined))||state.operations.some(row=>(row.identity.executorSourceSha===undefined)!==(row.identity.executorTreeSha===undefined)||row.identity.executorSourceSha!==undefined&&row.identity.operationSha256===undefined)||state.version===1&&modern.length||new Set(legacy.map(row=>row.identity.sourceSha)).size!==legacy.length||new Set(modern.map(row=>row.identity.operationSha256)).size!==modern.length||state.operations.some((row,index)=>row.identity.operationSha256===undefined&&state.operations.slice(0,index).some(prior=>prior.identity.operationSha256!==undefined)))context.addIssue({code:'custom',message:'Original legacy and generation-bound provider identities require exact unique history.'});
  for (const [operationIndex, operation] of state.operations.entries()) for (const [index, row] of operation.phases.entries()) {
    if (row.name !== providerPhaseOrder[index] || row.state === 'INTENT' && (row.receipt !== null || index !== operation.phases.length - 1 || operationIndex !== state.operations.length - 1)
      || row.state === 'CONFIRMED' && row.receipt?.kind !== row.name) context.addIssue({ code: 'custom', message: 'Original provider phases must be ordered and confirmed before continuation.' });
    if (row.receipt?.kind === 'API_ENVIRONMENT' && (new Set(row.receipt.variables.map(variable => variable.key)).size !== row.receipt.variables.length || new Set(row.receipt.variables.map(variable => variable.id)).size !== row.receipt.variables.length)
      || row.receipt?.kind === 'EDGE_SECRETS' && new Set(row.receipt.variables.map(variable => variable.name)).size !== row.receipt.variables.length) context.addIssue({ code: 'custom', message: 'Provider recipients must be unique.' });
  }
  if (state.operations.slice(0, -1).some(operation => operation.phases.length !== 4 || operation.phases.some(row => row.state !== 'CONFIRMED'))) context.addIssue({ code: 'custom', message: 'Prior provider operation requires review.' });
});
export type ProviderDeploymentState = z.infer<typeof providerDeploymentStateSchema>;
export type ProviderDeploymentOperation = ProviderDeploymentState['operations'][number];
export type ProviderDeploymentPhase = ProviderDeploymentOperation['phases'][number];
export const providerStateSha256 = (value: unknown) => createHash('sha256').update(canonicalReleaseReviewJson(value)).digest('hex');

/** Original phases are append-only facts. A new current approval can consume
 * them, but can never rewrite their identity or repeat an unconfirmed upload. */
export function validateProviderDeploymentTransition(beforeValue: unknown | null, afterValue: unknown, projectRef: string): ProviderDeploymentState {
  const after = providerDeploymentStateSchema.parse(JSON.parse(canonicalReleaseReviewJson(afterValue)));
  if (after.projectRef !== projectRef) throw Error('Private provider state requires review.');
  if (beforeValue === null) {
    if (after.operations.length !== 1 || after.operations[0].phases.length !== 1 || after.operations[0].phases[0].state !== 'INTENT') throw Error('Original provider intent is required.');
    return after;
  }
  const before = providerDeploymentStateSchema.parse(JSON.parse(canonicalReleaseReviewJson(beforeValue)));
  if(before.version===2&&after.version!==2||before.version===1&&after.version===2&&!after.operations.some(row=>row.identity.operationSha256!==undefined))throw Error('Provider history version cannot be downgraded or relabeled.');
  if (before.projectRef !== projectRef || after.operations.length < before.operations.length || after.operations.length > before.operations.length + 1) throw Error('Private provider history cannot be replaced.');
  for (const [index, operation] of before.operations.entries()) {
    const next = after.operations[index];
    if (canonicalReleaseReviewJson(next.identity) !== canonicalReleaseReviewJson(operation.identity) || next.phases.length < operation.phases.length || next.phases.length > operation.phases.length + 1) throw Error('Original provider identity is immutable.');
    for (const [phaseIndex, row] of operation.phases.entries()) {
      const updated = next.phases[phaseIndex];
      if (row.state === 'CONFIRMED' && canonicalReleaseReviewJson(row) !== canonicalReleaseReviewJson(updated) || row.state === 'INTENT' && updated.name !== row.name) throw Error('Original provider receipt is immutable.');
    }
    if (next.phases.length > operation.phases.length && next.phases.at(-1)?.state !== 'INTENT') throw Error('Each provider phase needs original intent.');
  }
  if (after.operations.length > before.operations.length && (before.operations.at(-1)?.phases.length !== 4 || before.operations.at(-1)?.phases.some(row => row.state !== 'CONFIRMED') || after.operations.at(-1)?.phases.length !== 1 || after.operations.at(-1)?.phases[0].state !== 'INTENT')) throw Error('Previous provider operation must be complete.');
  return after;
}
