'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { parseProgramme, type Programme } from '../model';
import { courseReviewScope, currentCourseReview, parseBoundReviewCourse, reviewProgramme, parseCurrentObjectivePage, objectiveReviewSelection, parseObjectiveReviewSelection, currentObjectiveReview, objectiveApprovalRecovery, objectiveApprovalFormKey, objectiveReviewOptions, objectiveRetryPermitted, validateObjectiveReviewReceipt, type ObjectiveReviewSelection, type ObjectiveApprovalSource } from '../course-review-model';
import { curriculumAr, curriculumEn } from '../messages';
import { useCurriculumSourceDenial } from '../source-recovery';
export function CourseObjectives({courseId,onChanged,onLockedChange}:{courseId:string;onChanged:()=>void;onLockedChange?:(locked:boolean)=>void}){
 const app=useApp();if(!courseReviewScope(app,'course-objectives',0))return null;
 return <CurrentCourseObjectives key={`${app.apiUrl}:${app.membership!.schoolId}:${app.membership!.userId}:${app.membership!.role}:${courseId}`} courseId={courseId} onChanged={onChanged} onLockedChange={onLockedChange}/>;
}
function CurrentCourseObjectives({courseId,onChanged,onLockedChange}:{courseId:string;onChanged:()=>void;onLockedChange?:(locked:boolean)=>void}){
 const app=useApp(),{locale,membership,formDrafts,commandJournal}=app,t=locale==='ar'?curriculumAr:curriculumEn;
 const path=`/v1/curriculum/courses/${courseId}/objectives`,selectionSlot=`${membership!.schoolId}:${membership!.userId}:${path}:selection`;
 const [selected,setSelected]=useState<ObjectiveReviewSelection|null>(()=>parseObjectiveReviewSelection(formDrafts.model(selectionSlot)));
 const [cursor,setCursor]=useState<string|null>(()=>selected?.cursor??null),[refresh,setRefresh]=useState(0),[locked,setLocked]=useState(false);
 const heading=useRef<HTMLHeadingElement|null>(null),editor=useRef<HTMLElement|null>(null),returnFocus=useRef(false),focusReview=useRef(false),initialFocus=useRef(true),opener=useRef<HTMLButtonElement|null>(null);
 const root=useRef<HTMLElement|null>(null),focusedInput=useRef<{element:HTMLInputElement|HTMLTextAreaElement;referenceId:string;name:string}|null>(null);
 useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
 const coursePath=`/v1/courses/${courseId}?limit=1`,courseScope=courseReviewScope(app,coursePath,refresh);
 const courseParser=useCallback((value:unknown)=>({scope:courseScope,value:parseBoundReviewCourse(value,courseId)}),[courseScope,courseId]);
 const courseQuery=useApiQuery(courseScope?coursePath:null,courseParser,refresh),course=currentCourseReview(courseQuery.data,courseScope);
 const programmePath='/v1/curriculum/programmes?limit=100',programmeScope=courseReviewScope(app,programmePath,refresh);
 const programmeParser=useCallback((value:unknown)=>{const row=parseProgramme(value);return{id:row.id,scope:programmeScope,value:row};},[programmeScope]);
 const programmes=usePaginatedLearningQuery(programmeScope?programmePath:null,programmeParser,refresh);
 const currentProgrammes=programmes.data.flatMap(row=>{const value=currentCourseReview(row,programmeScope);return value?[value]:[];});
 let programme:Programme|null=null,sourceError:LearningApiError|null=null;
 try{programme=course?reviewProgramme(course,currentProgrammes):null;}catch(error){sourceError=error instanceof LearningApiError?error:new LearningApiError('invalid');}
 const pagePath=`${path}?limit=25${cursor?`&cursor=${cursor}`:''}`,pageScope=courseReviewScope(app,pagePath,refresh);
 const pageParser=useCallback((value:unknown)=>{if(!course||!programme)throw new LearningApiError('invalid');return{scope:pageScope,value:parseCurrentObjectivePage(value,course,programme,cursor)};},[pageScope,course,programme,cursor]);
 const pageQuery=useApiQuery(course&&programme&&!sourceError&&pageScope?pagePath:null,pageParser,refresh),page=currentCourseReview(pageQuery.data,pageScope);
 const canApprove=membership!.role==='admin'||membership!.role==='coordinator',pending=locked||!!commandJournal.get(path);
 const options=objectiveReviewOptions(page?.items??[]);
 const duplicate=selected&&options.some(item=>item.id===selected.referenceId&&item.requiresReview);
 const current=selected&&course&&programme&&page&&!duplicate?currentObjectiveReview(selected,course,programme,page):null;
 const recovery=objectiveApprovalRecovery(commandJournal.get(path),courseId);
 const ready=!!course&&!!programme&&!!page&&!courseQuery.loading&&!courseQuery.error&&!programmes.loading&&!programmes.error&&!programmes.moreError&&!pageQuery.loading&&!pageQuery.error&&!sourceError;
 const onLocked=useCallback((value:boolean)=>setLocked(value),[]);
 useEffect(()=>{onLockedChange?.(pending);return()=>onLockedChange?.(false);},[pending,onLockedChange]);
 useEffect(()=>{if(initialFocus.current&&!courseQuery.loading&&!programmes.loading&&!pageQuery.loading&&(page||courseQuery.error||programmes.error||sourceError)){initialFocus.current=false;heading.current?.focus({preventScroll:true});}},[courseQuery.loading,courseQuery.error,programmes.loading,programmes.error,pageQuery.loading,page,sourceError]);
 useEffect(()=>{if(returnFocus.current){returnFocus.current=false;const target=opener.current?.isConnected&&opener.current.getClientRects().length?opener.current:heading.current;target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',behavior:'instant'});}},[selected]);
 useEffect(()=>{if(focusReview.current&&editor.current){focusReview.current=false;editor.current.focus({preventScroll:true});}},[selected?.referenceId,ready,recovery?.referenceId]);
 useEffect(()=>{const element=root.current;if(!element)return;const observer=new MutationObserver(()=>{const prior=focusedInput.current;if(!prior||prior.referenceId!==selected?.referenceId||prior.element.isConnected||document.activeElement!==document.body)return;const target=element.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[name="${prior.name}"]`);if(target&&!target.disabled){target.focus({preventScroll:true});focusedInput.current={...prior,element:target};}});observer.observe(element,{subtree:true,childList:true});return()=>observer.disconnect();},[selected?.referenceId]);
 function close(){if(pending)return;formDrafts.remove(selectionSlot);if(selected)formDrafts.remove(`${membership!.schoolId}:${membership!.userId}:${path}:review:${objectiveApprovalFormKey(selected)}`);setSelected(null);focusedInput.current=null;returnFocus.current=true;}
 function saved(){formDrafts.remove(selectionSlot);setSelected(null);focusedInput.current=null;returnFocus.current=true;setRefresh(value=>value+1);onChanged();}
 function choose(item:Parameters<typeof objectiveReviewSelection>[3],button:HTMLButtonElement){if(!course||!programme||!page||pending||options.some(option=>option.id===item.id&&option.requiresReview))return;const source=objectiveReviewSelection(course,programme,page,item,cursor);opener.current=button;formDrafts.saveModel(selectionSlot,source);focusedInput.current=null;focusReview.current=true;setSelected(source);}
 const error=courseQuery.error??programmes.error??programmes.moreError??sourceError??pageQuery.error;
 const knownDenied=useCurriculumSourceDenial([{path:coursePath,scope:courseScope,loading:courseQuery.loading,ready:!!course,error:courseQuery.error},{path:programmePath,scope:programmeScope,loading:programmes.loading||programmes.loadingMore,ready:programmes.loaded&&!programmes.loading&&!programmes.loadingMore&&!programmes.error&&!programmes.moreError,error:programmes.error??programmes.moreError},{path:pagePath,scope:pageScope,loading:pageQuery.loading,ready:!!page,error:pageQuery.error}]);
 const retryPermitted=!knownDenied&&objectiveRetryPermitted([courseQuery.error,programmes.error,programmes.moreError,sourceError,pageQuery.error]);
 const reading=canApprove&&((!!selected&&(!!current||!recovery))||!!recovery);
 const recoveryReader=recovery&&canApprove&&!current?(retryPermitted?<section ref={editor} tabIndex={-1} className="curriculum-course-review__approval curriculum-course-review__recovery" aria-label={t.approveObjective}><Button type="button" variant="quiet" className="curriculum-course-review__back" disabled={pending} onClick={close}>{t.backToObjectives}</Button><p className="notice">{t.objectiveChanged}</p><ObjectiveApproval key={objectiveApprovalFormKey(recovery)} source={recovery} courseId={courseId} recovery onLocked={onLocked} onSaved={saved}/></section>:<Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}><CuevoIcon name="refresh"/>{t.refresh}</Button>):null;
 return <section ref={root} className="curriculum-course-review" aria-label={t.courseObjectives} onFocusCapture={event=>{if(selected&&(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)&&event.target.name)focusedInput.current={element:event.target,referenceId:selected.referenceId,name:event.target.name};}}>
  <header className="curriculum-course-review__heading"><div><CuevoIcon name="assessment" variant="filled" size={28}/><h2 ref={heading} tabIndex={-1}>{t.courseObjectives}</h2></div><Button type="button" variant="quiet" disabled={pending} onClick={()=>setRefresh(value=>value+1)}><CuevoIcon name="refresh"/>{t.refresh}</Button></header>
  {error?<LearningError error={error}/>:courseQuery.loading||programmes.loading?<p role="status">{t.loading}</p>:!programme?<><p className="notice">{programmes.nextCursor?t.objectiveProgrammeMore:t.objectiveScopeReview}</p><LoadMore query={programmes}/></>:pageQuery.loading?<p role="status">{t.loading}</p>:ready&&page&&course?<>
   <section className="curriculum-course-review__context"><h3><bdi>{course.title}</bdi></h3><p><bdi>{programme.name} · {programme.className} · {programme.subjectName} · {programme.yearGroupName} · {programme.academicYearName}</bdi></p><p><bdi>{programme.framework} · {programme.packProgramme} · {programme.packVersion}</bdi></p><p className="notice">{t.objectiveApprovalNote}</p>{page.scopeStatus==='REQUIRES_REVIEW'?<p className="notice">{t.objectiveScopeReview}</p>:null}</section>
   {options.some(option=>option.requiresReview)?<p className="notice">{t.matchingObjectiveContext}</p>:null}
   <div className="curriculum-course-review__layout" data-selected={reading}><div className="curriculum-course-review__list">{page.items.length?page.items.map(item=><article className="curriculum-course-review__objective" key={item.id} data-selected={selected?.referenceId===item.id}><header><h3><bdi>{item.title}</bdi></h3><Status tone={item.approved?'positive':'warning'}>{item.approved?t.objectiveApproved:t.objectiveNotApproved}</Status></header><p dir="auto">{item.description}</p><dl className="curriculum-course-review__source-context"><div><dt>{t.type}</dt><dd>{t.referenceTypes[item.type]}</dd></div><div><dt>{t.parent}</dt><dd><bdi>{item.parentTitle??t.unknown}</bdi></dd></div><div><dt>{t.version}</dt><dd><bdi>{item.version}</bdi></dd></div></dl>{item.approvalReason?<p dir="auto">{item.approvalReason}</p>:null}{canApprove&&!item.approved&&page.scopeStatus==='READY'?<Button type="button" variant="secondary" disabled={pending||options.some(option=>option.id===item.id&&option.requiresReview)} onClick={event=>choose(item,event.currentTarget)}>{t.approveObjective}<CuevoIcon name="arrow"/></Button>:null}</article>):<p className="learning-empty">{t.empty}</p>}</div>
    {selected&&canApprove&&(current||!recovery)?<section ref={editor} tabIndex={-1} className="curriculum-course-review__approval" aria-label={t.approveObjective}><Button type="button" variant="quiet" className="curriculum-course-review__back" disabled={pending} onClick={close}>{t.backToObjectives}</Button>{current?<ObjectiveApproval key={objectiveApprovalFormKey(selected)} source={selected} courseId={courseId} row={current} onLocked={onLocked} onSaved={saved} onCancel={close}/>:<p className="notice">{t.objectiveChanged}</p>}</section>:null}{recoveryReader}
   </div><div className="learning-actions">{cursor?<Button type="button" variant="quiet" disabled={pending} onClick={()=>{setCursor(null);close();}}>{t.firstObjectives}</Button>:null}{page.nextCursor?<Button type="button" variant="secondary" disabled={pending} onClick={()=>{setCursor(page.nextCursor);close();}}>{t.nextObjectives}</Button>:null}</div>
  </>:null}
  {!ready?recoveryReader:null}
 </section>;
}
function ObjectiveApproval({source,courseId,row,recovery=false,onLocked,onSaved,onCancel}:{source:ObjectiveApprovalSource|ObjectiveReviewSelection;courseId:string;row?:{title:string;description:string};recovery?:boolean;onLocked:(value:boolean)=>void;onSaved:()=>void;onCancel?:()=>void}){
 const{locale,membership}=useApp(),t=locale==='ar'?curriculumAr:curriculumEn,path=`/v1/curriculum/courses/${courseId}/objectives`;
 return <CommandForm title={t.approveObjective} asRegion={false} path={path} draftKey={`${path}:review:${objectiveApprovalFormKey(source)}`} fields={recovery?[]:[{name:'reason',label:t.objectiveReason,type:'textarea',required:true,maxLength:2000},{name:'confirmConfiguration',label:t.objectiveConfirm,type:'checkbox',required:true}]} body={values=>{if(recovery)throw new LearningApiError('conflict');return{referenceId:source.referenceId,expectedVersion:source.approvalVersion,reason:String(values.get('reason')),confirmConfiguration:values.get('confirmConfiguration')==='on'};}} validateReceipt={(receipt,original)=>validateObjectiveReviewReceipt(receipt,original,source,membership!.role)} onLockedChange={onLocked} onSaved={onSaved} onCancel={onCancel} note={row?`${row.title} · ${row.description}`:undefined} actionLabel={t.approveObjective}/>;
}
