import { describe, expect, it } from 'vitest';
import * as academic from '@cuevo/contracts';
import type { z } from 'zod';

const contracts = academic as unknown as Record<string, z.ZodType>;
const courseId = '70000000-0000-4000-8000-000000000001';
const rubricId = '76000000-0000-4000-8000-000000000001';
const definition = { courseId, title: 'School explanation rubric', version: 'school-1', criteria: [
  { key: 'explanation', title: 'Explanation', levels: [{ key: 'developing', label: 'Developing', description: 'Explain one relevant step.' }, { key: 'secure', label: 'Secure', description: 'Explain the connected steps.' }] },
  { key: 'checking', title: 'Checking', levels: [{ key: 'not-demonstrated', label: 'Not demonstrated', description: 'Checking was not demonstrated in this work.' }, { key: 'demonstrated', label: 'Demonstrated', description: 'Show a check.' }] },
] };

describe('teacher-defined native rubric contracts', () => {
  it('exposes a bounded rubric definition without accepting issuer or grading authority', () => {
    expect(contracts.rubricInputSchema).toBeDefined();
    expect(contracts.rubricInputSchema!.safeParse(definition).success).toBe(true);
    expect(contracts.rubricInputSchema!.safeParse({ ...definition, issuer: 'Cambridge' }).success).toBe(false);
  });

  it('rejects missing criteria, duplicate criterion keys and duplicate allowed levels', () => {
    const schema = contracts.rubricInputSchema!;
    expect(schema).toBeDefined();
    for (const criteria of [[], [definition.criteria[0], definition.criteria[0]], [{ ...definition.criteria[0], levels: [] }], [{ ...definition.criteria[0], levels: [definition.criteria[0]!.levels[0], definition.criteria[0]!.levels[0]] }]]) {
      expect(schema.safeParse({ ...definition, criteria }).success).toBe(false);
    }
  });

  it('requires rubric identity, complete explicit native choices and optimistic context', () => {
    const mark = { nativeResult: { type: 'rubric', rubricId, criteria: [{ criterionKey: 'explanation', levelKey: 'developing' }, { criterionKey: 'checking', levelKey: 'not-demonstrated' }] }, feedback: 'Teacher reviewed work.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true };
    expect(academic.markingInputSchema.safeParse(mark).success).toBe(true);
    for (const altered of [{ ...mark, score: 0 }, { ...mark, nativeResult: { ...mark.nativeResult, criteria: [] } }, { ...mark, nativeResult: { ...mark.nativeResult, criteria: [mark.nativeResult.criteria[0], mark.nativeResult.criteria[0]] } }, { ...mark, sourceEvidence: false }, { ...mark, expectedPolicyVersion: 0 }]) {
      expect(academic.markingInputSchema.safeParse(altered).success).toBe(false);
    }
  });

  it('retains numeric zero and rejects a missing numeric grade', () => {
    const context = { feedback: 'Teacher reviewed work.', expectedPolicyVersion: 1, expectedRevision: 0, sourceEvidence: true };
    expect(academic.markingInputSchema.safeParse({ ...context, score: 0 }).success).toBe(true);
    expect(academic.markingInputSchema.safeParse(context).success).toBe(false);
  });

  it('requires a version-aware rubric assessment configuration', () => {
    expect(contracts.assessmentRubricSchema).toBeDefined();
    expect(contracts.assessmentRubricSchema!.safeParse({ rubricId, expectedPolicyVersion: 2 }).success).toBe(true);
    expect(contracts.assessmentRubricSchema!.safeParse({ rubricId, expectedPolicyVersion: 0 }).success).toBe(false);
  });
});
