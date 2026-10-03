import { describe, expect, it } from 'vitest';
import { nativeInterventionOutcomeSchema } from '@cuevo/contracts';
const id = (n: number) => `23000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const native = { type: 'rubric', rubricId: id(5), rubricTitle: 'School checking', rubricVersion: 'school-v1', policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'check', criterionTitle: 'Checking', levelKey: 'shown', levelLabel: 'Demonstrated', levelDescription: 'Show the checking step.' }] };
const value = { id: id(1), interventionId: id(2), baselineResultId: id(3), followUpResultId: id(4), status: 'inconclusive', model: 'rubric', baseline: native, followUp: { ...native, criteria: [{ ...native.criteria[0], levelKey: 'connected', levelLabel: 'Connected', levelDescription: 'Explain connected checks.' }] }, comparability: 'UNKNOWN', reason: 'NO_APPROVED_RUBRIC_COMPARISON_POLICY', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-01T00:00:00Z' };
describe('descriptor-only native rubric outcome', () => {
  it('preserves before and after descriptors without a scalar or inferred improvement', () => {
    expect(nativeInterventionOutcomeSchema.safeParse(value).success).toBe(true);
    expect(nativeInterventionOutcomeSchema.safeParse({ ...value, status: 'improved' }).success).toBe(false);
    expect(nativeInterventionOutcomeSchema.safeParse({ ...value, difference: 2 }).success).toBe(false);
    expect(nativeInterventionOutcomeSchema.safeParse({ ...value, comparability: 'TRUE' }).success).toBe(false);
  });
});
