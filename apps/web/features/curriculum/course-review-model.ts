import { z } from 'zod';
import { courseObjectiveApprovalSchema, type CurriculumProgramme, type ProgrammeLearnerPage } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { parseCourseDetail, type CourseDetail } from '../learning/model.ts';
import { parseProgrammeLearnerPage } from './model.ts';
export { curriculumReadScope as courseReviewScope, currentCurriculumRead as currentCourseReview } from './workspace-model.ts';
const uuid=z.uuid(),text=z.string().trim().min(1).max(200);
const bindingSchema=z.object({version:z.number().int().positive(),programmeId:uuid,referenceId:uuid}).strict();
export type BoundReviewCourse=CourseDetail&{curriculumContext:z.infer<typeof bindingSchema>};
export function parseBoundReviewCourse(value:unknown,courseId:string):BoundReviewCourse{
 const course=parseCourseDetail(value),binding=bindingSchema.safeParse(course.curriculumContext);
 if(course.id!==courseId||![course.id,course.classId,course.subjectId].every(id=>uuid.safeParse(id).success)||!course.title.trim()||!binding.success)throw new LearningApiError('invalid');
 return {...course,curriculumContext:binding.data};
}
export function reviewProgramme(course:BoundReviewCourse,programmes:readonly CurriculumProgramme[]):CurriculumProgramme|null{
 const matches=programmes.filter(row=>row.id===course.curriculumContext.programmeId);
 if(matches.length>1||matches.some(row=>row.classId!==course.classId||row.subjectId!==course.subjectId))throw new LearningApiError('invalid');
 return matches[0]??null;
}
const objectiveSchema=z.object({id:uuid,academicReferenceId:uuid.nullable(),title:text,description:z.string().trim().min(1).max(4000),type:z.enum(['objective','outcome','criterion']),parentTitle:text.nullable(),approved:z.boolean(),approvalReason:z.string().trim().min(1).max(2000).nullable(),version:text}).strict().superRefine((row,ctx)=>{
 if(row.approved?row.academicReferenceId===null||row.approvalReason===null:row.academicReferenceId!==null||row.approvalReason!==null)ctx.addIssue({code:'custom',message:'Approval source and prior reason must remain distinct.'});
});
const objectivePageSchema=z.object({version:z.number().int().positive(),scopeStatus:z.enum(['READY','REQUIRES_REVIEW']),courseTitle:text,programmeName:text,packVersion:text,subjectName:text,yearGroupName:text,items:z.array(objectiveSchema).max(100),nextCursor:uuid.nullable()}).strict();
export type ReviewedCourseObjective=z.infer<typeof objectiveSchema>;
export type ReviewedCourseObjectivePage=z.infer<typeof objectivePageSchema>;
function validContinuation(items:readonly{id:string}[],cursor:string|null,nextCursor:string|null){
 return (cursor===null||uuid.safeParse(cursor).success)&&items.every((row,index)=>(cursor===null||row.id>cursor)&&(index===0||row.id>items[index-1].id))&&(nextCursor===null||items.length>0&&nextCursor===items.at(-1)?.id);
}
export function parseCurrentObjectivePage(value:unknown,course:BoundReviewCourse,programme:CurriculumProgramme,cursor:string|null):ReviewedCourseObjectivePage{
 const result=objectivePageSchema.safeParse(value);if(!result.success)throw new LearningApiError('invalid');const page=result.data;
 if(reviewProgramme(course,[programme])?.id!==programme.id||page.courseTitle!==course.title||page.programmeName!==programme.name||page.packVersion!==programme.packVersion||page.subjectName!==programme.subjectName||page.yearGroupName!==programme.yearGroupName||page.items.some(row=>row.version!==programme.packVersion)||!validContinuation(page.items,cursor,page.nextCursor))throw new LearningApiError('invalid');
 return page;
}
const selectionSchema=z.object({courseId:uuid,programmeId:uuid,packVersionId:uuid,classId:uuid,subjectId:uuid,referenceId:uuid,bindingVersion:z.number().int().positive(),approvalVersion:z.number().int().positive(),sourceVersion:text,cursor:uuid.nullable()}).strict();
export type ObjectiveReviewSelection=z.infer<typeof selectionSchema>;
export function objectiveReviewSelection(course:BoundReviewCourse,programme:CurriculumProgramme,page:ReviewedCourseObjectivePage,objective:ReviewedCourseObjective,cursor:string|null):ObjectiveReviewSelection{
 if(page.scopeStatus!=='READY'||objective.approved||!page.items.some(row=>row.id===objective.id))throw new LearningApiError('invalid');
 return selectionSchema.parse({courseId:course.id,programmeId:programme.id,packVersionId:programme.packVersionId,classId:course.classId,subjectId:course.subjectId,referenceId:objective.id,bindingVersion:course.curriculumContext.version,approvalVersion:page.version,sourceVersion:objective.version,cursor});
}
export function parseObjectiveReviewSelection(value:unknown):ObjectiveReviewSelection|null{const result=selectionSchema.safeParse(value);return result.success?result.data:null;}
export function objectiveReviewBindingCurrent(selection:ObjectiveReviewSelection,course:BoundReviewCourse,programme:CurriculumProgramme):boolean{
 return selection.courseId===course.id&&selection.programmeId===programme.id&&selection.packVersionId===programme.packVersionId&&selection.classId===course.classId&&selection.subjectId===course.subjectId&&selection.bindingVersion===course.curriculumContext.version&&selection.sourceVersion===programme.packVersion;
}
export function currentObjectiveReview(selection:ObjectiveReviewSelection,course:BoundReviewCourse,programme:CurriculumProgramme,page:ReviewedCourseObjectivePage):ReviewedCourseObjective|null{
 if(!objectiveReviewBindingCurrent(selection,course,programme)||selection.approvalVersion!==page.version||page.scopeStatus!=='READY')return null;
 return page.items.find(row=>row.id===selection.referenceId&&!row.approved&&row.version===selection.sourceVersion)??null;
}
export function objectiveReviewOptions(rows:readonly ReviewedCourseObjective[]){
 const options=rows.map(row=>({id:row.id,label:[row.title,row.description,row.parentTitle??'',row.type,row.version].join(' · '),requiresReview:false}));
 return options.map(row=>({...row,requiresReview:options.filter(other=>other.label===row.label).length!==1}));
}
export type ObjectiveApprovalSource=Pick<ObjectiveReviewSelection,'courseId'|'referenceId'|'approvalVersion'>;
/** Local form/draft identity only. A new source requires fresh uncontrolled
 * fields; original journal recovery still uses its exact command payload. */
