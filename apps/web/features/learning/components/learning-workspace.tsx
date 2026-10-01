'use client';
import { parseList } from '../../../shared/api/responses';


import { useState } from 'react';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { parseChoice, parseCourse, parseAssessment, parseSubmission, type Choice, type Course, type Assessment, type Submission } from '../model';
import { useLearningApi } from '../api';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { CommandForm } from '../../../shared/components/command-form';
import { CourseView } from './course-editor';
import { AssessmentList, SubmissionList } from './assessment-view';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';

const choiceList = (value: unknown) => parseList(value, parseChoice);
type Tab = 'courses' | 'assessments' | 'submissions';

export function LearningWorkspace() {
  const { t } = useLearningApi();
  const { membership } = useApp();
  const [tab, setTab] = useState<Tab>('courses');
  const [refresh, setRefresh] = useState(0);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [creating, setCreating] = useState<'course' | 'assessment' | null>(null);
  const canAuthor = membership?.role === 'teacher' || membership?.role === 'admin';
  const hasLearning = membership?.entitlements.includes('learning');
  const hasAssessment = membership?.entitlements.includes('assessment');
  const canSeeSubmissions = membership?.role === 'admin' || membership?.role === 'teacher' || membership?.role === 'student';
  const courses = usePaginatedLearningQuery(hasLearning ? '/v1/courses?limit=100' : null, parseCourse, refresh);
  const classes = useApiQuery(canAuthor && hasLearning ? '/v1/classes?limit=100' : null, choiceList, refresh);
  const subjects = useApiQuery(canAuthor && hasLearning ? '/v1/subjects?limit=100' : null, choiceList, refresh);
  const assessments = usePaginatedLearningQuery(hasAssessment ? '/v1/assessments?limit=100' : null, parseAssessment, refresh);
  const submissions = usePaginatedLearningQuery(hasAssessment && canSeeSubmissions ? '/v1/submissions?limit=100' : null, parseSubmission, refresh);
  function reload() { setRefresh((value) => value + 1); }
  function saved() { setCreating(null); reload(); }
  if (!hasLearning) return <div className="notice" role="status">{t.notAvailable}</div>;
  if (courseId) return <CourseView courseId={courseId} onBack={() => { setCourseId(null); reload(); }} canAuthor={canAuthor} />;
  const active = tab === 'courses' ? courses : tab === 'assessments' ? assessments : submissions;
  const currentSourceLoading = tab === 'assessments' && membership?.role === 'student' && submissions.loading;
  const currentSourceError = tab === 'assessments' && membership?.role === 'student' ? submissions.error : null;
  const tabs: Tab[] = ['courses', ...(hasAssessment ? ['assessments' as const] : []), ...(hasAssessment && canSeeSubmissions ? ['submissions' as const] : [])];
  return <div className="learning-workspace"><aside className="synthetic-notice"><strong>{t.demoTitle}</strong><p>{t.demoBody}</p></aside><div className="learning-toolbar"><div className="learning-tabs" role="group" aria-label={t.learning}>{tabs.map((item) => <button key={item} type="button" aria-pressed={tab === item} onClick={() => { setTab(item); setCreating(null); }}>{t[item]}</button>)}</div><Button type="button" variant="quiet" onClick={reload}><RefreshCw size={15} aria-hidden="true" />{t.refresh}</Button></div>
    {canAuthor ? <div className="learning-actions">{tab === 'courses' ? <Button type="button" onClick={() => setCreating('course')}><Plus size={16} aria-hidden="true" />{t.createCourse}</Button> : tab === 'assessments' && hasAssessment ? <Button type="button" disabled={!courses.data?.length} onClick={() => setCreating('assessment')}><Plus size={16} aria-hidden="true" />{t.createAssessment}</Button> : null}</div> : <p className="learning-form__note">{membership?.role !== 'student' ? t.readOnly : ''}</p>}
    {creating === 'course' ? classes.data?.length && subjects.data?.length ? <CreateCourse classes={classes.data} subjects={subjects.data} onSaved={saved} onCancel={() => setCreating(null)} /> : classes.error ? <LearningError error={classes.error} /> : subjects.error ? <LearningError error={subjects.error} /> : <p className="notice">{classes.loading || subjects.loading ? t.loading : t.choicesUnavailable}</p> : null}
    {creating === 'assessment' && courses.data ? <CreateAssessment courses={courses.data} onSaved={saved} onCancel={() => setCreating(null)} /> : null}
    {active.loading || currentSourceLoading ? <p className="learning-empty" role="status">{t.loading}</p> : active.error || currentSourceError ? <LearningError error={(active.error ?? currentSourceError)!} /> : tab === 'courses' ? <CourseList courses={courses.data ?? []} onOpen={setCourseId} /> : tab === 'assessments' ? <AssessmentList assessments={(assessments.data ?? []) as Assessment[]} submissions={(submissions.data ?? []) as Submission[]} onSubmitted={reload} /> : <SubmissionList submissions={submissions.data ?? []} onChanged={reload} />}
    <LoadMore query={active} />
  </div>;
}

function CourseList({ courses, onOpen }: { courses: Course[]; onOpen: (id: string) => void }) {
  const { t } = useLearningApi();
  return courses.length ? <ul className="course-list">{courses.map((course) => <li key={course.id}><div><Status tone={course.status === 'PUBLISHED' ? 'positive' : 'neutral'}>{course.status === 'PUBLISHED' ? t.published : t.draft}</Status><h3>{course.title}</h3><p>{course.description}</p></div><Button type="button" variant="secondary" onClick={() => onOpen(course.id)}>{t.start}<ArrowRight size={16} className="directional-icon" aria-hidden="true" /></Button></li>)}</ul> : <p className="learning-empty">{t.noCourses}</p>;
}
function CreateCourse({ classes, subjects, onSaved, onCancel }: { classes: Choice[]; subjects: Choice[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  return <CommandForm title={t.createCourse} path="/v1/courses" fields={[{ name: 'classId', label: t.class, type: 'select', required: true, options: classes.map((item) => ({ value: item.id, label: item.name })) }, { name: 'subjectId', label: t.subject, type: 'select', required: true, options: subjects.map((item) => ({ value: item.id, label: item.name })) }, { name: 'title', label: t.title, required: true }, { name: 'description', label: t.description, type: 'textarea', maxLength: 4000 }]} body={(values) => ({ classId: String(values.get('classId')), subjectId: String(values.get('subjectId')), title: String(values.get('title')), description: String(values.get('description')) })} onSaved={onSaved} onCancel={onCancel} />;
}
function CreateAssessment({ courses, onSaved, onCancel }: { courses: Course[]; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  return <CommandForm title={t.createAssessment} path="/v1/assessments" fields={[{ name: 'courseId', label: t.course, type: 'select', required: true, options: courses.map((course) => ({ value: course.id, label: course.title })) }, { name: 'title', label: t.title, required: true }, { name: 'maxScore', label: t.maxScore, type: 'number', min: 0.01, max: 100000, step: 'any', defaultValue: 10, required: true }, { name: 'dueAt', label: t.dueAt, type: 'datetime-local' }, { name: 'instructions', label: t.instructions, type: 'textarea', required: true }]} body={(values) => { const dueAt = String(values.get('dueAt') ?? ''); return { courseId: String(values.get('courseId')), title: String(values.get('title')), instructions: String(values.get('instructions')), maxScore: Number(values.get('maxScore')), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) }; }} onSaved={onSaved} onCancel={onCancel} note={t.numericNote} />;
}
