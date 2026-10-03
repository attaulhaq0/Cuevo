'use client';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { curriculumBehaviorAcceptanceSchema } from '@cuevo/contracts';
import { Button, CuevoIcon } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { curriculumReadScope, currentCurriculumRead } from '../workspace-model';
import { useCurriculumSourceDenial } from '../source-recovery';
import { behaviorPreviewInput, curriculumVersionIdentity, parseAcceptedBehaviorStatus, parseSelectedBehavior, parseSelectedLifecycle, validateBehaviorReceipt } from '../source-review-model';
import { curriculumAr, curriculumEn } from '../messages';
import type { Version } from '../model';

type Review={scope:string;identity:string;revision:number;basis:string;directory:string;value:ReturnType<typeof parseSelectedBehavior>};
export function BehaviorAcceptance({version,disabled=false,onLockedChange}:{version:Version;disabled?:boolean;onLockedChange?:(locked:boolean)=>void}){
 const app=useApp();if(!curriculumReadScope(app,'/v1/curriculum',0)||!version.synthetic||!['admin','coordinator'].includes(app.membership?.role??''))return null;
 return <CurrentBehavior key={`${app.membership?.schoolId}:${app.membership?.userId}:${curriculumVersionIdentity(version)}`} version={version} disabled={disabled} onLockedChange={onLockedChange}/>;
}
function CurrentBehavior({version,disabled,onLockedChange}:{version:Version;disabled:boolean;onLockedChange?:(locked:boolean)=>void}){
 const app=useApp();const{locale,formDrafts,commandJournal,membership}=app;const t=locale==='ar'?curriculumAr:curriculumEn;const{request}=useApi();const id=useId();
 const path=`/v1/curriculum/versions/${version.id}/behavior-acceptance`,slot=`${membership?.schoolId}:${membership?.userId}:${path}:review-intent`,identity=curriculumVersionIdentity(version);
 const[open,setOpen]=useState(()=>!!formDrafts.model(slot)||!!commandJournal.get(path));const[basis,setBasis]=useState(()=>{const saved=formDrafts.model<{basis:string;directory:string}>(slot);return saved?.basis==='LOCKED_ARTIFACT'?'LOCKED_ARTIFACT':'SCHOOL_AUTHORED';});
 const[directory,setDirectory]=useState(()=>formDrafts.model<{basis:string;directory:string}>(slot)?.directory??'');const[preview,setPreview]=useState<Review|null>(null);const[error,setError]=useState<LearningApiError|null>(null);const[pending,setPending]=useState(false);const[refresh,setRefresh]=useState(0);const[formLocked,setFormLocked]=useState(false);
 const onLock=useCallback((value:boolean)=>{setFormLocked(value);onLockedChange?.(value);},[onLockedChange]);useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);const retained=commandJournal.get(path);const locked=formLocked||!!retained;
 const lifecyclePath=open?`/v1/curriculum/versions/${version.id}/lifecycle?limit=1`:null,scope=curriculumReadScope(app,lifecyclePath??'',refresh);
 const parse=useCallback((value:unknown)=>({scope,value:parseSelectedLifecycle(value,version.id)}),[scope,version.id]);const query=useApiQuery(scope?lifecyclePath:null,parse,refresh);const lifecycle=currentCurriculumRead(query.data,scope);
 const statusPath=open?path:null,statusScope=curriculumReadScope(app,statusPath??'',refresh);const parseStatus=useCallback((value:unknown)=>({scope:statusScope,value:parseAcceptedBehaviorStatus(value,version)}),[statusScope,version]);const statusQuery=useApiQuery(statusScope?statusPath:null,parseStatus,refresh);const status=currentCurriculumRead(statusQuery.data,statusScope);
 const reviewed=preview?.scope===scope&&preview.identity===identity&&preview.basis===basis&&preview.directory===directory&&preview.revision===lifecycle?.revision?preview:null;
 const controller=useRef<AbortController|null>(null),current=useRef('');current.current=JSON.stringify([scope,identity,basis,directory,lifecycle?.revision]);const requestScope=current.current;
 useEffect(()=>{controller.current?.abort();setPending(false);return()=>controller.current?.abort();},[requestScope]);
 useEffect(()=>{if(query.error){setPreview(null);formDrafts.remove(slot);}},[query.error,formDrafts,slot]);
 const previewAllowed=!!lifecycle&&!!status&&status.lifecycleRevision===lifecycle.revision;
 const allowed=previewAllowed&&['APPROVED','ACTIVE','SUPERSEDED'].includes(lifecycle!.state);const original=retained?curriculumBehaviorAcceptanceSchema.safeParse(retained.body):null;
 const denied=useCurriculumSourceDenial([{path:`/v1/curriculum/versions/${version.id}/lifecycle`,scope,loading:query.loading,ready:!!lifecycle,error:query.error},{path,scope:statusScope,loading:statusQuery.loading,ready:!!status,error:statusQuery.error}]);
 const fresh=!!reviewed&&allowed&&!(status?.basis==='LOCKED_ARTIFACT'&&basis!=='LOCKED_ARTIFACT');const canConfirm=!denied&&(fresh||!!(original?.success));
 const remember=(nextBasis:string,nextDirectory:string)=>{if(locked)return;setBasis(nextBasis);setDirectory(nextDirectory);setPreview(null);setError(null);formDrafts.saveModel(slot,{basis:nextBasis,directory:nextDirectory});};
 async function review(){
  if(!previewAllowed||!scope||pending||locked||disabled||status?.basis==='LOCKED_ARTIFACT'&&basis!=='LOCKED_ARTIFACT')return;let input;try{input=behaviorPreviewInput(basis,directory);}catch{setError(new LearningApiError('invalid'));return;}
  controller.current?.abort();const abort=new AbortController();controller.current=abort;const started=requestScope,revision=lifecycle!.revision;
  setPending(true);setError(null);setPreview(null);
  try{const result=await request(`/v1/curriculum/versions/${version.id}/behavior-preview`,{signal:abort.signal,command:{path:`/v1/curriculum/versions/${version.id}/behavior-preview`,key:crypto.randomUUID(),body:input}});if(abort.signal.aborted||current.current!==started)return;const value=parseSelectedBehavior(result,version,basis,directory);setPreview({scope:scope!,identity,revision,basis,directory,value});}
  catch(failure){if(!abort.signal.aborted&&current.current===started)setError(failure instanceof LearningApiError?failure:new LearningApiError('invalid'));}
  finally{if(!abort.signal.aborted&&current.current===started)setPending(false);}
 }
 return <section className="curriculum-source-review"><Button type="button" variant="quiet" disabled={disabled||locked} aria-expanded={open} aria-controls={`${id}-content`} onClick={()=>{if(!locked)setOpen(value=>!value);}}><CuevoIcon name="assessment"/>{t.reviewNativeBehavior}</Button>
 {open?<section id={`${id}-content`} className="curriculum-source-review__content" aria-label={t.reviewNativeBehavior}>
 {query.loading||statusQuery.loading?<p role="status">{t.loading}</p>:query.error||statusQuery.error?<><LearningError error={(query.error??statusQuery.error)!}/><Button type="button" variant="secondary" onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button></>:lifecycle?<>
 <p className="curriculum-source-review__limit">{t.behaviorNote}</p>
 {!allowed?<p className="notice" role="status">{t.planningSourceChanged}</p>:null}
 {status?.accepted?<p>{t.behaviorBasis}: {status.basis==='LOCKED_ARTIFACT'?t.lockedArtifactBasis:t.schoolAuthoredBasis} · {status.reason}</p>:null}
 <div className="curriculum-source-review__selectors"><div className="field"><label htmlFor={`${id}-basis`}>{t.behaviorBasis}</label><select id={`${id}-basis`} value={basis} disabled={locked||disabled} onChange={event=>remember(event.target.value,directory)}><option value="SCHOOL_AUTHORED" disabled={status?.basis==='LOCKED_ARTIFACT'}>{t.schoolAuthoredBasis}</option><option value="LOCKED_ARTIFACT">{t.lockedArtifactBasis}</option></select></div>
 {basis==='LOCKED_ARTIFACT'?<div className="field"><label htmlFor={`${id}-artifact`}>{t.artifactDirectory}</label><input id={`${id}-artifact`} value={directory} maxLength={200} disabled={locked||disabled} onChange={event=>remember(basis,event.target.value)}/></div>:null}</div>
 <Button type="button" disabled={pending||locked||disabled||!previewAllowed||basis==='LOCKED_ARTIFACT'&&!directory||status?.basis==='LOCKED_ARTIFACT'&&basis!=='LOCKED_ARTIFACT'} onClick={()=>void review()}>{pending?t.loading:t.previewBehavior}</Button>
 {error?<LearningError error={error}/>:null}
 {reviewed?<div className="curriculum-source-review__native"><h3>{version.framework} · {version.programme} · {reviewed.value.version}</h3><p>{reviewed.value.models.map(model=>model==='rubric'?t.nativeRubric:t.nativeNumeric).join(' · ')}</p><p>{t.acceptedMaximum}: {reviewed.value.numericMaxScore===null?t.unknown:new Intl.NumberFormat(locale).format(reviewed.value.numericMaxScore)}</p>
 {reviewed.value.rubric?<section><h4>{reviewed.value.rubric.title}</h4>{reviewed.value.rubric.criteria.map(criterion=><section key={criterion.key}><h5>{criterion.title}</h5>{criterion.levels.map(level=><p key={level.key}><strong>{level.label}</strong> · {level.description}</p>)}</section>)}</section>:<p>{t.nativeRubric}: {t.unknown}</p>}
 <details><summary>{t.sourceLocation}</summary><p>{reviewed.value.directory??t.schoolAuthoredBasis}</p><bdi>{reviewed.value.digest??t.unknown}</bdi></details></div>:null}
 </>:null}
 {canConfirm?<CommandForm key={`${reviewed?.revision??(original?.success?original.data.expectedLifecycleRevision:0)}:${reviewed?.basis??basis}:${reviewed?.directory??directory}`} title={t.acceptBehavior} path={path} draftKey={`${path}:${reviewed?.revision??(original?.success?original.data.expectedLifecycleRevision:0)}:${reviewed?.basis??basis}:${reviewed?.directory??directory}`} fields={retained?[]:[{name:'reason',label:t.behaviorReason,type:'textarea',required:true,maxLength:2000},{name:'confirmAcceptance',label:t.confirmBehavior,type:'checkbox',required:true}]} body={values=>{if(!fresh||!reviewed)throw new LearningApiError('conflict');return{reviewBasis:reviewed.basis,artifactDirectory:reviewed.basis==='LOCKED_ARTIFACT'?reviewed.directory:null,expectedLifecycleRevision:reviewed.revision,reason:String(values.get('reason')),confirmAcceptance:values.get('confirmAcceptance')==='on'};}} validateReceipt={validateBehaviorReceipt} onLockedChange={onLock} onSaved={()=>{setPreview(null);formDrafts.remove(slot);setRefresh(value=>value+1);}} onCancel={()=>{setPreview(null);formDrafts.remove(slot);}} note={t.behaviorNote}/>:null}
 <Button type="button" variant="quiet" disabled={locked} onClick={()=>setRefresh(value=>value+1)}>{t.refresh}</Button>
 </section>:null}</section>;
}
