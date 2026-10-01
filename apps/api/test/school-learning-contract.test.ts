import { describe, expect, it } from 'vitest';
import { courseInputSchema, assessmentInputSchema, submissionInputSchema, completionInputSchema, publishInputSchema, paginationSchema, idempotencyKeySchema } from '../../../packages/contracts/src/school-learning';
const uuid = '30000000-0000-4000-8000-000000000001';
describe('school learning input boundary', () => {
  it('rejects caller supplied tenant, actor, learner or status fields', () => {
    for (const extra of [{ schoolId: uuid }, { learnerId: uuid }, { createdBy: uuid }, { status: 'PUBLISHED' }]) {
      expect(courseInputSchema.safeParse({ classId: uuid, subjectId: uuid, title: 'School authored', description: '', ...extra }).success).toBe(false);
    }
  });
  it.each([0, -1, Number.NaN, Infinity, 100001])('rejects invalid numeric maximum %s', (maxScore) => {
    expect(assessmentInputSchema.safeParse({ courseId: uuid, title: 'School Custom', instructions: 'Write', maxScore }).success).toBe(false);
  });
  it('requires text submission instead of files or client authoritative state', () => {
    expect(submissionInputSchema.safeParse({ content: '' }).success).toBe(false);
    expect(submissionInputSchema.safeParse({ content: 'Work', learnerId: uuid }).success).toBe(false);
    expect(completionInputSchema.safeParse({ reflection: 'Observed', completedAt: '2026-10-01' }).success).toBe(false);
    expect(publishInputSchema.safeParse({ approved: true }).success).toBe(false);
  });
  it('requires stable bounded idempotency keys and rejects empty values', () => {
    for (const key of [undefined, '', 'short', ' '.repeat(8), 'a'.repeat(201)]) expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
  });
  it('rejects malformed or unbounded cursors and limits', () => {
    for (const input of [{ limit: '101' }, { limit: '0' }, { cursor: 'bad' }, { limit: 'Infinity' }, { unknown: 'value' }]) expect(paginationSchema.safeParse(input).success).toBe(false);
  });
});
