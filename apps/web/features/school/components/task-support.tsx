'use client';
import { WorkspaceState } from '@cuevo/ui';
import{useApp}from'../../../shared/session/providers';import{usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';import{LearningError}from'../../../shared/components/feedback';import{LoadMore}from'../../../shared/components/load-more';import{parseLearningSupport}from'../model';import{schoolAr,schoolEn}from'../messages';
export function TaskLearningSupport({courseId,assessmentId}:{courseId:string;assessmentId:string}){
 const{locale,membership}=useApp();const t=locale==='ar'?schoolAr:schoolEn;const support=usePaginatedLearningQuery(`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=${assessmentId}${membership?.role==='student'?`&learnerId=${membership.userId}`:''}`,parseLearningSupport,0);
 if(!support.loading&&!support.error&&!support.data.some(item=>item.state==='ACTIVE'))return null;
 return <section aria-label={t.taskSupport}>{support.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:support.error?<LearningError error={support.error}/>:support.data.filter(item=>item.state==='ACTIVE').map(item=><article key={item.id}><h4>{item.title}</h4><p>{item.instructions}</p><p>{item.effectiveFrom}–{item.effectiveTo}</p></article>)}{support.data.length?<LoadMore query={support}/>:null}</section>;
}
