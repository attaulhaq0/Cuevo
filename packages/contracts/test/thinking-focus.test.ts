import { describe, expect, it } from 'vitest';
import { thinkingFocusDraftInputSchema, thinkingFocusHistorySchema, thinkingFocusQueueSchema, thinkingFocusResponseSchema, thinkingFocusReviewInputSchema, thinkingFocusSchema, thinkingFocusSnapshotSchema, thinkingFocusTargetSchema } from '../src/thinking-focus';

const id = (number: number) => `f1000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const focus = { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'APPLY', additionalProcesses: ['UNDERSTAND', 'EVALUATE'] };
const source = { title: 'Check a school example', instructions: 'Use the example and explain your check.', contentRevision: 2, preparationVersion: null, policyVersion: null, rubricVersion: null, criterionTitle: null };
const classification = { id: id(2), revision: 2, focus, rationale: 'The task asks for using an idea and checking a reason.', authorId: id(3), authoredAt: '2026-10-04T09:00:00Z', reviewerId: id(4), reviewedAt: '2026-10-04T10:00:00Z', reviewReason: 'Reviewed the exact current material.' };
const response = { schemaVersion: '1', target: { kind: 'ACTIVITY', id: id(1), criterionKey: null }, courseId: id(5), targetTitle: source.title, sourceVersion: 'content:2', status: 'APPROVED', revision: 2, classification, source, canAuthor: false, canReview: false };

describe('reviewed thinking-focus boundaries', () => {
  it('accepts a mixed task focus without a numeric learner level or required sequence', () => {
    expect(thinkingFocusSchema.parse(focus)).toEqual(focus);
    expect(thinkingFocusSchema.parse({ ...focus, primaryProcess: 'CREATE', additionalProcesses: ['REMEMBER'] }).primaryProcess).toBe('CREATE');
  });
  it.each([
    { ...focus, taxonomyVersion: 'unknown-version' }, { ...focus, additionalProcesses: ['APPLY'] },
    { ...focus, additionalProcesses: ['UNDERSTAND', 'UNDERSTAND'] }, { ...focus, primaryProcess: 'LEVEL_3' },
    { ...focus, mastery: 0.8 }, { ...focus, xp: 25 }, { ...focus, prerequisite: 'REMEMBER' },
  ])('rejects unreviewed version, contradictory focus and learner-state fields: %j', input => {
    expect(thinkingFocusSchema.safeParse(input).success).toBe(false);
  });
  it('requires an exact criterion key only for criterion targets', () => {
    expect(thinkingFocusTargetSchema.parse({ kind: 'CRITERION', id: id(1), criterionKey: 'checking.reason' }).criterionKey).toBe('checking.reason');
    for (const input of [{ kind: 'CRITERION', id: id(1), criterionKey: null }, { kind: 'ACTIVITY', id: id(1), criterionKey: 'checking.reason' }, { kind: 'ASSESSMENT', id: id(1), criterionKey: '' }]) expect(thinkingFocusTargetSchema.safeParse(input).success).toBe(false);
  });
  it('accepts first drafts and requires an explicit current source and confirmed review', () => {
    expect(thinkingFocusDraftInputSchema.parse({ expectedRevision: 0, expectedSourceVersion: 'content:2', focus, rationale: 'Review this exact activity.' }).expectedRevision).toBe(0);
    expect(thinkingFocusReviewInputSchema.parse({ expectedRevision: 1, expectedSourceVersion: 'content:2', decision: 'APPROVE', reason: 'Reviewed source.', confirmReview: true }).decision).toBe('APPROVE');
    for (const input of [{ expectedRevision: 0, expectedSourceVersion: 'content:2', decision: 'APPROVE', reason: 'Reviewed.', confirmReview: true }, { expectedRevision: 1, expectedSourceVersion: '', decision: 'APPROVE', reason: 'Reviewed.', confirmReview: true }, { expectedRevision: 1, expectedSourceVersion: 'content:2', decision: 'APPROVE', reason: 'Reviewed.', confirmReview: false }]) expect(thinkingFocusReviewInputSchema.safeParse(input).success).toBe(false);
  });
  it('keeps an unclassified legacy task explicit without manufacturing a focus', () => {
    const legacy = { ...response, status: 'UNCLASSIFIED', revision: 0, classification: null };
    expect(thinkingFocusResponseSchema.parse(legacy).classification).toBeNull();
    expect(thinkingFocusResponseSchema.safeParse({ ...legacy, revision: 1 }).success).toBe(false);
    expect(thinkingFocusResponseSchema.safeParse({ ...legacy, classification }).success).toBe(false);
  });
  it('rejects self-review, inconsistent review tuples and mismatched immutable revisions', () => {
    expect(thinkingFocusResponseSchema.parse(response).classification?.reviewerId).toBe(id(4));
    for (const input of [{ ...response, classification: { ...classification, reviewerId: classification.authorId } }, { ...response, classification: { ...classification, reviewedAt: null } }, { ...response, revision: 3 }, { ...response, classification: { ...classification, reviewedAt: '2026-10-04T08:00:00Z' } }, { ...response, status: 'AWAITING_REVIEW' }]) expect(thinkingFocusResponseSchema.safeParse(input).success).toBe(false);
  });
  it('retains changed-source history without representing it as current approval', () => {
    expect(thinkingFocusResponseSchema.parse({ ...response, status: 'SOURCE_CHANGED', sourceVersion: 'content:3', source: { ...source, contentRevision: 3 } }).status).toBe('SOURCE_CHANGED');
    expect(thinkingFocusResponseSchema.safeParse({ ...response, mastery: 1, earnedXp: 25 }).success).toBe(false);
  });
  it('rejects a history row from a different course or target while retaining earlier source revisions', () => {
    const history = { schemaVersion: '1', target: response.target, courseId: response.courseId, targetTitle: response.targetTitle, sourceVersion: 'content:3', items: [response], nextCursor: null };
    expect(thinkingFocusHistorySchema.parse(history).items[0].sourceVersion).toBe('content:2');
    expect(thinkingFocusHistorySchema.safeParse({ ...history, items: [{ ...response, courseId: id(99) }] }).success).toBe(false);
    expect(thinkingFocusHistorySchema.safeParse({ ...history, items: [{ ...response, target: { ...response.target, id: id(99) } }] }).success).toBe(false);
  });
  it('rejects mixed-course queues and duplicate classification rows', () => {
    const queue = { schemaVersion: '1', courseId: response.courseId, items: [response], nextCursor: null };
    expect(thinkingFocusQueueSchema.parse(queue).items).toHaveLength(1);
    expect(thinkingFocusQueueSchema.safeParse({ ...queue, items: [{ ...response, courseId: id(99) }] }).success).toBe(false);
    expect(thinkingFocusQueueSchema.safeParse({ ...queue, items: [response, response] }).success).toBe(false);
  });
  it('keeps source snapshots read-only, bounded and distinct from attainment', () => {
    const snapshot = { schemaVersion: '1', kind: 'submission', id: id(50), recorded: true, scope: 'RECORDED_TASK_DEMAND_NOT_ATTAINMENT', items: [response] };
    expect(thinkingFocusSnapshotSchema.parse(snapshot).items[0].classification?.focus.primaryProcess).toBe('APPLY');
    expect(thinkingFocusSnapshotSchema.safeParse({ ...snapshot, items: [{ ...response, canAuthor: true }] }).success).toBe(false);
    expect(thinkingFocusSnapshotSchema.safeParse({ ...snapshot, scope: 'LEARNER_MASTERY', mastery: 1 }).success).toBe(false);
    expect(thinkingFocusSnapshotSchema.safeParse({ ...snapshot, items: Array(1032).fill(response) }).success).toBe(false);
    expect(thinkingFocusSnapshotSchema.safeParse({ ...snapshot, recorded: false }).success).toBe(false);
  });
  it('requires review when complete source snapshots exceed the byte limit without truncating rows', () => {
    const rows = Array.from({ length: 400 }, (_, number) => ({ ...response, target: { ...response.target, id: id(number + 100) }, source: { ...source, instructions: 'Source context '.repeat(100) } }));
    const snapshot = { schemaVersion: '1', kind: 'completion', id: id(50), recorded: true, scope: 'RECORDED_TASK_DEMAND_NOT_ATTAINMENT', items: rows };
    expect(thinkingFocusSnapshotSchema.safeParse(snapshot).success).toBe(false);
    expect(thinkingFocusSnapshotSchema.parse({ ...snapshot, items: [] }).recorded).toBe(true);
  });
});