export function objectiveApprovalFormKey(source:ObjectiveApprovalSource|ObjectiveReviewSelection):string{
 return 'programmeId'in source
  ?JSON.stringify([source.courseId,source.programmeId,source.packVersionId,source.classId,source.subjectId,source.referenceId,source.bindingVersion,source.approvalVersion,source.sourceVersion,source.cursor])
  :JSON.stringify([source.courseId,source.referenceId,source.approvalVersion]);
}
export function objectiveApprovalRecovery(command:Command|undefined,courseId:string):ObjectiveApprovalSource|null{
 if(!command||command.path!==`/v1/curriculum/courses/${courseId}/objectives`||!uuid.safeParse(courseId).success)return null;
 const input=courseObjectiveApprovalSchema.safeParse(command.body);return input.success?{courseId,referenceId:input.data.referenceId,approvalVersion:input.data.expectedVersion}:null;
}
export function objectiveRetryPermitted(errors:readonly(LearningApiError|null|undefined)[]):boolean{return !errors.some(error=>error&&['denied','unauthorized'].includes(error.kind));}
const receiptSchema=z.object({id:uuid,courseId:uuid,academicReferenceId:uuid,version:z.number().int().positive()}).strict();
/** SQL returns source/course identity and generated academic mapping/revision;
 * it does not echo reason, actor or the immutable binding version. */
export function validateObjectiveReviewReceipt(value:unknown,original:Command,source:ObjectiveApprovalSource,role:string):void{
 try{const receipt=receiptSchema.parse(value),input=courseObjectiveApprovalSchema.parse(original.body);
  if(!['admin','coordinator'].includes(role)||original.path!==`/v1/curriculum/courses/${source.courseId}/objectives`||input.referenceId!==source.referenceId||input.expectedVersion!==source.approvalVersion||receipt.id!==input.referenceId||receipt.courseId!==source.courseId||receipt.version!==input.expectedVersion+1||receipt.academicReferenceId===receipt.id)throw new LearningApiError('invalid');
 }catch{throw new LearningApiError('invalid',true);}
}
const programmeIdentitySchema=z.object({id:uuid,packVersionId:uuid,classId:uuid,subjectId:uuid,yearGroupId:uuid,packVersion:text}).strict();
export type ProgrammeReviewIdentity=z.infer<typeof programmeIdentitySchema>;
export function programmeReviewIdentity(programme:CurriculumProgramme):ProgrammeReviewIdentity{return programmeIdentitySchema.parse({id:programme.id,packVersionId:programme.packVersionId,classId:programme.classId,subjectId:programme.subjectId,yearGroupId:programme.yearGroupId,packVersion:programme.packVersion});}
export function parseCurrentProgrammeLearners(value:unknown,programmeId:string,cursor:string|null,source?:ProgrammeReviewIdentity):ProgrammeLearnerPage{
 const page=parseProgrammeLearnerPage(value);if(page.programme.id!==programmeId||!validContinuation(page.items,cursor,page.nextCursor)||source&&Object.entries(source).some(([key,value])=>page.programme[key as keyof CurriculumProgramme]!==value))throw new LearningApiError('invalid');return page;
}
