'use client';
import { WorkspaceState } from '@cuevo/ui';
import {useCallback,useState}from'react';
import {Button}from'@cuevo/ui';
import {useApp}from'../../../shared/session/providers';
import {usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';
import {LearningError}from'../../../shared/components/feedback';
import {LoadMore}from'../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import {parseAcademicHistoryResult,type AcademicHistoryAnchor}from'../model';
import {academicEn,academicAr}from'../messages';
import {NativeResultView}from'./native-result';
export function ResultHistory({resultId,anchor}:{resultId:string;anchor:AcademicHistoryAnchor}){
 const{locale,membership,apiUrl,accessToken,accessGeneration,online}=useApp();const t=locale==='ar'?academicAr:academicEn;const[open,setOpen]=useState(false);
 const scope=`${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${resultId}:${anchor.submissionId}:${anchor.assessmentId}:${anchor.learnerId}`;
 const parse=useCallback((value:unknown)=>({ ...parseAcademicHistoryResult(value,anchor,membership?.role??''),scope}),[scope,anchor.submissionId,anchor.assessmentId,anchor.learnerId,membership?.role]);
 const history=usePaginatedLearningQuery(open?`/v1/results/${resultId}/history?limit=25`:null,parse,0);
 const historyContext=JSON.stringify([history.context,scope]);
 const failure=[history.error,history.moreError].find(error=>error&&['denied','unauthorized','invalid'].includes(error.kind))??null;
 const[refusal,setRefusal]=useState<{context:string;error:LearningApiError}|null>(null);
 const currentRefusal=open?failure?{context:historyContext,error:failure}:refusal?.context===historyContext?refusal:null:null;
 if(currentRefusal?.context!==refusal?.context||currentRefusal?.error!==refusal?.error)setRefusal(currentRefusal);
 const rows=currentRefusal?[]:history.data.filter(row=>row.scope===scope);
 return <section><Button type="button" variant="quiet" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t.resultHistory}</Button>{open?<section aria-label={t.resultHistory}>{currentRefusal?<LearningError error={currentRefusal.error}/>:history.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:history.error?<LearningError error={history.error}/>:!rows.length?<WorkspaceState kind={!history.loaded||history.loadingMore||history.nextCursor||history.moreError?"unknown":"review"} icon="assessment" title={t.resultHistory} description={!history.loaded||history.loadingMore||history.nextCursor||history.moreError?t.historyIncomplete:t.historyUnavailable} role="status"/>:rows.map(result=><article key={result.id}><h4>{t.revision} {result.revision}</h4><NativeResultView result={result.nativeResult}/><p>{result.feedback}</p>{membership&&['admin','teacher','coordinator'].includes(membership.role)&&result.correctionReason?<p><strong>{t.correctionReason}</strong>: {result.correctionReason}</p>:null}<p>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.createdAt))}</p></article>)}{!currentRefusal?<LoadMore query={history}/>:null}</section>:null}</section>;
}
