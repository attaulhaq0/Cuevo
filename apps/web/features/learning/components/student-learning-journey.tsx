'use client';
import { useCallback, useRef, useState, type ReactNode, type Ref } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { parseLearnerReleasedResult } from '../../academic/model';
import { journeySelection, journeyTaskContext, journeyFeedbackRows, parseJourneyTask, type JourneyState } from '../student-journey-model';
import { studentJourneyEn, studentJourneyAr } from '../student-journey-messages';
import { learningTitle, type Activity, type Lesson } from '../model';
import { useLearningApi } from '../api';
import { LearningResources } from './resources';
import { ThinkingFocusSummary } from './thinking-focus';
import { trailAssets } from '../../../shared/characters/assets';
import { AssessmentList } from './assessment-view';
type Props = { lesson: Lesson; courseId: string; courseTitle?: string; activityId: string | null; onSelect: (id: string | null) => void; renderWork: (activity: Activity) => ReactNode; headingRef?: Ref<HTMLHeadingElement> };
export function StudentLearningJourney(props: Props) {
  const app = useApp();
  return <CurrentStudentLearningJourney key={`${app.membership?.schoolId}:${app.membership?.userId}:${app.accessGeneration}:${app.locale}:${props.lesson.id}:${props.lesson.contentRevision ?? 'legacy'}`} {...props}/>;
}
function CurrentStudentLearningJourney({ lesson, courseId, courseTitle, activityId, onSelect, renderWork, headingRef }: Props) {
  const { locale, membership, apiUrl, accessToken, accessGeneration, online, status } = useApp(); const { t: learning } = useLearningApi();
  const t = locale === 'ar' ? studentJourneyAr : studentJourneyEn;
  const selected = journeySelection(lesson, activityId);
  const [opened, setOpened] = useState<string | null>(null), [refresh, setRefresh] = useState(0), [chooserOpen, setChooserOpen] = useState(false);
  const ready = status === 'ready' && online && membership?.role === 'student';
  const taskPath = selected?.assessmentId ? `/v1/learning-content/activities/${selected.id}/task` : null;
  const scope = JSON.stringify([apiUrl, membership?.schoolId, membership?.userId, accessToken, accessGeneration, online, status, locale, courseId, selected?.id, taskPath, refresh]);
  const parser = useCallback((value: unknown) => ({ scope, task: parseJourneyTask(value, selected!, courseId) }), [scope, selected, courseId]);
  const query = useApiQuery(ready ? taskPath : null, parser, refresh);
  const currentTask = query.data?.scope === scope ? query.data.task : null;
  const task = currentTask ? { ...currentTask, courseTitle: currentTask.courseTitle || courseTitle || null } : null;
  const resultsParser = useCallback((value: unknown) => ({ ...parseLearnerReleasedResult(value, membership!.userId), scope }), [scope, membership]);
  const results = usePaginatedLearningQuery(ready && selected?.assessmentId ? '/v1/results?limit=25' : null, resultsParser, refresh);
  const currentResults = journeyFeedbackRows(results.data, scope, results.error, results.moreError);
  const context = selected ? journeyTaskContext(selected, task, currentResults, membership?.userId ?? '') : null;
  const selectedTitle = selected ? learningTitle(selected.title, learning.activityUnavailable) : lesson.title;
  const activeWork = !!selected && opened === selected.id;
  const panel = useRef<HTMLElement>(null);
  function select(id: string | null) { setOpened(null); setChooserOpen(false); onSelect(id); }
  function openWork() { if (!selected) return; setOpened(selected.id); }
  const stateLabel = (state: JourneyState) => t[state];
  const openFeedback = () => { const id = context?.feedback?.id; if (id) window.history.pushState(null, '', `/?view=academic&source=result&id=${encodeURIComponent(id)}`); };
  return <section className="student-learning-journey" aria-label={t.title} data-work-open={activeWork} data-selected={!!selected} data-chooser-open={chooserOpen}>
    <nav className="student-learning-journey__trail" aria-label={t.title}><div className="student-learning-journey__trail-heading"><h3>{t.title}</h3>{selected ? <Button type="button" variant="quiet" className="student-learning-journey__change-step" aria-expanded={chooserOpen} onClick={() => setChooserOpen(value => !value)}>{t.changeStep}</Button> : null}</div><ol>
      <li className={selected ? '' : 'is-selected'}><span className="student-learning-journey__number" aria-hidden="true">{new Intl.NumberFormat(locale).format(1)}</span><button type="button" onClick={() => select(null)} aria-current={!selected ? 'step' : undefined}><CuevoIcon name="learning" size={44} variant="filled"/><span><strong>{t.read}</strong><small>{t.readBody}</small></span><CuevoIcon name="arrow" size={20} className="directional-icon"/></button></li>
      {lesson.activities.map((activity, index) => { const state = activity.id === selected?.id && context ? context.state : activity.assessmentId ? 'unknown' : activity.completion ? 'completed' : activity.completion === null ? 'available' : 'unknown'; return <li key={activity.id} className={selected?.id === activity.id ? 'is-selected' : ''}><span className="student-learning-journey__number" aria-hidden="true">{new Intl.NumberFormat(locale).format(index + 2)}</span><button type="button" aria-label={`${learning.openActivity}: ${learningTitle(activity.title, learning.activityUnavailable)}`} onClick={() => select(activity.id)} aria-current={selected?.id === activity.id ? 'step' : undefined}><CuevoIcon name={activity.kind === 'reflection' ? 'reflection' : activity.kind === 'reading' ? 'learning' : activity.assessmentId ? 'community' : 'practice'} size={44} variant="filled"/><span><strong>{learningTitle(activity.title, learning.activityUnavailable)}</strong><Status tone={state === 'completed' || state === 'released' ? 'positive' : state === 'submitted' || state === 'returned' ? 'warning' : 'neutral'}>{stateLabel(state)}</Status><small>{activity.instructions}</small></span>{selected?.id === activity.id ? <img className="student-learning-journey__foxi" src={trailAssets.foxi} width={100} height={100} alt="" aria-hidden="true"/> : null}<CuevoIcon name="arrow" size={20} className="directional-icon"/></button></li>; })}
    </ol></nav>
    <section ref={panel} className="student-learning-journey__panel" aria-label={selectedTitle}>
      {activityId && !selected ? <p role="status">{t.missing}</p> : !selected ? <><header><div><p className="eyebrow">{t.lesson}</p><h3 ref={headingRef} tabIndex={-1}>{lesson.title}</h3></div><CuevoIcon name="learning" size={48} variant="filled"/></header><div className="lesson-content" dir="auto">{lesson.body || learning.contentUnavailable}</div><details className="student-learning-journey__materials"><summary>{t.materials}</summary><LearningResources courseId={courseId} targetKind="lesson" targetId={lesson.id} canManage={false} labelContext={lesson.title}/></details></> : activeWork ? <><Button type="button" variant="quiet" onClick={() => setOpened(null)}>{t.back}</Button><div className="student-learning-journey__actual-work">{selected.assessmentId ? query.loading ? <p role="status">{t.taskLoading}</p> : query.error ? <LearningError error={query.error}/> : task ? <AssessmentList initiallySelectedId={task.id} compactLinked assessments={[task]} submissions={[]} submissionsComplete={false} onSubmitted={() => setRefresh(value => value + 1)}/> : null : renderWork(selected)}</div></> : <>
        <header><div><p className="eyebrow">{lesson.title}</p><h3 ref={headingRef} tabIndex={-1}>{selectedTitle}</h3></div><CuevoIcon name={selected.assessmentId ? 'community' : 'practice'} size={48} variant="filled"/></header>
        <p className="student-learning-journey__instructions" dir="auto">{selected.instructions || learning.instructionsUnavailable}</p>
        <ThinkingFocusSummary value={selected.thinkingFocus} locale={locale}/>
        {query.loading ? <p role="status">{t.taskLoading}</p> : query.error ? <><LearningError error={query.error}/><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{learning.refresh}</Button></> : null}
        {context ? <div className="student-learning-journey__status"><CuevoIcon name={context.state === 'completed' ? 'check' : 'calendar'} size={28}/><div><small>{selected.assessmentId ? t.status : t.activityState}</small><strong>{stateLabel(context.state)}</strong></div>{context.feedback ? <div><small>{context.earlier ? t.earlier : t.feedback}</small><strong>{t.released}</strong></div> : null}</div> : null}
        {context?.submission ? <section className="student-learning-journey__submission"><h4>{t.response}</h4>{context.submission.responseKind === 'FILE' ? <p>{learning.fileTask}</p> : <div className="student-learning-journey__response" dir="auto">{context.submission.content}</div>}<Button type="button" onClick={openWork}>{t.open}<CuevoIcon name="arrow" size={20} className="directional-icon"/></Button></section> : <Button type="button" disabled={!!query.error || !!selected.assessmentId && !task} onClick={openWork}>{t.open}<CuevoIcon name="arrow" size={20} className="directional-icon"/></Button>}
        {context?.feedback ? <section className="student-learning-journey__feedback"><h4>{context.earlier ? t.earlier : t.feedback}</h4><div><CuevoIcon name="feedback" size={40} variant="filled"/><blockquote dir="auto">{context.feedback.feedback}</blockquote><Button type="button" variant="secondary" onClick={openFeedback}>{t.readFeedback}</Button></div>{context.earlier ? <small>{t.feedbackNote}</small> : null}</section> : null}
        {results.error || results.moreError ? <LearningError error={(results.error ?? results.moreError)!}/> : null}{results.nextCursor ? <details><summary>{t.feedback}</summary><LoadMore query={results}/></details> : null}
        <details className="student-learning-journey__materials"><summary>{t.activityMaterials}</summary><LearningResources courseId={courseId} targetKind="activity" targetId={selected.id} canManage={false} labelContext={selectedTitle}/></details>
      </>}
    </section>
  </section>;
}
