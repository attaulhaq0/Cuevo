import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReference, parseMarkingItem, parseReleasedResult, parseEvidence, canMarkSubmission,currentReleasedResultId,academicReferenceChoice } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
test('closed correction resolves the released result identity separately from its marking identity',()=>{
 const marking={id:'mark-1',resultId:'result-1',revision:1,feedback:'Reviewed',status:'RELEASED'as const,model:'numeric'as const,score:3,maxScore:10};assert.equal(currentReleasedResultId(marking),'result-1');assert.equal(currentReleasedResultId({...marking,resultId:undefined}),null);assert.equal(currentReleasedResultId({...marking,status:'REVIEW'}),null);
});

test('missing native score never becomes zero while an explicit zero remains valid', () => {
  const released = { id: 'result-1', submissionId: 'submission-1', learnerId: 'learner-1', revision: 1, score: 0, maxScore: 10, feedback: 'Review work', status: 'RELEASED', policyVersion: 2, referenceId: 'ref-1', referenceVersion: 'custom-v1', evidenceId: 'evidence-1', createdAt: '2026-10-01T00:00:00.000Z', nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 2 } };
  const native = parseReleasedResult(released).nativeResult;
  assert.equal(native.type === 'numeric' ? native.score : null, 0);
  assert.throws(() => parseReleasedResult({ ...released, nativeResult: { type: 'numeric', maxScore: 10, policyVersion: 2 } }), LearningApiError);
  assert.throws(() => parseReleasedResult({ ...released, status: 'REVIEW' }), LearningApiError);
});

test('unknown approval or absent reference cannot appear as approved academic context', () => {
  assert.throws(() => parseReference({ id: 'ref-1', title: 'Objective', description: 'Complete school-authored objective.', code: null, version: 'v1', status: 'UNKNOWN', sourceType: 'SCHOOL_AUTHORED', createdBy: 'teacher', approvedBy: null }), LearningApiError);
  const item = parseMarkingItem({ id: 'submission-1', assessmentId: 'assessment-1', learnerId: 'learner-1', content: 'Answer', assessmentTitle: 'Quiz', learnerName: 'Synthetic Learner', maxScore: 10, policyVersion: 1, referenceId: null, currentResult: null });
  assert.equal(item.referenceId, null);
  assert.equal(item.currentResult, null);
});

test('source evidence requires its result revision and reference provenance', () => {
  assert.throws(() => parseEvidence({ id: 'evidence-1', sourceType: 'SUBMISSION', sourceObjectId: 'submission-1', learnerId: 'learner-1', actorId: 'teacher-1', createdAt: '2026-10-01T00:00:00.000Z', quality: 'TEACHER_ENTERED', policyVersion: 2, resultId: 'result-1', revision: 1, visibility: 'LEARNER', reviewStatus: 'VERIFIED' }), LearningApiError);
});

test('marking requires the selected objective to be an approved reference in the current list', () => {
  const reference = { id: 'ref-1', title: 'Objective', description: 'School-authored explanation context.', code: null, version: 'v1', status: 'APPROVED' as const, sourceType: 'SCHOOL_AUTHORED' as const, createdBy: 'teacher', approvedBy: 'coordinator' };
  assert.equal(canMarkSubmission(null, [reference]), false);
  assert.equal(canMarkSubmission('ref-other', [reference]), false);
  assert.equal(canMarkSubmission('ref-1', [{ ...reference, status: 'DRAFT', approvedBy: null }]), false);
  assert.equal(canMarkSubmission('ref-1', [reference]), true);
});

test('objective approval context requires its complete bounded saved description', () => {
  const reference = { id: 'ref-1', title: 'Objective', description: 'Explain the school example. اشرح المثال المدرسي. <script>source text</script>', code: null, version: 'v1', status: 'DRAFT', sourceType: 'SCHOOL_AUTHORED', createdBy: 'teacher', approvedBy: null };
  assert.equal(parseReference(reference).description, reference.description);
  assert.throws(() => parseReference({ ...reference, description: undefined }), LearningApiError);
  assert.throws(() => parseReference({ ...reference, description: '' }), LearningApiError);
  assert.throws(() => parseReference({ ...reference, description: 'x'.repeat(4001) }), LearningApiError);
});
test('objective choices use real approval dates and parent context without inventing a version label',()=>{
 const reference={id:'ref-1',title:'Checking',description:'Explain a checking step.',code:null,version:'opaque-unverified-v7',status:'APPROVED'as const,sourceType:'SCHOOL_AUTHORED'as const,createdBy:'teacher',approvedBy:'coordinator',parentTitle:'Year 1 mathematics',approvedAt:'2026-10-03T09:15:00Z'};
 const label=academicReferenceChoice(reference,'en');assert.ok(label.includes('Checking'));assert.ok(label.includes('Year 1 mathematics'));assert.ok(label.includes('UTC'));assert.ok(!label.includes(reference.version));assert.throws(()=>parseReference({...reference,approvedAt:'unknown'}),LearningApiError);
});
