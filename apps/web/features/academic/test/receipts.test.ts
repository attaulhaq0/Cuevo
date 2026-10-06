import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAcademicMarkReceipt, validateAcademicReleaseReceipt } from '../receipt-model.ts';
import { parseMarkingItem, type MarkingItem, type MarkRevision } from '../model.ts';
import { CommandJournal, confirmCommandReceipt, LearningApiError, type Command } from '../../../shared/api/client.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const submissionId = id(1), assessmentId = id(2), learnerId = id(3), referenceId = id(4), markId = id(5), resultId = id(6), rubricId = id(7);
const numericItem = () => parseMarkingItem({ id: submissionId, assessmentId, learnerId, content: 'My explanation', assessmentTitle: 'Explain your checking step', learnerName: 'Alex', policyVersion: 3, referenceId, currentResult: null, submissionRevision: 2, submissionStatus: 'RESUBMITTED', model: 'numeric', maxScore: 4, rubric: null });
const command = (path: string, body: Record<string, unknown>): Command => ({ key: 'original-command', path, body });
const markCommand = (body: Record<string, unknown> = {}) => command(`/v1/submissions/${submissionId}/results`, { score: 0, feedback: '  Explain your checking step.  ', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true, ...body });
const markReceipt = () => ({ id: markId, submissionId, learnerId, revision: 1, score: 0, maxScore: 4, feedback: '  Explain your checking step.  ', status: 'REVIEW', policyVersion: 3, referenceId, model: 'numeric' });
const currentMark = (): MarkRevision => ({ id: markId, revision: 1, score: 0, maxScore: 4, feedback: '  Explain your checking step.  ', status: 'REVIEW', model: 'numeric' });
const releaseCommand = (body: Record<string, unknown> = {}) => command(`/v1/results/${markId}/release`, { expectedRevision: 1, parentVisible: false, ...body });
const releaseReceipt = () => ({ id: resultId, submissionId, assessmentId, learnerId, revision: 1, feedback: currentMark().feedback, status: 'RELEASED', policyVersion: 3, referenceId, referenceVersion: 'school-v1', evidenceId: id(8), createdAt: '2026-10-03T09:00:00Z', actorId: id(9), parentVisible: false, assessmentTitle: 'Explain your checking step', referenceTitle: 'Checking reasons', model: 'numeric', score: 0, maxScore: 4, nativeResult: { type: 'numeric', score: 0, maxScore: 4, policyVersion: 3 } });
const uncertain = (run: () => unknown) => assert.throws(run, error => error instanceof LearningApiError && error.uncertain);
const rubric = { id: rubricId, title: 'Reasoning rubric', version: 'school-v1', criteria: [{ key: 'reasoning', title: 'Explain reasons', levels: [{ key: 'developing', label: 'Developing', description: 'Explains part of the method.' }, { key: 'secure', label: 'Secure', description: 'Explains each step with evidence.' }] }, { key: 'checking', title: 'Check the example', levels: [{ key: 'checked', label: 'Checked', description: 'Checks the answer with the example.' }] }] };
const nativeRubric = () => ({ type: 'rubric', rubricId, rubricTitle: rubric.title, rubricVersion: rubric.version, policyVersion: 3, normalized: null, criteria: [{ criterionKey: 'reasoning', criterionTitle: 'Explain reasons', levelKey: 'secure', levelLabel: 'Secure', levelDescription: 'Explains each step with evidence.' }, { criterionKey: 'checking', criterionTitle: 'Check the example', levelKey: 'checked', levelLabel: 'Checked', levelDescription: 'Checks the answer with the example.' }] });
const rubricItem = (): MarkingItem => parseMarkingItem({ ...numericItem(), model: 'rubric', maxScore: undefined, rubric });
const rubricCommand = () => command(`/v1/submissions/${submissionId}/results`, { nativeResult: { type: 'rubric', rubricId, criteria: [{ criterionKey: 'checking', levelKey: 'checked' }, { criterionKey: 'reasoning', levelKey: 'secure' }] }, feedback: 'Criterion evidence reviewed.', expectedPolicyVersion: 3, expectedRevision: 0, sourceEvidence: true });
const rubricReceipt = () => ({ id: markId, submissionId, learnerId, revision: 1, feedback: 'Criterion evidence reviewed.', status: 'REVIEW', policyVersion: 3, referenceId, model: 'rubric', nativeResult: nativeRubric() });

