'use client';

import { useState } from 'react';
import { Plus, ArrowLeft } from 'lucide-react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { type CourseDetail, type Unit, type Lesson, parseCourseDetail } from '../model';
import { useLearningApi } from '../api';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';

type Editor = { kind: 'unit' } | { kind: 'lesson'; unit: Unit } | { kind: 'activity'; lesson: Lesson } | { kind: 'publish' } | null;

export function CourseView({ courseId, onBack, canAuthor }: { courseId: string; onBack: () => void; canAuthor: boolean }) {
  const { t } = useLearningApi();
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Editor>(null);
  const query = useApiQuery(`/v1/courses/${courseId}`, parseCourseDetail, refresh);
  function saved() { setEditor(null); setRefresh((value) => value + 1); }
  return <div className="course-view"><Button type="button" variant="quiet" onClick={onBack}><ArrowLeft size={16} className="directional-icon" aria-hidden="true" />{t.backCourses}</Button>{query.loading ? <p role="status" className="learning-empty">{t.loading}</p> : query.error ? <LearningError error={query.error} /> : query.data ? <>
    <div className="learning-section-heading"><div><h2>{query.data.title}</h2><p>{query.data.description}</p></div><Status tone={query.data.status === 'PUBLISHED' ? 'positive' : 'neutral'}>{query.data.status === 'PUBLISHED' ? t.published : t.draft}</Status></div>
    {canAuthor ? <div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setEditor({ kind: 'unit' })}><Plus size={16} aria-hidden="true" />{t.createUnit}</Button>{query.data.status === 'DRAFT' ? <Button type="button" onClick={() => setEditor({ kind: 'publish' })}>{t.publish}</Button> : null}</div> : null}
    {editor ? <EditorForm key={`${editor.kind}-${editor.kind === 'lesson' ? editor.unit.id : editor.kind === 'activity' ? editor.lesson.id : courseId}`} editor={editor} course={query.data} onSaved={saved} onCancel={() => setEditor(null)} /> : null}
    {query.data.units.length ? <div className="unit-list">{query.data.units.map((unit) => <section className="unit-section" key={unit.id}><div className="learning-section-heading"><h3>{unit.title}</h3>{canAuthor ? <Button type="button" variant="quiet" onClick={() => setEditor({ kind: 'lesson', unit })}><Plus size={15} aria-hidden="true" />{t.createLesson}</Button> : null}</div>{unit.lessons.length ? unit.lessons.map((lesson) => <LessonView key={lesson.id} lesson={lesson} canAuthor={canAuthor} coursePublished={query.data!.status === 'PUBLISHED'} onAdd={() => setEditor({ kind: 'activity', lesson })} />) : <p className="learning-empty">{t.noLessons}</p>}</section>)}</div> : <p className="learning-empty">{t.noUnits}</p>}
  </> : null}</div>;
}

function EditorForm({ editor, course, onSaved, onCancel }: { editor: NonNullable<Editor>; course: CourseDetail; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  const titleField: FormField = { name: 'title', label: t.title, required: true, maxLength: 200 };
  const sequenceField: FormField = { name: 'sequence', label: t.sequence, type: 'number', required: true, min: 1, max: 10000, defaultValue: editor.kind === 'unit' ? course.units.length + 1 : editor.kind === 'lesson' ? editor.unit.lessons.length + 1 : editor.kind === 'activity' ? editor.lesson.activities.length + 1 : 1 };
  if (editor.kind === 'publish') return <CommandForm title={t.publish} path={`/v1/courses/${course.id}/publish`} fields={[]} body={() => ({})} onSaved={onSaved} onCancel={onCancel} note={t.publishNote} actionLabel={t.publish} />;
  if (editor.kind === 'unit') return <CommandForm title={t.createUnit} path={`/v1/courses/${course.id}/units`} fields={[titleField, sequenceField]} body={(values) => ({ title: String(values.get('title')), sequence: Number(values.get('sequence')) })} onSaved={onSaved} onCancel={onCancel} />;
  if (editor.kind === 'lesson') return <CommandForm title={t.createLesson} path={`/v1/units/${editor.unit.id}/lessons`} fields={[titleField, sequenceField, { name: 'body', label: t.body, type: 'textarea', required: true }]} body={(values) => ({ title: String(values.get('title')), sequence: Number(values.get('sequence')), body: String(values.get('body')) })} onSaved={onSaved} onCancel={onCancel} />;
  return <CommandForm title={t.createActivity} path={`/v1/lessons/${editor.lesson.id}/activities`} fields={[titleField, sequenceField, { name: 'kind', label: t.kind, type: 'select', required: true, options: Object.entries(t.kinds).map(([value, label]) => ({ value, label })) }, { name: 'instructions', label: t.instructions, type: 'textarea', required: true }]} body={(values) => ({ title: String(values.get('title')), sequence: Number(values.get('sequence')), kind: String(values.get('kind')), instructions: String(values.get('instructions')) })} onSaved={onSaved} onCancel={onCancel} />;
}

function LessonView({ lesson, canAuthor, onAdd, coursePublished }: { lesson: Lesson; canAuthor: boolean; onAdd: () => void; coursePublished: boolean }) {
  const { t } = useLearningApi();
  const { membership } = useApp();
  const [completed, setCompleted] = useState<string[]>([]);
  return <article className="lesson-section"><div className="learning-section-heading"><h4>{lesson.title}</h4>{canAuthor ? <Button type="button" variant="quiet" onClick={onAdd}><Plus size={15} aria-hidden="true" />{t.createActivity}</Button> : null}</div><div className="lesson-content">{lesson.body}</div>{lesson.activities.length ? <div className="activity-list">{lesson.activities.map((activity) => <section className="activity-section" key={activity.id}><p className="eyebrow">{activity.kind in t.kinds ? t.kinds[activity.kind as keyof typeof t.kinds] : activity.kind}</p><h5>{activity.title}</h5><p className="lesson-content">{activity.instructions}</p>{membership?.role === 'student' && coursePublished ? completed.includes(activity.id) ? <Status tone="positive">{t.completed}</Status> : <CommandForm title={t.complete} path={`/v1/activities/${activity.id}/complete`} fields={[{ name: 'reflection', label: t.reflection, type: 'textarea', maxLength: 5000 }]} body={(values) => { const reflection = String(values.get('reflection') ?? '').trim(); return reflection ? { reflection } : {}; }} actionLabel={t.complete} onSaved={() => setCompleted((value) => [...value, activity.id])} /> : null}</section>)}</div> : <p className="learning-empty">{t.noActivities}</p>}</article>;
}
