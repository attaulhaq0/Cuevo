import assert from 'node:assert/strict';
import test from 'node:test';
import * as binding from '../parent-home-binding-model.ts';
import { LearningApiError } from '../../../shared/api/client.ts';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const context={apiUrl:'https://api.invalid',membership:{schoolId:id,userId:id,role:'parent'},accessToken:'token',accessGeneration:1,online:true,status:'ready'};
const result={id,submissionId:id,assessmentId:id,learnerId:id,revision:1,feedback:'Explain each step.',status:'RELEASED',policyVersion:1,referenceId:id,referenceVersion:'school-v1',evidenceId:id,createdAt:'2026-10-01T00:00:00Z',actorId:id,parentVisible:true,assessmentTitle:'My explanation',referenceTitle:'Checking reasons',model:'numeric',score:0,maxScore:4,nativeResult:{type:'numeric',score:0,maxScore:4,policyVersion:1}};
const report={schemaVersion:'1',schoolId:id,learnerId:id,schoolName:'Current school',learnerName:'Alex',generatedAt:'2026-10-02T00:00:00Z',scope:'CURRENT_RELEASED_PAGE',coverage:'NOT_ESTABLISHED',items:[result],nextCursor:null};
test('parent report validates exact school child publication and native zero before exposing any row',()=>{
 assert.equal(binding.parseParentHomeReport(report,id,id).items[0].nativeResult.type,'numeric');
 for(const value of [{...report,learnerId:other},{...report,schoolId:other},{...report,items:[{...result,parentVisible:false}]},{...report,items:[{...result,learnerId:other}]}])assert.throws(()=>binding.parseParentHomeReport(value,id,id),LearningApiError);
});
test('parent home source envelopes discard old child and access data on the first new projection',()=>{
 const scope=binding.parentHomeReadScope(context,id,'/v1/report',0);const source={scope,value:report};assert.equal(binding.currentParentHomeRead(source,scope)?.learnerId,id);
 for(const next of [binding.parentHomeReadScope(context,other,'/v1/report',0),binding.parentHomeReadScope({...context,accessGeneration:2},id,'/v1/report',0),binding.parentHomeReadScope({...context,online:false},id,'/v1/report',0),binding.parentHomeReadScope({...context,accessToken:'new'},id,'/v1/report',0)])assert.equal(binding.currentParentHomeRead(source,next),null);
});
test('parent conversation projections refuse another child and private staff controls',()=>{
 const conversation={id,learnerId:id,parentId:id,teacherId:other,classId:id,subjectId:id,title:'Learning question',learnerName:'Alex',parentName:'Sam',teacherName:'Maya',className:'Cedar',academicYearName:'2026–2027',subjectName:'Reasoning',createdAt:'2026-10-01T00:00:00Z',state:'OPEN',stateVersion:0,canModerate:false};
 assert.equal(binding.parseParentHomeConversation(conversation,id,id).teacherName,'Maya');
 assert.throws(()=>binding.parseParentHomeConversation({...conversation,learnerId:other},id,id),LearningApiError);
 assert.throws(()=>binding.parseParentHomeConversation({...conversation,canModerate:true},id,id),LearningApiError);
});
test('parent report continuation applies only complete same-child envelopes and stops repeated cursors',()=>{
 const first=binding.parseParentHomeReport({...report,nextCursor:other},id,id);const second=binding.parseParentHomeReport({...report,items:[{...result,id:other,revision:2}],nextCursor:null},id,id);
 const merged=binding.appendParentHomeReportPage(first.items,second,other);assert.deepEqual(merged.items.map(item=>item.id),[id,other]);assert.equal(merged.nextCursor,null);
 assert.throws(()=>binding.appendParentHomeReportPage(first.items,{...second,nextCursor:other},other),LearningApiError);
 assert.throws(()=>binding.appendParentHomeReportPage(first.items,{...second,items:[{...first.items[0],feedback:'Conflicting repeated source'}]},other),LearningApiError);
 assert.throws(()=>binding.appendParentHomeReportPage(first.items,{...second,nextCursor:id},other,[id]),LearningApiError);
});
test('non-period Parent Home report refuses a period-scoped response for its unfiltered source URL',()=>{
 const period={id,name:'Term one',revision:1,startsOn:'2026-10-01',endsOn:'2026-10-31',basis:'SOURCE_SUBMITTED_DATE_UTC'};
 assert.throws(()=>binding.parseParentHomeReport({...report,scope:'CURRENT_RELEASED_PERIOD_PAGE',period},id,id),LearningApiError);
});
test('parent feedback can claim latest only after its complete current report comparison set',()=>{
 const ready={loaded:true,loading:false,error:null,nextCursor:null,moreError:null};
 assert.equal(binding.parentHomeReportComplete(ready),true);
 for(const next of [{...ready,nextCursor:other},{...ready,moreError:new LearningApiError('unavailable')},{...ready,error:new LearningApiError('denied')},{...ready,loading:true},{...ready,loaded:false}])assert.equal(binding.parentHomeReportComplete(next),false);
});
test('parent shared dates retain school-wide or actual class context without learner attribution',()=>{
 const labels={schoolWide:'School-wide date',classUnknown:'Shared class date · class information unavailable'};
 assert.equal(binding.parentHomeEventContext({classId:null,className:'Noor'},labels),'School-wide date');
 assert.equal(binding.parentHomeEventContext({classId:id,className:'Cedar'},labels),'Cedar');
 assert.equal(binding.parentHomeEventContext({classId:id,className:null},labels),'Shared class date · class information unavailable');
});
test('a denied continuation withholds prior protected rows until a fresh current source scope',()=>{
 const scope='current-child-report',denied=new LearningApiError('denied');
 const source={loaded:true,loading:false,error:null,moreError:denied};
 const barrier=binding.parentHomeSourceDenial(null,scope,source);
 assert.equal(binding.parentHomeSourceUsable(source,barrier),false);
 const retry={...source,moreError:null,loadingMore:true};
 const retained=binding.parentHomeSourceDenial(barrier,scope,retry);
 assert.equal(binding.parentHomeSourceUsable(retry,retained),false);
 const settledRetry={...retry,loadingMore:false};assert.equal(binding.parentHomeSourceUsable(settledRetry,binding.parentHomeSourceDenial(retained,scope,settledRetry)),false);
 const fresh=binding.parentHomeSourceDenial(retained,'fresh-current-read',{...retry,loading:true});
 assert.equal(binding.parentHomeSourceUsable({...retry,loading:true},fresh),false);
 assert.equal(binding.parentHomeSourceUsable(retry,fresh),true);
});
test('unauthorized source continuation is withheld while a service outage retains the loaded page',()=>{
 const source={loaded:true,loading:false,error:null,moreError:new LearningApiError('unauthorized')};
 assert.equal(binding.parentHomeSourceUsable(source,binding.parentHomeSourceDenial(null,'child-source',source)),false);
 const outage={...source,moreError:new LearningApiError('unavailable')};
 assert.equal(binding.parentHomeSourceUsable(outage,binding.parentHomeSourceDenial(null,'child-source',outage)),true);
});
