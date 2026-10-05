'use client';
import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { Button, WorkspaceState } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningError } from '../../../shared/components/feedback';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { parseSchedule } from '../../school/model';
import { parseParentAnnouncement } from '../../community/model';
import { parsePortfolioItemForLearner } from '../../portfolio/model';
import { NativeResultView } from '../../academic/ui';
import { ParentTrailHomeView } from './parent-trail-home';
import { appendParentHomeReportPage, currentParentHomeRead, parentHomeReadScope, parseParentHomeReport, parseParentHomeConversation, parseParentHomeConversationPolicy, parentHomeConversationPolicy, parentHomeConversationPath, parentHomeEventContext, parentHomeReportComplete, parentHomeSourceDenial, parentHomeSourceUsable, type ParentHomeRead, type ParentHomeSourceDenial, type ParentHomeSourceState } from '../parent-home-binding-model';
import type { ParentTrailContext, ParentTrailSnapshot } from '../parent-trail-model';
import type { HomeDestination, HomeTarget } from '../model';
import { parentTrailAr, parentTrailEn } from '../parent-trail-messages';

const copy={en:{refresh:'Refresh approved child records',reports:'All loaded approved results',portfolio:'All loaded approved portfolio work',upcoming:'All loaded shared dates',announcements:'Current school announcements',conversations:'Current child conversations',openReport:'Read approved report',openPortfolio:'Browse approved portfolio',openSchool:'Open school dates and support',openCommunity:'Open school communication',support:'Check school-published support',supportNote:'Choose your child’s current course in School to read any approved support instructions. Missing guidance does not establish that no support is needed.',reportAbout:'Feedback from this exact school-released result. Native values retain their recorded scale.',portfolioAbout:'The school has approved this exact reviewed reflection. Open the portfolio to check its permitted selected work.',conversationAbout:'A current school-scoped conversation for this child. Message delivery and read state remain in the conversation.',unknownEvent:'Shared event title unavailable',utc:'UTC'},ar:{refresh:'تحديث سجلات الطفل المعتمدة',reports:'كل النتائج المعتمدة المحمّلة',portfolio:'كل الأعمال المعتمدة المحمّلة',upcoming:'كل المواعيد المشتركة المحمّلة',announcements:'إعلانات المدرسة الحالية',conversations:'محادثات الطفل الحالية',openReport:'قراءة التقرير المعتمد',openPortfolio:'تصفح ملف الأعمال المعتمد',openSchool:'فتح مواعيد المدرسة والدعم',openCommunity:'فتح التواصل المدرسي',support:'التحقق من الدعم الذي نشرته المدرسة',supportNote:'اختر مقرر طفلك الحالي في المدرسة لقراءة أي تعليمات دعم معتمدة. غياب الإرشادات لا يثبت عدم الحاجة إلى دعم.',reportAbout:'ملاحظات من هذه النتيجة المحددة التي أصدرتها المدرسة. تحتفظ القيم بمقياسها الأصلي.',portfolioAbout:'اعتمدت المدرسة هذا التأمل المحدد الذي تمت مراجعته. افتح ملف الأعمال للتحقق من العمل المختار المتاح.',conversationAbout:'محادثة مدرسية حالية لهذا الطفل. يبقى تسليم الرسائل وحالة قراءتها داخل المحادثة.',unknownEvent:'عنوان الحدث المشترك غير متاح',utc:'التوقيت العالمي'}};

const sourceCopy={en:{schoolWide:'School-wide date',classUnknown:'Shared class date · class information unavailable',checking:'Checking current records…',unavailable:'These records are not available with your current access.',partial:'More current records remain to be checked. This shows the available loaded records.'},ar:{schoolWide:'موعد على مستوى المدرسة',classUnknown:'موعد مشترك للصف · معلومات الصف غير متاحة',checking:'جارٍ التحقق من السجلات الحالية…',unavailable:'لا تتاح هذه السجلات ضمن صلاحياتك الحالية.',partial:'لا تزال هناك سجلات حالية أخرى للتحقق منها. تُعرض السجلات المتاحة التي تم تحميلها.'}};

