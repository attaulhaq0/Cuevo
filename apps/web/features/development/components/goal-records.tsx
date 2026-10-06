'use client';
import { WorkspaceState } from '@cuevo/ui';
import type {ReactNode} from 'react';
import type {LearningApiError} from '../../../shared/api/client';
import {LearningError} from '../../../shared/components/feedback';
import {LoadMore} from '../../../shared/components/load-more';
import {goalAr,goalEn} from '../goal-messages';
import {developmentRecordState} from '../model';

type Query={data:readonly unknown[];loading:boolean;loadingMore:boolean;loaded:boolean;error:LearningApiError|null;moreError:LearningApiError|null;nextCursor:string|null;loadMore:()=>void};
export function LearnerGoalRecords({query,editing,student,locale,children}:{query:Query;editing:boolean;student:boolean;locale:'en'|'ar';children:ReactNode}){
 const t=locale==='ar'?goalAr:goalEn;
 const state=developmentRecordState(query);
 return <>
  {state==='loading'?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:state==='error'?<LearningError error={query.error!}/>:state==='more-error'?null:query.data.length?<details className="development-goal-records" open={editing}><summary>{t.title}</summary>{children}</details>:state==='empty'?<WorkspaceState kind="empty" icon="goal" title={t.empty} headingLevel={3} description={student?t.emptyBody:undefined}/>:null}
  {state==='partial'?<WorkspaceState kind="review" icon="goal" description={t.moreGoals}/>:state==='unknown'?<WorkspaceState kind="unknown" icon="goal" description={t.recordsChecking}/>:null}<LoadMore query={query} label={t.title}/>
 </>;
}
