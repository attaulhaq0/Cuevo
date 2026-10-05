'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { curriculumReadScope, currentCurriculumRead } from '../workspace-model';
import { useCurriculumSourceDenial } from '../source-recovery';
import { curriculumVersionLabel } from '../presentation-model';
import { curriculumVersionIdentity, curriculumLifecycleCanManage, parseSelectedLifecycle, validateLifecycleReceipt } from '../source-review-model';
import { curriculumAr, curriculumEn } from '../messages';
import type { Version } from '../model';
import { z } from 'zod';
const intentSchema=z.object({state:z.enum(['APPROVED','ACTIVE','SUPERSEDED','RETIRED']),revision:z.number().int().positive()}).strict();
export function CurriculumLifecycle({version,versions,disabled=false,onLockedChange}:{version:Version;versions:Version[];disabled?:boolean;onLockedChange?:(locked:boolean)=>void}){
 const app=useApp();if(!curriculumReadScope(app,'/v1/curriculum',0))return null;
 return <CurrentLifecycle key={`${app.membership?.schoolId}:${app.membership?.userId}:${curriculumVersionIdentity(version)}`} version={version} versions={versions} disabled={disabled} onLockedChange={onLockedChange}/>;
}
function CurrentLifecycle({version,versions,disabled,onLockedChange}:{version:Version;versions:Version[];disabled:boolean;onLockedChange?:(locked:boolean)=>void}){
 const app=useApp();const{locale,membership,formDrafts,commandJournal}=app;const t=locale==='ar'?curriculumAr:curriculumEn;const id=useId();
 const path=`/v1/curriculum/versions/${version.id}/lifecycle`,slot=`${membership?.schoolId}:${membership?.userId}:${path}:review-intent`;
 const[open,setOpen]=useState(()=>!!formDrafts.model(slot)||!!commandJournal.get(path));const[refresh,setRefresh]=useState(0);const[cursor,setCursor]=useState<string|null>(null);
 const[intent,setIntent]=useState<z.infer<typeof intentSchema>|null>(()=>{const saved=intentSchema.safeParse(formDrafts.model(slot));return saved.success?saved.data:null;});
 const[formLocked,setFormLocked]=useState(false);const onLock=useCallback((value:boolean)=>{setFormLocked(value);onLockedChange?.(value);},[onLockedChange]);
 useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
 const retained=commandJournal.get(path);const canManage=curriculumLifecycleCanManage(membership?.role);const locked=canManage&&(formLocked||!!retained);const sourceReady=version.synthetic&&version.sourceStatus==='VERIFIED'&&version.rightsStatus==='PERMITTED';
 const readPath=open?`${path}?limit=25${cursor?`&cursor=${cursor}`:''}`:null;const scope=curriculumReadScope(app,readPath??'',refresh);
 const parse=useCallback((value:unknown)=>({scope,value:parseSelectedLifecycle(value,version.id)}),[scope,version.id]);const query=useApiQuery(scope?readPath:null,parse,refresh);const page=currentCurriculumRead(query.data,scope);
 useEffect(()=>{if(query.error){formDrafts.remove(slot);setIntent(null);}},[query.error,formDrafts,slot]);
 const next=page?.state==='DRAFT'?['APPROVED']:page?.state==='APPROVED'?['ACTIVE']:page?.state==='ACTIVE'?['SUPERSEDED','RETIRED']:page?.state==='SUPERSEDED'?['RETIRED']:[];
 const restored=retained?intentSchema.safeParse({state:retained.body.state,revision:retained.body.expectedRevision}):null;
 const denied=useCurriculumSourceDenial([{path,scope,loading:query.loading,ready:!!page,error:query.error}]);
 const selected=!canManage||denied?null:restored?.success?restored.data:intent;const stale=!!selected&&!!page&&(selected.revision!==page.revision||!next.includes(selected.state));
 const replacements=versions.filter(candidate=>candidate.id!==version.id&&candidate.packId===version.packId&&candidate.synthetic&&candidate.framework===version.framework&&candidate.programme===version.programme&&candidate.scope===version.scope);
 const change=(value:string)=>{if(locked||!page||!sourceReady)return;const chosen=intentSchema.safeParse({state:value,revision:page.revision});const nextIntent=chosen.success?chosen.data:null;setIntent(nextIntent);if(nextIntent)formDrafts.saveModel(slot,nextIntent);else formDrafts.remove(slot);};
 const clear=()=>{formDrafts.remove(slot);setIntent(null);};
 return <section className="curriculum-source-review"><Button type="button" variant="quiet" disabled={disabled||locked} aria-expanded={open} aria-controls={`${id}-content`} onClick={()=>{if(!locked)setOpen(value=>!value);}}><CuevoIcon name="curriculum"/>{t.sourceLifecycle}</Button>
 {open?<section id={`${id}-content`} className="curriculum-source-review__content" aria-label={t.sourceLifecycle}>
 {query.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:query.error?<><LearningError error={query.error}/><Button type="button" variant="secondary" onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button></>:page?<>
 <header className="curriculum-source-review__heading"><h3>{version.framework} · {version.programme} · {curriculumVersionLabel(version.version,t)}</h3><Status tone={page.state==='ACTIVE'?'positive':'warning'}>{t.lifecycleStates[page.state]}</Status></header>
 <p>{page.reason}</p><p className="curriculum-source-review__limit">{t.lifecycleLimit}</p>
 <dl className="curriculum-source-review__facts">{[[t.boundProgrammes,page.programmeCount],[t.boundCourses,page.courseCount],[t.openAcademicWork,page.openAssessmentCount]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{new Intl.NumberFormat(locale).format(Number(value))}</dd></div>)}</dl>
 {canManage&&sourceReady&&(next.length||selected)?<div className="curriculum-source-review__editor">
 <div className="field"><label htmlFor={`${id}-state`}>{t.lifecycleNext}</label><select id={`${id}-state`} value={selected?.state??''} disabled={locked||disabled&&!selected} onChange={event=>change(event.target.value)}><option value="">{t.lifecycleNext}</option>{[...new Set([...next,...(selected?[selected.state]:[])])].map(value=><option key={value} value={value}>{t.lifecycleStates[value as keyof typeof t.lifecycleStates]}</option>)}</select></div>
 {stale?<WorkspaceState kind="review" icon="help" description={t.planningSourceChanged} role="status"/>:null}
 </div>:null}
 {!sourceReady?<p className="notice">{t.officialLifecycleReview}</p>:null}
 <details className="curriculum-source-review__history"><summary>{t.sourceLifecycle}</summary>{page.history.map(record=><article key={record.id}><h4>{t.lifecycleStates[record.state]}</h4><p>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(record.createdAt))}</p><p>{record.reason}</p></article>)}</details>
 <div className="curriculum-source-review__actions">{page.nextCursor?<Button type="button" variant="quiet" disabled={locked} onClick={()=>setCursor(page.nextCursor)}>{t.nextLifecycle}</Button>:null}{cursor?<Button type="button" variant="quiet" disabled={locked} onClick={()=>setCursor(null)}>{t.firstLifecycle}</Button>:null}<Button type="button" variant="quiet" disabled={locked} onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button></div>
 </>:null}
 {selected?<CommandForm key={`${version.id}:${selected.state}`} title={t.confirmLifecycle} path={path} draftKey={`${path}:${selected.state}`} fields={retained?[]:[...(selected.state==='SUPERSEDED'?[{name:'replacementVersionId',label:t.lifecycleReplacement,type:'select'as const,required:true,options:replacements.map(candidate=>({value:candidate.id,label:`${candidate.framework} · ${candidate.programme} · ${curriculumVersionLabel(candidate.version,t)} · ${candidate.scope}`}))}]:[]),{name:'reason',label:t.lifecycleReason,type:'textarea',required:true,maxLength:2000},{name:'confirmTransition',label:t.lifecycleConfirm,type:'checkbox',required:true}]} body={values=>{if(!canManage||!page||stale||!sourceReady)throw new LearningApiError('conflict');return{state:selected.state,expectedRevision:selected.revision,reviewBasis:'SCHOOL_AUTHORED',artifactDirectory:null,replacementVersionId:selected.state==='SUPERSEDED'?String(values.get('replacementVersionId')):null,reason:String(values.get('reason')),confirmTransition:values.get('confirmTransition')==='on'};}} validateReceipt={validateLifecycleReceipt} onLockedChange={onLock} onSaved={()=>{clear();setRefresh(value=>value+1);setCursor(null);}} onCancel={clear} note={t.schoolAuthoredReview} actionLabel={t.confirmLifecycle}/>:null}
</section>:null}</section>;
}
