'use client';

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { type Activity, type CourseDetail, type Unit, type Lesson, activityKindLabel, activityCompletionState, courseReadingContext, currentActivityCompletion, currentCourseReading, learningTitle } from '../model';
import { useLearningApi } from '../api';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LearningResources } from './resources';
import { LearningContentEditor, ConnectedAssessment } from './content-editor';
import { LearningSourceContext } from './source-context';
import { trailAssets } from '../../../shared/characters/assets';

type Editor = { kind: 'unit' } | { kind: 'lesson'; unit: Unit } | { kind: 'activity'; lesson: Lesson } | { kind: 'publish' } | null;

export function CourseView({ courseId, onBack, canAuthor }: { courseId: string; onBack: () => void; canAuthor: boolean }) {
  const { membership } = useApp();
  return <CurrentCourseView key={`${courseId}:${membership?.schoolId}:${membership?.userId}:${membership?.role}`} courseId={courseId} onBack={onBack} canAuthor={canAuthor} />;
}

function CurrentCourseView({ courseId, onBack, canAuthor }: { courseId: string; onBack: () => void; canAuthor: boolean }) {
  const { t } = useLearningApi();
  const { membership, accessGeneration, online, status } = useApp();
  const student = membership?.role === 'student';
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<Editor>(null);
  const [unitId, setUnitId] = useState<string | null>(null); const [unitCursor, setUnitCursor] = useState<string | null>(null); const [lessonCursor, setLessonCursor] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [activityId, setActivityId] = useState<string | null>(null);
  const parameters = new URLSearchParams({ limit: '10' }); if (unitId) parameters.set('unitId', unitId); if (unitCursor) parameters.set('unitCursor', unitCursor); if (lessonCursor) parameters.set('lessonCursor', lessonCursor);
  const path = `/v1/courses/${courseId}?${parameters}`;
  const readScope = `${membership?.schoolId}:${membership?.userId}:${membership?.role}:${accessGeneration}:${online}:${status}:${path}:${refresh}`;
  const parseCurrentCourse = useCallback((value: unknown) => ({ scope: readScope, course: currentCourseReading(value, courseId, unitId) }), [readScope, courseId, unitId]);
  const read = useApiQuery(path, parseCurrentCourse, refresh);
  const query = { ...read, data: read.data?.scope === readScope ? read.data.course : null };
  const courseRoot = useRef<HTMLDivElement>(null);
  const readerHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusReader = useRef(false);
  const focusedReader = useRef<{ context: string; element: HTMLElement; field?: string; button?: string } | null>(null);
  const restoreReaderFocus = useRef<typeof focusedReader.current>(null);
  const selectionContext = `${courseId}:${lessonId}:${activityId}`;
  useEffect(() => {
    const focused = focusedReader.current;
    if (focused?.context === selectionContext && !focused.element.isConnected && (document.activeElement === document.body || document.activeElement === document.documentElement)) restoreReaderFocus.current = focused;
  }, [readScope, selectionContext]);
  useEffect(() => {
    const restore = restoreReaderFocus.current;
    if (!query.data || query.loading || !restore) return;
    restoreReaderFocus.current = null;
    if (restore.context !== selectionContext || shouldFocusReader.current || document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    const candidates = Array.from(courseRoot.current?.querySelectorAll<HTMLElement>('.lesson-section input, .lesson-section textarea, .lesson-section select, .lesson-section button') ?? []);
    const target = candidates.find(element => restore.field ? element.getAttribute('name') === restore.field : restore.button ? element.tagName === 'BUTTON' && (element.getAttribute('aria-label') || element.textContent?.trim()) === restore.button : false);
    (target && !target.matches(':disabled') ? target : readerHeading.current)?.focus();
  }, [query.data, query.loading, selectionContext]);
  useEffect(() => { if ((query.data || query.error) && !query.loading && shouldFocusReader.current && readerHeading.current) { readerHeading.current.focus(); shouldFocusReader.current = false; } }, [query.data, query.error, query.loading, lessonId, activityId]);
  function saved() { setEditor(null); setRefresh((value) => value + 1); }
  function resetReading() { shouldFocusReader.current = true; setLessonId(null); setActivityId(null); }
  const context = query.data ? courseReadingContext(query.data, lessonId, activityId) : null;
  const course = query.data;
  return <div ref={courseRoot} onFocusCapture={event => { const element = event.target as HTMLElement; focusedReader.current = element.closest('.lesson-section') ? { context: selectionContext, element, field: element.getAttribute('name') ?? undefined, button: element.tagName === 'BUTTON' ? element.getAttribute('aria-label') || element.textContent?.trim() : undefined } : null; }} className={`course-view ${student ? 'course-view--student' : ''} ${student && context?.lesson ? 'course-view--reading' : ''}`}><div className="course-view__toolbar"><Button type="button" variant="quiet" onClick={onBack}><CuevoIcon name="arrow" size={18} className="directional-icon learning-back-icon" />{t.backCourses}</Button><Button type="button" variant="quiet" onClick={saved}><CuevoIcon name="refresh" size={18} />{t.refresh}</Button></div>{query.loading || !query.error && !course ? <p role="status" className="learning-empty">{t.loading}</p> : query.error ? <><h3 ref={readerHeading} tabIndex={-1}>{t.course}</h3><LearningError error={query.error} /></> : course ? <>
    <nav className="learning-breadcrumb" aria-label={t.learningPath}><ol><li>{t.courses}</li><li><bdi>{learningTitle(course.title, t.courseUnavailable)}</bdi></li>{student && context?.unit ? <li><bdi>{learningTitle(context.unit.title, t.unitUnavailable)}</bdi></li> : null}{student && context?.lesson ? <li aria-current={context.activity ? undefined : 'page'}><bdi>{learningTitle(context.lesson.title, t.lessonUnavailable)}</bdi></li> : null}{student && context?.activity ? <li aria-current="page"><bdi>{learningTitle(context.activity.title, t.activityUnavailable)}</bdi></li> : null}</ol></nav>
    <div className="course-heading"><img src={trailAssets.lesson} width={88} height={88} alt="" aria-hidden="true" /><div><p className="eyebrow">{t.course}</p><h2><bdi>{learningTitle(course.title, t.courseUnavailable)}</bdi></h2><p dir="auto">{course.description.trim() || t.descriptionUnavailable}</p></div><Status tone={course.status === 'PUBLISHED' ? 'positive' : 'neutral'}>{course.status === 'PUBLISHED' ? t.published : t.draft}</Status></div>
    {canAuthor ? <LearningContentEditor resource="course" sourceId={courseId} courseId={courseId} onChanged={saved} /> : null}
    {canAuthor ? <div className="learning-actions"><Button type="button" variant="secondary" onClick={() => setEditor({ kind: 'unit' })}><CuevoIcon name="practice" size={18} />{t.createUnit}</Button>{course.status === 'DRAFT' ? <Button type="button" onClick={() => setEditor({ kind: 'publish' })}>{t.publish}</Button> : null}</div> : null}
    {editor ? <EditorForm key={`${editor.kind}-${editor.kind === 'lesson' ? editor.unit.id : editor.kind === 'activity' ? editor.lesson.id : courseId}`} editor={editor} course={course} onSaved={saved} onCancel={() => setEditor(null)} /> : null}
    {course.units.length ? <div className={student ? 'learning-course-layout' : 'unit-list'}>
      {student ? <details className="learning-unit-directory" key={context?.lesson ? 'reading-units' : 'course-units'} open={context?.lesson ? undefined : true}><summary>{t.unitsInCourse}</summary><ul>{course.units.map(unit => <li key={unit.id}><button type="button" aria-current={context?.unit?.id === unit.id ? 'step' : undefined} onClick={() => { setUnitId(unit.id); setLessonCursor(null); resetReading(); }}><CuevoIcon name="curriculum" size={22} variant="filled" /><span><bdi>{learningTitle(unit.title, t.unitUnavailable)}</bdi>{context?.unit?.id === unit.id ? <small>{t.selectedUnit}</small> : null}</span><CuevoIcon name="arrow" size={18} className="directional-icon" /></button></li>)}</ul></details> : null}
      <div className="learning-course-content">{(student ? context?.unit ? [context.unit] : [] : course.units).map((unit) => <section className="unit-section" key={unit.id}>
        <div className="learning-section-heading"><div>{student ? <p className="eyebrow">{t.unit}</p> : null}<h3><bdi>{learningTitle(unit.title, t.unitUnavailable)}</bdi></h3></div><div className="learning-actions">{course.selectedUnitId && course.selectedUnitId !== unit.id ? <Button type="button" variant="secondary" onClick={() => { setUnitId(unit.id); setLessonCursor(null); resetReading(); }}>{t.openUnit}</Button> : null}{canAuthor ? <Button type="button" variant="quiet" onClick={() => setEditor({ kind: 'lesson', unit })}><CuevoIcon name="practice" size={18} />{t.createLesson}</Button> : null}</div></div>
        {canAuthor ? <LearningContentEditor resource="unit" sourceId={unit.id} courseId={courseId} onChanged={saved} /> : null}
        {unit.lessons.length ? student ? context?.lesson ? <>{!context.activity ? <Button type="button" variant="quiet" onClick={resetReading}><CuevoIcon name="arrow" size={18} className="directional-icon learning-back-icon" />{t.closeLesson}</Button> : null}<LessonView key={`${context.lesson.id}:${context.lesson.contentRevision ?? 'legacy'}`} courseId={courseId} lesson={context.lesson} canAuthor={canAuthor} coursePublished={course.status === 'PUBLISHED'} onChanged={saved} onAdd={() => setEditor({ kind: 'activity', lesson: context.lesson! })} activityId={context.activity?.id ?? null} onOpenActivity={id => { shouldFocusReader.current = true; setActivityId(id); }} headingRef={readerHeading} /></> : <LessonDirectory lessons={unit.lessons} headingRef={readerHeading} onOpen={id => { shouldFocusReader.current = true; setLessonId(id); setActivityId(null); }} /> : unit.lessons.map((lesson) => <LessonView key={`${lesson.id}:${lesson.contentRevision ?? 'legacy'}`} courseId={courseId} lesson={lesson} canAuthor={canAuthor} coursePublished={course.status === 'PUBLISHED'} onChanged={saved} onAdd={() => setEditor({ kind: 'activity', lesson })} />) : course.selectedUnitId === unit.id || !course.selectedUnitId ? <p className="learning-empty">{t.noLessons}</p> : null}
      </section>)}{student && !context?.unit ? <p className="notice" role="status">{t.unitSelectionUnavailable}</p> : null}
      <div className="learning-actions learning-course-pagination">{course.nextLessonCursor ? <Button type="button" variant="secondary" onClick={() => { setUnitId(course.selectedUnitId ?? null); setLessonCursor(course.nextLessonCursor ?? null); resetReading(); }}>{t.nextLessons}</Button> : null}{lessonCursor ? <Button type="button" variant="quiet" onClick={() => { setLessonCursor(null); resetReading(); }}>{t.firstLessons}</Button> : null}{course.nextUnitCursor ? <Button type="button" variant="secondary" onClick={() => { setUnitId(null); setLessonCursor(null); setUnitCursor(course.nextUnitCursor ?? null); resetReading(); }}>{t.nextUnits}</Button> : null}{unitCursor ? <Button type="button" variant="quiet" onClick={() => { setUnitId(null); setUnitCursor(null); setLessonCursor(null); resetReading(); }}>{t.firstUnits}</Button> : null}</div></div>
    </div> : <p className="learning-empty">{t.noUnits}</p>}
  </> : null}</div>;
}

function EditorForm({ editor, course, onSaved, onCancel }: { editor: NonNullable<Editor>; course: CourseDetail; onSaved: () => void; onCancel: () => void }) {
  const { t } = useLearningApi();
  const titleField: FormField = { name: 'title', label: t.title, required: true, maxLength: 200 };
  const sequenceField: FormField = { name: 'sequence', label: t.sequence, type: 'number', required: true, min: 1, max: 10000, defaultValue: editor.kind === 'unit' ? course.nextUnitSequence ?? course.units.length + 1 : editor.kind === 'lesson' ? editor.unit.nextLessonSequence ?? editor.unit.lessons.length + 1 : editor.kind === 'activity' ? editor.lesson.activities.length + 1 : 1 };
  if (editor.kind === 'publish') return <CommandForm title={t.publish} path={`/v1/courses/${course.id}/publish`} fields={[]} body={() => ({})} onSaved={onSaved} onCancel={onCancel} note={t.publishNote} actionLabel={t.publish} />;
  if (editor.kind === 'unit') return <CommandForm title={t.createUnit} path={`/v1/courses/${course.id}/units`} fields={[titleField, sequenceField]} body={(values) => ({ preparation:true,title: String(values.get('title')), sequence: Number(values.get('sequence')) })} onSaved={onSaved} onCancel={onCancel} />;
  if (editor.kind === 'lesson') return <CommandForm title={t.createLesson} path={`/v1/units/${editor.unit.id}/lessons`} fields={[titleField, sequenceField, { name: 'body', label: t.body, type: 'textarea', required: true }]} body={(values) => ({ preparation:true,title: String(values.get('title')), sequence: Number(values.get('sequence')), body: String(values.get('body')) })} onSaved={onSaved} onCancel={onCancel} />;
  return <CommandForm title={t.createActivity} path={`/v1/lessons/${editor.lesson.id}/activities`} fields={[titleField, sequenceField, { name: 'kind', label: t.kind, type: 'select', required: true, options: Object.entries(t.kinds).map(([value, label]) => ({ value, label })) }, { name: 'instructions', label: t.instructions, type: 'textarea', required: true }]} body={(values) => ({ preparation:true,title: String(values.get('title')), sequence: Number(values.get('sequence')), kind: String(values.get('kind')), instructions: String(values.get('instructions')) })} onSaved={onSaved} onCancel={onCancel} />;
}

function LessonDirectory({ lessons, onOpen, headingRef }: { lessons: Lesson[]; onOpen: (id: string) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { t } = useLearningApi();
  return <div className="learning-lesson-directory"><div className="learning-reading-intro"><img src={trailAssets.lesson} width={104} height={104} alt="" aria-hidden="true" /><div><h4 ref={headingRef} tabIndex={-1}>{t.chooseReading}</h4><p>{t.chooseReadingBody}</p></div></div><h4>{t.lessonsInUnit}</h4><ol>{lessons.map(lesson => <li key={lesson.id}><div><p className="eyebrow">{t.lesson} <bdi>{lesson.sequence}</bdi></p><h5><bdi>{learningTitle(lesson.title, t.lessonUnavailable)}</bdi></h5></div><Button type="button" variant="secondary" aria-label={`${t.openLesson}: ${learningTitle(lesson.title, t.lessonUnavailable)}`} onClick={() => onOpen(lesson.id)}>{t.openLesson}<CuevoIcon name="arrow" size={20} className="directional-icon" /></Button></li>)}</ol></div>;
}

function LessonView({ courseId, lesson, canAuthor, onAdd, coursePublished, onChanged, activityId = null, onOpenActivity, headingRef }: { courseId: string; lesson: Lesson; canAuthor: boolean; onAdd: () => void; coursePublished: boolean; onChanged: () => void; activityId?: string | null; onOpenActivity?: (id: string | null) => void; headingRef?: Ref<HTMLHeadingElement> }) {
  const { t } = useLearningApi();
  const { membership } = useApp();
  const student = membership?.role === 'student';
  const selectedActivity = student ? lesson.activities.find(activity => activity.id === activityId) ?? null : null;
  const activities = student ? selectedActivity ? [selectedActivity] : [] : lesson.activities;
  return <article className="lesson-section">{!selectedActivity ? <div className="learning-section-heading"><div><p className="eyebrow">{t.lessonMaterial}</p><h4 ref={headingRef} tabIndex={-1}><bdi>{learningTitle(lesson.title, t.lessonUnavailable)}</bdi></h4></div>{canAuthor ? <Button type="button" variant="quiet" onClick={onAdd}><CuevoIcon name="practice" size={18} />{t.createActivity}</Button> : null}</div> : null}
    {selectedActivity ? <><p className="learning-reader-context"><CuevoIcon name="learning" size={20} variant="filled" /><bdi>{learningTitle(lesson.title, t.lessonUnavailable)}</bdi></p><Button type="button" variant="quiet" onClick={() => onOpenActivity?.(null)}><CuevoIcon name="arrow" size={18} className="directional-icon learning-back-icon" />{t.closeActivity}</Button></> : <><div className="lesson-content" dir="auto">{lesson.body.trim() || t.contentUnavailable}</div>{canAuthor ? <LearningContentEditor resource="lesson" sourceId={lesson.id} courseId={courseId} onChanged={onChanged} /> : null}<LearningResources courseId={courseId} targetKind="lesson" targetId={lesson.id} canManage={canAuthor} labelContext={learningTitle(lesson.title, t.lessonUnavailable)} /></>}
    {student && !selectedActivity && lesson.activities.length ? <section className="learning-activity-directory"><h4>{t.activitiesInLesson}</h4><ol>{lesson.activities.map(activity => <li key={activity.id}><CuevoIcon name={activity.kind === 'reflection' ? 'reflection' : activity.kind === 'reading' ? 'learning' : activity.assessmentId ? 'assessment' : 'practice'} size={26} variant="filled" /><div><p className="eyebrow">{activityKindLabel(activity.kind, t.kinds, t.kindUnavailable)}</p><h5><bdi>{learningTitle(activity.title, t.activityUnavailable)}</bdi></h5>{activityCompletionState(activity) === 'confirmed' ? <Status tone="positive"><CuevoIcon name="check" size={16} />{t.completed}</Status> : null}</div><Button type="button" variant="secondary" aria-label={`${t.openActivity}: ${learningTitle(activity.title, t.activityUnavailable)}`} onClick={() => onOpenActivity?.(activity.id)}>{t.openActivity}<CuevoIcon name="arrow" size={18} className="directional-icon" /></Button></li>)}</ol></section> : null}
    {activities.length ? <div className="activity-list">{activities.map(activity => <ActivityView key={`${activity.id}:${activity.contentRevision ?? 'legacy'}:${activity.completion?.id ?? 'unconfirmed'}`} courseId={courseId} activity={activity} canAuthor={canAuthor} coursePublished={coursePublished} onChanged={onChanged} studentReading={student} headingRef={student ? headingRef : undefined} />)}</div> : !lesson.activities.length ? <p className="learning-empty">{t.noActivities}</p> : null}
  </article>;
}

function ActivityView({ courseId, activity, canAuthor, coursePublished, onChanged, studentReading, headingRef }: { courseId: string; activity: Activity; canAuthor: boolean; coursePublished: boolean; onChanged: () => void; studentReading: boolean; headingRef?: Ref<HTMLHeadingElement> }) {
  const { t } = useLearningApi();
  const { membership } = useApp();
  const [completion, setCompletion] = useState(activity.completion);
  return <section className="activity-section"><p className="eyebrow">{activityKindLabel(activity.kind, t.kinds, t.kindUnavailable)}</p><h4 ref={headingRef} tabIndex={studentReading ? -1 : undefined}><bdi>{learningTitle(activity.title, t.activityUnavailable)}</bdi></h4><div className="lesson-content" dir="auto">{activity.instructions.trim() || t.instructionsUnavailable}</div>{canAuthor ? <LearningContentEditor resource="activity" sourceId={activity.id} courseId={courseId} onChanged={onChanged} /> : null}<LearningResources courseId={courseId} targetKind="activity" targetId={activity.id} canManage={canAuthor} labelContext={learningTitle(activity.title, t.activityUnavailable)} />{activity.assessmentId ? <ConnectedAssessment activityId={activity.id} /> : null}{completion ? <LearningSourceContext type="completion" sourceId={completion.id} /> : null}
    {membership?.role === 'student' && coursePublished && !activity.assessmentId ? completion ? <Status tone="positive"><CuevoIcon name="check" size={18} />{t.completed}</Status> : <><p className="learning-form__note">{activityCompletionState(activity) === 'unknown' ? t.completionUnknown : t.completionNotRecorded}</p><CommandForm title={t.complete} path={`/v1/activities/${activity.id}/complete`} fields={[{ name: 'reflection', label: t.reflection, type: 'textarea', maxLength: 5000 }]} body={(values) => { const reflection = String(values.get('reflection') ?? '').trim(); return reflection ? { reflection } : {}; }} actionLabel={t.complete} note={t.completionNote} onSaved={value => { setCompletion(currentActivityCompletion(value, activity.id, membership.userId)); onChanged(); }} /></> : null}
  </section>;
}
