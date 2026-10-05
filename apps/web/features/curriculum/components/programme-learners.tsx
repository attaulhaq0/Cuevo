'use client';
import { IconButton } from '@cuevo/ui';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { courseReviewScope, currentCourseReview, parseCurrentProgrammeLearners, programmeReviewIdentity, type ProgrammeReviewIdentity } from '../course-review-model';
import { curriculumAr, curriculumEn } from '../messages';
export function ProgrammeLearners({programmeId,refresh}:{programmeId:string;refresh:number}){
 const app=useApp();if(!courseReviewScope(app,'programme-learners',0))return null;
 return <CurrentProgrammeLearners key={`${app.apiUrl}:${app.membership!.schoolId}:${app.membership!.userId}:${app.membership!.role}:${programmeId}`} programmeId={programmeId} refresh={refresh}/>;
}
function CurrentProgrammeLearners({programmeId,refresh}:{programmeId:string;refresh:number}){
 const app=useApp(),{locale}=app,t=locale==='ar'?curriculumAr:curriculumEn;
 const[cursor,setCursor]=useState<string|null>(null),[previous,setPrevious]=useState<(string|null)[]>([]),[reload,setReload]=useState(0);
 const heading=useRef<HTMLHeadingElement|null>(null),needsFocus=useRef(true),source=useRef<ProgrammeReviewIdentity|undefined>(undefined);
 const path=`/v1/curriculum/programmes/${programmeId}/learners?limit=25${cursor?`&cursor=${cursor}`:''}`,scope=courseReviewScope(app,path,refresh+reload);
 const parser=useCallback((value:unknown)=>{const page=parseCurrentProgrammeLearners(value,programmeId,cursor,source.current);source.current=programmeReviewIdentity(page.programme);return{scope,value:page};},[scope,programmeId,cursor]);
 const query=useApiQuery(scope?path:null,parser,refresh+reload),page=currentCourseReview(query.data,scope);
 useEffect(()=>{if(needsFocus.current&&!query.loading&&(page||query.error)&&heading.current){needsFocus.current=false;heading.current.focus({preventScroll:true});}},[query.loading,query.error,page]);
 function refreshPage(){setCursor(null);setPrevious([]);source.current=undefined;setReload(value=>value+1);}
 return <section className="curriculum-programme-learners" aria-label={t.programmeAssignments}>
  <header className="curriculum-programme-learners__heading"><div><CuevoIcon name="people" size={25}/><h3 ref={heading} tabIndex={-1}>{t.programmeAssignments}</h3></div><IconButton icon="refresh" label={t.refreshAssignments} type="button" onClick={refreshPage} /></header>
  <p className="learning-form__note">{t.assignmentScope}</p>{query.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:query.error?<><LearningError error={query.error}/><WorkspaceState kind="review" icon="help" description={t.assignmentContextChanged}/></>:page?<>
   <div className="curriculum-programme-learners__context"><h4><bdi>{page.programme.name}</bdi></h4><p><bdi>{page.programme.className} · {page.programme.subjectName} · {page.programme.yearGroupName} · {page.programme.academicYearName}</bdi></p><p><bdi>{page.programme.framework} · {page.programme.packProgramme} · {page.programme.packVersion}</bdi></p></div>
   <p className="learning-form__note">{t.assignmentPageNote}</p><div className="curriculum-programme-learners__list">{page.items.length?page.items.map(assignment=><article className="curriculum-programme-learners__assignment" key={assignment.id} data-programme-learner-id={assignment.id}><header><h4><bdi>{assignment.learnerName}</bdi></h4><Status tone={assignment.status==='active'?'positive':'neutral'}>{assignment.status==='active'?t.active:t.revoked}</Status></header><p>{t.assignmentApprovedBy}: <bdi>{assignment.approvedByName}</bdi></p><p><bdi>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(assignment.updatedAt))}</bdi></p></article>):<WorkspaceState kind={page.nextCursor?'unknown':'empty'} icon="curriculum" description={page.nextCursor?t.nextAssignments:t.noAssignments}/>}</div>
   <div className="learning-actions">{previous.length?<Button type="button" variant="quiet" onClick={()=>{needsFocus.current=true;setCursor(previous.at(-1)??null);setPrevious(values=>values.slice(0,-1));}}>{t.previousAssignments}</Button>:null}{page.nextCursor?<Button type="button" variant="secondary" onClick={()=>{needsFocus.current=true;setPrevious(values=>[...values,cursor]);setCursor(page.nextCursor);}}>{t.nextAssignments}<CuevoIcon name="arrow"/></Button>:null}</div>
  </>:null}
 </section>;
}