export function ParentTrailHomeConnected({onNavigate,headingRef}:{onNavigate:(destination:HomeDestination)=>void;headingRef?:Ref<HTMLHeadingElement>}) {
 const app=useApp();
 return <CurrentParentTrailHome key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`} onNavigate={onNavigate} headingRef={headingRef}/>;
}
type ReportPageState={items:ReturnType<typeof parseParentHomeReport>['items'];nextCursor:string|null;loading:boolean;loadingMore:boolean;error:LearningApiError|null;moreError:LearningApiError|null;loaded:boolean};
function useParentReport(path:string|null,scope:string|null,schoolId:string|null,childId:string|null) {
 const {request}=useApi();const [state,setState]=useState<ParentHomeRead<ReportPageState>|null>(null);const current=useRef(scope);current.current=scope;const pending=useRef<AbortController|null>(null);const seenCursors=useRef<string[]>([]);const paging=useRef(false);
 const empty:ReportPageState={items:[],nextCursor:null,loading:!!scope,loadingMore:false,error:null,moreError:null,loaded:false};
 useEffect(()=>{pending.current?.abort();seenCursors.current=[];paging.current=false;if(!path||!scope||!schoolId||!childId){setState(null);return;}const controller=new AbortController();pending.current=controller;setState({scope,value:{...empty,loading:true}});void request(path,{signal:controller.signal,isCurrentRead:()=>current.current===scope}).then(value=>{const report=parseParentHomeReport(value,schoolId,childId);if(!controller.signal.aborted&&current.current===scope)setState({scope,value:{...empty,items:report.items,nextCursor:report.nextCursor,loading:false,loaded:true}});}).catch(error=>{if(!controller.signal.aborted&&current.current===scope)setState({scope,value:{...empty,loading:false,error:error instanceof LearningApiError?error:new LearningApiError('invalid')}});});return()=>controller.abort();},[path,scope,schoolId,childId,request]);
 const value=currentParentHomeRead(state,scope)??empty;
 function loadMore(){if(!path||!scope||!schoolId||!childId||paging.current||value.loadingMore||!value.nextCursor)return;const controller=new AbortController();pending.current=controller;const cursor=value.nextCursor;paging.current=true;seenCursors.current.push(cursor);setState({scope,value:{...value,loadingMore:true,moreError:null}});void request(path+`&cursor=${cursor}`,{signal:controller.signal,isCurrentRead:()=>current.current===scope}).then(result=>{const page=parseParentHomeReport(result,schoolId,childId);const merged=appendParentHomeReportPage(value.items,page,cursor,seenCursors.current);if(!controller.signal.aborted&&current.current===scope)setState({scope,value:{...value,...merged,loadingMore:false}});}).catch(error=>{if(!controller.signal.aborted&&current.current===scope)setState({scope,value:{...value,loadingMore:false,moreError:error instanceof LearningApiError?error:new LearningApiError('invalid')}});}).finally(()=>{if(current.current===scope)paging.current=false;});}
 return {...value,data:value.items,loadMore};
}
function useCurrentHomeSource<T extends ParentHomeSourceState>(query:T,scope:string|null):T&{usable:boolean;denied:boolean} {
 const [denial,setDenial]=useState<ParentHomeSourceDenial|null>(null);
 const current=parentHomeSourceDenial(denial,scope,query);
 if(current!==denial)setDenial(current);
 return {...query,error:current?.error??query.error,usable:parentHomeSourceUsable(query,current),denied:!!current};
}
function CurrentParentTrailHome({onNavigate,headingRef}:{onNavigate:(destination:HomeDestination)=>void;headingRef?:Ref<HTMLHeadingElement>}) {
 const app=useApp();const {membership,locale}=app;const t=locale==='ar'?parentTrailAr:parentTrailEn,c=copy[locale],s=sourceCopy[locale];const [refresh,setRefresh]=useState(0);const [now,setNow]=useState<number|null>(null);useEffect(()=>{setNow(Date.now());},[refresh,app.accessGeneration]);
 const childContext=useChildContext(refresh);const child=childContext.child;const childId=child?.id??null;
 const can=(target:HomeTarget)=>!!membership&&membership.role==='parent'&&canOpenWorkspace(target,membership.entitlements,membership.role);
 const reportPath=childId&&can('academic')?`/v1/learners/${childId}/academic-report?limit=25`:null;const reportScope=parentHomeReadScope(app,childId,reportPath,refresh);
 const reportRead=useCurrentHomeSource(useParentReport(reportScope?reportPath:null,reportScope,membership?.schoolId??null,childId),reportScope);const reportItems=reportRead.usable?reportRead.data:[];
 const portfolioPath=childId&&can('portfolio')?`/v1/portfolio/items?limit=25&learnerId=${childId}`:null;const portfolioScope=parentHomeReadScope(app,childId,portfolioPath,refresh);
 const parsePortfolio=useCallback((value:unknown)=>{const item=parsePortfolioItemForLearner(value,childId,true);return{id:item.id,scope:portfolioScope,value:item};},[childId,portfolioScope]);
 const portfolios=useCurrentHomeSource(usePaginatedLearningQuery(portfolioScope?portfolioPath:null,parsePortfolio,refresh),portfolioScope);const portfolioItems=portfolios.usable?portfolios.data.flatMap(row=>{const item=currentParentHomeRead(row,portfolioScope);return item?[item]:[];}):[];
 const calendarPath=childId&&can('school')?`/v1/school/calendar?limit=25&learnerId=${childId}`:null;const calendarScope=parentHomeReadScope(app,childId,calendarPath,refresh);
 const parseCalendar=useCallback((value:unknown)=>{const item=parseSchedule(value);return{id:item.id,scope:calendarScope,value:item};},[calendarScope]);
 const calendar=useCurrentHomeSource(usePaginatedLearningQuery(calendarScope?calendarPath:null,parseCalendar,refresh),calendarScope);const events=calendar.usable?calendar.data.flatMap(row=>{const item=currentParentHomeRead(row,calendarScope);return item?[item]:[];}):[];
 const announcementPath=childId&&can('community')?'/v1/community/announcements?limit=25':null;const announcementScope=parentHomeReadScope(app,childId,announcementPath,refresh);
 const parseNews=useCallback((value:unknown)=>{const item=parseParentAnnouncement(value);return{id:item.id,scope:announcementScope,value:item};},[announcementScope]);
 const announcements=useCurrentHomeSource(usePaginatedLearningQuery(announcementScope?announcementPath:null,parseNews,refresh),announcementScope);const news=announcements.usable?announcements.data.flatMap(row=>{const item=currentParentHomeRead(row,announcementScope);return item?[item]:[];}):[];
 const policyPath=childId&&can('community')?'/v1/community/conversations/policy':null;const policyScope=parentHomeReadScope(app,childId,policyPath,refresh);
 const parsePolicy=useCallback((value:unknown)=>({scope:policyScope,value:parseParentHomeConversationPolicy(value)}),[policyScope]);
 const policyRead=useApiQuery(policyScope?policyPath:null,parsePolicy,refresh);
 const currentPolicy=parentHomeConversationPolicy(policyRead.data,policyScope,policyRead.loading,policyRead.error);
 const conversationPath=parentHomeConversationPath(currentPolicy,childId);const baseConversationScope=parentHomeReadScope(app,childId,conversationPath,refresh);
 const conversationScope=baseConversationScope&&currentPolicy.state==='enabled'?JSON.stringify([baseConversationScope,currentPolicy.policy.id,currentPolicy.policy.version,currentPolicy.policy.approvedAt]):null;
 const parseConversation=useCallback((value:unknown)=>{const item=parseParentHomeConversation(value,membership!.userId,childId!);return{id:item.id,scope:conversationScope,value:item};},[conversationScope,membership?.userId,childId]);
 const conversations=useCurrentHomeSource(usePaginatedLearningQuery(conversationScope?conversationPath:null,parseConversation,refresh),conversationScope);const threads=conversations.usable?conversations.data.flatMap(row=>{const item=currentParentHomeRead(row,conversationScope);return item?[item]:[];}):[];
 const sources=[reportRead,portfolios,calendar,announcements,conversations];const errors=sources.flatMap(source=>source.error?[source.error]:[]);const loading=sources.some(source=>source.loading);
 const ready=app.online&&app.status==='ready'&&membership?.role==='parent';const childState:ParentTrailContext['child']=child?{status:'ready',key:child.id,name:child.displayName,classLabel:child.classLabels.join(' · ')||null,schoolName:membership?.school.name??null}:childContext.query.loading?{status:'resolving'}:childContext.children.length?{status:'selection-required'}:{status:'unavailable'};
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' · '+c.utc;
 const result=reportItems.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];const selectedPortfolio=portfolioItems.slice().sort((a,b)=>Date.parse(b.reviewedAt??b.createdAt)-Date.parse(a.reviewedAt??a.createdAt))[0];const thread=threads.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];const future=now===null?[]:events.filter(event=>Date.parse(event.endsAt)>=now).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
 const partial=sources.some(query=>query.nextCursor||query.moreError)||errors.length>0;
 const refreshAction=()=>setRefresh(value=>value+1);
 const sourceState=(query:{loading:boolean;loaded:boolean;error:LearningApiError|null},scope:string|null)=>query.error?<div className="parent-trail__source-state"><LearningError error={query.error}/><Button type="button" variant="quiet" onClick={refreshAction}>{c.refresh}</Button></div>:query.loading?<WorkspaceState kind="loading" description={s.checking} role="status"/>:!scope?<WorkspaceState kind="unavailable" description={s.unavailable}/>:null;
 const communicationState=currentPolicy.state==='enabled'?sourceState(conversations,conversationScope):currentPolicy.state==='disabled'?<div className="parent-trail__source-state"><WorkspaceState kind="unavailable" description={locale==='ar'?'لم تفعّل المدرسة محادثات أولياء الأمور والمعلّمين. يمكن لمسؤول المدرسة مراجعة هذا الإعداد.':'Your school has not enabled parent and teacher conversations. Your school administrator can review this setting.'}/><Button type="button" variant="quiet" onClick={()=>onNavigate('community')}>{c.openCommunity}</Button></div>:currentPolicy.state==='loading'?<WorkspaceState kind="loading" description={s.checking} role="status"/>:<div className="parent-trail__source-state">{currentPolicy.error?<LearningError error={currentPolicy.error}/>:<WorkspaceState kind="unavailable" description={s.unavailable}/>}<Button type="button" variant="quiet" onClick={refreshAction}>{c.refresh}</Button></div>;
 const continuation=(query:Parameters<typeof LoadMore>[0]['query']&{denied:boolean},label:string)=>!query.denied&&(query.nextCursor||query.moreError)?<div className="parent-trail__source-continuation"><p role="status">{s.partial}</p><LoadMore query={query} label={label}/></div>:null;
 const snapshot:ParentTrailSnapshot|null=child&&ready?{
  childKey:child.id,status:loading||partial?'partial':'ready',
  feedback:result?{publication:'approved',latest:parentHomeReportComplete(reportRead),title:result.assessmentTitle,referenceTitle:result.referenceTitle,text:result.feedback,teacherName:null,dateLabel:date(result.createdAt),description:c.reportAbout,nativeResultView:<NativeResultView result={result.nativeResult}/>,action:{label:c.openReport,onClick:()=>onNavigate({view:'academic',source:'result',id:result.id})}}:null,
  portfolio:selectedPortfolio?{publication:'approved',title:selectedPortfolio.title,description:c.portfolioAbout,feedback:selectedPortfolio.feedback??undefined,reflection:selectedPortfolio.reflection,dateLabel:selectedPortfolio.reviewedAt?date(selectedPortfolio.reviewedAt):null,action:{label:c.openPortfolio,onClick:()=>onNavigate('portfolio')}}:null,
  upcoming:future.slice(0,3).map(event=>({key:event.id,title:typeof event.title==='string'&&event.title.trim()?event.title:c.unknownEvent,description:parentHomeEventContext(event,s),dateLabel:date(event.startsAt)})),upcomingAction:can('school')?{label:c.openSchool,onClick:()=>onNavigate('school')}:undefined,
  communication:thread?{status:'available',title:thread.title,teacherName:thread.teacherName,description:c.conversationAbout,action:{label:c.openCommunity,onClick:()=>onNavigate('community')}}:null,
  updates:can('community')?{items:news.slice(0,2).map(item=>({key:item.id,title:item.title,body:item.body,dateLabel:date(item.createdAt)}))}:undefined,
  sourceControls:{feedback:sourceState(reportRead,reportScope),portfolio:sourceState(portfolios,portfolioScope),upcoming:sourceState(calendar,calendarScope),communication:communicationState,updates:sourceState(announcements,announcementScope)},
  continuations:{feedback:continuation(reportRead,c.reports),portfolio:continuation(portfolios,c.portfolio),upcoming:continuation(calendar,c.upcoming),communication:continuation(conversations,c.conversations),updates:continuation(announcements,c.announcements)},
  support:can('school')?{title:c.support,description:c.supportNote,action:{label:c.openSchool,onClick:()=>onNavigate('school')}}:null
 }:null;
 const availability:ParentTrailContext['availability']=!app.online?'offline':!ready?'denied':childContext.query.error?'error':loading||partial?'partial':'ready';
 const context:ParentTrailContext={availability,child:childState,snapshot,selector:<ChildSelector context={childContext}/>,notice:loading?t.loading:partial?t.partial:undefined,recovery:{label:c.refresh,onClick:refreshAction}};
 return <div><ParentTrailHomeView context={context} locale={locale} headingRef={headingRef}/>{ready ? <div className="home-overview-controls"><Button type="button" variant="quiet" onClick={refreshAction}>{c.refresh}</Button></div> : null}</div>;
}
