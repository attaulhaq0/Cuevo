import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePortfolioItem, parsePortfolioRevision, parsePrivateAsset, parsePortfolioSourceWork, parsePortfolioRequestedReview, parsePortfolioFeedbackRequest,portfolioWorkChoices } from '../model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
import * as portfolio from '../model.ts';
import { CommandJournal, confirmCommandReceipt, captureCommandReceiptValidator } from '../../../shared/api/client.ts';
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

const sourceId='00000000-0000-4000-8000-000000000001';
const otherId='00000000-0000-4000-8000-000000000002';
const document={id:sourceId,name:'Checking.pdf',contentType:'application/pdf' as const,byteSize:12,sha256:'a'.repeat(64),state:'AVAILABLE' as const};
const exactItem=parsePortfolioItem({...item,id:sourceId,revisionId:sourceId,learnerId:sourceId,evidenceId:sourceId,resultId:sourceId,submissionId:sourceId,referenceId:sourceId,submissionKind:'TEXT',responseKind:'TEXT',artifactCount:1,identity:{status:'READY',learnerName:'Lina',className:'Cedar',yearGroupName:'Year 8',academicYearName:'2026–2027',courseTitle:'Checking',assessmentTitle:'School task',submittedAt:'2026-10-01T00:00:00Z',submissionRevision:1}});
const exactSource=parsePortfolioSourceWork({itemId:sourceId,revisionId:sourceId,portfolioRevision:1,learnerId:sourceId,learnerName:'Lina',evidenceId:sourceId,resultId:sourceId,referenceId:sourceId,referenceVersion:'v1',policyVersion:2,source:{kind:'TEXT',submissionId:sourceId,submissionRevision:1,assessmentId:sourceId,assessmentTitle:'School task',submittedAt:'2026-10-01T00:00:00Z',content:'Exact answer',artifacts:[document]}});
const readContext={apiUrl:'https://api.cuevo.invalid',membership:{schoolId:'school',userId:'learner',role:'student'},accessToken:'token',accessGeneration:1,online:true,status:'ready'};

