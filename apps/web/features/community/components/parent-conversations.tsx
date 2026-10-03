'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError } from '../../../shared/api/client';
import { conversationReadScope, currentConversationRead, parseConversationPolicy, parseCurrentConversationChoice, parseCurrentConversation, conversationChoiceOptions, conversationIdentity, validateConversationReceipt } from '../conversation-model';
import { conversationEn, conversationAr } from '../conversation-messages';
import { ConversationThread } from './conversation-thread';
import { parseConversationIntent, type ConversationIntent } from '../conversation-state-model';

export function ParentConversations() {
  const app = useApp();
  if (!conversationReadScope(app, '/v1/community/conversations', 0)) return null;
  return <CurrentParentConversations key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`} />;
}
function CurrentParentConversations() {
  const app = useApp(); const { membership, locale, formDrafts, commandJournal } = app;
  const t = locale === 'ar' ? conversationAr : conversationEn;
  const actorId = membership!.userId, role = membership!.role, prefix = `${membership!.schoolId}:${actorId}:`;
  const path = '/v1/community/conversations', selectedSlot = `${prefix}conversation-selected`, createSlot = `${prefix}${path}`;
  const heading = useRef<HTMLHeadingElement | null>(null), returnFocus = useRef(false);
  const root = useRef<HTMLElement | null>(null);
  const focusContext = useRef('');
  const focused = useRef<{ context: string; element: HTMLElement; form: string | null; name: string | null } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<ConversationIntent | null>(() => parseConversationIntent(formDrafts.model<ConversationIntent>(selectedSlot)));
  const [creating, setCreating] = useState(() => !!formDrafts.get(`${createSlot}:choice`) || !!commandJournal.get(path));
  const [choiceId, setChoiceId] = useState(() => formDrafts.model<string>(`${createSlot}:choice`) ?? '');
  focusContext.current = `${prefix}:${selected?.id ?? ''}:${choiceId}`;
  const [locked, setLocked] = useState(false); const [policyLocked, setPolicyLocked] = useState(false);
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const policyPath = `${path}/policy`, policyScope = conversationReadScope(app, policyPath, refresh);
  const policyParser = useCallback((value: unknown) => ({ scope: policyScope, value: parseConversationPolicy(value) }), [policyScope]);
  const policyQuery = useApiQuery(policyScope ? policyPath : null, policyParser, refresh);
  const policy = currentConversationRead(policyQuery.data, policyScope);
  const choicePath = `${path}/choices?limit=100`, choiceScope = conversationReadScope(app, choicePath, refresh);
  const choiceParser = useCallback((value: unknown) => ({ ...parseCurrentConversationChoice(value, role, actorId), sourceScope: choiceScope }), [choiceScope, role, actorId]);
  const choices = usePaginatedLearningQuery(policy?.enabled && role !== 'admin' ? choicePath : null, choiceParser, refresh);
  const threadPath = `${path}?limit=100`, threadScope = conversationReadScope(app, threadPath, refresh);
  const threadParser = useCallback((value: unknown) => {
    if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw new LearningApiError('invalid');
    return { ...parseCurrentConversation(value, value.id, role, actorId), sourceScope: threadScope };
  }, [threadScope, role, actorId]);
  const threads = usePaginatedLearningQuery(policy?.enabled && !selected ? threadPath : null, threadParser, refresh);
  const currentChoices = choices.data.filter(row => row.sourceScope === choiceScope);
  const options = conversationChoiceOptions(currentChoices);
  const choicesReady = choices.loaded && !choices.loading && !choices.error && !choices.moreError && !choices.nextCursor;
  const choice = choicesReady ? currentChoices.find(row => row.id === choiceId && !options.find(option => option.value === row.id)?.requiresReview) : undefined;
  const rows = threads.data.filter(row => row.sourceScope === threadScope);
  const blocked = locked || policyLocked || !!commandJournal.get(path) || !!commandJournal.get(policyPath);
  const onCreateLock = useCallback((value: boolean) => setLocked(value), []), onPolicyLock = useCallback((value: boolean) => setPolicyLocked(value), []);
  useEffect(() => { if (returnFocus.current && !selected && heading.current) { returnFocus.current = false; heading.current.focus({ preventScroll: true }); } }, [selected, policyQuery.loading]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new MutationObserver(() => {
      const previous = focused.current;
      if (!previous || previous.context !== focusContext.current || previous.element.isConnected || document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
      const target = Array.from(root.current?.querySelectorAll<HTMLElement>('input,textarea,select') ?? []).find(element => element.getAttribute('name') === previous.name && element.closest('section[aria-label]')?.getAttribute('aria-label') === previous.form);
      if (target && !target.matches(':disabled')) { target.focus({ preventScroll: true }); focused.current = { ...previous, element: target }; }
    });
    observer.observe(root.current, { subtree: true, childList: true }); return () => observer.disconnect();
  }, []);
  function back() { formDrafts.remove(selectedSlot); setSelected(null); setRefresh(value => value + 1); returnFocus.current = true; }
  function reload() { setRefresh(value => value + 1); }
  function open(thread: Parameters<typeof conversationIdentity>[0]) { const intent = conversationIdentity(thread); formDrafts.saveModel(selectedSlot, intent); setSelected(intent); }
  function created(receipt: unknown) {
    const row = receipt as Parameters<typeof conversationIdentity>[0]; setCreating(false); setChoiceId(''); formDrafts.remove(`${createSlot}:choice`); open(row);
  }
  const validate = (receipt: unknown, original: Parameters<typeof validateConversationReceipt>[1]) => validateConversationReceipt(receipt, original, actorId, role);
  return <section ref={root} onFocusCapture={event => { const element = event.target as HTMLElement; if (element.matches('input,textarea,select')) focused.current = { context: focusContext.current, element, form: element.closest('section[aria-label]')?.getAttribute('aria-label') ?? null, name: element.getAttribute('name') }; }} className="conversation-workspace" aria-label={t.heading}>
    {selected ? policyQuery.loading || !policy && !policyQuery.error ? <p role="status">{t.loading}</p> : policyQuery.error ? <section><LearningError error={policyQuery.error}/><Button type="button" onClick={back}>{t.back}</Button><Button type="button" onClick={reload}>{t.refresh}</Button></section> : policy?.enabled ? <ConversationThread key={selected.id} intent={selected} onBack={back} /> : <section><p className="notice">{t.disabled}</p><Button type="button" onClick={back}>{t.back}</Button></section> : <>
      <header className="conversation-heading"><div><h2 ref={heading} tabIndex={-1}>{t.heading}</h2><p>{t.note}</p></div><Button type="button" variant="quiet" disabled={blocked} onClick={reload}><CuevoIcon name="refresh" />{t.refresh}</Button></header>
      {policyQuery.loading || !policy && !policyQuery.error ? <p role="status">{t.loading}</p> : policyQuery.error ? <LearningError error={policyQuery.error} /> : policy ? <>
        {role === 'admin' ? <section className="conversation-policy"><CommandForm title={t.policy} path={policyPath} fields={[{ name: 'enabled', label: t.enabled, type: 'checkbox', defaultChecked: policy.enabled }, { name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmApproval', label: t.confirm, type: 'checkbox', required: true }]} body={values => ({ enabled: values.get('enabled') === 'on', reason: String(values.get('reason')), confirmApproval: values.get('confirmApproval') === 'on', expectedVersion: policy.version })} validateReceipt={validate} onLockedChange={onPolicyLock} onSaved={reload} actionLabel={t.approve} /></section> : null}
        {!policy.enabled ? <p className="notice">{t.disabled}</p> : <>
          <div className="conversation-list-actions"><p className="conversation-safety"><CuevoIcon name="shield" />{role === 'admin' ? t.adminScope : t.safety}</p>{role !== 'admin' ? <Button type="button" disabled={blocked} onClick={() => setCreating(true)}><CuevoIcon name="feedback" />{t.create}</Button> : null}</div>
          {creating && role !== 'admin' ? <section className="conversation-create" aria-label={t.create}>
            {choices.loading ? <p role="status">{t.loading}</p> : choices.error ? <LearningError error={choices.error} /> : <>
              <div className="field"><label htmlFor="conversation-choice">{t.choice}</label><select id="conversation-choice" value={choice ? choiceId : ''} disabled={blocked || !choicesReady} onChange={event => { setChoiceId(event.target.value); formDrafts.saveModel(`${createSlot}:choice`, event.target.value); }}><option value="">{t.choose}</option>{options.map(option => <option key={option.value} value={option.value} disabled={option.requiresReview}>{option.label}</option>)}</select></div>
              {!choicesReady && choices.nextCursor ? <p className="notice">{t.completeChoices}</p> : null}{options.some(option => option.requiresReview) ? <p className="notice">{t.matchingChoices}</p> : null}
              {choice ? <CommandForm key={choice.id} title={t.create} path={path} draftKey={`${path}:choice:${choice.id}`} fields={[{ name: 'title', label: t.title, required: true, maxLength: 200 }, { name: 'body', label: t.message, type: 'textarea', required: true, maxLength: 4000 }]} body={values => ({ learnerId: choice.learnerId, parentId: choice.parentId, teacherId: choice.teacherId, classId: choice.classId, subjectId: choice.subjectId, title: String(values.get('title')), body: String(values.get('body')) })} validateReceipt={validate} onLockedChange={onCreateLock} onSaved={created} onCancel={() => { setCreating(false); formDrafts.remove(`${createSlot}:choice`); }} actionLabel={t.send} /> : <p className="learning-form__note">{choicesReady && !options.length ? t.noChoices : t.choose}</p>}<LoadMore query={choices} />
            </>}
          </section> : null}
          <div className="conversation-list">{threads.loading ? <p role="status">{t.loading}</p> : threads.error || threads.moreError ? <LearningError error={threads.error ?? threads.moreError!} /> : rows.length ? rows.map(thread => <article key={thread.id} className="conversation-list-item"><div className="conversation-list-symbol"><CuevoIcon name="feedback" variant="filled" size={28} /></div><div><h3><bdi>{thread.title}</bdi></h3><p><bdi>{thread.learnerName} · {thread.className} · {thread.academicYearName} · {thread.subjectName}</bdi></p><p><bdi>{thread.parentName}</bdi><span aria-hidden="true"> · </span><bdi>{thread.teacherName}</bdi></p><Status tone={thread.state === 'PAUSED' ? 'warning' : 'neutral'}>{thread.state === 'PAUSED' ? t.pausedShort : t.openState}</Status></div><Button type="button" variant="secondary" disabled={blocked} onClick={() => open(thread)}>{t.open}<CuevoIcon name="arrow" /></Button></article>) : threads.loaded ? <p className="learning-empty">{t.empty}</p> : null}</div><LoadMore query={threads} />
        </>}
      </> : null}
    </>}
  </section>;
}
