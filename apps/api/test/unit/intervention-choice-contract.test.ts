import { describe, expect, it } from 'vitest';
import { decisionInputSchema, interventionChoiceInputSchema } from '@cuevo/contracts';
const a = '18000000-0000-4000-8000-000000000001'; const b = '18000000-0000-4000-8000-000000000002';
describe('explicit approved intervention alternatives', () => {
  it('requires unique bounded choices approved only with a human-approved task', () => {
    expect(decisionInputSchema.safeParse({ decision: 'APPROVE', reason: 'Teacher reviewed both paths.', approvedActivityIds: [a, b] }).success).toBe(true);
    for (const approvedActivityIds of [[a, a], [a, b, a, b]]) expect(decisionInputSchema.safeParse({ decision: 'APPROVE', reason: 'Reviewed.', approvedActivityIds }).success).toBe(false);
    expect(decisionInputSchema.safeParse({ decision: 'REJECT', reason: 'Another path.', approvedActivityIds: [a] }).success).toBe(false);
  });
  it('requires exact source identity and explicit learner choice confirmation', () => {
    expect(interventionChoiceInputSchema.safeParse({ activityId: a, confirmChoice: true }).success).toBe(true);
    expect(interventionChoiceInputSchema.safeParse({ activityId: a, confirmChoice: false }).success).toBe(false);
    expect(interventionChoiceInputSchema.safeParse({ activityId: a, title: 'An unapproved practice', confirmChoice: true }).success).toBe(false);
  });
});