test('protected detail and document-review acknowledgements disappear on the first changed-context projection',()=>{
 assert.equal(typeof portfolio.portfolioReadScope,'function');
 const scope=portfolio.portfolioReadScope(readContext,'/v1/portfolio/items/source',0);
 const response={scope,value:exactSource};const acknowledgements={scope,value:[sourceId]};
 assert.equal(portfolio.currentPortfolioRead(response,scope)?.source.content,'Exact answer');
 for(const context of [{...readContext,apiUrl:'https://replacement.invalid'},{...readContext,membership:{...readContext.membership,schoolId:'other-school'}},{...readContext,membership:{...readContext.membership,userId:'other-learner'}},{...readContext,membership:{...readContext.membership,role:'teacher'}},{...readContext,accessToken:'replacement-token'},{...readContext,accessGeneration:2},{...readContext,online:false},{...readContext,status:'verifying'}]){
  const next=portfolio.portfolioReadScope(context,'/v1/portfolio/items/source',0);
  assert.equal(portfolio.currentPortfolioRead(response,next),null);
  assert.equal(portfolio.currentPortfolioRead(acknowledgements,next),null);
 }
 for(const next of [portfolio.portfolioReadScope(readContext,'/v1/portfolio/items/other',0),portfolio.portfolioReadScope(readContext,'/v1/portfolio/items/source',1),null])assert.equal(portfolio.currentPortfolioRead(response,next),null);
});
test('exact selected source requires every known academic and submitted context before review',()=>{
 assert.equal(typeof portfolio.portfolioSourceMatchesItem,'function');
 assert.equal(portfolio.portfolioSourceMatchesItem(exactSource,exactItem),true);
 for(const source of [{...exactSource,portfolioRevision:2},{...exactSource,evidenceId:otherId},{...exactSource,resultId:otherId},{...exactSource,referenceId:otherId},{...exactSource,referenceVersion:'v2'},{...exactSource,policyVersion:3},{...exactSource,learnerName:'Other learner'},{...exactSource,source:{...exactSource.source,submissionRevision:2}},{...exactSource,source:{...exactSource.source,assessmentTitle:'Other task'}},{...exactSource,source:{...exactSource.source,submittedAt:'2026-10-02T00:00:00Z'}},{...exactSource,source:{...exactSource.source,kind:'FILE' as const,content:''}},{...exactSource,source:{...exactSource.source,artifacts:[]}}])assert.equal(portfolio.portfolioSourceMatchesItem(source,exactItem),false);
});
test('document selections require exact full submission parity and an available unique subset',()=>{
 assert.equal(typeof portfolio.portfolioDocumentSelectionValid,'function');
 const all={submissionId:sourceId,assessmentId:sourceId,learnerId:sourceId,revision:1,responseKind:'TEXT' as const,content:'Exact answer',artifacts:[document,{...document,id:otherId,name:'Other.pdf'}]};
 assert.equal(portfolio.portfolioDocumentSelectionValid(all,exactSource,exactItem,[sourceId,otherId]),true);
 for(const chosen of [[sourceId,sourceId],['unknown'],[sourceId,otherId,otherId],['a','b','c','d','e','f']])assert.equal(portfolio.portfolioDocumentSelectionValid(all,exactSource,exactItem,chosen),false);
 for(const changed of [{...all,revision:2},{...all,assessmentId:otherId},{...all,responseKind:'FILE' as const,content:''},{...all,content:'Other answer'},{...all,artifacts:[{...document,state:'RETIRED' as const}]},{...all,artifacts:[{...document,sha256:'b'.repeat(64)}]}])assert.equal(portfolio.portfolioDocumentSelectionValid(changed,exactSource,exactItem,[sourceId]),false);
 const fileItem={...exactItem,responseKind:'FILE' as const};const fileSource={...exactSource,source:{...exactSource.source,kind:'FILE' as const,content:''}};const fileAll={...all,responseKind:'FILE' as const,content:''};
 assert.equal(portfolio.portfolioDocumentSelectionValid(fileAll,fileSource,fileItem,[]),false);
 assert.equal(portfolio.portfolioDocumentSelectionValid(fileAll,fileSource,fileItem,[sourceId]),true);
});
test('source validation precedes document controls and downloaded acknowledgements retain exact byte metadata',()=>{
 assert.equal(typeof portfolio.portfolioDocumentSourcesMatch,'function');
 const all={submissionId:sourceId,assessmentId:sourceId,learnerId:sourceId,revision:1,responseKind:'TEXT' as const,content:'Exact answer',artifacts:[document]};
 assert.equal(portfolio.portfolioDocumentSourcesMatch(all,exactSource,exactItem),true);
 assert.equal(portfolio.portfolioDocumentSourcesMatch({...all,artifacts:[{...document,sha256:'b'.repeat(64)}]},exactSource,exactItem),false);
 const reviewed=portfolio.portfolioArtifactReviewKey(document);
 for(const changed of [{...document,sha256:'b'.repeat(64)},{...document,byteSize:13},{...document,name:'Other.pdf'},{...document,state:'RETIRED' as const}])assert.notEqual(portfolio.portfolioArtifactReviewKey(changed),reviewed);
});
test('requested review rejects a policy mismatch between its native result and embedded selected work',()=>{
 const request={id:sourceId,itemId:sourceId,revisionId:sourceId,learnerId:sourceId,learnerName:'Lina',title:'Selected explanation',message:'Please review',state:'PENDING' as const,requestedAt:'2026-10-01T00:00:00Z'};
 const source=parsePortfolioRequestedReview({requestId:sourceId,itemId:sourceId,revisionId:sourceId,revision:1,title:'Selected explanation',reflection:'Exact reflection',learnerId:sourceId,learnerName:'Lina',sourceModel:'numeric',nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2},evidenceId:sourceId,resultId:sourceId,assessmentTitle:'School task',referenceTitle:'Objective',work:exactSource});
 assert.equal(typeof portfolio.portfolioRequestedReviewMatchesRequest,'function');
 assert.equal(portfolio.portfolioRequestedReviewMatchesRequest(source,request),true);
 assert.equal(portfolio.portfolioRequestedReviewMatchesRequest({...source,work:{...exactSource,policyVersion:3}},request),false);
 assert.equal(portfolio.portfolioRequestedReviewMatchesRequest({...source,title:'Other reflection'},request),false);
});
test('upload settles only a matching complete available receipt and retains malformed-success retries',()=>{
 assert.equal(typeof portfolio.parsePrivateAssetReceipt,'function');
 const staged={id:sourceId,ownerId:sourceId,name:'Checking.pdf',contentType:'application/pdf',byteSize:12,sha256:'a'.repeat(64),state:'STAGED',createdAt:'2026-10-01T00:00:00Z',objectPath:'private/opaque'};
 const expected={ownerId:sourceId,name:'Checking.pdf',contentType:'application/pdf' as const,byteSize:12,sha256:'a'.repeat(64)};
 assert.equal(portfolio.parsePrivateAssetReceipt(staged,expected,'stage').id,sourceId);
 const journal=new CommandJournal();const command=journal.prepare('finalize',`/v1/assets/${sourceId}/finalize`,{contentBase64:'ZXhhY3Q='});
 for(const receipt of [{id:sourceId},{...staged,state:'AVAILABLE',id:otherId},{...staged,state:'AVAILABLE',ownerId:otherId},{...staged,state:'AVAILABLE',sha256:'b'.repeat(64)},{...staged,state:'AVAILABLE',byteSize:13},{...staged,state:'AVAILABLE',name:'Other.pdf'},staged]){
  assert.throws(()=>confirmCommandReceipt(journal,'finalize',command.key,receipt, value=>{portfolio.parsePrivateAssetReceipt(value,expected,'finalize',sourceId);}),error=>error instanceof LearningApiError&&error.uncertain);
  assert.equal(journal.get('finalize')?.key,command.key);
 }
 assert.equal(confirmCommandReceipt(journal,'finalize',command.key,{...staged,state:'AVAILABLE'},value=>{portfolio.parsePrivateAssetReceipt(value,expected,'finalize',sourceId);}),true);
 assert.equal(journal.get('finalize'),undefined);
});
test('portfolio command receipts retain original keys until the exact immutable transition is confirmed',()=>{
 assert.equal(typeof portfolio.parsePortfolioCommandReceipt,'function');
 const expected={id:sourceId,revisionId:sourceId,revision:1};
 const cases=[
  {command:'create' as const,expected:undefined,valid:{id:sourceId,revisionId:otherId,revision:1,status:'AWAITING_REVIEW'},invalid:[{id:sourceId},{id:sourceId,revisionId:otherId,revision:2,status:'AWAITING_REVIEW'},{id:sourceId,revisionId:otherId,revision:1,status:'REVIEWED'}]},
  {command:'reflection' as const,expected,valid:{id:sourceId,revisionId:otherId,revision:2,status:'AWAITING_REVIEW'},invalid:[{id:otherId,revisionId:otherId,revision:2,status:'AWAITING_REVIEW'},{id:sourceId,revisionId:sourceId,revision:2,status:'AWAITING_REVIEW'},{id:sourceId,revisionId:otherId,revision:1,status:'AWAITING_REVIEW'},{id:sourceId,revisionId:otherId,revision:2,status:'REVIEWED'}]},
  {command:'review' as const,expected,valid:{id:sourceId,revisionId:sourceId,revision:1,status:'REVIEWED'},invalid:[{id:otherId,revisionId:sourceId,revision:1,status:'REVIEWED'},{id:sourceId,revisionId:otherId,revision:1,status:'REVIEWED'},{id:sourceId,revisionId:sourceId,revision:2,status:'REVIEWED'},{id:sourceId,revisionId:sourceId,revision:1,status:'AWAITING_REVIEW'}]},
  {command:'revoke' as const,expected,valid:{id:sourceId,revisionId:sourceId,revision:1,status:'PARENT_REVOKED'},invalid:[{id:sourceId,revisionId:otherId,revision:1,status:'PARENT_REVOKED'},{id:sourceId,revisionId:sourceId,revision:2,status:'PARENT_REVOKED'},{id:sourceId,revisionId:sourceId,revision:1,status:'REVIEWED'}]},
 ];
 for(const example of cases){
  const journal=new CommandJournal();const pending=journal.prepare(example.command,'/v1/portfolio/items/source/'+example.command,{expectedRevision:1});
  for(const value of [null,[],{},...example.invalid,{...example.valid,id:'invalid'},{...example.valid,revisionId:'invalid'},{...example.valid,revision:0},{...example.valid,revision:1.5}]){
   assert.throws(()=>confirmCommandReceipt(journal,example.command,pending.key,value,receipt=>{portfolio.parsePortfolioCommandReceipt(receipt,example.command,example.expected);}),error=>error instanceof LearningApiError&&error.uncertain);
   assert.equal(journal.get(example.command)?.key,pending.key);
  }
  assert.equal(confirmCommandReceipt(journal,example.command,pending.key,example.valid,receipt=>{portfolio.parsePortfolioCommandReceipt(receipt,example.command,example.expected);}),true);
  assert.equal(journal.get(example.command),undefined);
 }
 for(const command of ['reflection','review','revoke'] as const)assert.throws(()=>portfolio.parsePortfolioCommandReceipt({id:sourceId,revisionId:sourceId,revision:1,status:'REVIEWED'},command),error=>error instanceof LearningApiError&&error.uncertain);
});
test('student and selected-child portfolio pages reject another learner and unapproved parent projections',()=>{
 const own=portfolio.parsePortfolioItemForLearner(exactItem,sourceId,false);
 assert.equal(own.learnerId,sourceId);
 assert.throws(()=>portfolio.parsePortfolioItemForLearner({...exactItem,learnerId:otherId},sourceId,false),LearningApiError);
 assert.throws(()=>portfolio.parsePortfolioItemForLearner(exactItem,null,true),LearningApiError);
 const approved={...exactItem,approvalState:'REVIEWED',parentVisible:true,feedback:'Reviewed this reflection.',reviewedAt:'2026-10-02T11:00:00Z'};
 assert.equal(portfolio.parsePortfolioItemForLearner(approved,sourceId,true).parentVisible,true);
 assert.throws(()=>portfolio.parsePortfolioItemForLearner({...approved,learnerId:otherId},sourceId,true),LearningApiError);
 assert.throws(()=>portfolio.parsePortfolioItemForLearner({...approved,parentVisible:false},sourceId,true),LearningApiError);
 assert.throws(()=>portfolio.parsePortfolioItemForLearner(exactItem,sourceId,true),LearningApiError);
});
test('released portfolio source choices require the exact current learner before display or selection',()=>{
 const result={id:sourceId,submissionId:sourceId,learnerId:sourceId,referenceId:sourceId,referenceVersion:'v1',evidenceId:sourceId,createdAt:'2026-10-01T11:00:00Z',status:'RELEASED',revision:1,policyVersion:2,feedback:'Check your explanation.',assessmentTitle:'School task',referenceTitle:'Objective',model:'numeric',score:0,maxScore:10,nativeResult:{type:'numeric',score:0,maxScore:10,policyVersion:2}};
 assert.equal(portfolio.parsePortfolioReleasedResultForLearner(result,sourceId).nativeResult.type,'numeric');
 assert.throws(()=>portfolio.parsePortfolioReleasedResultForLearner({...result,learnerId:otherId},sourceId),LearningApiError);
 assert.throws(()=>portfolio.parsePortfolioReleasedResultForLearner(result,null),LearningApiError);
});
test('portfolio history verifies the immutable item source before using revision pagination identity',()=>{
 const older={...exactItem,revisionId:otherId,revision:2,reflection:'A different saved reflection.',createdAt:'2026-10-02T11:00:00Z',approvalState:'REVIEWED',parentVisible:true,feedback:'An earlier review.',reviewedAt:'2026-10-02T11:01:00Z',artifactCount:0,sourceWorkApproved:true};
 const row=portfolio.parsePortfolioHistoryForItem(older,exactItem);
 assert.equal(row.id,otherId);assert.equal(row.revision,2);assert.equal(row.parentVisible,true);assert.equal(row.artifactCount,0);
 for(const changed of [{...older,id:otherId},{...older,learnerId:otherId},{...older,evidenceId:otherId},{...older,resultId:otherId},{...older,submissionId:otherId},{...older,referenceId:otherId},{...older,referenceVersion:'v2'},{...older,policyVersion:3,nativeResult:{...older.nativeResult,policyVersion:3}}])assert.throws(()=>portfolio.parsePortfolioHistoryForItem(changed,exactItem),LearningApiError);
});