test('numeric mark success binds original submission learner objective policy next revision and exact zero feedback', () => {
  assert.doesNotThrow(() => validateAcademicMarkReceipt(markReceipt(), markCommand(), numericItem()));
  for (const patch of [{ id: 'unknown' }, { submissionId: id(10) }, { learnerId: id(10) }, { referenceId: id(10) }, { policyVersion: 4 }, { revision: 2 }, { score: 1 }, { maxScore: 10 }, { feedback: 'Explain your checking step.' }, { status: 'RELEASED' }, { actorId: id(9) }]) uncertain(() => validateAcademicMarkReceipt({ ...markReceipt(), ...patch }, markCommand(), numericItem()));
  const reviewed = parseMarkingItem({ ...numericItem(), currentResult: currentMark() });
  assert.doesNotThrow(() => validateAcademicMarkReceipt({ ...markReceipt(), id: id(11), revision: 2 }, markCommand({ expectedRevision: 1 }), reviewed));
  uncertain(() => validateAcademicMarkReceipt(markReceipt(), markCommand({ expectedRevision: 1 }), reviewed));
});

test('original malformed mark path payload source policy and frozen scale cannot settle a success', () => {
  for (const original of [command(`/v1/submissions/${id(10)}/results`, markCommand().body), command(`/v1/results/${submissionId}/release`, markCommand().body), markCommand({ expectedPolicyVersion: 4 }), markCommand({ expectedRevision: 1 }), markCommand({ sourceEvidence: false }), markCommand({ score: 5 }), markCommand({ parentVisible: true })]) uncertain(() => validateAcademicMarkReceipt(markReceipt(), original, numericItem()));
  uncertain(() => validateAcademicMarkReceipt(markReceipt(), markCommand(), { ...numericItem(), referenceId: null }));
  uncertain(() => validateAcademicMarkReceipt(markReceipt(), markCommand(), { ...numericItem(), submissionStatus: 'CLOSED' }));
});

test('rubric mark success requires every selected source-backed criterion label descriptor and version without numeric fields', () => {
  assert.doesNotThrow(() => validateAcademicMarkReceipt(rubricReceipt(), rubricCommand(), rubricItem()));
  for (const native of [{ ...nativeRubric(), rubricVersion: 'later-v2' }, { ...nativeRubric(), rubricTitle: 'Another rubric' }, { ...nativeRubric(), normalized: 100 }, { ...nativeRubric(), criteria: [nativeRubric().criteria[0]] }, { ...nativeRubric(), criteria: [nativeRubric().criteria[0], nativeRubric().criteria[0]] }, { ...nativeRubric(), criteria: [{ ...nativeRubric().criteria[0], levelLabel: 'Excellent' }, nativeRubric().criteria[1]] }, { ...nativeRubric(), criteria: [{ ...nativeRubric().criteria[0], criterionTitle: 'Other objective' }, nativeRubric().criteria[1]] }, { ...nativeRubric(), criteria: [{ ...nativeRubric().criteria[0], levelKey: 'developing' }, nativeRubric().criteria[1]] }]) uncertain(() => validateAcademicMarkReceipt({ ...rubricReceipt(), nativeResult: native }, rubricCommand(), rubricItem()));
  uncertain(() => validateAcademicMarkReceipt({ ...rubricReceipt(), score: 0, maxScore: 4 }, rubricCommand(), rubricItem()));
  uncertain(() => validateAcademicMarkReceipt(rubricReceipt(), markCommand(), rubricItem()));
});

