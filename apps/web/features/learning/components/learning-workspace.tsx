'use client';
import { WorkspaceState } from '@cuevo/ui';


import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status, WorkspaceTabs, WorkspacePageHeading, type CuevoIconName } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseChoice,choiceLabel, staffCourseChoices, learningTitle, learningNavigationLocked, parseCourse, parseAssessment, parseSubmission, type Choice, type Course, type Assessment, type Submission } from '../model';
import { useLearningApi } from '../api';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { CourseView } from './course-editor';
import { AssessmentList, SubmissionList } from './assessment-view';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import type{NavigationIntent}from'../../../shared/session/navigation-intent';
import{LearningApiError}from'../../../shared/api/client';
import { trailAssets } from '../../../shared/characters/assets';
import { learningAr, learningEn } from '../messages';

type Tab = 'courses' | 'assessments' | 'submissions';

export function LearningWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'learning'}>|null}={}) {
  const { membership } = useApp();
  const root = useRef<HTMLDivElement>(null);
  const actor = `${membership?.schoolId}:${membership?.userId}`;
  const focused = useRef<{ actor: string; taskId: string; element: HTMLElement; field?: string; control?: string } | null>(null);
  useEffect(() => {
    const restore = () => {
      const previous = focused.current;
      if (!previous || previous.actor !== actor || previous.element.isConnected || document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
      const task = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-assessment-id]') ?? []).find(element => element.dataset.assessmentId === previous.taskId);
      if (!task) return;
      const candidates = Array.from(task.querySelectorAll<HTMLElement>('input, textarea, select, button, summary'));
      const target = candidates.find(element => previous.field ? element.getAttribute('name') === previous.field : previous.control ? (element.getAttribute('aria-label') || element.textContent?.trim()) === previous.control : false);
      if (!target && task.querySelector('[data-work-loading="true"]')) return;
      const destination = target && !target.matches(':disabled') ? target : task.querySelector<HTMLElement>('h2[tabindex="-1"], h3[tabindex="-1"]');
      if (destination) { focused.current = null; destination.focus(); }
    };
    const observer = new MutationObserver(restore);
    if (root.current) observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [actor]);
  return <div ref={root} onFocusCapture={event => {
    const element = event.target as HTMLElement;
    const taskId = element.closest<HTMLElement>('[data-assessment-id]')?.dataset.assessmentId;
    focused.current = taskId ? { actor, taskId, element, field: element.getAttribute('name') ?? undefined, control: element.matches('button, summary') ? element.getAttribute('aria-label') || element.textContent?.trim() : undefined } : null;
  }}><CurrentLearningWorkspace key={actor} intent={intent} /></div>;
}

function CurrentLearningWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'learning'}>|null}={}) {
  const { t } = useLearningApi();
  const { membership, apiUrl, accessToken, accessGeneration, online, status, locale, commandJournal } = useApp();
  useSyncExternalStore(commandJournal.subscribe,commandJournal.getSnapshot,commandJournal.getSnapshot);
  const navigationLocked = learningNavigationLocked(commandJournal.pending());
  const courseOpener = useRef<HTMLElement | null>(null), returnToCourses = useRef(false);
  const courseBrowseId=useRef<string|null>(null);
  const [tab, setTab] = useState<Tab>('courses');
  const [refresh, setRefresh] = useState(0);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [assessmentJourney, setAssessmentJourney] = useState<{ assessmentId: string; courseId: string } | null>(null);
  const [creating, setCreating] = useState<'course' | 'assessment' | null>(null);
  const canAuthor = membership?.role === 'teacher' || membership?.role === 'admin';
  const hasLearning = membership?.entitlements.includes('learning');
  const hasAssessment = membership?.entitlements.includes('assessment');
  const exactPath = intent?.source === 'assessment' && hasAssessment ? `/v1/assessments/${intent.id}` : null;
  const exactScope = `${apiUrl}:${accessToken??''}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessGeneration}:${online}:${status}:${exactPath}:${refresh}`;
  const parseExactAssessment = useCallback((value: unknown) => { const assessment = parseAssessment(value); if (intent?.source !== 'assessment' || assessment.id !== intent.id) throw new LearningApiError('invalid'); return { scope: exactScope, assessment }; }, [exactScope, intent]);
  const exactRead = useApiQuery(exactPath, parseExactAssessment, refresh);
  const exact = { ...exactRead, data: exactRead.data?.scope === exactScope ? exactRead.data.assessment : null };
  const canSeeSubmissions = membership?.role === 'admin' || membership?.role === 'teacher' || membership?.role === 'student';
  const courses = usePaginatedLearningQuery(hasLearning ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const classes = usePaginatedLearningQuery(canAuthor && hasLearning ? '/v1/classes?limit=100' : null, parseChoice, refresh);
  const subjects = usePaginatedLearningQuery(canAuthor && hasLearning ? '/v1/subjects?limit=100' : null, parseChoice, refresh);
  const assessments = usePaginatedLearningQuery(hasAssessment ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const submissions = usePaginatedLearningQuery(hasAssessment && canSeeSubmissions ? '/v1/submissions?limit=100' : null, parseSubmission, refresh);
  const courseChoicesComplete=[courses,classes,subjects].every(query=>query.loaded&&!query.loading&&!query.loadingMore&&!query.error&&!query.moreError&&!query.nextCursor);
  const courseChoices=staffCourseChoices(courses.data,classes.data,subjects.data,courseChoicesComplete,t.courseContextReview);
  function reload() { setRefresh((value) => value + 1); }
  function saved() { setCreating(null); reload(); }
  useEffect(() => {
    if (!returnToCourses.current || courseId || courses.loading) return;
    const frame = requestAnimationFrame(() => { returnToCourses.current = false; const row=document.querySelector<HTMLElement>(`[data-course-choice="${courseBrowseId.current}"] button`);const target=courseOpener.current?.isConnected&&courseOpener.current.matches('button,a,input,select,textarea,[tabindex]')&&!courseOpener.current.matches(':disabled')?courseOpener.current:row??document.querySelector<HTMLElement>('.learning-workspace h1');target?.focus({preventScroll:true});if(target&&document.activeElement!==target){row?.focus({preventScroll:true});if(document.activeElement!==row)document.querySelector<HTMLElement>('.learning-workspace h1')?.focus({preventScroll:true});}target?.scrollIntoView({block:'nearest',behavior:'instant'}); });
    return () => cancelAnimationFrame(frame);
  }, [courseId,courses.loading,courses.data]);
  if (!hasLearning) return <><WorkspacePageHeading title={t.learning}/><WorkspaceState kind="unavailable" icon="learning" description={t.notAvailable} role="status"/></>;
  if(intent?.source==='assessment'&&!hasAssessment)return <section><WorkspacePageHeading title={t.assessments}/><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{t.backCourses}</Button><LearningError error={new LearningApiError('denied')}/></section>;
  if(intent?.source==='course')return <CourseView courseId={intent.id} onBack={()=>window.history.back()} canAuthor={canAuthor}/>;
  if(intent?.source==='assessment'&&assessmentJourney?.assessmentId===intent.id)return <CourseView courseId={assessmentJourney.courseId} onBack={()=>setAssessmentJourney(null)} canAuthor={canAuthor} backLabel={t.backTask}/>;
  if(intent?.source==='assessment')return <section><WorkspacePageHeading title={exact.data ? learningTitle(exact.data.title,t.assessmentUnavailable) : t.assessments} caption={exact.data ? <bdi>{learningTitle(exact.data.courseTitle??'',t.courseUnavailable)}</bdi> : undefined}/><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{t.backCourses}</Button>{exact.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:exact.error?<><LearningError error={exact.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exact.data?<>{membership?.role==='student'?<StudentAssessmentJourneyLink assessment={exact.data} locale={locale} onOpen={courseId=>setAssessmentJourney({assessmentId:exact.data!.id,courseId})}/>:null}<AssessmentList key={intent.id} initiallySelectedId={intent.id} assessments={[exact.data]} submissions={[]} submissionsComplete={false} onSubmitted={reload}/></>:null}</section>;
  if (courseId) return <CourseView courseId={courseId} onBack={() => { if(learningNavigationLocked(commandJournal.pending()))return;returnToCourses.current=true;setCourseId(null); }} canAuthor={canAuthor} />;
  const active = tab === 'courses' ? courses : tab === 'assessments' ? assessments : submissions;
  const needsSubmissionQueue = assessments.data.some(assessment => assessment.currentSubmission === undefined);
  const currentSourceLoading = tab === 'assessments' && membership?.role === 'student' && needsSubmissionQueue && submissions.loading;
  const currentSourceError = tab === 'assessments' && membership?.role === 'student' && needsSubmissionQueue ? submissions.error : null;
  const tabs: Tab[] = ['courses', ...(hasAssessment ? ['assessments' as const] : []), ...(hasAssessment && canSeeSubmissions ? ['submissions' as const] : [])];
  const tabIcons: Record<Tab, CuevoIconName> = { courses: 'learning', assessments: 'assessment', submissions: 'portfolio' };
  return <div className="learning-workspace"><WorkspacePageHeading title={tab==='courses'?t.courseDirectory:tab==='assessments'&&membership?.role==='student'?t.assessmentPath:t[tab]} description={tab==='courses'?t.courseDirectoryBody:tab==='assessments'&&membership?.role==='student'?t.assessmentPathBody:undefined}/><WorkspaceTabs label={t.learning} items={tabs.map(item=>({id:item,label:t[item],icon:tabIcons[item]}))} selected={tab} disabled={navigationLocked} onChange={id=>{if(!learningNavigationLocked(commandJournal.pending())&&tabs.includes(id as Tab)){setTab(id as Tab);setCreating(null);}}} actions={<Button type="button" variant="quiet" onClick={reload}><CuevoIcon name="refresh" size={18} />{t.refresh}</Button>}/>
    {canAuthor ? <div className="learning-actions">{tab === 'courses' ? <Button type="button" disabled={navigationLocked} onClick={() => setCreating('course')}><CuevoIcon name="practice" size={18} />{t.createCourse}</Button> : tab === 'assessments' && hasAssessment ? <Button type="button" disabled={navigationLocked||!courses.data?.length} onClick={() => setCreating('assessment')}><CuevoIcon name="practice" size={18} />{t.createAssessment}</Button> : null}</div> : membership?.role !== 'student' ? <p className="learning-form__note">{t.readOnly}</p> : null}
    {creating === 'course' ? <>{classes.data?.length && subjects.data?.length ? <CreateCourse classes={classes.data} subjects={subjects.data} onSaved={saved} onCancel={() => setCreating(null)} /> : classes.error ? <LearningError error={classes.error} /> : subjects.error ? <LearningError error={subjects.error} /> : <WorkspaceState kind={classes.loading || subjects.loading?'loading':'unavailable'} icon={classes.loading || subjects.loading?'refresh':'help'} description={classes.loading || subjects.loading ? t.loading : t.choicesUnavailable}/>}<LoadMore query={classes} label={t.class}/><LoadMore query={subjects} label={t.subject}/></> : null}
    {creating === 'assessment' ? <>{!courseChoicesComplete?<WorkspaceState kind={courses.loading||classes.loading||subjects.loading?'loading':'review'} icon={courses.loading||classes.loading||subjects.loading?'refresh':'learning'} description={t.courseChoicesLoading}/>:null}{courseChoices.some(choice=>choice.requiresReview)?<WorkspaceState kind="review" icon="help" description={t.courseContextReview}/>:null}{courseChoicesComplete&&courseChoices.some(choice=>!choice.requiresReview)?<CreateAssessment choices={courseChoices.filter(choice=>!choice.requiresReview)} onSaved={saved} onCancel={() => setCreating(null)}/>:null}<LoadMore query={courses} label={t.course}/><LoadMore query={classes} label={t.class}/><LoadMore query={subjects} label={t.subject}/>{courses.error||classes.error||subjects.error?<LearningError error={courses.error??classes.error??subjects.error!}/>:null}</>:null}
    {tab === 'submissions' && canAuthor && hasAssessment && status === 'ready' && online && !!accessToken ? <SubmissionList submissions={submissions.data} currentPage={submissions} onChanged={reload}/> : active.loading || currentSourceLoading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : active.error || currentSourceError ? <LearningError error={(active.error ?? currentSourceError)!} /> : tab === 'courses' ? <CourseList sourceComplete={courses.loaded&&!courses.loadingMore&&!courses.moreError&&!courses.nextCursor} courses={courses.data ?? []} onOpen={id=>{if(learningNavigationLocked(commandJournal.pending()))return;courseOpener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;courseBrowseId.current=id;setCourseId(id);}} contexts={canAuthor?courseChoices:undefined} /> : tab === 'assessments' ? <AssessmentList sourceComplete={assessments.loaded&&!assessments.loadingMore&&!assessments.moreError&&!assessments.nextCursor} pageHeading assessments={(assessments.data ?? []) as Assessment[]} submissions={(submissions.data ?? []) as Submission[]} submissionsComplete={submissions.loaded && !submissions.nextCursor && !submissions.error} onSubmitted={reload} /> : <SubmissionList currentPage={submissions} submissions={submissions.data ?? []} onChanged={reload} />}
    {tab !== 'submissions' || !canAuthor ? <LoadMore query={active} /> : null}{tab === 'assessments' && membership?.role === 'student' && assessments.data.some(item => item.currentSubmission === undefined) && submissions.nextCursor ? <div className="notice"><WorkspaceState kind="unknown" icon="help" description={t.submissionUnknown}/><LoadMore query={submissions} /></div> : null}
  </div>;
}

function CourseList({ courses, onOpen, contexts, sourceComplete = false }: { courses: Course[]; onOpen: (id: string) => void; contexts?:{value:string;label:string;requiresReview:boolean}[];sourceComplete?:boolean }) {
  const { t } = useLearningApi();
  return courses.length ? <section className="learning-directory" aria-label={t.courseDirectory}><ul className="course-list">{courses.map((course) => <li key={course.id} data-course-choice={course.id}><div className="course-list__art"><img src={trailAssets.lesson} width={88} height={88} alt="" aria-hidden="true" /></div><div className="course-list__body"><Status tone={course.status === 'PUBLISHED' ? 'positive' : 'neutral'}>{course.status === 'PUBLISHED' ? t.published : t.draft}</Status><h2><bdi>{learningTitle(course.title, t.courseUnavailable)}</bdi></h2>{contexts?.find(choice=>choice.value===course.id)?<p><bdi>{contexts.find(choice=>choice.value===course.id)!.label}</bdi></p>:null}<p dir="auto">{course.description.trim() || t.descriptionUnavailable}</p></div><Button type="button" variant="secondary" onClick={() => onOpen(course.id)}>{t.start}<CuevoIcon name="arrow" size={20} className="directional-icon" /></Button></li>)}</ul></section> : <WorkspaceState kind={sourceComplete?'empty':'unknown'} icon="learning" description={sourceComplete?t.noCourses:t.courseChoicesLoading}/>;
}
function CreateCourse({ classes, subjects, onSaved, onCancel }: { classes: Choice[]; subjects: Choice[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  return <CommandForm title={t.createCourse} path="/v1/courses" fields={[{ name: 'classId', label: t.class, type: 'select', required: true, options: classes.map((item) => ({ value: item.id, label: choiceLabel(item) })) }, { name: 'subjectId', label: t.subject, type: 'select', required: true, options: subjects.map((item) => ({ value: item.id, label: choiceLabel(item) })) }, { name: 'title', label: t.title, required: true }, { name: 'description', label: t.description, type: 'textarea', maxLength: 4000 }]} body={(values) => ({ classId: String(values.get('classId')), subjectId: String(values.get('subjectId')), title: String(values.get('title')), description: String(values.get('description')) })} onSaved={onSaved} onCancel={onCancel} />;
}
function CreateAssessment({ choices, onSaved, onCancel }: { choices:{value:string;label:string}[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  const [model,setModel]=useState('numeric');
  return <CommandForm title={t.createAssessment} path="/v1/assessments" fields={[{ name: 'courseId', label: t.course, type: 'select', required: true, options: choices }, { name: 'title', label: t.title, required: true },{name:'intendedSubmissionKind',label:t.taskType,type:'select',required:true,defaultValue:'TEXT',options:[{value:'TEXT',label:t.textTask},{value:'QUIZ',label:t.quizQuestions}]},{name:'intendedModel',label:t.assessmentModel,type:'select',required:true,defaultValue:'numeric',options:[{value:'numeric',label:t.numericModel},{value:'rubric',label:t.rubricModel}]}, ...(model==='numeric'?[{ name: 'maxScore', label: t.maxScore, type: 'number'as const, min: 0.01, max: 100000, step: 'any'as const, defaultValue: 10, required: true }]:[]), { name: 'dueAt', label: t.dueAt, type: 'datetime-local' }, { name: 'instructions', label: t.instructions, type: 'textarea', required: true }]} onValuesChange={values=>setModel(String(values.get('intendedModel')||'numeric'))} body={(values) => { const dueAt = String(values.get('dueAt') ?? ''); if(!choices.some(choice=>choice.value===String(values.get('courseId'))))throw new LearningApiError('conflict'); return { courseId: String(values.get('courseId')), title: String(values.get('title')), instructions: String(values.get('instructions')), maxScore:values.get('intendedModel')==='rubric'?10:Number(values.get('maxScore')),preparation:true,intendedSubmissionKind:String(values.get('intendedSubmissionKind')),intendedModel:String(values.get('intendedModel')), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) }; }} onSaved={onSaved} onCancel={onCancel} note={t.preparationNote} />;
}

export function StudentAssessmentJourneyLink({ assessment, locale, onOpen }: { assessment: Assessment; locale: 'en' | 'ar'; onOpen: (courseId: string) => void }) {
  const t = locale === 'ar' ? learningAr : learningEn;
  return <div className="learning-assessment-journey"><p>{t.learningJourneyBody}</p><Button type="button" variant="secondary" onClick={() => onOpen(assessment.courseId)}><CuevoIcon name="learning" size={24}/>{t.openLearningJourney}</Button></div>;
}
