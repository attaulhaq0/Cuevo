import { describe, expect, it } from 'vitest';
import * as contracts from '@cuevo/contracts';
import type { z } from 'zod';

const id = (n: number) => `23000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const learnerId = id(12);
const context = {
  status: 'READY', labelBasis: 'CURRENT_REGISTERED_NAMES_AND_IMMUTABLE_TASK', learnerId, identityRequiresReview: false,
  learnerName: 'Lina Hassan', className: 'Cedar', yearGroupName: 'Year 1', academicYearName: '2026–2027',
  courseTitle: 'School checking', practiceTitle: 'Explain one checking step', baselineAssessmentTitle: 'First checking task',
  followUpAssessmentTitle: 'Later checking task', baselineSubmittedAt: '2026-10-01T10:00:00Z', followUpSubmittedAt: '2026-10-02T10:00:00Z',
};
const numeric = { id: id(1), interventionId: id(2), baselineResultId: id(3), followUpResultId: id(4), status: 'improved', difference: 2, minimumChange: 1, baseline: { score: 0, maxScore: 10 }, followUp: { score: 2, maxScore: 10 }, reason: 'OBSERVED_RAW_SCORE_CHANGE', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-02T11:00:00Z' };
const native = { type: 'rubric', rubricId: id(5), rubricTitle: 'Checking', rubricVersion: 'school-v1', policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'check', criterionTitle: 'Checking', levelKey: 'shown', levelLabel: 'Shown', levelDescription: 'Show the check.' }] };
const rubric = { id: id(1), interventionId: id(2), baselineResultId: id(3), followUpResultId: id(4), model: 'rubric', status: 'inconclusive', baseline: native, followUp: native, comparability: 'UNKNOWN', reason: 'NO_APPROVED_RUBRIC_COMPARISON_POLICY', limitation: 'OBSERVED_CHANGE_NOT_CAUSAL_PROOF', measuredAt: '2026-10-02T11:00:00Z' };
function schema(name: string) { const value = (contracts as unknown as Record<string, z.ZodType>)[name]; expect(value).toBeDefined(); return value; }
const names = ['learnerName', 'className', 'yearGroupName', 'academicYearName', 'courseTitle', 'practiceTitle', 'baselineAssessmentTitle', 'followUpAssessmentTitle'];
const state = (outcome: unknown) => ({ learnerId, status: 'READY', generatedAt: '2026-10-02T12:00:00Z', version: 1, academic: [], development: { practice: { count: null, observationIds: [] }, revision: { count: null, observationIds: [] }, reflection: { count: null, observationIds: [] }, windowStart: null, windowEnd: null }, engagement: { completedActivityCount: null, lastCompletedAt: null }, support: { activeInterventionIds: [], items: [{ id: id(2), recommendationId: id(6), learnerId, referenceId: id(7), baselineResultId: id(3), title: 'Explain one checking step', instructions: 'Check the school example.', status: 'MEASURED', createdAt: '2026-10-01T12:00:00Z', completedAt: '2026-10-02T09:00:00Z', followUpAssessmentId: id(8) }] }, impact: { status: 'measured', measurementIds: [id(1)], outcomes: [outcome] }, sourceEventIds: [] });

describe('optional exact outcome display context', () => {
  it('retains both native outcome forms and legacy outcomes without context', () => {
    const display = schema('outcomeDisplaySchema');
    expect(display.parse(numeric)).toEqual(numeric); expect(display.parse(rubric)).toEqual(rubric);
    expect(display.parse({ ...numeric, context })).toEqual({ ...numeric, context });
    expect(display.parse({ ...rubric, context })).toEqual({ ...rubric, context });
    expect(contracts.nativeInterventionOutcomeSchema.safeParse({ ...rubric, context }).success).toBe(false);
  });
  it.each(names)('keeps missing %s explicitly under review and refuses a false READY state', key => {
    const display = schema('outcomeDisplayContextSchema');
    expect(display.safeParse({ ...context, [key]: null }).success).toBe(false);
    const underReview = { ...context, status: 'REQUIRES_REVIEW', [key]: null };
    expect(display.parse(underReview)).toEqual(underReview);
  });
  it.each([{ status: 'UNKNOWN' }, { labelBasis: 'INFERRED' }, { learnerId: 'opaque' }, { identityRequiresReview: 'false' }, { identityRequiresReview: true }, { learnerName: '' }, { learnerName: '   ' }, { practiceTitle: 'x'.repeat(201) }, { peers: [id(13)] }, { email: 'private@example.test' }, { baselineSubmittedAt: 'not-a-date' }, { followUpSubmittedAt: undefined }])('rejects malformed, inferred or overbroad context %j', change => {
    expect(schema('outcomeDisplayContextSchema').safeParse({ ...context, ...change }).success).toBe(false);
  });
  it('permits an explicit ambiguous context without fabricating missing source dates', () => {
    const underReview = { ...context, status: 'REQUIRES_REVIEW', identityRequiresReview: true, baselineSubmittedAt: null, followUpSubmittedAt: null };
    expect(schema('outcomeDisplayContextSchema').parse(underReview)).toEqual(underReview);
    expect(schema('outcomeDisplayContextSchema').safeParse({ ...underReview, status: 'READY' }).success).toBe(false);
  });
  it('rejects context null while keeping truly absent legacy context valid', () => {
    expect(schema('outcomeDisplaySchema').safeParse({ ...numeric, context: null }).success).toBe(false);
  });
  it('binds outcome context to the selected learner in learner-state responses', () => {
    expect(contracts.learnerStateSchema.safeParse(state({ ...numeric, context })).success).toBe(true);
    expect(contracts.learnerStateSchema.safeParse(state({ ...rubric, context })).success).toBe(true);
    expect(contracts.learnerStateSchema.safeParse(state(numeric)).success).toBe(true);
    expect(contracts.learnerStateSchema.safeParse(state({ ...numeric, context: { ...context, learnerId: id(99) } })).success).toBe(false);
  });
  it('does not let display context change native measurement and comparison rules', () => {
    const valid = { ...numeric, context };
    expect(contracts.learnerStateSchema.safeParse(state({ ...valid, difference: 0 })).success).toBe(false);
    expect(contracts.learnerStateSchema.safeParse(state({ ...valid, status: 'inconclusive' })).success).toBe(false);
    expect(schema('outcomeDisplaySchema').safeParse({ ...rubric, context, difference: 2 }).success).toBe(false);
    expect(schema('outcomeDisplaySchema').safeParse({ ...rubric, context, comparability: 'TRUE' }).success).toBe(false);
  });
});
