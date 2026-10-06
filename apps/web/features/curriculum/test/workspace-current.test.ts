import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../workspace-model.ts';
import { LearningApiError, CommandJournal, confirmCommandReceipt } from '../../../shared/api/client.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('curriculum lifecycle behavior and course review deny recovery until each exact current source succeeds',()=>{
 const paths=['/v1/curriculum/versions/source/lifecycle','/v1/curriculum/versions/source/behavior-acceptance','/v1/curriculum/courses/course/objectives','/v1/curriculum/versions?limit=100'];
 for(const path of paths){const read={path,scope:'original',loading:false,ready:false,error:new LearningApiError('denied')};let denied=model.updateCurriculumSourceDenials({},[read]);assert.equal(model.curriculumHasSourceDenial(denied,[read]),true);
  const loading={...read,scope:'refreshed',loading:true,error:null};denied=model.updateCurriculumSourceDenials(denied,[loading]);assert.equal(model.curriculumHasSourceDenial(denied,[loading]),true);
  const failed={...loading,loading:false,error:new LearningApiError('unavailable')};denied=model.updateCurriculumSourceDenials(denied,[failed]);assert.equal(model.curriculumHasSourceDenial(denied,[failed]),true);
  const success={...loading,loading:false,ready:true};denied=model.updateCurriculumSourceDenials(denied,[success]);assert.equal(model.curriculumHasSourceDenial(denied,[success]),false);
 }
});
test('curriculum workspace protects exact current staff context and never mounts a preceding source',()=>{
 const context={apiUrl:'https://api.invalid',membership:{schoolId:id(1),userId:id(2),role:'teacher',entitlements:['curriculum']},accessToken:'token',online:true,status:'ready',accessGeneration:1};
 const scope=model.curriculumReadScope(context,'/v1/curriculum/versions',0);assert.ok(scope);
 assert.equal(model.currentCurriculumRead({scope,value:{id:id(3)}},scope)?.id,id(3));
 assert.equal(model.currentCurriculumRead({scope,value:{id:id(3)}},model.curriculumReadScope({...context,accessGeneration:2},'/v1/curriculum/versions',0)),null);
 assert.equal(model.curriculumReadScope({...context,membership:{...context.membership,role:'parent'}},'/v1/curriculum/versions',0),null);
});
test('curriculum configuration receipt binds command school and actual course/programme echoes',()=>{
 const path=`/v1/curriculum/courses/${id(3)}`,journal=new CommandJournal();
 const command=journal.prepare(path,path,{programmeId:id(4),referenceId:id(5),expectedVersion:1,confirmConfiguration:true});
 const receipt={id:id(3),command:'course.configure',schoolId:id(1),academicReferenceId:id(6)};
 const validate=(value:unknown,original:typeof command)=>model.validateCurriculumConfigurationReceipt(value,original,id(1));
 for(const patch of [{id:id(9)},{schoolId:id(9)},{command:'programme.create'},{academicReferenceId:null},{privateDetails:'Excluded'}]){
  assert.throws(()=>confirmCommandReceipt(journal,path,command.key,{...receipt,...patch},undefined,validate),error=>error instanceof LearningApiError&&error.uncertain);assert.equal(journal.get(path),command);
 }
 assert.equal(confirmCommandReceipt(journal,path,command.key,receipt,undefined,validate),true);
});
test('curriculum creation receipts cannot manufacture absent saved values or official readiness',()=>{
 const command={key:'original',path:'/v1/curriculum/overlays',body:{packVersionId:id(4),axis:'quality',status:'UNKNOWN',confirmConfiguration:true}};
 assert.doesNotThrow(()=>model.validateCurriculumConfigurationReceipt({id:id(3),command:'overlay.configure',schoolId:id(1),academicReferenceId:null},command,id(1)));
 assert.throws(()=>model.validateCurriculumConfigurationReceipt({id:id(3),command:'overlay.configure',schoolId:id(1),academicReferenceId:id(6)},command,id(1)),LearningApiError);
});
test('configuration recovery retains only the bounded action and exact selected course',()=>{
 assert.deepEqual(model.parseCurriculumConfigurationIntent({action:'course',courseId:id(4)}),{action:'course',courseId:id(4)});
 assert.equal(model.parseCurriculumConfigurationIntent({action:'course',courseId:'short-id'}),null);
 assert.equal(model.parseCurriculumConfigurationIntent({action:'course',courseId:id(4),protectedSource:{}}),null);
});
test('configuration choices refuse matching human labels without inventing an identifier suffix',()=>{
 const choices=model.curriculumChoices([{id:id(1),label:'Programme · Year 1'},{id:id(2),label:'Programme · Year 1'},{id:id(3),label:'Programme · Year 2'},{id:id(4),label:''}]);
 assert.deepEqual(choices.map(item=>item.available),[false,false,true,false]);
 assert.equal(choices[0].label,'Programme · Year 1');
});
