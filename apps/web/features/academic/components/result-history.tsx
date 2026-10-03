'use client';
import {useState}from'react';
import {Button}from'@cuevo/ui';
import {useApp}from'../../../shared/session/providers';
import {usePaginatedLearningQuery}from'../../../shared/hooks/use-paginated-query';
import {LearningError}from'../../../shared/components/feedback';
import {LoadMore}from'../../../shared/components/load-more';
import {parseReleasedResult}from'../model';
import {academicEn,academicAr}from'../messages';
import {NativeResultView}from'./native-result';
export function ResultHistory({resultId}:{resultId:string}){
 const{locale}=useApp();const t=locale==='ar'?academicAr:academicEn;const[open,setOpen]=useState(false);
 const history=usePaginatedLearningQuery(open?`/v1/results/${resultId}/history?limit=25`:null,parseReleasedResult,0);
 return <section><Button type="button" variant="quiet" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{t.resultHistory}</Button>{open?<section aria-label={t.resultHistory}>{history.loading?<p role="status">{t.loading}</p>:history.error?<LearningError error={history.error}/>:history.data.map(result=><article key={result.id}><h4>{t.revision} {result.revision}</h4><NativeResultView result={result.nativeResult}/><p>{result.feedback}</p>{result.correctionReason?<p><strong>{t.correctionReason}</strong>: {result.correctionReason}</p>:null}<p>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.createdAt))}</p></article>)}<LoadMore query={history}/></section>:null}</section>;
}
