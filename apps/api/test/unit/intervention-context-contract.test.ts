import { describe, expect, it } from 'vitest';
import * as contracts from '@cuevo/contracts';

const id = (value: number) => `60000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const context = {
  interventionId: id(1), baselineResultId: id(2), learnerId: id(3), referenceId: id(4),
  status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_SOURCE_TASK', identityRequiresReview: false,
  learnerName: 'Lina Hassan', courseTitle: 'Mathematics', className: 'Cedar', yearGroupName: 'Year 1', academicYearName: '2026–2027',
};
describe('exact Intervention read context contract', () => {
  it('admits only bounded source labels and explicit unavailable context', () => {
    const schema = contracts.interventionDisplayContextSchema;
    expect(schema).toBeDefined();
    expect(schema!.parse(context)).toEqual(context);
    expect(schema!.safeParse({ ...context, status: 'REQUIRES_REVIEW', learnerName: null, courseTitle: null }).success).toBe(true);
    for (const change of [{ status: 'READY', learnerName: null }, { identityRequiresReview: true }, { learnerName: '   ' }, { courseTitle: id(8) }, { email: 'private@example.test' }, { unitTitle: 'Inferred unit' }]) {
      expect(schema!.safeParse({ ...context, ...change }).success).toBe(false);
    }
  });
  it('keeps practice completion and reassessment input free of read context', () => {
    expect(contracts.interventionCompleteSchema.safeParse({ reflection: 'I checked the step.', context }).success).toBe(false);
    expect(contracts.reassessmentInputSchema.safeParse({ assessmentId: id(8), context }).success).toBe(false);
  });
});
