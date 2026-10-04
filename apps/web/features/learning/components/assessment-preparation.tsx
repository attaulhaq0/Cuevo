'use client';
import {Button}from'@cuevo/ui';
import {useApp}from'../../../shared/session/providers';
import {useState}from'react';

import {useLearningApi}from'../api';
import {staffRubricChoices,type Assessment}from'../model';
import {parseReference,parseRubric,academicReferenceChoice}from'../../academic/model';
import {usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';
import {CommandForm}from'../../../shared/components/command-form';
import {LearningError}from'../../../shared/components/feedback';
import {LearningApiError}from'../../../shared/api/client';
import {LoadMore}from'../../../shared/components/load-more';
import { ThinkingFocusEditor, AssessmentCriterionThinkingFocus } from './thinking-focus';
export function AssessmentPreparation({assessment,onChanged}:{assessment:Assessment;onChanged:()=>void}){
 const{commandJournal,locale}=useApp();
 const contextLabel=[assessment.courseTitle,assessment.title].filter(Boolean).join(' · ');
 const {t}=useLearningApi();const[editing,setEditing]=useState(true);const[refresh,setRefresh]=useState(0);
 const references=usePaginatedLearningQuery(`/v1/courses/${assessment.courseId}/academic-references?limit=100`,parseReference,refresh);
 const rubrics=usePaginatedLearningQuery(assessment.intendedModel==='rubric'?'/v1/rubrics?limit=100':null,parseRubric,refresh);
 const approved=references.data.filter(reference=>reference.status==='APPROVED');const available=rubrics.data.filter(rubric=>rubric.courseId===assessment.courseId);
 const choicesComplete=references.loaded&&!references.loading&&!references.error&&!references.moreError&&!references.nextCursor&&(assessment.intendedModel!=='rubric'||rubrics.loaded&&!rubrics.loading&&!rubrics.error&&!rubrics.moreError&&!rubrics.nextCursor);
 const rubricChoices=staffRubricChoices(available,choicesComplete,t.rubricChoicesReview);
 const retained=!!commandJournal.get(`/v1/assessments/${assessment.id}/preparation`);
 function local(value:string|null){if(!value)return'';const date=new Date(value);const pad=(part:number)=>String(part).padStart(2,'0');return`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;}
 const error=references.error??references.moreError??rubrics.error??rubrics.moreError;
 return <section className="learning-form"><p className="learning-form__note">{contextLabel}</p><p className="notice">{t.preparationNote}</p><p>{t.taskType}: {assessment.intendedSubmissionKind==='QUIZ'?t.quizQuestions:t.textTask} · {t.assessmentModel}: {assessment.intendedModel==='rubric'?t.rubricModel:t.numericModel}</p>
 <Button type="button" variant="quiet" onClick={()=>{setRefresh(value=>value+1);onChanged();}}>{t.refreshChoices}</Button>
 {error?<LearningError error={error}/>:!retained&&(references.loading||rubrics.loading||!choicesComplete)?<p role="status">{t.loading}</p>:editing?<CommandForm key={`${assessment.id}:${assessment.preparationVersion}:${assessment.policyVersion}`} title={t.editPreparation} asRegion={false} regionLabel={`${t.editPreparation}: ${contextLabel}`} path={`/v1/assessments/${assessment.id}/preparation`} fields={[{name:'title',label:t.title,required:true,defaultValue:assessment.title,maxLength:200},{name:'instructions',label:t.instructions,type:'textarea',required:true,defaultValue:assessment.instructions,maxLength:10000},{name:'dueAt',label:t.dueAt,type:'datetime-local',defaultValue:local(assessment.dueAt)},...(assessment.intendedModel!=='rubric'?[{name:'maxScore',label:t.maxScore,type:'number'as const,min:0.01,max:100000,step:'any'as const,required:true,defaultValue:assessment.model==='numeric'?assessment.maxScore:10}]:[]),{name:'referenceId',label:t.preparationObjective,type:'select',required:true,defaultValue:assessment.referenceId??'',options:approved.map(reference=>({value:reference.id,label:academicReferenceChoice(reference,locale)}))},...(assessment.intendedModel==='rubric'?[{name:'rubricId',label:t.rubricModel,type:'select'as const,required:true,defaultValue:assessment.rubricId??'',options:rubricChoices.filter(choice=>!choice.requiresReview).map(({value,label})=>({value,label}))}]:[])]} body={values=>{if(!choicesComplete||assessment.intendedModel==='rubric'&&!rubricChoices.some(choice=>choice.value===String(values.get('rubricId'))&&!choice.requiresReview))throw new LearningApiError('conflict');return({title:String(values.get('title')),instructions:String(values.get('instructions')),dueAt:values.get('dueAt')?new Date(String(values.get('dueAt'))).toISOString():null,maxScore:assessment.intendedModel==='rubric'?10:Number(values.get('maxScore')),referenceId:String(values.get('referenceId'))||null,rubricId:assessment.intendedModel==='rubric'?String(values.get('rubricId'))||null:null,expectedPreparationVersion:assessment.preparationVersion});}} onSaved={()=>{setEditing(false);onChanged();}} actionLabel={t.savePreparation}/>:<Button type="button" variant="secondary" onClick={()=>setEditing(true)}>{t.editPreparation}</Button>}
 {rubricChoices.some(choice=>choice.requiresReview)?<p className="notice">{t.rubricChoicesReview}</p>:null}{!references.loading&&!approved.length?<p className="notice">{t.objectiveNeeded}</p>:null}{assessment.intendedModel==='rubric'&&!rubrics.loading&&!available.length?<p className="notice">{t.rubricNeeded}</p>:null}<LoadMore query={references}/>{assessment.intendedModel==='rubric'?<LoadMore query={rubrics}/>:null}
 {assessment.referenceId&&assessment.model===assessment.intendedModel&&(assessment.intendedSubmissionKind!=='QUIZ'||assessment.submissionKind==='QUIZ')?<CommandForm title={t.publishAssessment} asRegion={false} regionLabel={`${t.publishAssessment}: ${contextLabel}`} path={`/v1/assessments/${assessment.id}/publish`} fields={[]} body={()=>({expectedPreparationVersion:assessment.preparationVersion,expectedPolicyVersion:assessment.policyVersion,expectedAvailabilityVersion:assessment.availabilityVersion})} onSaved={onChanged} actionLabel={t.publishAssessment} note={t.publishAssessmentNote}/>:assessment.intendedSubmissionKind==='QUIZ'?<p className="notice">{t.quizPreparationNeeded}</p>:null}
 <ThinkingFocusEditor kind="assessment" id={assessment.id} courseId={assessment.courseId} onChanged={onChanged}/><AssessmentCriterionThinkingFocus assessment={assessment} onChanged={onChanged}/></section>;
}

