import { describe, expect, it } from 'vitest';
import { insightContextSchema } from '@cuevo/contracts';
const id = (n: number) => `25000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = { schemaVersion: '1', learnerId: id(1), courseId: id(2), classId: id(3), reference: { id: id(4), version: 'school-v1', title: 'School objective' }, recentResults: [{ resultId: id(5), evidenceId: id(6), referenceId: id(4), referenceVersion: 'school-v1', score: 3, maxScore: 10 }], observations: [], priorInterventions: [], learningOptions: [{ activityId: id(7), title: 'Published practice', instructions: 'Explain one checking step.', kind: 'practice', contentRevisionId: id(8), contentRevision: 2 }], coverage: 'BOUNDED_AUTHORIZED_CONTEXT' };
describe('frozen published practice content identity', () => {
  it('retains exact optional published revision and rejects half or invalid identities', () => {
    expect(insightContextSchema.safeParse(context).success).toBe(true);
    for (const fields of [{ contentRevisionId: undefined }, { contentRevision: 0 }, { contentRevision: undefined }]) expect(insightContextSchema.safeParse({ ...context, learningOptions: [{ ...context.learningOptions[0], ...fields }] }).success).toBe(false);
  });
});