test('organization receipts validate the new row and exact original placement revision before journal settlement',()=>{
 const parse=(portfolio as unknown as {parsePortfolioOrganizationReceipt:(value:unknown,command:'collection.create'|'placement.create'|'feedback.request',expectedRevision?:number)=>{id:string;revision:number}}).parsePortfolioOrganizationReceipt;
 assert.equal(typeof parse,'function');
 for(const example of [
  {kind:'collection.create' as const,path:'/v1/portfolio/collections',body:{title:'My explanations',description:'Selected school work'},revision:1},
  {kind:'feedback.request' as const,path:`/v1/portfolio/items/${sourceId}/feedback-request`,body:{revisionId:sourceId,expectedRevision:4,message:'Review this reflection',confirmRequest:true},revision:1},
  {kind:'placement.create' as const,path:`/v1/portfolio/items/${sourceId}/placement`,body:{collectionId:sourceId,expectedRevision:4,position:2},revision:5},
 ]){
  const journal=new CommandJournal();const command=journal.prepare(example.path,example.path,example.body);let effects=0;
  const validate=captureCommandReceiptValidator(command,(receipt,original)=>{parse(receipt,example.kind,example.kind==='placement.create'?Number(original.body.expectedRevision):undefined);});
  for(const receipt of [null,[],{}, {id:otherId}, {id:'not-a-row',revision:example.revision}, {id:otherId,revision:0}, {id:otherId,revision:1.5}, {id:otherId,revision:example.revision+1}, {id:otherId,revision:Number.MAX_SAFE_INTEGER+1}]){
   assert.throws(()=>confirmCommandReceipt(journal,example.path,command.key,receipt,()=>{effects++;},validate),error=>error instanceof LearningApiError&&error.kind==='invalid'&&error.uncertain);
   assert.equal(journal.get(example.path)?.key,command.key);assert.equal(effects,0);
  }
  // Placement returns a new placement-row ID, not the selected item ID.
  assert.deepEqual(parse({id:otherId,revision:example.revision},example.kind,example.kind==='placement.create'?4:undefined),{id:otherId,revision:example.revision});
  assert.equal(confirmCommandReceipt(journal,example.path,command.key,{id:otherId,revision:example.revision},()=>{effects++;},validate),true);
  assert.equal(effects,1);assert.equal(journal.get(example.path),undefined);
 }
});

