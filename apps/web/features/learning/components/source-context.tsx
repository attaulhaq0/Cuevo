'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useState } from 'react';
import { Button } from '@cuevo/ui';
import { learningSourceContextSchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { ThinkingFocusSnapshot } from './thinking-focus';
const parseContext=(value:unknown)=>{const parsed=learningSourceContextSchema.safeParse(value);if(!parsed.success)throw new LearningApiError('invalid');return parsed.data;};
export function LearningSourceContext({type,sourceId}:{type:'submission'|'completion';sourceId:string}){
 const{locale}=useApp();const[open,setOpen]=useState(false);const query=useApiQuery(open?`/v1/learning-content/sources/${type}/${sourceId}`:null,parseContext,0);const title=locale==='ar'?'سياق العمل الأصلي':'Original learning context';return <section><Button type="button" variant="quiet" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{title}</Button>{open?<section aria-label={title}>{query.loading?<WorkspaceState kind="loading" icon="refresh" description={locale==='ar'?'جارٍ تحميل السياق الأصلي…':'Loading original context…'} role="status"/>:query.error?<LearningError error={query.error}/>:query.data?.sourceId!==sourceId?<LearningError error={new LearningApiError('invalid')}/>:query.data.contextStatus==='UNKNOWN'?<WorkspaceState kind="unknown" icon="help" description={locale==='ar'?'لم يسجّل هذا العمل السابق مراجعة محتوى محددة. السياق الأصلي غير معروف.':'This earlier work did not record an exact content revision. Its original learning context is unknown.'}/>:<>{[query.data.course,query.data.lesson,query.data.activity].filter(item=>item!==null).map((item,index)=><article key={index}><h4>{item.title}</h4><p className="learning-form__note">{locale==='ar'?'مراجعة المحتوى':'Content revision'} {item.revision}</p><p className="lesson-content" dir="auto">{item.content}</p></article>)}{query.data.assessment?<article><h4>{query.data.assessment.title}</h4><p className="lesson-content" dir="auto">{query.data.assessment.instructions}</p></article>:null}</>}<ThinkingFocusSnapshot type={type} sourceId={sourceId}/></section>:null}</section>;
}
