import{describe,it,expect}from'vitest';
import{gradebookPageSchema}from'@cuevo/contracts';
const id='40000000-0000-4000-8000-000000000001';
describe('gradebook identity review metadata',()=>{
 it('requires explicit current identity review state independent of visible page rows',()=>{
  const page={courseId:id,courseTitle:'School course',className:'Cedar',yearGroupName:'Year 1',assessments:[],items:[{id,learnerName:'Same name',identityRequiresReview:true,cells:[]}],learnerTotal:2,assessmentTotal:0,nextLearnerCursor:id,nextAssessmentCursor:null};
  expect(gradebookPageSchema.safeParse(page).success).toBe(true);
  expect(gradebookPageSchema.safeParse({...page,items:[{id,learnerName:'Same name',cells:[]}]}).success).toBe(false);
 });
});
