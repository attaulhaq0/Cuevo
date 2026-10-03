import { DomainError } from '@cuevo/domain';
import { intelligenceAnalysisSchema,type IntelligenceAnalysis } from '@cuevo/contracts';
import type { InsightContext } from './insight-context';

export function validateIntelligenceAnalysis(input:unknown,baseline:{resultId:string;score:number;maxScore:number}|{resultId:string;nativeResult:unknown},insight?:InsightContext):IntelligenceAnalysis{
 const parsed=intelligenceAnalysisSchema.safeParse(input);const denied=()=>new DomainError('INTELLIGENCE_REQUIRES_REVIEW',409,'Analysis reasoning citations require review.');if(!parsed.success)throw denied();
 const value=parsed.data;const results=insight?.recentResults??[baseline];
 if(!value.resultIds.includes(baseline.resultId)||value.resultIds.some(id=>!results.some(result=>result.resultId===id))||value.observationIds.some(id=>!insight?.observations.some(item=>item.id===id))||value.priorInterventionIds.some(id=>!insight?.priorInterventions.some(item=>item.id===id)))throw denied();
 const kind=value.basis==='RECORDED_PRACTICE'?'practice':'reflection';
 if(value.basis==='SINGLE_RESULT'&&(value.resultIds.length!==1||value.observationIds.length||value.priorInterventionIds.length)
 ||value.basis==='NATIVE_RESULT_DECLINE'&&(!('score'in baseline)||!value.resultIds.some(id=>results.some(result=>'score'in result&&result.resultId===id&&result.maxScore===baseline.maxScore&&result.score>baseline.score))||value.observationIds.length||value.priorInterventionIds.length)
 ||['RECORDED_PRACTICE','RECORDED_REFLECTION'].includes(value.basis)&&(value.observationIds.length===0||value.observationIds.some(id=>!insight?.observations.some(item=>item.id===id&&item.kind===kind))||value.priorInterventionIds.length)
 ||value.basis==='PRIOR_NO_MEANINGFUL_CHANGE'&&(value.priorInterventionIds.length===0||value.priorInterventionIds.some(id=>!insight?.priorInterventions.some(item=>item.id===id&&item.status==='MEASURED'&&item.outcome?.status==='no_meaningful_change'))||value.observationIds.length))throw denied();
 return value;
}
export function analysisCopy(analysis:IntelligenceAnalysis){
 const rationale={SINGLE_RESULT:'This proposal uses one current native result; wider learning coverage is unknown.',NATIVE_RESULT_DECLINE:'The baseline is lower than another cited result on the same native scale. The recorded change does not establish a cause.',RECORDED_PRACTICE:'Cited practice actions are recorded alongside the current result. Practice records do not establish effort, ability or cause.',RECORDED_REFLECTION:'Cited reflection actions are recorded alongside the current result. Reflection records do not establish a learner trait or cause.',PRIOR_NO_MEANINGFUL_CHANGE:'A cited prior measured intervention recorded no meaningful change under its teacher-defined threshold. Review the next action with the teacher.'};
 return {interpretation:'Possible next step: a teacher may review the cited evidence and select a supported learning action.',rationale:rationale[analysis.basis],uncertainty:'The explanation is a proposal for teacher review. Recorded evidence is not causal proof or a learner trait.'};
}
