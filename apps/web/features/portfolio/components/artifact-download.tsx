'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, WorkspaceState} from '@cuevo/ui';
import type { SubmissionArtifact } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { currentPortfolioRead, portfolioReadScope, type PortfolioRead } from '../model';
export function PortfolioArtifactDownload({itemId,revisionId,asset,onReviewed}:{itemId:string;revisionId:string;asset:SubmissionArtifact;onReviewed?:()=>void}){
 const app=useApp();const{membership,locale,apiUrl,accessToken,online}=app;const[failure,setFailure]=useState<PortfolioRead<LearningApiError>|null>(null);const path=`/v1/portfolio/items/${itemId}/revisions/${revisionId}/artifacts/${asset.id}/download`;
 const readScope=portfolioReadScope(app,path,0);const scope=readScope?JSON.stringify([readScope,asset.sha256,asset.byteSize,asset.contentType,asset.name,asset.state]):null;
 const error=currentPortfolioRead(failure,scope);const current=useRef(scope);current.current=scope;const controller=useRef<AbortController|null>(null);const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);useEffect(()=>()=>controller.current?.abort(),[scope]);
 async function download(){
  if(!membership||!accessToken||!online||!scope||asset.state!=='AVAILABLE')return;const expected=scope;const active=new AbortController();controller.current?.abort();controller.current=active;setFailure(null);
  try{const response=await fetch(apiUrl+path,{headers:{Authorization:`Bearer ${accessToken}`,'X-School-Id':membership.schoolId},cache:'no-store',credentials:'omit',signal:AbortSignal.any([active.signal,AbortSignal.timeout(15000)])});if(!response.ok)throw new LearningApiError(response.status===403?'denied':'unavailable');const bytes=await response.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==asset.byteSize||hash!==asset.sha256)throw new LearningApiError('invalid');if(!mounted.current||active.signal.aborted||current.current!==expected)return;const url=URL.createObjectURL(new Blob([bytes],{type:asset.contentType}));const anchor=document.createElement('a');anchor.href=url;anchor.download=asset.name;anchor.click();onReviewed?.();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(failure){if(mounted.current&&!active.signal.aborted&&current.current===expected)setFailure({scope,value:failure instanceof LearningApiError?failure:new LearningApiError('unavailable')});}
 }
 return scope?<div className="portfolio-artifact-download"><bdi>{asset.name}</bdi>{asset.state==='AVAILABLE'?<Button type="button" variant="quiet" onClick={()=>void download()}>{locale==='ar'?'تنزيل العمل المختار':'Download selected work document'}</Button>:<WorkspaceState kind="unavailable" description={locale==='ar'?'المستند غير متاح':'Document unavailable'}/>}{error?<LearningError error={error}/>:null}</div>:null;
}
