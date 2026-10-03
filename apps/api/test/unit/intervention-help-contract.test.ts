import { describe, expect, it } from 'vitest';
import { interventionHelpInputSchema, interventionHelpReplyInputSchema, decisionInputSchema } from '@cuevo/contracts';
describe('task-scoped help boundaries', () => {
  it('requires explicit bounded learner request and staff reply', () => {
    expect(interventionHelpInputSchema.safeParse({ kind: 'WORKED_EXAMPLE', question: 'Can I see the checking step?', confirmSend: true }).success).toBe(true);
    expect(interventionHelpReplyInputSchema.safeParse({ response: 'Check each step against the example.', confirmSend: true }).success).toBe(true);
    for (const input of [{ kind: 'CHANGE_GRADE', question: 'Please help', confirmSend: true }, { kind: 'INSTRUCTIONS', question: '', confirmSend: true }, { kind: 'FEEDBACK', question: 'Please help', confirmSend: false }]) expect(interventionHelpInputSchema.safeParse(input).success).toBe(false);
  });
  it('does not infer a learner-visible note from private staff approval reason', () => {
    const decision = { decision: 'APPROVE', reason: 'Private staff decision basis.' };
    expect(decisionInputSchema.parse(decision)).not.toHaveProperty('learnerNote');
    expect(decisionInputSchema.safeParse({ ...decision, learnerNote: 'Please ask if the checking step is unclear.' }).success).toBe(true);
    expect(decisionInputSchema.safeParse({ ...decision, decision: 'REJECT', learnerNote: 'A rejected proposal is not a learner task.' }).success).toBe(false);
  });
});
