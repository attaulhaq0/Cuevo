import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePortfolioItem, portfolioCollectionChoices, portfolioEvidenceChoices, portfolioIdentityLabel, portfolioWorkChoices } from '../model.ts';
import { parseReleasedResult } from '../../academic/model.ts';

const id = '00000000-0000-4000-8000-000000000001';
const result = parseReleasedResult({ id, evidenceId: id, submissionId: id, learnerId: id, referenceId: id, referenceVersion: 'locked-reference-token', createdAt: '2026-10-03T08:15:20Z', revision: 2, status: 'RELEASED', policyVersion: 1, feedback: '', model: 'numeric', score: 7, maxScore: 10, nativeResult: { type: 'numeric', score: 7, maxScore: 10, policyVersion: 1 }, assessmentTitle: 'Checking methods', referenceTitle: 'Explain your evidence', learnerName: 'Lina Hassan' });
const item = parsePortfolioItem({ id, revisionId: id, revision: 1, learnerId: id, sourceModel: 'numeric', title: 'My checking explanation', reflection: 'I explained why the check works.', createdAt: '2026-10-03T09:00:00Z', feedback: null, featured: false, approvalState: 'AWAITING_REVIEW', parentVisible: false, reviewedAt: null, evidenceId: id, resultId: id, submissionId: id, referenceId: id, referenceVersion: 'locked-reference-token', policyVersion: 1, nativeResult: { type: 'numeric', score: 7, maxScore: 10, policyVersion: 1 }, assessmentTitle: 'Checking methods', referenceTitle: 'Explain your evidence', identity: { status: 'READY', learnerName: 'Lina Hassan', className: 'Year 8', yearGroupName: 'Year 8', academicYearName: '2026–2027', courseTitle: 'Checking methods', assessmentTitle: 'Checking methods', submittedAt: '2026-10-03T08:00:00Z', submissionRevision: 3 } });

test('released evidence with matching task titles is distinguished by actual objective and native revision', () => {
  const choices = portfolioEvidenceChoices([result, { ...result, evidenceId: 'another-evidence', referenceTitle: 'Explain a different check' }, { ...result, evidenceId: 'revised-evidence', revision: 3 }], 'en');
  assert.equal(choices.every(choice => !choice.ambiguous && !choice.unavailable), true);
  assert.match(choices[0].label, /Objective: Explain your evidence/);
  assert.match(choices[0].label, /Result revision: 2/);
  assert.match(choices[0].label, /Result recorded:/);
  assert.doesNotMatch(choices[0].label, /Released:/);
  assert.equal(choices.some(choice => /another-evidence|revised-evidence|locked-reference-token/.test(choice.label)), false);
});

test('released evidence dates retain the source revision creation time and identical context remains ambiguous', () => {
  const separate = portfolioEvidenceChoices([result, { ...result, evidenceId: 'other', createdAt: '2026-10-04T08:15:20Z' }], 'en');
  assert.equal(separate.every(choice => !choice.ambiguous), true);
  const duplicate = portfolioEvidenceChoices([result, { ...result, evidenceId: 'other' }], 'en');
  assert.equal(duplicate.every(choice => choice.ambiguous), true);
});

test('missing released-source names show localized review instead of a technical fallback', () => {
  const [choice] = portfolioEvidenceChoices([{ ...result, assessmentTitle: undefined, referenceTitle: undefined }], 'ar');
  assert.equal(choice.unavailable, true);
  assert.match(choice.label, /غير متاح/);
  assert.equal(choice.label.includes(id) || choice.label.includes('locked-reference-token'), false);
});

test('Arabic released source context names its objective, revision and recorded source date', () => {
  const [choice] = portfolioEvidenceChoices([result], 'ar');
  assert.match(choice.label, /الهدف: Explain your evidence/);
  assert.match(choice.label, /مراجعة النتيجة:/);
  assert.match(choice.label, /سُجّلت النتيجة في:/);
  assert.doesNotMatch(choice.label, /صدرت في:/);
  assert.equal(choice.label.includes(id), false);
});

test('portfolio identity labels name the class, year group and academic year as distinct axes', () => {
  const label = portfolioIdentityLabel(item.identity, 'en');
  assert.match(label, /Class: Year 8/); assert.match(label, /Year group: Year 8/); assert.match(label, /Academic year: 2026–2027/);
  const arabic = portfolioIdentityLabel(item.identity, 'ar');
  assert.match(arabic, /الصف: Year 8/); assert.match(arabic, /المستوى الدراسي: Year 8/); assert.match(arabic, /العام الدراسي: 2026–2027/);
  assert.match(portfolioIdentityLabel({ ...item.identity, className: null, status: 'REQUIRES_REVIEW' }, 'ar'), /غير متاح/);
});

test('same-title selected work includes the real submission and reflection revisions without changing names', () => {
  const named = { ...item, identity: { ...item.identity, learnerName: 'Year 8 Lina Hassan' } };
  const choices = portfolioWorkChoices([named, { ...named, id: 'another-item', revision: 2 }], 'en');
  assert.equal(choices.every(choice => !choice.ambiguous), true);
  assert.match(choices[0].label, /Year 8 Lina Hassan/);
  assert.match(choices[0].label, /Submitted work revision: 3/);
  assert.match(choices[0].label, /Reflection revision: 1/);
  assert.equal(choices.some(choice => choice.label.includes('another-item') || choice.label.includes(id)), false);
});

test('same-name collections use actual descriptions and indistinguishable collections need review', () => {
  const choices = portfolioCollectionChoices([{ id, title: 'My work', description: 'Checking explanations' }, { id: 'other', title: 'My work', description: 'Reflection practice' }], 'en');
  assert.equal(choices.every(choice => !choice.ambiguous && !choice.unavailable), true);
  assert.match(choices[0].label, /Checking explanations/); assert.match(choices[1].label, /Reflection practice/);
  const duplicates = portfolioCollectionChoices([{ id, title: 'My work', description: '' }, { id: 'other', title: 'My work', description: '' }], 'ar');
  assert.equal(duplicates.every(choice => choice.ambiguous), true);
  assert.equal(duplicates.some(choice => choice.label.includes(id) || choice.label.includes('other')), false);
  const [unknown] = portfolioCollectionChoices([{ id, title: ' ', description: '' }], 'ar');
  assert.equal(unknown.unavailable, true); assert.match(unknown.label, /غير متاح/);
});

test('visually equal collection captions stay ambiguous across casing and repeated spaces', () => {
  const choices = portfolioCollectionChoices([{ id, title: 'My work', description: 'Checking practice' }, { id: 'other', title: 'MY   WORK', description: 'checking  practice' }], 'en');
  assert.equal(choices.every(choice => choice.ambiguous), true);
});

test('missing selected-work context remains unavailable even when its reflection title is unique', () => {
  const [choice] = portfolioWorkChoices([{ ...item, identity: { ...item.identity, status: 'REQUIRES_REVIEW', className: null } }], 'ar');
  assert.equal(choice.unavailable, true); assert.match(choice.label, /غير متاح/);
  assert.equal(choice.label.includes(id), false);
});

test('unavailable source revision date does not become an invented time or a selectable source', () => {
  const [choice] = portfolioEvidenceChoices([{ ...result, createdAt: 'unknown' }], 'en');
  assert.equal(choice.unavailable, true); assert.match(choice.label, /Result recorded: Context unavailable/);
});
