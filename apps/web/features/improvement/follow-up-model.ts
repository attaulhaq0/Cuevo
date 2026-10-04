import type { Assessment } from '../learning/model.ts';
import type { ReleasedResult } from '../academic/model.ts';
import type { Intervention } from './model.ts';

/** Presentation eligibility follows known native sources; the server reauthorizes. */
export function compatibleFollowUpAssessments(task:Intervention,results:ReleasedResult[],assessments:Assessment[]):Assessment[] {
 const baselines=results.filter(result=>result.id===task.baselineResultId&&result.learnerId===task.learnerId&&result.referenceId===task.referenceId);
 if(baselines.length!==1)return [];
 const baseline=baselines[0];const source=assessments.find(assessment=>assessment.id===baseline.assessmentId);
 if(!source)return [];
 return assessments.filter(assessment=>assessment.status==='PUBLISHED'&&assessment.id!==baseline.assessmentId&&assessment.courseId===source.courseId&&assessment.referenceId===baseline.referenceId&&assessment.model===baseline.model&&(assessment.model==='numeric'&&baseline.model==='numeric'?assessment.maxScore===baseline.maxScore:assessment.model==='rubric'&&baseline.model==='rubric'&&assessment.rubricId===baseline.nativeResult.rubricId));
}
export function compatibleFollowUpResults(task:Intervention,results:ReleasedResult[]):ReleasedResult[] {
 return results.filter(result=>result.learnerId===task.learnerId&&result.assessmentId===task.followUpAssessmentId&&result.referenceId===task.referenceId);
}