test('released result keeps marking revision exact source native zero and submitted sharing state', () => {
  const item = parseMarkingItem({ ...numericItem(), currentResult: currentMark() });
  assert.doesNotThrow(() => validateAcademicReleaseReceipt(releaseReceipt(), releaseCommand(), item, currentMark()));
  assert.doesNotThrow(() => validateAcademicReleaseReceipt(releaseReceipt(), command(releaseCommand().path, { expectedRevision: 1 }), item, currentMark()));
  for (const patch of [{ submissionId: id(10) }, { assessmentId: id(10) }, { learnerId: id(10) }, { referenceId: id(10) }, { policyVersion: 4 }, { revision: 2 }, { feedback: 'Other feedback' }, { parentVisible: true }, { assessmentTitle: 'Other assessment' }, { score: 1, nativeResult: { type: 'numeric', score: 1, maxScore: 4, policyVersion: 3 } }, { createdAt: 'unknown' }, { referenceVersion: '' }, { evidenceId: 'unknown' }, { actorId: 'unknown' }, { markingId: markId }]) uncertain(() => validateAcademicReleaseReceipt({ ...releaseReceipt(), ...patch }, releaseCommand(), item, currentMark()));
  for (const original of [command(`/v1/results/${id(10)}/release`, releaseCommand().body), releaseCommand({ expectedRevision: 2 }), releaseCommand({ parentVisible: true }), releaseCommand({ confirmRelease: true })]) uncertain(() => validateAcademicReleaseReceipt(releaseReceipt(), original, item, currentMark()));
  uncertain(() => validateAcademicReleaseReceipt(releaseReceipt(), releaseCommand(), { ...item, submissionStatus: 'RETURNED' }, currentMark()));
});

test('released rubric source must equal the captured reviewed criteria and cannot normalize them', () => {
  const mark: MarkRevision = { id: markId, revision: 1, feedback: 'Criterion evidence reviewed.', status: 'REVIEW', model: 'rubric', nativeResult: nativeRubric() as Extract<MarkRevision, { model: 'rubric' }>['nativeResult'] };
  const item = parseMarkingItem({ ...rubricItem(), currentResult: mark });
  const base = Object.fromEntries(Object.entries(releaseReceipt()).filter(([key]) => key !== 'score' && key !== 'maxScore')); const receipt = { ...base, model: 'rubric', feedback: mark.feedback, nativeResult: nativeRubric() };
  assert.doesNotThrow(() => validateAcademicReleaseReceipt(receipt, releaseCommand(), item, mark));
  uncertain(() => validateAcademicReleaseReceipt({ ...receipt, nativeResult: { ...nativeRubric(), criteria: [{ ...nativeRubric().criteria[0], levelDescription: 'Invented description' }, nativeRubric().criteria[1]] } }, releaseCommand(), item, mark));
  uncertain(() => validateAcademicReleaseReceipt({ ...receipt, score: 0 }, releaseCommand(), item, mark));
  uncertain(() => validateAcademicReleaseReceipt(receipt, releaseCommand(), item, { ...mark, id: id(10) }));
});

test('unmounted malformed academic receipts preserve the original key and only an exact receipt settles it', () => {
  const journal = new CommandJournal(); const original = journal.prepare(markCommand().path, markCommand().path, markCommand().body);
  const validate = (receipt: unknown, submitted: Command) => validateAcademicMarkReceipt(receipt, submitted, numericItem());
  uncertain(() => confirmCommandReceipt(journal, original.path, original.key, { ...markReceipt(), feedback: 'Wrong saved feedback' }, undefined, validate));
  assert.equal(journal.get(original.path), original);
  assert.equal(confirmCommandReceipt(journal, original.path, original.key, markReceipt(), undefined, validate), true);
  assert.equal(journal.get(original.path), undefined);
});

test('a retained mark retry survives current readback advancement without adopting its later revision or feedback', () => {
  const source = parseMarkingItem({ ...numericItem(), currentResult: currentMark() });
  assert.doesNotThrow(() => validateAcademicMarkReceipt(markReceipt(), markCommand(), source));
  uncertain(() => validateAcademicMarkReceipt({ ...markReceipt(), revision: 2 }, markCommand(), source));
  const releaseJournal = new CommandJournal(), original = releaseJournal.prepare(releaseCommand().path, releaseCommand().path, releaseCommand().body);
  const validate = (receipt: unknown, submitted: Command) => validateAcademicReleaseReceipt(receipt, submitted, source, currentMark());
  uncertain(() => confirmCommandReceipt(releaseJournal, original.path, original.key, { ...releaseReceipt(), parentVisible: true }, undefined, validate));
  assert.equal(releaseJournal.get(original.path), original);
  assert.equal(confirmCommandReceipt(releaseJournal, original.path, original.key, releaseReceipt(), undefined, validate), true);
});
