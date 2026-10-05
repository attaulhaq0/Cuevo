'use client';
import { WorkspaceState } from '@cuevo/ui';
import type {ReactNode} from 'react';
import {CuevoIcon} from '@cuevo/ui';
import type {LearningApiError} from '../../../shared/api/client';
import {LearningError} from '../../../shared/components/feedback';
import {LoadMore} from '../../../shared/components/load-more';
import {goalAr,goalEn} from '../goal-messages';

type Query={data:readonly unknown[];loading:boolean;loadingMore:boolean;loaded:boolean;error:LearningApiError|null;moreError:LearningApiError|null;nextCursor:string|null;loadMore:()=>void};
export function LearnerGoalRecords({query,editing,student,locale,children}:{query:Query;editing:boolean;student:boolean;locale:'en'|'ar';children:ReactNode}){
 const t=locale==='ar'?goalAr:goalEn;
 return <>
  {query.loading||!query.loaded&&!query.error?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:query.error?<LearningError error={query.error}/>:query.moreError?null:query.data.length?<details className="development-goal-records" open={editing}><summary>{t.title}</summary>{children}</details>:<div className="development-empty"><CuevoIcon name="goal" size={32}/><h3>{t.empty}</h3>{student?<p>{t.emptyBody}</p>:null}</div>}
  {query.nextCursor?<p className="development-meta">{t.moreGoals}</p>:null}<LoadMore query={query} label={t.title}/>
 </>;
}
