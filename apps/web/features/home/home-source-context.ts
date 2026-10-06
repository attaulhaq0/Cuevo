import { parseEvidence, type Evidence } from '../academic/model.ts';
import { LearningApiError } from '../../shared/api/client.ts';

export type HomeFeedbackSource={id:string;learnerId:string;submissionId:string;evidenceId:string;referenceId:string;referenceVersion:string;policyVersion:number;revision:number;model:'numeric'|'rubric'};
export type HomeFeedbackEvidenceRead={scope:string|null;value:Evidence};
export function homeFeedbackEvidenceScope(frame:string|null,result:HomeFeedbackSource|null):string|null{
 return frame&&result?JSON.stringify([frame,result.id,result.learnerId,result.submissionId,result.evidenceId,result.referenceId,result.referenceVersion,result.policyVersion,result.revision,result.model]):null;
}
/** The current evidence owner supplies names only after its exact protected source
 * and Parent publication checks. Home never looks up a person by a raw actor ID. */
export function parseHomeFeedbackEvidence(value:unknown,result:HomeFeedbackSource,actor:{role:'student'|'parent';userId:string;learnerId:string}):Evidence{
 const evidence=parseEvidence(value);
 if(evidence.id!==result.evidenceId||evidence.resultId!==result.id||evidence.learnerId!==result.learnerId||evidence.learnerId!==actor.learnerId||evidence.sourceObjectId!==result.submissionId||evidence.referenceId!==result.referenceId||evidence.referenceVersion!==result.referenceVersion||evidence.policyVersion!==result.policyVersion||evidence.revision!==result.revision||evidence.model!==result.model||actor.role==='student'&&actor.userId!==evidence.learnerId||actor.role==='parent'&&evidence.visibility!=='PARENT_APPROVED')throw new LearningApiError('invalid');
 return evidence;
}
export function currentHomeFeedbackEvidence(source:HomeFeedbackEvidenceRead|null,scope:string|null,loading:boolean,error:unknown):{teacherName:string;contextLabel:string|null}|null{
 if(!scope||loading||error||source?.scope!==scope||source.value.context.status!=='READY'||source.value.context.identityRequiresReview)return null;
 const human=(value:string|null)=>typeof value==='string'&&!!value.trim()&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
 const context=source.value.context;if(!human(context.recordedByName))return null;
 return{teacherName:context.recordedByName!.trim(),contextLabel:[context.courseTitle,context.className].filter(human).join(' · ')||null};
}
