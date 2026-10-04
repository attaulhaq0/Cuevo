'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button,Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { currentLearningContent,learningContentActions,parseContentTaskChoice,contentDraftBody,type LearningContentResource } from '../content-model';
import { contentEn,contentAr } from '../content-messages';
import { parseAssessment } from '../model';
import { AssessmentList } from './assessment-view';
import { taskReadingFocusState, type TaskReadingFocusIntent } from '../task-reading-focus';
export function LearningContentEditor({resource,sourceId,courseId,onChanged}:{resource:LearningContentResource;sourceId:string;courseId:string;onChanged:()=>void}){
 const{locale,membership,accessGeneration,online,status,formDrafts,commandJournal}=useApp();useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);const prefix=`${membership?.schoolId}:${membership?.userId}:`;const restored=(['edit','publish','retire']as const).find(kind=>{const suffix=kind==='edit'?'draft':kind;const endpoint=`/v1/learning-content/${resource}/${sourceId}/${suffix}`;return !!commandJournal.get(endpoint)||!!formDrafts.get(prefix+endpoint);});const t=locale==='ar'?contentAr:contentEn;const[refresh,setRefresh]=useState(0);const[locked,setLocked]=useState(false);const[action,setAction]=useState<'edit'|'publish'|'retire'|'history'|null>(restored??null);const path=`/v1/learning-content/${resource}/${sourceId}`;const scope=`${membership?.schoolId}:${membership?.userId}:${accessGeneration}:${online}:${status}:${path}:${refresh}`;const parser=useCallback((value:unknown)=>({scope,source:currentLearningContent(value,resource,sourceId,courseId)}),[scope,resource,sourceId,courseId]);const read=useApiQuery(path,parser,refresh);const source={...read,data:read.data?.scope===scope?read.data.source:null};const historyParser=useCallback((value:unknown)=>currentLearningContent(value,resource,sourceId,courseId),[resource,sourceId,courseId]);const history=usePaginatedLearningQuery(action==='history'?path+'/history?limit=25':null,historyParser,refresh);const tasks=usePaginatedLearningQuery(resource==='activity'&&action==='edit'?`/v1/learning-content/activities/${sourceId}/task-choices?limit=25`:null,parseContentTaskChoice,refresh);
 function saved(){setAction(null);setRefresh(value=>value+1);onChanged();}
 return <section >{source.loading?<p role="status">{t.loading}</p>:source.error?<><LearningError error={source.error}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.retry}</Button></>:source.data?<><p className="learning-form__note">{t.revision} {source.data.revision} · <Status>{source.data.state==='DRAFT'?t.draft:source.data.state==='RETIRED'?t.retired:t.published}</Status></p>{source.data.state==='RETIRED'?<p>{t.unavailable}</p>:null}<div className="learning-actions">{learningContentActions(source.data.state).includes('edit')?<><Button type="button" variant="quiet" disabled={locked} onClick={()=>setAction('edit')}>{t.edit}</Button>{source.data.state==='DRAFT'?<Button type="button" disabled={locked} onClick={()=>setAction('publish')}>{t.publish}</Button>:null}<Button type="button" variant="quiet" disabled={locked} onClick={()=>setAction('retire')}>{t.retire}</Button></>:null}<Button type="button" variant="quiet" disabled={locked} onClick={()=>setAction('history')}>{t.history}</Button></div>{action==='edit'&&source.data.state!=='RETIRED'?<CommandForm key={`${source.data.id}:edit`} title={t.edit} asRegion={false} regionLabel={`${t.edit}: ${source.data.title}`} path={path+'/draft'} fields={[{name:'title',label:t.title,required:true,defaultValue:source.data.title},...(resource!=='unit'?[{name:'content',label:t.content,type:'textarea'as const,required:resource!=='course',defaultValue:source.data.content,maxLength:resource==='course'?4000:resource==='activity'?10000:50000}]:[]),...(resource==='activity'?[{name:'kind',label:t.kind,type:'select'as const,required:true,defaultValue:source.data.kind??'',options:[{value:source.data.kind??'',label:source.data.kind==='reading'?(locale==='ar'?'قراءة':'Reading'):source.data.kind==='practice'?(locale==='ar'?'تدريب':'Practice'):source.data.kind==='assignment'?(locale==='ar'?'واجب':'Assignment'):source.data.kind==='quiz'?(locale==='ar'?'اختبار قصير':'Quiz'):(locale==='ar'?'تأمل':'Reflection')}]},{name:'assessmentId',label:t.task,type:'select'as const,defaultValue:source.data.assessmentId??'',options:tasks.data.filter(task=>task.courseId===courseId).map(task=>({value:task.id,label:task.title}))}]:[]),{name:'reason',label:t.reason,type:'textarea',required:true,maxLength:1000}]} body={values=>contentDraftBody(source.data!,values)} onLockedChange={setLocked} onSaved={saved} onCancel={()=>setAction(null)} note={t.draftNote}/>:action==='publish'&&source.data.state!=='RETIRED'?<CommandForm title={t.publish} asRegion={false} regionLabel={`${t.publish}: ${source.data.title}`} path={path+'/publish'} fields={[{name:'confirmPublication',label:t.confirm,type:'checkbox',required:true}]} body={values=>({expectedRevision:source.data!.draftRevision,confirmPublication:values.get('confirmPublication')==='on'})} onLockedChange={setLocked} onSaved={saved} onCancel={()=>setAction(null)} actionLabel={t.publish}/>:action==='retire'&&source.data.state!=='RETIRED'?<CommandForm title={t.retire} asRegion={false} regionLabel={`${t.retire}: ${source.data.title}`} path={path+'/retire'} fields={[{name:'reason',label:t.reason,type:'textarea',required:true,maxLength:1000},{name:'confirmRetirement',label:t.confirmRetire,type:'checkbox',required:true}]} body={values=>({expectedRevision:source.data!.draftRevision,reason:String(values.get('reason')),confirmRetirement:values.get('confirmRetirement')==='on'})} onLockedChange={setLocked} onSaved={saved} onCancel={()=>setAction(null)} actionLabel={t.retire}/>:action==='history'?<>{history.loading?<p role="status">{t.loading}</p>:history.error?<><LearningError error={history.error}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.retry}</Button></>:history.data.map(item=><article key={item.id}><h3>{item.title}</h3><p>{t.revision} {item.revision}</p><p className="lesson-content" dir="auto">{item.content}</p></article>)}<LoadMore query={history}/></>:null}</>:null}</section>;
}
export function ConnectedAssessment({activityId,onOpenChange}:{activityId:string;onOpenChange?:(open:boolean)=>void}) {
 const{locale,membership,apiUrl,accessToken,accessGeneration,status,online}=useApp();const t=locale==='ar'?contentAr:contentEn;
 const[open,setOpen]=useState(false),[refresh,setRefresh]=useState(0);
 const path=`/v1/learning-content/activities/${activityId}/task`;
 const scope=`${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessToken??''}:${accessGeneration}:${status}:${online}:${path}:${refresh}`;
 const permitted=status==='ready'&&online&&!!membership&&!!accessToken;
 const parse=useCallback((value:unknown)=>({scope,assessment:parseAssessment(value)}),[scope]);
 const query=useApiQuery(open?path:null,parse,refresh);
 const current=query.data?.scope===scope?query.data.assessment:null;
 const root=useRef<HTMLElement>(null);
 const intent=useRef<(TaskReadingFocusIntent&{opener:HTMLElement;newerFocus:boolean})|null>(null);
 const currentScope=useRef(scope);currentScope.current=scope;
 if(intent.current?.scope!==scope)intent.current=null;
 useEffect(()=>{
  const cancelOnFocus=(event:FocusEvent)=>{const pending=intent.current;if(pending&&event.target!==pending.opener){pending.newerFocus=true;intent.current=null;}};
  document.addEventListener('focusin',cancelOnFocus);
  return()=>{document.removeEventListener('focusin',cancelOnFocus);intent.current=null;};
 },[]);
 useEffect(()=>{
  if(!intent.current||!root.current)return;
  const target=root.current;
  const settle=()=>{
   const pending=intent.current;const active=document.activeElement;
   const heading=target.querySelector<HTMLElement>('h2[tabindex="-1"]');
   const decision=taskReadingFocusState(pending,currentScope.current,{open,permitted,failed:!!query.error||!!target.querySelector('[role="alert"]'),ready:!query.loading&&!!current,newerFocus:pending?.newerFocus??false,openerConnected:pending?.opener.isConnected??false,activeIsOpener:active===pending?.opener,activeIsNeutral:active===document.body||active===document.documentElement||active===null,headingAvailable:!!heading});
   if(decision==='cancel'){intent.current=null;return true;}
   if(decision==='focus'&&heading){intent.current=null;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:'instant'});return true;}
   return false;
  };
  if(settle())return;
  const observer=new MutationObserver(()=>{if(settle())observer.disconnect();});
  observer.observe(target,{subtree:true,childList:true});
  return()=>observer.disconnect();
 },[open,permitted,scope,query.loading,query.error,current]);
 return <section ref={root} className="connected-assessment" data-open={open}>
  {!open?<Button type="button" variant="secondary" onClick={event=>{intent.current=onOpenChange?{scope,opener:event.currentTarget,newerFocus:false}:null;setOpen(true);onOpenChange?.(true);}}>{t.openTask}</Button>:null}
  {open?<><Button type="button" variant="quiet" onClick={()=>{intent.current=null;setOpen(false);onOpenChange?.(false);}}>{t.backTask}</Button><p className="learning-form__note">{t.taskNote}</p>{query.loading?<p role="status">{t.loading}</p>:query.error?<LearningError error={query.error}/>:current?<AssessmentList compactLinked={!!onOpenChange} initiallySelectedId={current.id} assessments={[current]} submissions={[]} submissionsComplete={false} onSubmitted={()=>setRefresh(value=>value+1)}/>:null}</>:null}
 </section>;
}
