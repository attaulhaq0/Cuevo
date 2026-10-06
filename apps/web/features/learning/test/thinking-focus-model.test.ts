import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThinkingFocusDraft, currentThinkingFocusRead, parseThinkingFocusRead, parseThinkingFocusSnapshot, parseThinkingFocusRubric, parseThinkingFocusMaterials, thinkingFocusMaterialsPath, thinkingFocusActionAvailable, thinkingFocusPath, validateThinkingFocusReceipt } from '../thinking-focus-model.ts';
import { parseActivity, parseCourseDetail, staffCourseChoices } from '../model.ts';

const id = (number: number) => `f2000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const target = { kind: 'ACTIVITY' as const, id: id(1), criterionKey: null };
const focus = { taxonomyVersion: 'revised-bloom-2001-cuevo-v1', primaryProcess: 'APPLY', additionalProcesses: ['UNDERSTAND'] };
const source = { title: 'Explain a check', instructions: 'Use the idea and explain the checking step.', contentRevision: 2, preparationVersion: null, policyVersion: null, rubricVersion: null, criterionTitle: null };
const current = { schemaVersion: '1', target, courseId: id(2), targetTitle: source.title, sourceVersion: 'activity:2', status: 'UNCLASSIFIED', revision: 0, classification: null, source, canAuthor: true, canReview: false };

test('course activity metadata binds the enclosing course and the exact activity content revision', () => {
  const activity = { id: id(1), title: source.title, kind: 'TASK', instructions: source.instructions, sequence: 1, contentRevision: 2, thinkingFocus: current };
  const course = { id: id(2), classId: id(8), subjectId: id(9), title: 'Reviewed course', description: '', status: 'PUBLISHED', createdAt: '2026-10-04T09:00:00Z', units: [{ id: id(10), title: 'Unit', sequence: 1, lessons: [{ id: id(11), title: 'Lesson', sequence: 1, body: '', status: 'PUBLISHED', activities: [activity] }] }] };
  assert.equal(parseCourseDetail(course).units[0].lessons[0].activities[0].thinkingFocus?.courseId, id(2));
  assert.throws(() => parseActivity({ ...activity, contentRevision: 3 }));
  assert.throws(() => parseActivity({ ...activity, contentRevision: undefined }));
  assert.throws(() => parseCourseDetail({ ...course, id: id(12) }));
  assert.equal(parseActivity({ ...activity, thinkingFocus: undefined, contentRevision: undefined }).id, id(1));
});

test('thinking-focus course choices use real context and suppress incomplete or ambiguous records', () => {
  const course = { id: id(2), classId: id(8), subjectId: id(9), title: 'Science', description: '', status: 'PUBLISHED', createdAt: '2026-10-04T09:00:00Z' };
  const classes = [{ id: id(8), name: 'Class A', yearGroupName: 'Year 6', academicYearName: '2026' }, { id: id(10), name: 'Class B', yearGroupName: 'Year 7', academicYearName: '2026' }];
  const subjects = [{ id: id(9), name: 'Biology' }];
  const choices = staffCourseChoices([course, { ...course, id: id(3), classId: id(10) }], classes, subjects, true, 'Review course context');
  assert.equal(choices[0].label, 'Science · Class A · Year 6 · 2026 · Biology');
  assert.ok(choices.every(row => !row.requiresReview));
  assert.ok(staffCourseChoices([course], classes, subjects, false, 'Review course context')[0].requiresReview);
  assert.ok(staffCourseChoices([course], [], subjects, true, 'Review course context')[0].requiresReview);
  assert.ok(staffCourseChoices([course, { ...course, id: id(3) }], classes, subjects, true, 'Review course context').every(row => row.requiresReview));
});

test('thinking-focus reads reject another exact target and course before exposing its task', () => {
  assert.equal(parseThinkingFocusRead(current, target, id(2)).sourceVersion, 'activity:2');
  assert.throws(() => parseThinkingFocusRead({ ...current, courseId: id(9) }, target, id(2)));
  assert.throws(() => parseThinkingFocusRead({ ...current, target: { ...target, id: id(9) } }, target, id(2)));
});

test('material review paths and manifests bind the exact task, criterion, course and source version', () => {
  const basis = parseThinkingFocusRead(current, target, id(2));
  const manifest = { schemaVersion: '1', target, courseId: id(2), sourceVersion: 'activity:2', items: [] };
  assert.equal(parseThinkingFocusMaterials(manifest, basis).items.length, 0);
  assert.throws(() => parseThinkingFocusMaterials({ ...manifest, courseId: id(12) }, basis));
  assert.throws(() => parseThinkingFocusMaterials({ ...manifest, sourceVersion: 'changed' }, basis));
  assert.throws(() => parseThinkingFocusMaterials({ ...manifest, target: { ...target, id: id(12) } }, basis));
  assert.equal(thinkingFocusMaterialsPath({ kind: 'CRITERION', id: id(1), criterionKey: 'check:reason' }, 'basis:2', { id: id(3), revisionId: id(4) }), `/v1/thinking-focus/criterion/${id(1)}/materials/${id(3)}/${id(4)}/download?sourceVersion=basis%3A2&criterionKey=check%3Areason`);
});

test('criterion choices bind the current assessment rubric identity, course and version', () => {
  const rubric = { id: id(13), courseId: id(2), title: 'Compare alternatives', version: 'reviewed-v1', criteria: [{ key: 'compare', title: 'Compare alternatives', levels: [{ key: 'explained', label: 'Explained', description: 'Explains a comparison.' }] }], sourceType: 'SCHOOL_AUTHORED', createdBy: id(4), createdAt: '2026-10-04T09:00:00Z' };
  const basis = parseThinkingFocusRead({ ...current, source: { ...source, rubricVersion: `${rubric.id}:${rubric.version}` } }, target, id(2));
  assert.equal(parseThinkingFocusRubric(rubric, { rubricId: id(13), courseId: id(2) }, basis).criteria[0].key, 'compare');
  assert.throws(() => parseThinkingFocusRubric({ ...rubric, version: 'changed-v2' }, { rubricId: id(13), courseId: id(2) }, basis));
  assert.throws(() => parseThinkingFocusRubric({ ...rubric, courseId: id(14) }, { rubricId: id(13), courseId: id(2) }, basis));
  assert.throws(() => parseThinkingFocusRubric(rubric, { rubricId: id(14), courseId: id(2) }, basis));
});

test('an unconfirmed withdrawal can reconcile its original action after current review permission ends', () => {
  const basis = parseThinkingFocusRead(current, target, id(2));
  const after = { ...basis, canReview: false };
  assert.equal(thinkingFocusActionAvailable(after, 'review', basis, true), true);
  assert.equal(thinkingFocusActionAvailable(after, 'review', basis, false), false);
  assert.equal(thinkingFocusActionAvailable({ ...after, sourceVersion: 'changed' }, 'review', basis, true), false);
  assert.equal(thinkingFocusActionAvailable(null, 'review', basis, true), false);
});
test('a review receipt confirms the original decision, reviewer and preserved authored source', () => {
  const classification = { id: id(3), revision: 1, focus, rationale: 'Use and explain.', authorId: id(4), authoredAt: '2026-10-04T09:00:00Z', reviewerId: null, reviewedAt: null, reviewReason: null };
  const basis = parseThinkingFocusRead({ ...current, status: 'AWAITING_REVIEW', revision: 1, classification }, target, id(2));
  const receipt = { ...basis, id: id(5), status: 'REJECTED', revision: 2, classification: { ...classification, id: id(5), revision: 2, reviewerId: id(6), reviewedAt: '2026-10-04T10:00:00Z', reviewReason: 'The actual task needs another focus.' } };
  const command = { key: 'thinking-review-1', path: `/v1/thinking-focus/activity/${id(1)}/review`, body: { expectedRevision: 1, expectedSourceVersion: 'activity:2', decision: 'REJECT', reason: 'The actual task needs another focus.', confirmReview: true } };
  validateThinkingFocusReceipt(receipt, command, basis, id(6), 'review');
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, status: 'APPROVED' }, command, basis, id(6), 'review'));
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, classification: { ...receipt.classification, reviewReason: 'Different reason.' } }, command, basis, id(6), 'review'));
  assert.throws(() => validateThinkingFocusReceipt(receipt, command, basis, id(7), 'review'));
});
test('a native-result snapshot must bind the requested result while retaining its exact submission identity', () => {
  const snapshot = { schemaVersion: '1', kind: 'submission', id: id(8), resultId: id(9), recorded: true, scope: 'RECORDED_TASK_DEMAND_NOT_ATTAINMENT', items: [] };
  assert.equal(parseThinkingFocusSnapshot(snapshot, 'result', id(9)).id, id(8));
  assert.throws(() => parseThinkingFocusSnapshot({ ...snapshot, resultId: id(10) }, 'result', id(9)));
  assert.throws(() => parseThinkingFocusSnapshot(snapshot, 'submission', id(9)));
  assert.throws(() => parseThinkingFocusSnapshot({ ...snapshot, kind: 'completion' }, 'result', id(9)));
});
test('a stale actor or source response never reappears in the current editor', () => {
  const value = parseThinkingFocusRead(current, target, id(2));
  assert.equal(currentThinkingFocusRead({ scope: 'school:actor:token:activity:2', value }, 'school:actor:token:activity:2')?.targetTitle, source.title);
  assert.equal(currentThinkingFocusRead({ scope: 'school:actor:token:activity:2', value }, 'school:other:token:activity:2'), null);
  assert.equal(currentThinkingFocusRead({ scope: 'school:actor:token:activity:2', value }, 'school:actor:token:activity:3'), null);
});
test('criterion URLs preserve the exact encoded key without accepting a key on an activity', () => {
  assert.equal(thinkingFocusPath('criterion', id(1), 'checking:reason'), `/v1/thinking-focus/criterion/${id(1)}?criterionKey=checking%3Areason`);
  assert.throws(() => thinkingFocusPath('activity', id(1), 'checking:reason'));
});
test('draft payload keeps the frozen source revision and mixed categories without duplicate primary focus', () => {
  const values = new FormData(); values.set('primaryProcess', 'APPLY'); values.set('additional:UNDERSTAND', 'on'); values.set('rationale', 'The task asks for using an idea.');
  assert.deepEqual(buildThinkingFocusDraft(values, parseThinkingFocusRead(current, target, id(2))), { expectedRevision: 0, expectedSourceVersion: 'activity:2', focus, rationale: 'The task asks for using an idea.' });
  values.set('additional:APPLY', 'on'); assert.throws(() => buildThinkingFocusDraft(values, parseThinkingFocusRead(current, target, id(2))));
});
test('draft receipts must confirm the exact source, focus, rationale and one new immutable revision', () => {
  const body = { expectedRevision: 0, expectedSourceVersion: 'activity:2', focus, rationale: 'Use and explain.' };
  const classification = { id: id(3), revision: 1, focus, rationale: body.rationale, authorId: id(4), authoredAt: '2026-10-04T09:00:00Z', reviewerId: null, reviewedAt: null, reviewReason: null };
  const receipt = { ...current, id: id(3), status: 'AWAITING_REVIEW', revision: 1, classification };
  const basis = parseThinkingFocusRead(current, target, id(2));
  const command = { key: 'thinking-draft-1', path: `/v1/thinking-focus/activity/${id(1)}/draft`, body };
  validateThinkingFocusReceipt(receipt, command, basis, id(4), 'draft');
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, classification: { ...classification, rationale: 'Changed by server' } }, command, basis, id(4), 'draft'));
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, sourceVersion: 'activity:3' }, command, basis, id(4), 'draft'));
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, classification: { ...classification, focus: { ...focus, primaryProcess: 'CREATE' } } }, command, basis, id(4), 'draft'));
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, revision: 2 }, command, basis, id(4), 'draft'));
  assert.throws(() => validateThinkingFocusReceipt(receipt, { ...command, path: `/v1/thinking-focus/activity/${id(9)}/draft` }, basis, id(4), 'draft'));
  assert.throws(() => validateThinkingFocusReceipt({ id: id(3) }, command, basis, id(4), 'draft'), (error: unknown) => !!error && typeof error === 'object' && 'uncertain' in error && error.uncertain === true);
});
test('a new draft records the current editor without copying an earlier author identity or time', () => {
  const earlier = { id: id(3), revision: 2, focus, rationale: 'Earlier teacher draft.', authorId: id(4), authoredAt: '2026-10-04T09:00:00Z', reviewerId: id(6), reviewedAt: '2026-10-04T10:00:00Z', reviewReason: 'Reviewed earlier task.' };
  const basis = parseThinkingFocusRead({ ...current, status: 'APPROVED', revision: 2, classification: earlier }, target, id(2));
  const command = { key: 'thinking-admin-edit', path: `/v1/thinking-focus/activity/${id(1)}/draft`, body: { expectedRevision: 2, expectedSourceVersion: 'activity:2', focus, rationale: 'Current editor reviewed the task.' } };
  const receipt = { ...basis, id: id(7), status: 'AWAITING_REVIEW', revision: 3, classification: { ...earlier, id: id(7), revision: 3, rationale: command.body.rationale, authorId: id(8), authoredAt: '2026-10-04T11:00:00Z', reviewerId: null, reviewedAt: null, reviewReason: null } };
  validateThinkingFocusReceipt(receipt, command, basis, id(8), 'draft');
  assert.throws(() => validateThinkingFocusReceipt({ ...receipt, classification: { ...receipt.classification, authorId: id(4) } }, command, basis, id(8), 'draft'));
});
