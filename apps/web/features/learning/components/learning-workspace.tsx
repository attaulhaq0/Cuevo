'use client';


import { useState } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseChoice,choiceLabel, learningTitle, parseCourse, parseAssessment, parseSubmission, type Choice, type Course, type Assessment, type Submission } from '../model';
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

type Tab = 'courses' | 'assessments' | 'submissions';

export function LearningWorkspace({intent}:{intent?:Extract<NavigationIntent,{view:'learning'}>|null}={}) {
  const { t } = useLearningApi();
  const { membership } = useApp();
  const [tab, setTab] = useState<Tab>('courses');
  const [refresh, setRefresh] = useState(0);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [creating, setCreating] = useState<'course' | 'assessment' | null>(null);
  const canAuthor = membership?.role === 'teacher' || membership?.role === 'admin';
  const hasLearning = membership?.entitlements.includes('learning');
  const hasAssessment = membership?.entitlements.includes('assessment');
  const exact=useApiQuery(intent?.source==='assessment'&&hasAssessment?`/v1/assessments/${intent.id}`:null,parseAssessment,refresh);
  const canSeeSubmissions = membership?.role === 'admin' || membership?.role === 'teacher' || membership?.role === 'student';
  const courses = usePaginatedLearningQuery(hasLearning ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const classes = usePaginatedLearningQuery(canAuthor && hasLearning ? '/v1/classes?limit=100' : null, parseChoice, refresh);
  const subjects = usePaginatedLearningQuery(canAuthor && hasLearning ? '/v1/subjects?limit=100' : null, parseChoice, refresh);
  const assessments = usePaginatedLearningQuery(hasAssessment ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const submissions = usePaginatedLearningQuery(hasAssessment && canSeeSubmissions ? '/v1/submissions?limit=100' : null, parseSubmission, refresh);
  function reload() { setRefresh((value) => value + 1); }
  function saved() { setCreating(null); reload(); }
  if (!hasLearning) return <div className="notice" role="status">{t.notAvailable}</div>;
  if(intent?.source==='assessment'&&!hasAssessment)return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{t.backCourses}</Button><LearningError error={new LearningApiError('denied')}/></section>;
  if(intent?.source==='course')return <CourseView courseId={intent.id} onBack={()=>window.history.back()} canAuthor={canAuthor}/>;
  if(intent?.source==='assessment')return <section><Button type="button" variant="quiet" onClick={()=>window.history.back()}>{t.backCourses}</Button>{exact.loading?<p role="status">{t.loading}</p>:exact.error?<><LearningError error={exact.error}/><Button type="button" onClick={reload}>{t.refresh}</Button></>:exact.data?<AssessmentList initiallySelectedId={intent.id} assessments={[exact.data]} submissions={[]} submissionsComplete={false} onSubmitted={reload}/>:null}</section>;
  if (courseId) return <CourseView courseId={courseId} onBack={() => { setCourseId(null); reload(); }} canAuthor={canAuthor} />;
  const active = tab === 'courses' ? courses : tab === 'assessments' ? assessments : submissions;
  const needsSubmissionQueue = assessments.data.some(assessment => assessment.currentSubmission === undefined);
  const currentSourceLoading = tab === 'assessments' && membership?.role === 'student' && needsSubmissionQueue && submissions.loading;
  const currentSourceError = tab === 'assessments' && membership?.role === 'student' && needsSubmissionQueue ? submissions.error : null;
  const tabs: Tab[] = ['courses', ...(hasAssessment ? ['assessments' as const] : []), ...(hasAssessment && canSeeSubmissions ? ['submissions' as const] : [])];
  return <div className="learning-workspace">{membership?.role === 'student' && tab === 'courses' ? <div className="learning-path-heading"><div><p className="eyebrow">{t.learningPath}</p><p className="learning-path-heading__body">{t.learningPathBody}</p></div><img src={trailAssets.lesson} width={112} height={112} alt="" aria-hidden="true" /></div> : null}<aside className="synthetic-notice"><strong>{t.demoTitle}</strong><p>{t.demoBody}</p></aside><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.learning}>{tabs.map((item) => <button key={item} type="button" aria-pressed={tab === item} onClick={() => { setTab(item); setCreating(null); }}>{t[item]}</button>)}</div><Button type="button" variant="quiet" onClick={reload}><CuevoIcon name="refresh" size={18} />{t.refresh}</Button></div>
    {canAuthor ? <div className="learning-actions">{tab === 'courses' ? <Button type="button" onClick={() => setCreating('course')}><CuevoIcon name="practice" size={18} />{t.createCourse}</Button> : tab === 'assessments' && hasAssessment ? <Button type="button" disabled={!courses.data?.length} onClick={() => setCreating('assessment')}><CuevoIcon name="practice" size={18} />{t.createAssessment}</Button> : null}</div> : membership?.role !== 'student' ? <p className="learning-form__note">{t.readOnly}</p> : null}
    {creating === 'course' ? <>{classes.data?.length && subjects.data?.length ? <CreateCourse classes={classes.data} subjects={subjects.data} onSaved={saved} onCancel={() => setCreating(null)} /> : classes.error ? <LearningError error={classes.error} /> : subjects.error ? <LearningError error={subjects.error} /> : <p className="notice">{classes.loading || subjects.loading ? t.loading : t.choicesUnavailable}</p>}<LoadMore query={classes} label={t.class}/><LoadMore query={subjects} label={t.subject}/></> : null}
    {creating === 'assessment' && courses.data ? <CreateAssessment courses={courses.data} onSaved={saved} onCancel={() => setCreating(null)} /> : null}
    {active.loading || currentSourceLoading ? <p className="learning-empty" role="status">{t.loading}</p> : active.error || currentSourceError ? <LearningError error={(active.error ?? currentSourceError)!} /> : tab === 'courses' ? <CourseList courses={courses.data ?? []} onOpen={setCourseId} /> : tab === 'assessments' ? <AssessmentList assessments={(assessments.data ?? []) as Assessment[]} submissions={(submissions.data ?? []) as Submission[]} submissionsComplete={submissions.loaded && !submissions.nextCursor && !submissions.error} onSubmitted={reload} /> : <SubmissionList submissions={submissions.data ?? []} onChanged={reload} />}
    <LoadMore query={active} />{tab === 'assessments' && membership?.role === 'student' && assessments.data.some(item => item.currentSubmission === undefined) && submissions.nextCursor ? <div className="notice"><p>{t.submissionUnknown}</p><LoadMore query={submissions} /></div> : null}
  </div>;
}

function CourseList({ courses, onOpen }: { courses: Course[]; onOpen: (id: string) => void }) {
  const { t } = useLearningApi();
  return courses.length ? <section className="learning-directory" aria-label={t.courseDirectory}><div className="learning-directory__heading"><h2>{t.courseDirectory}</h2><p>{t.courseDirectoryBody}</p></div><ul className="course-list">{courses.map((course) => <li key={course.id}><div className="course-list__art"><img src={trailAssets.lesson} width={88} height={88} alt="" aria-hidden="true" /></div><div className="course-list__body"><Status tone={course.status === 'PUBLISHED' ? 'positive' : 'neutral'}>{course.status === 'PUBLISHED' ? t.published : t.draft}</Status><h3><bdi>{learningTitle(course.title, t.courseUnavailable)}</bdi></h3><p dir="auto">{course.description.trim() || t.descriptionUnavailable}</p></div><Button type="button" variant="secondary" onClick={() => onOpen(course.id)}>{t.start}<CuevoIcon name="arrow" size={20} className="directional-icon" /></Button></li>)}</ul></section> : <p className="learning-empty">{t.noCourses}</p>;
}
function CreateCourse({ classes, subjects, onSaved, onCancel }: { classes: Choice[]; subjects: Choice[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  return <CommandForm title={t.createCourse} path="/v1/courses" fields={[{ name: 'classId', label: t.class, type: 'select', required: true, options: classes.map((item) => ({ value: item.id, label: choiceLabel(item) })) }, { name: 'subjectId', label: t.subject, type: 'select', required: true, options: subjects.map((item) => ({ value: item.id, label: choiceLabel(item) })) }, { name: 'title', label: t.title, required: true }, { name: 'description', label: t.description, type: 'textarea', maxLength: 4000 }]} body={(values) => ({ classId: String(values.get('classId')), subjectId: String(values.get('subjectId')), title: String(values.get('title')), description: String(values.get('description')) })} onSaved={onSaved} onCancel={onCancel} />;
}
function CreateAssessment({ courses, onSaved, onCancel }: { courses: Course[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  const [model,setModel]=useState('numeric');
  return <CommandForm title={t.createAssessment} path="/v1/assessments" fields={[{ name: 'courseId', label: t.course, type: 'select', required: true, options: courses.map((course) => ({ value: course.id, label: course.title })) }, { name: 'title', label: t.title, required: true },{name:'intendedSubmissionKind',label:t.taskType,type:'select',required:true,defaultValue:'TEXT',options:[{value:'TEXT',label:t.textTask},{value:'QUIZ',label:t.quizQuestions}]},{name:'intendedModel',label:t.assessmentModel,type:'select',required:true,defaultValue:'numeric',options:[{value:'numeric',label:t.numericModel},{value:'rubric',label:t.rubricModel}]}, ...(model==='numeric'?[{ name: 'maxScore', label: t.maxScore, type: 'number'as const, min: 0.01, max: 100000, step: 'any'as const, defaultValue: 10, required: true }]:[]), { name: 'dueAt', label: t.dueAt, type: 'datetime-local' }, { name: 'instructions', label: t.instructions, type: 'textarea', required: true }]} onValuesChange={values=>setModel(String(values.get('intendedModel')||'numeric'))} body={(values) => { const dueAt = String(values.get('dueAt') ?? ''); return { courseId: String(values.get('courseId')), title: String(values.get('title')), instructions: String(values.get('instructions')), maxScore:values.get('intendedModel')==='rubric'?10:Number(values.get('maxScore')),preparation:true,intendedSubmissionKind:String(values.get('intendedSubmissionKind')),intendedModel:String(values.get('intendedModel')), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) }; }} onSaved={onSaved} onCancel={onCancel} note={t.preparationNote} />;
}
