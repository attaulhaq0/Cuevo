'use client';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { submissionWorkSourceSchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { parsePortfolioSourceWork, type PortfolioItem } from '../model';
import { portfolioAr, portfolioEn } from '../messages';
const parseSubmission=(value:unknown)=>{const parsed=submissionWorkSourceSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export function PortfolioDocumentSelection({item,onSaved,onCancel}:{item:PortfolioItem;onSaved:()=>void;onCancel:()=>void}) {
 const {locale,membership,formDrafts}=useApp(); const t=locale==='ar'?portfolioAr:portfolioEn; const path=`/v1/portfolio/items/${item.id}/reflection`; const slot=`${membership?.schoolId}:${membership?.userId}:portfolio-documents:${item.id}:${item.revisionId}`;
 const [refresh,setRefresh]=useState(0); const [selected,setSelected]=useState<string[]|null>(()=>formDrafts.model<string[]>(slot)??null);const[locked,setLocked]=useState(false);
 const all=useApiQuery(`/v1/submissions/${item.submissionId}/source-work`,parseSubmission,refresh);const current=useApiQuery(`/v1/portfolio/items/${item.id}/revisions/${item.revisionId}/source-work`,parsePortfolioSourceWork,refresh);
 const matches=all.data&&current.data&&all.data.submissionId===item.submissionId&&all.data.learnerId===item.learnerId&&current.data.itemId===item.id&&current.data.revisionId===item.revisionId&&current.data.source.submissionId===item.submissionId;
 const chosen=selected??current.data?.source.artifacts?.map(asset=>asset.id)??[];

 return <section aria-label={t.chooseDocuments}>{all.loading||current.loading?<p role="status">{t.loadingWork}</p>:all.error||current.error?<><LearningError error={all.error??current.error!}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.retryWork}</Button></>:!matches?<LearningError error={new LearningApiError('invalid')}/>:<><h3>{t.chooseDocuments}</h3><p className="learning-form__note">{t.selectedDocumentsNote}</p><fieldset disabled={locked}>{all.data!.artifacts.map(asset=><div className="checkbox-field" key={asset.id}><input id={`portfolio-select-${item.revisionId}-${asset.id}`} type="checkbox" checked={chosen.includes(asset.id)} disabled={asset.state!=='AVAILABLE'} onChange={event=>{const next=event.target.checked?[...chosen,asset.id]:chosen.filter(id=>id!==asset.id);setSelected(next);formDrafts.saveModel(slot,next);}}/><label htmlFor={`portfolio-select-${item.revisionId}-${asset.id}`}><bdi>{asset.name}</bdi>{asset.state==='RETIRED'?` · ${t.retiredFile}`:''}</label></div>)}</fieldset><CommandForm title={t.edit} path={path} fields={[{name:'title',label:t.title,required:true,defaultValue:item.title},{name:'reflection',label:t.reflection,type:'textarea',required:true,defaultValue:item.reflection,maxLength:10000}]} body={values=>({title:String(values.get('title')),reflection:String(values.get('reflection')),expectedRevision:item.revision,assetIds:chosen})} onLockedChange={setLocked} onSaved={()=>{formDrafts.remove(slot);onSaved();}} onCancel={onCancel} note={t.editNote}/></>}</section>;
}


