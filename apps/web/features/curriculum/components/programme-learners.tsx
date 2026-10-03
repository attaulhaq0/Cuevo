'use client';
import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { LearningApiError } from '../../../shared/api/client';
import { parseProgrammeLearnerPage } from '../model';
import { curriculumAr, curriculumEn } from '../messages';

export function ProgrammeLearners({ programmeId, refresh }: { programmeId: string; refresh: number }) {
 const {locale}=useApp();const t=locale==='ar'?curriculumAr:curriculumEn;
 const [cursor,setCursor]=useState<string|null>(null);const [previous,setPrevious]=useState<(string|null)[]>([]);const [reload,setReload]=useState(0);
 const query=useApiQuery(`/v1/curriculum/programmes/${programmeId}/learners?limit=25${cursor?`&cursor=${cursor}`:''}`,parseProgrammeLearnerPage,refresh+reload);
 const page=query.data?.programme.id===programmeId?query.data:null;
 return <section aria-label={t.programmeAssignments}><h3>{t.programmeAssignments}</h3><p>{t.assignmentScope}</p><Button type="button" variant="quiet" onClick={()=>{setCursor(null);setPrevious([]);setReload(value=>value+1);}}>{t.refreshAssignments}</Button>{query.loading?<p role="status">{t.loading}</p>:query.error?<LearningError error={query.error}/>:!page?<LearningError error={new LearningApiError('invalid')}/>:<><p>{page.programme.className} · {page.programme.subjectName} · {page.programme.yearGroupName} · {page.programme.academicYearName}</p>{page.items.length?page.items.map(assignment=><article className="school-record" key={assignment.id} data-programme-learner-id={assignment.id}><h4><bdi>{assignment.learnerName}</bdi></h4><Status tone={assignment.status==='active'?'positive':'neutral'}>{assignment.status==='active'?t.active:t.revoked}</Status><p>{t.assignmentApprovedBy}: <bdi>{assignment.approvedByName}</bdi> · <bdi>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(assignment.updatedAt))}</bdi></p></article>):<p>{t.noAssignments}</p>}<div className="learning-actions">{previous.length?<Button type="button" variant="quiet" onClick={()=>{setCursor(previous.at(-1)??null);setPrevious(values=>values.slice(0,-1));}}>{t.previousAssignments}</Button>:null}{page.nextCursor?<Button type="button" variant="secondary" onClick={()=>{setPrevious(values=>[...values,cursor]);setCursor(page.nextCursor);}}>{t.nextAssignments}</Button>:null}</div></>}</section>;
}
