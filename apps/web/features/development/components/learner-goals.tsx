'use client';
import { WorkspaceState } from '@cuevo/ui';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { trailAssets } from '../../../shared/characters/assets';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { parseCourse } from '../../learning/model';
import { confirmLearnerGoalReceipt, parseLearnerGoal, learnerGoalEditorFocus, type LearnerGoalEditorIntent } from '../model';
import { LearnerGoalRecords } from './goal-records';
import { goalAr, goalEn } from '../goal-messages';

export function LearnerGoals({ learnerId }: { learnerId: string }) {
  const { membership } = useApp();
  return <CurrentLearnerGoals key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}:${learnerId}`} learnerId={learnerId} />;
}

function CurrentLearnerGoals({ learnerId }: { learnerId: string }) {
  const { locale, membership, status, online, commandJournal, formDrafts, apiUrl, accessToken, accessGeneration } = useApp();
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const t = locale === 'ar' ? goalAr : goalEn;
  const [refresh, setRefresh] = useState(0);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLElement>(null);
  const focusEditor = useRef<{intent:LearnerGoalEditorIntent;origin:HTMLElement}|null>(null);
  const focusScope=`${apiUrl}:${membership?.schoolId}:${membership?.userId}:${membership?.role}:${learnerId}:${accessToken??''}:${accessGeneration}:${status}:${online}`;
  const currentFocusScope=useRef(focusScope); currentFocusScope.current=focusScope;
  const [focusAfterRead, setFocusAfterRead] = useState(false);
  const [locked, setLocked] = useState(false);
  const onLockedChange = useCallback((value: boolean) => setLocked(value), []);
  const student = membership?.role === 'student';
  const permitted = status === 'ready' && online && !!membership && canOpenWorkspace('development', membership.entitlements, membership.role) && (student || membership.role === 'teacher' || membership.role === 'admin');
  const parseCurrentGoal = useCallback((value: unknown) => {
    const goal = parseLearnerGoal(value);
    if (goal.learnerId !== learnerId) throw new LearningApiError('invalid');
    return goal;
  }, [learnerId]);
  const goals = usePaginatedLearningQuery(permitted && learnerId ? `/v1/development/goals?learnerId=${encodeURIComponent(learnerId)}&limit=25` : null, parseCurrentGoal, refresh);
  const courses = usePaginatedLearningQuery(permitted && student ? '/v1/courses?limit=25' : null, parseCourse, refresh);
  const failed = !!goals.error || !!goals.moreError;
  useEffect(() => {
    const pending=focusEditor.current;
    const kind:'create'|'review'|null=create?'create':action?'review':null;
    const current=()=>({scope:currentFocusScope.current,kind,goalId:action,permitted,failed,activeOrigin:document.activeElement===pending?.origin});
    if(!learnerGoalEditorFocus(pending?.intent??null,current())){focusEditor.current=null;return;}
    const cancel=()=>{if(focusEditor.current===pending)focusEditor.current=null;};
    const focusChanged=(event:FocusEvent)=>{if(event.target!==pending?.origin)cancel();};
    const locate=()=>{
      if(focusEditor.current!==pending||!learnerGoalEditorFocus(pending?.intent??null,current()))return true;
      const source=action?root.current?.querySelector(`[data-goal-id="${action}"]`):root.current;
      const field=source?.querySelector<HTMLElement>('.learning-form input:not(:disabled),.learning-form select:not(:disabled),.learning-form textarea:not(:disabled)');
      if(!field)return false;
      cancel();field.focus({preventScroll:true});field.scrollIntoView({block:'center',behavior:'instant'});return true;
    };
    if(locate()||!root.current)return;
    const observer=new MutationObserver(()=>{if(locate())observer.disconnect();});
    observer.observe(root.current,{childList:true,subtree:true});document.addEventListener('focusin',focusChanged);
    return()=>{observer.disconnect();document.removeEventListener('focusin',focusChanged);};
  }, [create,action,permitted,failed,focusScope]);
  useEffect(()=>()=>{focusEditor.current=null;},[]);
  useEffect(() => {
    if (failed) formDrafts.clearRead(`${membership?.schoolId}:${membership?.userId}:`, '/v1/development/goals');
  }, [failed, formDrafts, membership?.schoolId, membership?.userId]);
  useEffect(() => {
    if (focusAfterRead && goals.loaded && !goals.loading && !failed) {
      heading.current?.focus(); setFocusAfterRead(false);
    }
  }, [focusAfterRead, goals.loaded, goals.loading, failed]);
  function saved(message: string) {
    focusEditor.current=null; setCreate(false); setAction(null); setConfirmation(message); setFocusAfterRead(true); setRefresh(value => value + 1);
  }
  if (!permitted || !learnerId) return null;
  const availableGoals = failed ? [] : goals.data;
  const createPath = '/v1/development/goals';
  const createLocked = locked || !!commandJournal.get(createPath);
  return <section ref={root} className="development-goals development-panel" aria-label={t.title} data-editing={create || !!action}>
    <div className="development-heading">
      <img className="development-art" src={trailAssets.goal} width="80" height="80" alt="" aria-hidden="true" />
      <div><h2 ref={heading} tabIndex={-1}>{t.title}</h2><p>{t.notice}</p></div>
      <div className="development-actions"><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}><CuevoIcon name="refresh" />{t.refresh}</Button>{student ? <Button type="button" disabled={locked || !!action && !!commandJournal.get(`/v1/development/goals/${action}/review`)} onClick={event => { focusEditor.current={intent:{scope:focusScope,kind:'create',goalId:null},origin:event.currentTarget}; setCreate(true); setAction(null); setConfirmation(null); }}><CuevoIcon name="goal" />{t.create}</Button> : null}</div>
    </div>
    {confirmation && goals.loaded && !failed ? <p className="development-confirmation" role="status"><CuevoIcon name="check" />{confirmation}</p> : null}
    {create && courses.loaded && !courses.error && !courses.moreError && courses.data.length ? <CommandForm
      title={t.create} path={createPath} draftKey="/v1/development/goals:create" note={t.createNote}
      fields={[{ name: 'courseId', label: t.course, type: 'select', required: true, options: courses.data.map(course => ({ value: course.id, label: course.title })) }, { name: 'title', label: t.name, required: true, maxLength: 200 }, { name: 'plannedStep', label: t.step, type: 'textarea', required: true, maxLength: 2000 }]}
      body={values => ({ courseId: String(values.get('courseId')), referenceId: null, title: String(values.get('title')), plannedStep: String(values.get('plannedStep')) })}
      validateReceipt={(receipt, originalCommand) => { confirmLearnerGoalReceipt(receipt, learnerId, originalCommand); }}
      onSaved={() => saved(t.saved)} onCancel={() => {focusEditor.current=null;setCreate(false);}} onLockedChange={onLockedChange}
    /> : null}
    {create ? <div>{courses.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : courses.error ? <LearningError error={courses.error} /> : courses.loaded && !courses.data.length ? <p className="notice">{t.noCourses}</p> : null}<LoadMore query={courses} label={t.course} /></div> : null}
    <LearnerGoalRecords query={goals} editing={create || !!action} student={student} locale={locale}><ul className="development-goal-list">{availableGoals.map(goal => {
      const path = `/v1/development/goals/${goal.id}/review`;
      const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
      return <li key={goal.id}><article className="development-goal" data-goal-id={goal.id}>
        <div className="development-goal__heading"><div><p className="development-eyebrow"><bdi>{goal.courseTitle}</bdi></p><h3 dir="auto">{goal.title}</h3></div><Status tone={goal.status === 'REVIEWED' ? 'positive' : 'neutral'}>{goal.status === 'ACTIVE' ? t.active : goal.status === 'CLOSED' ? t.closed : t.reviewed}</Status></div>
        <p className="development-goal__step" dir="auto"><CuevoIcon name="arrow" /><span>{goal.plannedStep}</span></p>
        <div className="development-goal__context"><bdi>{goal.learnerName}</bdi><span>{t.recordedOn}: <time dateTime={goal.createdAt}>{date(goal.createdAt)}</time></span><span>{t.revision}: {new Intl.NumberFormat(locale).format(goal.revision)}</span></div>
        {goal.review ? <div className="development-goal__reflection"><CuevoIcon name="reflection" /><div><p dir="auto">{goal.review}</p>{goal.reviewedAt ? <p className="development-meta">{t.reviewedOn}: <time dateTime={goal.reviewedAt}>{date(goal.reviewedAt)}</time></p> : null}</div></div> : null}
        {student && goal.status !== 'CLOSED' ? <Button type="button" variant="secondary" disabled={createLocked || !!action && !!commandJournal.get(`/v1/development/goals/${action}/review`)} onClick={event => { focusEditor.current={intent:{scope:focusScope,kind:'review',goalId:goal.id},origin:event.currentTarget}; setAction(goal.id); setCreate(false); setConfirmation(null); }}><CuevoIcon name="reflection" />{t.review}</Button> : goal.status === 'CLOSED' ? <p className="development-meta">{t.closeUnavailable}</p> : null}
        {student && action === goal.id && (goal.status !== 'CLOSED' || !!commandJournal.get(path)) ? <CommandForm
          title={t.review} path={path} note={t.reviewNote}
          fields={[{ name: 'status', label: t.status, type: 'select', required: true, options: [{ value: 'REVIEWED', label: t.reviewed }, { value: 'CLOSED', label: t.closed }] }, { name: 'review', label: t.reflection, type: 'textarea', required: true, maxLength: 2000 }, { name: 'confirmReview', label: t.confirm, type: 'checkbox', required: true }]}
          body={values => ({ expectedRevision: goal.revision, status: String(values.get('status')), review: String(values.get('review')), confirmReview: values.get('confirmReview') === 'on' })}
          validateReceipt={(receipt, originalCommand) => { confirmLearnerGoalReceipt(receipt, learnerId, originalCommand, goal); }}
          onSaved={() => saved(t.reviewSaved)} onCancel={() => {focusEditor.current=null;setAction(null);}} onLockedChange={onLockedChange}
        /> : null}
      </article></li>;
    })}</ul></LearnerGoalRecords>
  </section>;
}
