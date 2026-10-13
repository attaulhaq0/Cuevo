'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, WorkspaceState} from '@cuevo/ui';
import type { SubmissionArtifact } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { deliverVerifiedDownload, fetchVerifiedDownload } from '../../../shared/api/verified-download';
import { currentPortfolioRead, portfolioReadScope, type PortfolioRead } from '../model';
export function PortfolioArtifactDownload({itemId,revisionId,asset,onReviewed}:{itemId:string;revisionId:string;asset:SubmissionArtifact;onReviewed?:()=>void}){
 const app=useApp();const{membership,locale,apiUrl,accessToken,online}=app;const[failure,setFailure]=useState<PortfolioRead<LearningApiError>|null>(null);const path=`/v1/portfolio/items/${itemId}/revisions/${revisionId}/artifacts/${asset.id}/download`;
 const readScope=portfolioReadScope(app,path,0);const scope=readScope?JSON.stringify([readScope,asset.sha256,asset.byteSize,asset.contentType,asset.name,asset.state]):null;
 const error=currentPortfolioRead(failure,scope);const current=useRef(scope);current.current=scope;const controller=useRef<AbortController|null>(null);const mounted=useRef(false);
 const lifecycle=useRef(app.readLifecycle);lifecycle.current=app.readLifecycle;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);useEffect(()=>()=>controller.current?.abort(),[scope,app.readLifecycle]);
 async function download(){
  if(!membership||!accessToken||!online||!scope||asset.state!=='AVAILABLE')return;const expected=scope;const active=new AbortController();controller.current?.abort();controller.current=active;setFailure(null);
  const readLifecycle=app.readLifecycle,frame=readLifecycle?.capture();const isCurrent=()=>mounted.current&&!active.signal.aborted&&controller.current===active&&current.current===expected&&lifecycle.current===readLifecycle&&(!frame||!!readLifecycle?.isCurrent(frame));
  try{const verified=await fetchVerifiedDownload({config:{apiUrl,accessToken,schoolId:membership.schoolId},path,metadata:asset,signal:active.signal,isCurrent,readLifecycle});deliverVerifiedDownload(verified,{onDelivered:onReviewed});}catch(failure){if(isCurrent())setFailure({scope,value:failure instanceof LearningApiError?failure:new LearningApiError('unavailable')});}
 }
 return scope?<div className="portfolio-artifact-download"><bdi>{asset.name}</bdi>{asset.state==='AVAILABLE'?<Button type="button" variant="quiet" onClick={()=>void download()}>{locale==='ar'?'تنزيل العمل المختار':'Download selected work document'}</Button>:<WorkspaceState kind="unavailable" description={locale==='ar'?'المستند غير متاح':'Document unavailable'}/>}{error?<LearningError error={error}/>:null}</div>:null;
}
