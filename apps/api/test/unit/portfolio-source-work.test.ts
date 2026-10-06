import { describe, expect, it } from 'vitest';
import { portfolioReviewSchema, portfolioSourceWorkSchema } from '@cuevo/contracts';
const id = '00000000-0000-4000-8000-000000000001';
const source = { itemId: id, revisionId: id, portfolioRevision: 1, learnerId: id, learnerName: 'School learner', evidenceId: id, resultId: id, referenceId: id, referenceVersion: 'school-v1', policyVersion: 2, source: { kind: 'TEXT', submissionId: id, submissionRevision: 1, assessmentId: id, assessmentTitle: 'School explanation', submittedAt: '2026-10-01T00:00:00Z', content: 'Exact answer. الإجابة الأصلية.' } };
describe('exact portfolio source work boundary', () => {
  it('keeps complete immutable text and rejects clipped or untyped work', () => {
    expect(portfolioSourceWorkSchema.parse(source).source.content).toBe(source.source.content);
    for (const changed of [{ content: '' }, { content: 'x'.repeat(50001) }, { kind: 'QUIZ' }, { submissionRevision: 0 }]) expect(portfolioSourceWorkSchema.safeParse({ ...source, source: { ...source.source, ...changed } }).success).toBe(false);
    expect(portfolioSourceWorkSchema.safeParse({ ...source, objectPath: 'private/source' }).success).toBe(false);
  });
  it('requires an explicit source review confirmation without inventing approval for legacy receipts', () => {
    const review = { expectedRevision: 1, feedback: 'Reviewed source', featured: false, parentVisible: true, confirmParentApproval: true };
    expect(portfolioReviewSchema.parse(review).confirmSourceReview).toBe(false);
    expect(portfolioReviewSchema.parse({ ...review, confirmSourceReview: true }).confirmSourceReview).toBe(true);
  });
});
