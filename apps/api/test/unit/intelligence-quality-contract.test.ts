import { describe, expect, it } from 'vitest';
import { intelligenceQualityReviewInputSchema, intelligenceEvaluationSchema } from '@cuevo/contracts';

const review = { usefulness: 'USEFUL', grounding: 'SUPPORTED', privacy: 'NO_ISSUE_OBSERVED', toolSafety: 'UNKNOWN', confirmReview: true, reason: 'Reviewed the supplied evidence and proposed next step.' };
const emptyRate = { numerator: 0, denominator: 0, rate: null };
describe('observed intelligence quality boundaries', () => {
  it('requires explicit structured human observations and preserves unknown', () => {
    expect(intelligenceQualityReviewInputSchema.safeParse(review).success).toBe(true);
    for (const change of [{ confirmReview: false }, { usefulness: 'GENIUS' }, { reason: '' }, { grounding: null }, { academicGrade: 10 }]) expect(intelligenceQualityReviewInputSchema.safeParse({ ...review, ...change }).success).toBe(false);
  });
  it('separates two assessed outputs from one unevaluated attempt and sampled human judgments', () => {
    const value = { scope: 'CURRENT_AUTHORIZED_RUNS', structuralAcceptance: { numerator: 1, denominator: 2, rate: .5 }, unevaluatedAttempts: 1, legacyUnobservedRuns: 4, humanReviewCount: 1, usefulness: { numerator: 1, denominator: 1, rate: 1 }, unsupportedClaim: emptyRate, privacyIssue: emptyRate, invalidTool: emptyRate, humanOverride: emptyRate, limitation: 'OBSERVED_SAMPLE_NOT_QUALITY_CERTIFICATION' };
    expect(intelligenceEvaluationSchema.safeParse(value).success).toBe(true);
    expect(intelligenceEvaluationSchema.safeParse({ ...value, structuralAcceptance: { numerator: 1, denominator: 2, rate: 1 } }).success).toBe(false);
    expect(intelligenceEvaluationSchema.safeParse({ ...value, humanReviewCount: 0 }).success).toBe(false);
  });
});
