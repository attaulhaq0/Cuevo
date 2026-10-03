import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePortfolioItem, parsePortfolioRevision, parsePrivateAsset, parsePortfolioSourceWork, parsePortfolioRequestedReview, parsePortfolioFeedbackRequest,portfolioWorkChoices } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const item = { id: 'p', revisionId: 'pr1', revision: 1, learnerId: 'l', sourceModel: 'numeric', title: 'Selected explanation', reflection: 'I explained the source.', createdAt: '2026-10-01T00:00:00Z', feedback: null, featured: false, approvalState: 'AWAITING_REVIEW', parentVisible: false, reviewedAt: null, evidenceId: 'e', resultId: 'r', submissionId: 's', referenceId: 'ref', referenceVersion: 'v1', policyVersion: 2, nativeResult: { type: 'numeric', score: 0, maxScore: 10, policyVersion: 2 }, assessmentTitle: 'School task', referenceTitle: 'Objective' };
test('selected work preserves zero and source/native revision without inheriting parent approval', () => {
  const result = parsePortfolioItem(item); assert.equal(result.parentVisible, false);
  assert.throws(() => parsePortfolioItem({ ...item, parentVisible: true }), LearningApiError);
  assert.throws(() => parsePortfolioItem({ ...item, evidenceId: null }), LearningApiError);
});
test('reviewed portfolio must retain human feedback and reviewed time', () => {
  const reviewed = { ...item, approvalState: 'REVIEWED', feedback: 'Teacher reviewed work.', reviewedAt: '2026-10-01T00:01:00Z', parentVisible: true };
  assert.equal(parsePortfolioItem(reviewed).approvalState, 'REVIEWED');
  assert.throws(() => parsePortfolioItem({ ...reviewed, reviewedAt: null }), LearningApiError);
  assert.equal(parsePortfolioItem({ ...reviewed, sourceWorkApproved: false }).sourceWorkApproved, false);
  assert.throws(() => parsePortfolioItem({ ...item, sourceWorkApproved: true }), LearningApiError);
});
test('history preserves distinct immutable revision identities in bounded pagination', () => { assert.equal(parsePortfolioRevision(item).id, 'pr1'); assert.equal(parsePortfolioRevision({ ...item, revisionId: 'pr2', revision: 2 }).id, 'pr2'); });
test('private asset metadata rejects oversized or unknown files before upload controls', () => { const asset = { id: 'a', ownerId: 'l', name: 'work.txt', contentType: 'text/plain', byteSize: 12, sha256: 'a'.repeat(64), state: 'AVAILABLE', createdAt: '2026-10-01T00:00:00Z' }; assert.equal(parsePrivateAsset(asset).byteSize, 12); assert.throws(() => parsePrivateAsset({ ...asset, byteSize: 524289 }), LearningApiError); assert.throws(() => parsePrivateAsset({ ...asset, contentType: 'text/html' }), LearningApiError); });
test('selected source work retains the exact immutable text and rejects a mismatched revision', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const work = { itemId: id, revisionId: id, portfolioRevision: 1, learnerId: id, learnerName: 'School learner', evidenceId: id, resultId: id, referenceId: id, referenceVersion: 'v1', policyVersion: 2, source: { kind: 'TEXT', submissionId: id, submissionRevision: 1, assessmentId: id, assessmentTitle: 'Explain', submittedAt: '2026-10-01T00:00:00Z', content: 'Complete answer. <script>Untrusted source</script>' } };
  assert.equal(parsePortfolioSourceWork(work).source.content, work.source.content);
  assert.throws(() => parsePortfolioSourceWork({ ...work, portfolioRevision: 0 }), LearningApiError);
  assert.throws(() => parsePortfolioSourceWork({ ...work, source: { ...work.source, content: 'x'.repeat(50001) } }), LearningApiError);
});

test('file portfolio metadata requires a real selected artifact and bounded truthful counts',()=>{
 assert.throws(()=>parsePortfolioItem({...item,submissionKind:'TEXT',responseKind:'FILE',artifactCount:0}),LearningApiError);
 assert.throws(()=>parsePortfolioItem({...item,responseKind:'FILE',artifactCount:6}),LearningApiError);
 assert.throws(()=>parsePortfolioItem({...item,responseKind:'UNKNOWN',artifactCount:1}),LearningApiError);
 assert.throws(()=>parsePortfolioItem({...item,submissionKind:'QUIZ',responseKind:'FILE',artifactCount:1}),LearningApiError);
});
test('requested feedback retains exact learner and reflection identity before review controls',()=>{const id='00000000-0000-4000-8000-000000000001';const request={id,itemId:id,revisionId:id,learnerId:id,learnerName:'School learner',title:'Checking reflection',message:'Review my checking',state:'PENDING',requestedAt:'2026-10-02T00:00:00Z'};assert.equal(parsePortfolioFeedbackRequest(request).learnerId,id);assert.throws(()=>parsePortfolioFeedbackRequest({...request,requestedAt:'unknown'}),LearningApiError);const review={requestId:id,itemId:id,revisionId:id,revision:1,title:'Checking reflection',reflection:'I reviewed one check.',learnerId:id,learnerName:'School learner',sourceModel:'numeric',nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2},evidenceId:id,resultId:id,assessmentTitle:'School task',referenceTitle:'School objective',work:null};assert.equal(parsePortfolioRequestedReview(review).nativeResult.type,'numeric');assert.throws(()=>parsePortfolioRequestedReview({...review,sourceModel:'rubric'}),LearningApiError);});
test('selected work labels use real source/time context and require clear names for exact duplicates',()=>{const source=parsePortfolioItem(item);const choices=portfolioWorkChoices([source,{...source,id:'other'}],'en');assert.equal(choices.every(choice=>choice.ambiguous),true);assert.equal(choices.some(choice=>choice.label.includes('other')||choice.label.includes(source.revisionId)),false);const clear=portfolioWorkChoices([source,{...source,id:'other',title:'A different checking explanation'}],'ar');assert.equal(clear.every(choice=>!choice.ambiguous),true);assert.throws(()=>parsePortfolioItem({...item,title:''}),LearningApiError);});
test('portfolio identity keeps learner and submitted context before matching-title review choices',()=>{const identity={status:'READY',learnerName:'Lina Hassan',className:'Cedar',yearGroupName:'Year 8',academicYearName:'2026–2027',courseTitle:'Checking methods',assessmentTitle:'Selected checking',submittedAt:'2026-10-02T01:00:00Z',submissionRevision:1};const first=parsePortfolioItem({...item,identity});const second=parsePortfolioItem({...item,id:'other',learnerId:'other-learner',identity:{...identity,learnerName:'Maha Hassan'}});const choices=portfolioWorkChoices([first,second],'en');assert.equal(choices.every(choice=>!choice.ambiguous),true);assert.match(choices[0].label,/Lina Hassan/);assert.match(choices[1].label,/Maha Hassan/);assert.equal(choices.some(choice=>choice.label.includes('other-learner')),false);});
test('missing portfolio identity is explicit unknown and cannot label review by technical identifier',()=>{const unknown=parsePortfolioItem(item);assert.equal(unknown.identity.status,'REQUIRES_REVIEW');assert.equal(unknown.identity.learnerName,null);assert.throws(()=>parsePortfolioItem({...item,identity:{status:'READY',learnerName:null,className:'Cedar',yearGroupName:'Year 8',academicYearName:'2026–2027',courseTitle:'Checking',assessmentTitle:'Selected work',submittedAt:'2026-10-02T01:00:00Z',submissionRevision:1}}),LearningApiError);});
