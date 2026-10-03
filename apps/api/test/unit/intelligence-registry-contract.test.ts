import { describe, expect, it } from 'vitest';
import { intelligenceExecutionManifestSchema } from '@cuevo/contracts';
const manifest = { version: 'teacher-insight-1', purpose: 'NEXT_LEARNING_ACTION', capabilities: ['GROUNDED_EXPLANATION', 'RECOMMENDATION'], mode: 'FIXTURE', provider: 'deterministic-fixture', model: 'source-locked-v1', promptId: 'next-learning-action', promptVersion: '2', promptDigest: 'a'.repeat(64), promptSource: 'SOURCE_CONTROLLED_TASK_POLICY', promptEffectiveAt: '2026-10-02T00:00:00Z', evaluationVersion: 'source-78-checked-evidence-1', dataClassification: 'SCHOOL_CUSTOM_NUMERIC', providerDataPolicy: 'LOCAL_SYNTHETIC_FIXTURE', maxOutputTokens: 1000, timeoutMs: 10000, maxCost: 1 };
describe('execution registry metadata boundaries', () => {
  it('keeps hosted fixture provenance distinct and rejects fixture policy assigned to live mode', () => {
    expect(intelligenceExecutionManifestSchema.safeParse({ ...manifest, providerDataPolicy: 'HOSTED_SYNTHETIC_FIXTURE' }).success).toBe(true);
    expect(intelligenceExecutionManifestSchema.safeParse({ ...manifest, mode: 'LIVE', providerDataPolicy: 'HOSTED_SYNTHETIC_FIXTURE' }).success).toBe(false);
  });
  it('retains exact task/model/prompt manifest and source approval metadata', () => {
    expect(intelligenceExecutionManifestSchema.safeParse(manifest).success).toBe(true);
    for (const fields of [{ capabilities: ['RELEASE_GRADES'] }, { promptDigest: '' }, { providerDataPolicy: 'UNVERIFIED_IS_APPROVED' }, { apiKey: 'private' }, { promptEffectiveAt: '' }]) expect(intelligenceExecutionManifestSchema.safeParse({ ...manifest, ...fields }).success).toBe(false);
  });
});
