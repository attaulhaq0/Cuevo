import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandJournal, confirmCommandReceipt, LearningApiError } from '../../../shared/api/client.ts';
import { FormDrafts } from '../../../shared/session/form-drafts.ts';
import { supportDraftKey, supportRecovery, currentSupportSelection, supportApprovalBody, supportAssessmentCurrent, validateSupportReceipt, supportChoices, parseSupportSelection } from '../support-review-model.ts';

const id = (value: number) => `b0000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const selected = { courseId: id(1), learnerId: id(2) };
const course = { id: selected.courseId, title: 'School reasoning', status: 'PUBLISHED' };
const learner = { id: selected.learnerId, displayName: 'Alex Taylor', role: 'student', status: 'active' };
const task = { id: id(3), courseId: selected.courseId, title: 'Explain the method' };
const payload = { ...selected, assessmentId: task.id, title: 'Checking guide', instructions: 'Instructions for Alex', effectiveFrom: '2026-10-01', effectiveTo: '2026-10-31', studentVisible: true, parentVisible: false, reason: 'Approval for Alex only', confirmApproval: true };

test('working instructions and publication consent cannot move to a different learner or course', () => {
  const drafts = new FormDrafts();
  const own = `school:actor:${supportDraftKey(selected)}`;
  drafts.save(own, { instructions: payload.instructions, studentVisible: true, parentVisible: true, confirmApproval: true }, {});
  assert.equal(drafts.get(`school:actor:${supportDraftKey({ ...selected, learnerId: id(4) })}`), undefined);
  assert.equal(drafts.get(`school:actor:${supportDraftKey({ ...selected, courseId: id(5) })}`), undefined);
  assert.equal(drafts.get(own)?.values.instructions, payload.instructions);
  drafts.clearRead('school:actor:', '/v1/school/learning-support?limit=25');
  assert.equal(drafts.get(own), undefined);
});

test('recovery restores only the exact original support command and never permits a second tuple under its key', () => {
  const journal = new CommandJournal();
  const original = journal.prepare('/v1/school/learning-support', '/v1/school/learning-support', payload);
  assert.deepEqual(supportRecovery(original), { key: original.key, input: payload });
  assert.throws(() => journal.prepare(original.path, original.path, { ...payload, learnerId: id(4) }), error => error instanceof LearningApiError && error.uncertain);
  assert.equal(supportRecovery({ ...original, path: '/v1/recommendations' }), null);
  assert.equal(supportRecovery({ ...original, body: { ...payload, confirmApproval: false } }), null);
  assert.equal(supportRecovery({ ...original, body: { ...payload, extra: 'Unrecognized authority' } }), null);
  assert.deepEqual(parseSupportSelection(selected), selected);
  assert.equal(parseSupportSelection({ ...selected, reason: payload.reason }), null);
});

test('current source selection requires a unique active learner and published course and rejects another course assessment', () => {
  assert.deepEqual(currentSupportSelection(selected, [course], [learner]), selected);
  assert.equal(currentSupportSelection(selected, [{ ...course, contentState: 'RETIRED' }], [learner]), null);
  assert.equal(currentSupportSelection(selected, [{ ...course, status: 'DRAFT' }], [learner]), null);
  assert.equal(currentSupportSelection(selected, [course], [{ ...learner, status: 'suspended' }]), null);
  assert.equal(currentSupportSelection(selected, [course, { ...course, id: id(5) }], [learner]), null);
  assert.equal(currentSupportSelection(selected, [course], [learner, { ...learner, id: id(4) }]), null);
  const values = new FormData();
  for (const [key, value] of Object.entries(payload)) if (typeof value === 'string') values.set(key, value);
  values.set('studentVisible', 'on'); values.set('confirmApproval', 'on');
  assert.deepEqual(supportApprovalBody(selected, values, [task]), payload);
  assert.throws(() => supportApprovalBody(selected, values, [{ ...task, courseId: id(5) }]), LearningApiError);
  assert.throws(() => supportApprovalBody(selected, values, []), LearningApiError);
  assert.equal(supportAssessmentCurrent(selected, task.id, [{ ...task, courseId: id(5) }]), false);
  assert.equal(supportAssessmentCurrent(selected, task.id, [task, { ...task, id: id(6) }]), false);
  assert.equal(supportAssessmentCurrent(selected, null, []), true);
  values.set('assessmentId', '');
  assert.equal(supportApprovalBody(selected, values, []).assessmentId, null);
});

test('owner source denial clears support working input without clearing an original-key reconciliation or another owner draft', () => {
  const journal = new CommandJournal(), drafts = new FormDrafts();
  const original = journal.prepare('/v1/school/learning-support', '/v1/school/learning-support', payload);
  drafts.saveModel('school:actor:/v1/school/learning-support:selection', selected);
  drafts.save(`school:actor:${supportDraftKey(selected)}`, { instructions: payload.instructions }, {});
  drafts.save('school:actor:/v1/portfolio/items', { reflection: 'My other work' }, {});
  drafts.clearRead('school:actor:', '/v1/school/learning-support');
  assert.equal(drafts.model('school:actor:/v1/school/learning-support:selection'), undefined);
  assert.equal(drafts.get(`school:actor:${supportDraftKey(selected)}`), undefined);
  assert.equal(drafts.get('school:actor:/v1/portfolio/items')?.values.reflection, 'My other work');
  assert.equal(supportRecovery(journal.get(original.path))?.key, original.key);
});

test('ambiguous and unavailable support labels never get identifier suffixes', () => {
  const choices = supportChoices([{ id: id(1), label: 'Same course' }, { id: id(2), label: 'Same course' }, { id: id(3), label: ' ' }], 'Name unavailable');
  assert.deepEqual(choices.map(choice => [choice.label, choice.requiresReview]), [['Same course', true], ['Same course', true], ['Name unavailable', true]]);
});

test('limited create and revoke receipts validate original input and revision before an unmounted command settles', () => {
  const journal = new CommandJournal();
  const create = journal.prepare('/v1/school/learning-support', '/v1/school/learning-support', payload);
  for (const receipt of [{ id: id(6), revision: 2 }, { id: 'opaque', revision: 1 }, { id: id(6), revision: 1, learnerId: id(4) }]) {
    assert.throws(() => confirmCommandReceipt(journal, create.path, create.key, receipt, undefined, validateSupportReceipt), error => error instanceof LearningApiError && error.uncertain);
    assert.equal(journal.get(create.path)?.key, create.key);
  }
  assert.equal(confirmCommandReceipt(journal, create.path, create.key, { id: id(6), revision: 1 }, undefined, validateSupportReceipt), true);
  const revoke = journal.prepare(`/v1/school/learning-support/${id(6)}/revoke`, `/v1/school/learning-support/${id(6)}/revoke`, { expectedRevision: 1, reason: 'Withdraw this publication', confirmRevocation: true });
  assert.throws(() => validateSupportReceipt({ id: id(7), revision: 2 }, revoke), LearningApiError);
  assert.throws(() => validateSupportReceipt({ id: id(6), revision: 1 }, revoke), LearningApiError);
  assert.equal(confirmCommandReceipt(journal, revoke.path, revoke.key, { id: id(6), revision: 2 }, undefined, validateSupportReceipt), true);
});
