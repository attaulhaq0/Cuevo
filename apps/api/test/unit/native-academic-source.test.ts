import { describe, expect, it } from 'vitest';
import { nativeAcademicSourceSchema } from '@cuevo/contracts';
const id = (n: number) => `19000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const common = { id: id(1), learnerId: id(2), submissionId: id(3), assessmentId: id(4), courseId: id(5), referenceId: id(6), referenceVersion: 'school-v1', evidenceId: id(7), revision: 1, policyVersion: 2, createdAt: '2026-10-01T00:00:00Z' };
describe('native academic source identity bridge', () => {
  it('preserves a numeric zero on the original native scale', () => {
    expect(nativeAcademicSourceSchema.parse({ ...common, model: 'numeric', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 2, normalized: null } }).nativeResult).toMatchObject({ score: 0, maxScore: 10 });
  });
  it('retains exact rubric descriptors and rejects fabricated scalar or duplicated criterion source', () => {
    const nativeResult = { type: 'rubric', rubricId: id(8), rubricTitle: 'Teacher explanation', rubricVersion: 'school-1', policyVersion: 2, normalized: null, criteria: [{ criterionKey: 'check', criterionTitle: 'Checking', levelKey: 'shown', levelLabel: 'Demonstrated', levelDescription: 'Show the checking step.' }] };
    expect(nativeAcademicSourceSchema.safeParse({ ...common, model: 'rubric', nativeResult }).success).toBe(true);
    expect(nativeAcademicSourceSchema.safeParse({ ...common, model: 'rubric', nativeResult: { ...nativeResult, score: 5 } }).success).toBe(false);
    expect(nativeAcademicSourceSchema.safeParse({ ...common, model: 'rubric', nativeResult: { ...nativeResult, criteria: [nativeResult.criteria[0], nativeResult.criteria[0]] } }).success).toBe(false);
    expect(nativeAcademicSourceSchema.safeParse({ ...common, model: 'numeric', nativeResult }).success).toBe(false);
  });
});
