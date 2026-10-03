import{describe,it,expect}from'vitest';import * as runtime from'../../src/modules/curriculum/public';
describe('accepted curriculum runtime behavior',()=>{
 it('validates exact native numeric scale and rubric definition without guessed normalization',()=>{
  const validate=(runtime as unknown as Record<string,(behavior:unknown,input:unknown)=>unknown>).validateAcceptedAssessment;expect(validate).toBeTypeOf('function');
  const behavior={basis:'LOCKED_ARTIFACT',version:'synthetic-1',models:['numeric','rubric'],numericMaxScore:10,rubric:{title:'School descriptors',version:'synthetic-1',criteria:[{key:'check',title:'Checking',levels:[{key:'shown',label:'Shown',description:'The check is shown.'}]}]}};
  expect(()=>validate(behavior,{model:'numeric',maxScore:10})).not.toThrow();expect(()=>validate(behavior,{model:'numeric',maxScore:20})).toThrow();expect(()=>validate(behavior,{model:'rubric',rubric:behavior.rubric})).not.toThrow();expect(()=>validate(behavior,{model:'rubric',rubric:{...behavior.rubric,version:'wrong'}})).toThrow();
 });
 it('refuses missing accepted provenance before authoring a course assessment',async()=>{
  const validate=runtime.acceptedCourseBehavior;const client={query:async()=>({rows:[{behavior:undefined}]})}as unknown as Parameters<typeof validate>[0];await expect(validate(client,'course')).rejects.toMatchObject({code:'CURRICULUM_REQUIRES_REVIEW'});
 });
});
