import { academicReportResultSchema, closedResultCorrectionSchema } from '@cuevo/contracts';
import { LearningApiError, type Command } from '../../shared/api/client.ts';
import { currentReleasedResultId, parseMarkingItem, sameNativeResult, type MarkingItem, type ReleasedResult } from './model.ts';

export type ClosedCorrectionBasis = { submissionId:string;assessmentId:string;learnerId:string;referenceId:string;policyVersion:number;submissionRevision:number;markRevision:number;resultId:string|null;resultRevision:number;model:'numeric'|'rubric';scale:string };
export function parseClosedCorrectionBasis(value:unknown):ClosedCorrectionBasis|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as Record<string,unknown>;const keys=['submissionId','assessmentId','learnerId','referenceId','policyVersion','submissionRevision','markRevision','resultId','resultRevision','model','scale'];
  if(Object.keys(row).length!==keys.length||Object.keys(row).some(key=>!keys.includes(key))||['submissionId','assessmentId','learnerId','referenceId','scale'].some(key=>typeof row[key]!=='string'||!row[key])||!['numeric','rubric'].includes(String(row.model))||['policyVersion','submissionRevision'].some(key=>!Number.isSafeInteger(row[key])||Number(row[key])<1)||['markRevision','resultRevision'].some(key=>!Number.isSafeInteger(row[key])||Number(row[key])<0)||!(row.resultId===null||typeof row.resultId==='string'&&row.resultId)||(row.resultId===null)!==(row.resultRevision===0))return null;
  return row as ClosedCorrectionBasis;
}
function priorMatches(source:MarkingItem,prior:ReleasedResult):boolean {
  if(prior.submissionId!==source.id||prior.learnerId!==source.learnerId||prior.assessmentId!==source.assessmentId||prior.model!==source.model||prior.referenceId!==source.referenceId||prior.policyVersion!==source.policyVersion||!source.currentResult||prior.revision>=source.currentResult.revision)return false;
  if(source.model==='numeric')return prior.model==='numeric'&&prior.maxScore===source.maxScore;
  if(prior.model!=='rubric'||prior.nativeResult.rubricId!==source.rubric.id||prior.nativeResult.rubricTitle!==source.rubric.title||prior.nativeResult.rubricVersion!==source.rubric.version||prior.nativeResult.criteria.length!==source.rubric.criteria.length)return false;
  return prior.nativeResult.criteria.every((criterion,index)=>{const allowed=source.rubric.criteria[index],level=allowed.levels.find(option=>option.key===criterion.levelKey);return criterion.criterionKey===allowed.key&&criterion.criterionTitle===allowed.title&&!!level&&criterion.levelLabel===level.label&&criterion.levelDescription===level.description;});
}
export function closedCorrectionBasis(item:MarkingItem,prior?:ReleasedResult|null):ClosedCorrectionBasis|null {
  const source=parseMarkingItem(item);if(source.submissionStatus!=='CLOSED'||!source.referenceId)return null;
  const current=source.currentResult;const resultId=currentReleasedResultId(current);
  if(current?.status==='REVIEW'&&(!prior||!priorMatches(source,prior)))return null;
  if(current?.status==='RELEASED'&&!resultId)return null;
  return {submissionId:source.id,assessmentId:source.assessmentId,learnerId:source.learnerId,referenceId:source.referenceId,policyVersion:source.policyVersion,submissionRevision:source.submissionRevision,markRevision:current?.revision??0,resultId:current?.status==='REVIEW'?prior!.id:resultId,resultRevision:current?.status==='REVIEW'?prior!.revision:current?.status==='RELEASED'?current.revision:0,model:source.model,scale:source.model==='numeric'?JSON.stringify(source.maxScore):JSON.stringify(source.rubric)};
}
export function closedCorrectionBasisCurrent(basis:ClosedCorrectionBasis|null,item:MarkingItem,prior?:ReleasedResult|null):boolean {const current=closedCorrectionBasis(item,prior);return !!basis&&!!current&&JSON.stringify(basis)===JSON.stringify(current);}
/** Current SQL returns a released native result. Its generated result/evidence
 * identities have no previous-result, submission-revision or reason echo. */
export function validateClosedCorrectionReceipt(value:unknown,originalCommand:Command,item:MarkingItem,actorId:string,prior?:ReleasedResult|null) {
  try {
    const input=closedResultCorrectionSchema.parse(originalCommand.body),saved=academicReportResultSchema.parse(value),source=parseMarkingItem(item);
    if(originalCommand.path!==`/v1/submissions/${source.id}/closed-result`||source.submissionStatus!=='CLOSED'||!source.referenceId||input.expectedPolicyVersion!==source.policyVersion||input.expectedSubmissionRevision!==source.submissionRevision||saved.submissionId!==source.id||saved.assessmentId!==source.assessmentId||saved.assessmentTitle!==source.assessmentTitle||saved.learnerId!==source.learnerId||saved.actorId!==actorId||saved.referenceId!==source.referenceId||saved.policyVersion!==input.expectedPolicyVersion||saved.revision!==input.expectedRevision+1||saved.feedback!==input.feedback||saved.parentVisible!==input.parentVisible||saved.model!==source.model)throw new LearningApiError('invalid');
    const current=source.currentResult;const sourceBasis=closedCorrectionBasis(source,prior);const currentResult=sourceBasis?.resultId;
    if(saved.id===input.expectedResultId)throw new LearningApiError('invalid');
    if((current?.revision??0)===input.expectedRevision){
      if(!sourceBasis||currentResult!==input.expectedResultId||sourceBasis.resultRevision!==input.expectedResultRevision)throw new LearningApiError('invalid');
    }else if(current?.revision!==input.expectedRevision+1||currentResult!==saved.id)throw new LearningApiError('invalid');
    if(source.model==='numeric'){
      if(!('score'in input)||saved.model!=='numeric'||input.score>source.maxScore||saved.score!==input.score||saved.maxScore!==source.maxScore)throw new LearningApiError('invalid');
    }else{
      if(!('nativeResult'in input)||saved.model!=='rubric'||input.nativeResult.rubricId!==source.rubric.id||input.nativeResult.criteria.length!==source.rubric.criteria.length)throw new LearningApiError('invalid');
      const expected={type:'rubric'as const,rubricId:source.rubric.id,rubricTitle:source.rubric.title,rubricVersion:source.rubric.version,policyVersion:source.policyVersion,normalized:null,criteria:source.rubric.criteria.map(criterion=>{const choice=input.nativeResult.criteria.find(row=>row.criterionKey===criterion.key),level=criterion.levels.find(row=>row.key===choice?.levelKey);if(!choice||!level)throw new LearningApiError('invalid');return {criterionKey:criterion.key,criterionTitle:criterion.title,levelKey:level.key,levelLabel:level.label,levelDescription:level.description};})};
      if(!sameNativeResult(saved.nativeResult,expected))throw new LearningApiError('invalid');
    }
    return saved;
  }catch{throw new LearningApiError('invalid',true);}
}
