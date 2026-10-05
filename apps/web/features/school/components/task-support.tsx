'use client';
import { Button, WorkspaceState } from '@cuevo/ui';
import { useState } from 'react';
import type { LearningApiError } from '../../../shared/api/client';
import{useApp}from'../../../shared/session/providers';import{usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';import{LearningError}from'../../../shared/components/feedback';import{LoadMore}from'../../../shared/components/load-more';import{parseLearningSupport}from'../model';import{schoolAr,schoolEn,approvedContextAr,approvedContextEn}from'../messages';
export function TaskLearningSupport({courseId,assessmentId}:{courseId:string;assessmentId:string}){
 const{locale,membership}=useApp();const t=locale==='ar'?schoolAr:schoolEn;const[refresh,setRefresh]=useState(0);const support=usePaginatedLearningQuery(`/v1/school/learning-support?limit=25&courseId=${courseId}&assessmentId=${assessmentId}${membership?.role==='student'?`&learnerId=${membership.userId}`:''}`,parseLearningSupport,refresh);
 const[refusal,setRefusal]=useState<{context:string;error:LearningApiError}|null>(null);const failure=support.moreError&&['denied','unauthorized','invalid'].includes(support.moreError.kind)?support.moreError:null;const currentRefusal=failure?{context:support.context,error:failure}:refusal?.context===support.context?refusal:null;
 if(currentRefusal?.context!==refusal?.context||currentRefusal?.error!==refusal?.error)setRefusal(currentRefusal);
 const refused=!!currentRefusal;const active=refused?[]:support.data.filter(item=>item.state==='ACTIVE');const complete=!refused&&support.loaded&&!support.loading&&!support.loadingMore&&!support.error&&!support.moreError&&!support.nextCursor;const emptyCopy=locale==='ar'?approvedContextAr:approvedContextEn;
 if(complete&&!active.length)return null;
 return <section aria-label={t.taskSupport}>{support.loading||!support.loaded&&!support.error?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:support.error?<LearningError error={support.error}/>:refused?null:!active.length?<WorkspaceState kind="unknown" icon="help" description={emptyCopy.partial} role="status"/>:active.map(item=><article key={item.id}><h4>{item.title}</h4><p>{item.instructions}</p><p>{item.effectiveFrom}–{item.effectiveTo}</p></article>)}{currentRefusal&&!support.moreError?<LearningError error={currentRefusal.error}/>:null}{currentRefusal?<Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button>:null}<LoadMore query={support}/></section>;
}
