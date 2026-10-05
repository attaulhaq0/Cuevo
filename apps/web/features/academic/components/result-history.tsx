'use client';
import { WorkspaceState } from '@cuevo/ui';
import {useCallback,useState}from'react';
import {Button}from'@cuevo/ui';
import {useApp}from'../../../shared/session/providers';
import {usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';
import {LearningError}from'../../../shared/components/feedback';
import {LoadMore}from'../../../shared/components/load-more';
import {parseAcademicHistoryResult,type AcademicHistoryAnchor}from'../model';
import {academicEn,academicAr}from'../messages';
import {NativeResultView}from'./native-result';
export function ResultHistory({resultId,anchor}:{resultId:string;anchor:AcademicHistoryAnchor}){
 const{locale,membership,apiUrl,accessToken,accessGeneration,online}=useApp();const t=locale==='ar'?academicAr:academicEn;const[open,setOpen]=useState(false);
 const scope=`${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken}:${online}:${accessGeneration}:${resultId}:${anchor.submissionId}:${anchor.assessmentId}:${anchor.learnerId}`;
 const parse=useCallback((value:unknown)=>({ ...parseAcademicHistoryResult(value,anchor,membership?.role??''),scope}),[scope,anchor.submissionId,anchor.assessmentId,anchor.learnerId,membership?.role]);
 const history=usePaginatedLearningQuery(open?`/v1/results/${resultId}/history?limit=25`:null,parse,0);
 const rows=history.data.filter(row=>row.scope===scope);
 return <section><Button type="button" variant="quiet" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t.resultHistory}</Button>{open?<section aria-label={t.resultHistory}>{history.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:history.error?<LearningError error={history.error}/>:rows.map(result=><article key={result.id}><h4>{t.revision} {result.revision}</h4><NativeResultView result={result.nativeResult}/><p>{result.feedback}</p>{membership&&['admin','teacher','coordinator'].includes(membership.role)&&result.correctionReason?<p><strong>{t.correctionReason}</strong>: {result.correctionReason}</p>:null}<p>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.createdAt))}</p></article>)}<LoadMore query={history}/></section>:null}</section>;
}
