import{gradebookPageSchema,gradebookPreviewResponseSchema,gradebookPreviewSchema,gradebookReleaseSchema,nativeAcademicResultSchema,type GradebookPage,type GradebookSelection,type GradebookPreview}from'@cuevo/contracts';
import {z} from 'zod';
import{LearningApiError,type Command}from'../../shared/api/client';
import {canOpenWorkspace} from '../../shared/session/capabilities';
import {sameNativeResult} from './model';
export type{GradebookPage,GradebookSelection,GradebookPreview};
export function parseGradebook(value:unknown){const parsed=gradebookPageSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;}
export function parseGradebookPreview(value:unknown){const parsed=gradebookPreviewResponseSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;}
export function gradebookAmbiguousNames(items:GradebookPage['items']){const counts=new Map<string,number>();for(const item of items)counts.set(item.learnerName,(counts.get(item.learnerName)??0)+1);return new Set(items.filter(item=>item.identityRequiresReview||(counts.get(item.learnerName)??0)>1).map(item=>item.id));}
type GradebookReadContext={apiUrl:string;membership:{schoolId:string;userId:string;role:string;entitlements:string[]}|null;accessToken:string|null;accessGeneration:number;online:boolean;status:string};
export function gradebookReadScope(app:GradebookReadContext,path:string|null,refresh:number):string|null{
 if(!path||!app.online||app.status!=='ready'||!app.accessToken||!app.membership||!['teacher','admin'].includes(app.membership.role)||!canOpenWorkspace('academic',app.membership.entitlements,app.membership.role))return null;
 return JSON.stringify([app.apiUrl,app.membership.schoolId,app.membership.userId,app.membership.role,app.accessToken,app.accessGeneration,path,refresh]);
}
export function currentGradebookRead<T>(read:{scope:string|null;value:T}|null|undefined,scope:string|null):T|null{return scope&&read?.scope===scope?read.value:null;}
export function parseCurrentGradebook(value:unknown,courseId:string):GradebookPage{
 const page=parseGradebook(value);
 if(page.courseId!==courseId||page.items.some(row=>row.cells.some((cell,index)=>cell.policyVersion!==page.assessments[index].policyVersion||cell.nativeResult&&cell.nativeResult.type!==page.assessments[index].model)))throw new LearningApiError('invalid');
 return page;
}
function sameSelection(a:GradebookSelection,b:GradebookSelection,sharing=true){return a.markingId===b.markingId&&a.submissionId===b.submissionId&&a.expectedRevision===b.expectedRevision&&a.expectedSubmissionRevision===b.expectedSubmissionRevision&&a.expectedPolicyVersion===b.expectedPolicyVersion&&(!sharing||a.parentVisible===b.parentVisible);}
export function parseCurrentGradebookPreview(value:unknown,page:GradebookPage,selections:GradebookSelection[]):GradebookPreview{
 const preview=parseGradebookPreview(value),chosen=gradebookPreviewSchema.parse({selections}).selections;
 if(preview.courseId!==page.courseId||preview.items.length!==chosen.length||new Set(preview.items.map(item=>item.selection.markingId)).size!==preview.items.length)throw new LearningApiError('invalid');
 const ambiguous=gradebookAmbiguousNames(page.items);
 for(const item of preview.items){
  const selection=chosen.find(row=>sameSelection(row,item.selection));
  const learner=page.items.find(row=>row.cells.some(cell=>cell.markingId===selection?.markingId&&cell.submissionId===selection?.submissionId));
  const cell=learner?.cells.find(cell=>cell.markingId===selection?.markingId),assessment=page.assessments.find(row=>row.id===cell?.assessmentId);
  if(!selection||!learner||!cell||!assessment||ambiguous.has(learner.id)||cell.state!=='REVIEW'||cell.markingRevision!==selection.expectedRevision||cell.submissionRevision!==selection.expectedSubmissionRevision||cell.policyVersion!==selection.expectedPolicyVersion||learner.learnerName!==item.learnerName||assessment.title!==item.assessmentTitle||assessment.referenceTitle!==item.referenceTitle||!cell.nativeResult||!sameNativeResult(cell.nativeResult,item.nativeResult))throw new LearningApiError('invalid');
 }
 return preview;
}
const releaseReceipt=z.object({id:z.uuid(),items:z.array(z.object({id:z.uuid(),evidenceId:z.uuid(),revision:z.number().int().positive(),nativeResult:nativeAcademicResultSchema,feedback:z.string().max(10000),referenceTitle:z.string().min(1).max(200),submissionId:z.uuid(),assessmentId:z.uuid(),learnerId:z.uuid()}).strict()).min(1).max(25)}).strict();
/** SQL echoes released source/native data, but no marking ID or parent sharing.
 * Original selections remain server-authorized; absence is never invented. */
export function validateGradebookReleaseReceipt(value:unknown,originalCommand:Command,reviewed?:GradebookPreview,sourcePage?:GradebookPage):void{
 try{
  const match=originalCommand.path.match(/^\/v1\/courses\/([^/]+)\/gradebook\/release$/),body=gradebookReleaseSchema.parse(originalCommand.body),receipt=releaseReceipt.parse(value);
  if(!match||receipt.id!==match[1]||receipt.items.length!==body.selections.length||new Set(receipt.items.map(row=>row.submissionId)).size!==receipt.items.length||new Set(receipt.items.map(row=>row.id)).size!==receipt.items.length||new Set(receipt.items.map(row=>row.evidenceId)).size!==receipt.items.length||reviewed&&reviewed.courseId!==receipt.id)throw new LearningApiError('invalid');
  for(const row of receipt.items){
   const selection=body.selections.find(item=>item.submissionId===row.submissionId);
   if(!selection||row.revision!==selection.expectedRevision||row.nativeResult.policyVersion!==selection.expectedPolicyVersion)throw new LearningApiError('invalid');
   if(reviewed){const item=reviewed.items.find(item=>sameSelection(item.selection,selection,false));if(!item||!sameNativeResult(item.nativeResult,row.nativeResult)||item.feedback!==row.feedback||item.referenceTitle!==row.referenceTitle)throw new LearningApiError('invalid');}
   if(sourcePage){const learner=sourcePage.items.find(item=>item.cells.some(cell=>cell.submissionId===selection.submissionId&&cell.markingId===selection.markingId));const cell=learner?.cells.find(cell=>cell.submissionId===selection.submissionId);if(sourcePage.courseId!==receipt.id||!learner||!cell||row.learnerId!==learner.id||row.assessmentId!==cell.assessmentId)throw new LearningApiError('invalid');}
  }
 }catch{throw new LearningApiError('invalid',true);}
}
