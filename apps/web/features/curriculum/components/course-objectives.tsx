'use client';
import{useState}from'react';
import{Button,Status}from'@cuevo/ui';
import{useApp}from'../../../shared/session/providers';
import{useApiQuery}from'../../../shared/hooks/use-api';
import{CommandForm}from'../../../shared/components/command-form';
import{LearningError}from'../../../shared/components/feedback';
import{parseCourseObjectivePage}from'../model';
import{curriculumAr,curriculumEn}from'../messages';
export function CourseObjectives({courseId,onChanged}:{courseId:string;onChanged:()=>void}){
 const{locale}=useApp();const t=locale==='ar'?curriculumAr:curriculumEn;
 const[cursor,setCursor]=useState<string|null>(null);const[refresh,setRefresh]=useState(0);const[selected,setSelected]=useState<string|null>(null);
 const page=useApiQuery(`/v1/curriculum/courses/${courseId}/objectives?limit=25${cursor?`&cursor=${cursor}`:''}`,parseCourseObjectivePage,refresh);
 const source=page.data?.items.find(item=>item.id===selected);
 function saved(){setSelected(null);setCursor(null);setRefresh(value=>value+1);onChanged();}
 return <section className="learning-form" aria-label={t.courseObjectives}><div className="learning-section-heading"><h2>{t.courseObjectives}</h2><Button type="button" variant="quiet" onClick={()=>{setSelected(null);setRefresh(value=>value+1);}}>{t.refresh}</Button></div>
 {page.loading?<p role="status">{t.loading}</p>:page.error?<LearningError error={page.error}/>:page.data?<><p>{page.data.courseTitle} · {page.data.programmeName} · {page.data.packVersion}</p><p>{page.data.subjectName} · {page.data.yearGroupName}</p><p className="notice">{t.objectiveApprovalNote}</p>{page.data.scopeStatus==='REQUIRES_REVIEW'?<p className="notice">{t.objectiveScopeReview}</p>:null}
 {page.data.items.map(item=><article className="curriculum-record" key={item.id}><h3>{item.title}</h3><p dir="auto">{item.description}</p><p>{t.referenceTypes[item.type]} · {item.parentTitle??t.unknown}</p><Status tone={item.approved?'positive':'warning'}>{item.approved?t.objectiveApproved:t.objectiveNotApproved}</Status>{item.approvalReason?<p>{item.approvalReason}</p>:null}{!item.approved&&page.data!.scopeStatus==='READY'?<Button type="button" variant="secondary" onClick={()=>setSelected(item.id)}>{t.approveObjective}</Button>:null}</article>)}
 {source&&!source.approved?<CommandForm key={`${courseId}:${source.id}:${page.data.version}`} title={t.approveObjective} path={`/v1/curriculum/courses/${courseId}/objectives`} fields={[{name:'reason',label:t.objectiveReason,type:'textarea',required:true,maxLength:2000},{name:'confirmConfiguration',label:t.objectiveConfirm,type:'checkbox',required:true}]} body={values=>({referenceId:source.id,expectedVersion:page.data!.version,reason:String(values.get('reason')),confirmConfiguration:values.get('confirmConfiguration')==='on'})} onSaved={saved} onCancel={()=>setSelected(null)} note={`${source.title} · ${source.description}`} actionLabel={t.approveObjective}/>:null}
 <div className="learning-actions">{cursor?<Button type="button" variant="quiet" onClick={()=>{setCursor(null);setSelected(null);}}>{t.firstObjectives}</Button>:null}{page.data.nextCursor?<Button type="button" variant="secondary" onClick={()=>{setCursor(page.data!.nextCursor);setSelected(null);}}>{t.nextObjectives}</Button>:null}</div>
 </>:null}
 </section>;
}
