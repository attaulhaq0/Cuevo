'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@cuevo/ui';
import { submissionWorkSourceSchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { currentPortfolioRead, parsePortfolioCommandReceipt, parsePortfolioSourceWork, portfolioDocumentSelectionValid, portfolioDocumentSourcesMatch, portfolioReadScope, type PortfolioItem, type PortfolioRead } from '../model';
import { portfolioAr, portfolioEn } from '../messages';
const parseSubmission=(value:unknown)=>{const parsed=submissionWorkSourceSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export function PortfolioDocumentSelection({item,onSaved,onCancel}:{item:PortfolioItem;onSaved:()=>void;onCancel:()=>void}) {
 const app=useApp();const {locale,membership,formDrafts}=app; const t=locale==='ar'?portfolioAr:portfolioEn; const path=`/v1/portfolio/items/${item.id}/reflection`; const slot=`${membership?.schoolId}:${membership?.userId}:portfolio-documents:${item.id}:${item.revisionId}`;
 const [refresh,setRefresh]=useState(0);const sourcePath=`/v1/submissions/${item.submissionId}/source-work`;const currentPath=`/v1/portfolio/items/${item.id}/revisions/${item.revisionId}/source-work`;const scope=portfolioReadScope(app,currentPath,refresh);const allScope=portfolioReadScope(app,sourcePath,refresh);
 const [selection,setSelection]=useState<PortfolioRead<string[]>|null>(()=>{const selected=formDrafts.model<string[]>(slot);return selected?{scope,value:selected}:null;});const[lock,setLock]=useState<PortfolioRead<boolean>|null>(null);
 const parseAll=useCallback((value:unknown)=>({scope:allScope,value:parseSubmission(value)}),[allScope]);const parseCurrent=useCallback((value:unknown)=>({scope,value:parsePortfolioSourceWork(value)}),[scope]);
 const all=useApiQuery(allScope?sourcePath:null,parseAll,refresh);const current=useApiQuery(scope?currentPath:null,parseCurrent,refresh);
 const allWork=currentPortfolioRead(all.data,allScope);const work=currentPortfolioRead(current.data,scope);const selected=currentPortfolioRead(selection,scope);const locked=currentPortfolioRead(lock,scope)??false;const chosen=selected??formDrafts.model<string[]>(slot)??work?.source.artifacts?.map(asset=>asset.id)??[];
 const matches=portfolioDocumentSourcesMatch(allWork,work,item);
 const loading=all.loading||current.loading||!!scope&&(!!all.data&&!allWork||!!current.data&&!work);
 const onLockedChange=useCallback((value:boolean)=>setLock({scope,value}),[scope]);
 useEffect(()=>{if((all.error||current.error)&&selection?.scope===scope){formDrafts.remove(slot);setSelection(null);}},[all.error,current.error,formDrafts,slot,selection,scope]);
 const detail=useRef<HTMLElement|null>(null);const focused=useRef(false);
 useEffect(()=>{if(!loading&&!focused.current&&(allWork&&work||all.error||current.error)){if(document.activeElement===document.body||document.activeElement?.getAttribute('data-portfolio-focus')===item.id)detail.current?.focus({preventScroll:true});focused.current=true;}},[loading,allWork,work,all.error,current.error,item.id]);

 return <section ref={detail} tabIndex={-1} className="portfolio-document-selection" aria-label={t.chooseDocuments}>{loading?<p role="status">{t.loadingWork}</p>:all.error||current.error?<><LearningError error={all.error??current.error!}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.retryWork}</Button></>:!matches?<LearningError error={new LearningApiError('invalid')}/>:<><h3>{t.chooseDocuments}</h3><p className="learning-form__note">{t.selectedDocumentsNote}</p><fieldset disabled={locked}>{allWork!.artifacts.map(asset=><div className="checkbox-field" key={asset.id}><input id={`portfolio-select-${item.revisionId}-${asset.id}`} type="checkbox" checked={chosen.includes(asset.id)} disabled={asset.state!=='AVAILABLE'&&!chosen.includes(asset.id)} onChange={event=>{const next=event.target.checked?[...chosen,asset.id]:chosen.filter(id=>id!==asset.id);setSelection({scope,value:next});formDrafts.saveModel(slot,next);}}/><label htmlFor={`portfolio-select-${item.revisionId}-${asset.id}`}><bdi>{asset.name}</bdi>{asset.state==='RETIRED'?` · ${t.retiredFile}`:''}</label></div>)}</fieldset><CommandForm key={`${scope}:${item.revisionId}`} title={t.edit} path={path} fields={[{name:'title',label:t.title,required:true,defaultValue:item.title},{name:'reflection',label:t.reflection,type:'textarea',required:true,defaultValue:item.reflection,maxLength:10000}]} body={values=>{if(!portfolioDocumentSelectionValid(allWork,work,item,chosen))throw new LearningApiError('invalid');return {title:String(values.get('title')),reflection:String(values.get('reflection')),expectedRevision:item.revision,assetIds:chosen};}} onLockedChange={onLockedChange} validateReceipt={(receipt,command)=>{parsePortfolioCommandReceipt(receipt,'reflection',{...item,revision:Number(command.body.expectedRevision)});}} onSaved={()=>{formDrafts.remove(slot);onSaved();}} onCancel={()=>{formDrafts.remove(slot);onCancel();}} note={t.editNote}/></>}</section>;
}