test('organization placement receipt capture cannot follow a changed revision or accept an unknown expected basis',()=>{
 const parse=(portfolio as unknown as {parsePortfolioOrganizationReceipt:(value:unknown,command:'placement.create',expectedRevision?:number)=>{id:string;revision:number}}).parsePortfolioOrganizationReceipt;
 assert.equal(typeof parse,'function');
 const journal=new CommandJournal();const path=`/v1/portfolio/items/${sourceId}/placement`;const original=journal.prepare(path,path,{collectionId:null,expectedRevision:0,position:1});
 const validate=captureCommandReceiptValidator(original,(receipt,command)=>{parse(receipt,'placement.create',Number(command.body.expectedRevision));});
 original.body.expectedRevision=9;
 assert.throws(()=>confirmCommandReceipt(journal,path,original.key,{id:otherId,revision:10},undefined,validate),error=>error instanceof LearningApiError&&error.uncertain);
 assert.equal(journal.get(path)?.key,original.key);
 assert.equal(confirmCommandReceipt(journal,path,original.key,{id:otherId,revision:1},undefined,validate),true);
 for(const basis of [undefined,-1,1.5,Number.MAX_SAFE_INTEGER,Number.NaN])assert.throws(()=>parse({id:otherId,revision:1},'placement.create',basis),error=>error instanceof LearningApiError&&error.uncertain);
});


test('organization selection restoration accepts only exact local IDs and revision basis',()=>{
 const parse=(portfolio as unknown as {parsePortfolioOrganizationSelection:(value:unknown)=>unknown}).parsePortfolioOrganizationSelection;
 assert.equal(typeof parse,'function');
 const examples=[{kind:'create'},{kind:'placement',itemId:sourceId,revisionId:otherId,revision:2,placementRevision:0},{kind:'feedback-request',itemId:sourceId,revisionId:otherId,revision:2},{kind:'review',requestId:otherId,itemId:sourceId,revisionId:otherId}];
 for(const selection of examples)assert.deepEqual(parse(selection),selection);
 for(const value of [null,[],{}, {kind:'other'},{kind:'create',title:'Protected work'},{...examples[1],reflection:'Protected response'}, {...examples[2],itemId:'unknown'}, {...examples[2],revisionId:''}, {...examples[2],revision:0}, {...examples[2],revision:1.5}, {...examples[2],revision:Number.MAX_SAFE_INTEGER+1}, {...examples[1],placementRevision:-1}, {...examples[1],placementRevision:1.5}, {...examples[3],requestId:'unknown'},{...examples[3],revision:1}])assert.throws(()=>parse(value),LearningApiError);
});
