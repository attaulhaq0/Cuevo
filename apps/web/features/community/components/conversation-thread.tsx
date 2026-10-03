'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { LearningApiError, type Command } from '../../../shared/api/client';
import { conversationReadScope, currentConversationRead, parseCurrentConversation, parseCurrentConversationMessage, parseCurrentConversationReport, validateConversationReceipt, type ParentConversation, type ConversationMessage } from '../conversation-model';
import { conversationEn, conversationAr } from '../conversation-messages';
import { parseConversationAction, type ConversationIntent, type ConversationAction as Action } from '../conversation-state-model';

export function ConversationThread({ intent, onBack }: { intent: ConversationIntent; onBack: () => void }) {
  const app = useApp(); const { membership, locale } = app; const t = locale === 'ar' ? conversationAr : conversationEn;
  const [refresh, setRefresh] = useState(0);
  const path = `/v1/community/conversations/${intent.id}`, scope = conversationReadScope(app, path, refresh);
  const parser = useCallback((value: unknown) => {
    const thread = parseCurrentConversation(value, intent.id, membership?.role ?? '', membership?.userId ?? '');
    if (thread.learnerId !== intent.learnerId || thread.parentId !== intent.parentId || thread.teacherId !== intent.teacherId || thread.classId !== intent.classId || thread.subjectId !== intent.subjectId) throw new LearningApiError('invalid');
    return { scope, value: thread };
  }, [scope, intent, membership?.role, membership?.userId]);
  const query = useApiQuery(scope ? path : null, parser, refresh), thread = currentConversationRead(query.data, scope);
  return thread && !query.loading && !query.error ? <ConversationContent thread={thread} onBack={onBack} onStateChanged={() => setRefresh(value => value + 1)} /> : <section className="conversation-thread-recovery"><Button type="button" variant="quiet" onClick={onBack}><CuevoIcon name="arrow" />{t.back}</Button>{query.error ? <LearningError error={query.error} /> : <p role="status">{t.loading}</p>}<Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.refresh}</Button></section>;
}
function ConversationRead({message,thread,locked,lock,onSaved}:{message:ConversationMessage;thread:ParentConversation;locked:boolean;lock:(key:string,value:boolean)=>void;onSaved:()=>void}) {
  const {locale,membership,commandJournal}=useApp(); const t=locale==='ar'?conversationAr:conversationEn;
  const path=`/v1/community/conversations/messages/${message.id}/read`,key=`read:${message.id}`;
  const [ownsLock,setOwnsLock]=useState(false);
  const onLockedChange=useCallback((value:boolean)=>{setOwnsLock(value);lock(key,value);},[lock,key]);
  return <fieldset disabled={locked&&!ownsLock&&!commandJournal.get(path)}><CommandForm title={t.markRead} path={path} fields={[]} body={()=>({})} validateReceipt={(receipt,original)=>validateConversationReceipt(receipt,original,membership!.userId,membership!.role,thread,message)} onSaved={onSaved} onLockedChange={onLockedChange} actionLabel={t.markRead}/></fieldset>;
}
function ConversationContent({ thread, onBack, onStateChanged }: { thread: ParentConversation; onBack: () => void; onStateChanged: () => void }) {
  const app = useApp(); const { membership, locale, formDrafts, commandJournal } = app; const t = locale === 'ar' ? conversationAr : conversationEn;
  const actor = membership!.userId, role = membership!.role, prefix = `${membership!.schoolId}:${actor}:`;
  const path = `/v1/community/conversations/${thread.id}`, actionSlot = `${prefix}${path}:action`;
  const [refresh, setRefresh] = useState(0); const [action, setAction] = useState<Action | null>(() => parseConversationAction(formDrafts.model<Action>(actionSlot)));
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const heading = useRef<HTMLHeadingElement | null>(null), actionHeading = useRef<HTMLElement | null>(null);
  const hasWorkingInput = formDrafts.first(`${prefix}${path}`) !== undefined;
  useEffect(() => { const timer = window.setTimeout(() => { if (!hasWorkingInput && document.activeElement === document.body) heading.current?.focus({ preventScroll: true }); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { actionHeading.current?.focus({ preventScroll: true }); }, [action?.id, action?.kind]);
  const participant = role === 'parent' && actor === thread.parentId || role === 'teacher' && actor === thread.teacherId;
  const messagePath = `${path}/messages?limit=100`, messageScope = conversationReadScope(app, messagePath, refresh);
  const messageParser = useCallback((value: unknown) => { const message = parseCurrentConversationMessage(value, thread); return { id: message.id, scope: messageScope, value: message }; }, [messageScope, thread.id, thread.parentId, thread.teacherId]);
  const messages = usePaginatedLearningQuery(messageScope ? messagePath : null, messageParser, refresh);
  const reportPath = `${path}/reports?limit=100`, reportScope = conversationReadScope(app, reportPath, refresh);
  const reportParser = useCallback((value: unknown) => { const report = parseCurrentConversationReport(value, thread.id); return { id: report.id, scope: reportScope, value: report }; }, [reportScope, thread.id]);
  const reports = usePaginatedLearningQuery(thread.canModerate && reportScope ? reportPath : null, reportParser, refresh);
  const rows = messages.data.flatMap(row => { const value = currentConversationRead(row, messageScope); return value ? [value] : []; }), reportRows = reports.data.flatMap(row => { const value = currentConversationRead(row, reportScope); return value ? [value] : []; });
  const visibleRows = role === 'admin' ? reports.loaded && !reports.loading && !reports.error && !reports.moreError ? rows.filter(message => reportRows.some(report => report.messageId === message.id)) : [] : rows;
  const ready = messages.loaded && !messages.loading && !messages.error && !messages.moreError;
  const authority = ready && (role !== 'admin' || reports.loaded && !reports.loading && !reports.error && !reports.moreError);
  const actionPath = action ? action.kind === 'state' ? `${path}/state` : `/v1/community/conversations/messages/${action.id}/${action.kind === 'report' ? 'report' : 'moderate'}` : null;
  const sendPath = `${path}/messages`;
  const retained = commandJournal.get(sendPath) || actionPath && commandJournal.get(actionPath) || rows.map(message => commandJournal.get(`/v1/community/conversations/messages/${message.id}/read`)).find(Boolean);
  const locked = Object.values(locks).some(Boolean) || !!retained;
  const lock = useCallback((key: string, value: boolean) => setLocks(previous => previous[key] === value ? previous : { ...previous, [key]: value }), []);
  const sendLock = useCallback((value: boolean) => lock('send', value), [lock]);
  const actionLock = useCallback((value: boolean) => lock('action', value), [lock]);
  const validate = (receipt: unknown, original: Command) => validateConversationReceipt(receipt, original, actor, role, thread);
  function changed() { setRefresh(value => value + 1); }
  function closeAction() { formDrafts.remove(actionSlot); setAction(null); heading.current?.focus({ preventScroll: true }); }
  function openAction(next: Action) { if (locked) return; setAction(next); formDrafts.saveModel(actionSlot, next); }
  useEffect(() => { if (messages.error || messages.moreError || role === 'admin' && (reports.error || reports.moreError)) { formDrafts.remove(actionSlot); setAction(null); } }, [messages.error, messages.moreError, reports.error, reports.moreError, role, formDrafts, actionSlot]);
  const currentActionMessage = action?.kind === 'state' ? null : rows.find(message => message.id === action?.id);
  const validAction = action && (action.kind === 'state' ? thread.canModerate : !!currentActionMessage && (action.kind === 'report' ? participant : thread.canModerate && (role !== 'admin' || reportRows.some(report => report.messageId === action.id))));
  return <section className="conversation-thread" aria-label={thread.title}>
    <div className="conversation-thread-navigation"><Button type="button" variant="quiet" disabled={locked} onClick={onBack}><CuevoIcon name="arrow" />{t.back}</Button><Button type="button" variant="quiet" disabled={locked} onClick={() => { changed(); onStateChanged(); }}><CuevoIcon name="refresh" />{t.refresh}</Button></div>
    <header className="conversation-thread-heading"><div className="conversation-thread-symbol"><CuevoIcon name="feedback" variant="filled" size={30} /></div><div><h2 ref={heading} tabIndex={-1}><bdi>{thread.title}</bdi></h2><p><bdi>{thread.learnerName} · {thread.className} · {thread.academicYearName} · {thread.subjectName}</bdi></p><p><bdi>{thread.parentName}</bdi><span aria-hidden="true"> · </span><bdi>{thread.teacherName}</bdi></p></div><Status tone={thread.state === 'PAUSED' ? 'warning' : 'neutral'}>{thread.state === 'PAUSED' ? t.pausedShort : t.openState}</Status></header>
    <p className="conversation-safety"><CuevoIcon name="shield" />{role === 'admin' ? t.adminScope : t.safety}</p>{thread.state === 'PAUSED' ? <p className="notice">{t.paused}</p> : null}
    <div className="conversation-thread-layout"><div className="conversation-timeline">
      {messages.loading || role === 'admin' && (!reports.loaded || reports.loading) && !reports.error && !reports.moreError ? <p role="status">{t.loading}</p> : messages.error || messages.moreError ? <LearningError error={messages.error ?? messages.moreError!} /> : role === 'admin' && (reports.error || reports.moreError) ? <p className="notice">{t.reviewUnavailable}</p> : visibleRows.length ? visibleRows.map(message => {
        const moderate = thread.canModerate && (role !== 'admin' || reportRows.some(report => report.messageId === message.id));
        return <article className={`conversation-message${message.senderId === actor ? ' conversation-message--own' : ''}`} key={message.id} data-message-id={message.id}><header><h3><bdi>{message.senderName}</bdi></h3><p><bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.sentAt))}</bdi></p></header>{message.status === 'VISIBLE' ? <p className="community-message" dir="auto">{message.body}</p> : <p className="notice">{t.hidden}</p>}<Status>{message.recipientReadAt ? t.read : t.delivered}</Status><div className="conversation-message-actions">
          {participant && message.senderId !== actor && message.status === 'VISIBLE' && (!message.recipientReadAt || commandJournal.get(`/v1/community/conversations/messages/${message.id}/read`)) ? <ConversationRead message={message} thread={thread} locked={locked} lock={lock} onSaved={changed} /> : null}
          {participant ? <Button type="button" variant="quiet" disabled={locked || !authority} onClick={() => openAction({ id: message.id, kind: 'report', version: message.moderationVersion, target: null })}><CuevoIcon name="shield" />{t.report}</Button> : null}
          {moderate ? <Button type="button" variant="quiet" disabled={locked || !authority} onClick={() => openAction({ id: message.id, kind: 'moderate', version: message.moderationVersion, target: message.status === 'HIDDEN' ? 'RESTORE' : 'HIDE' })}>{message.status === 'HIDDEN' ? t.restore : t.hide}</Button> : null}
        </div></article>;
      }) : messages.loaded ? <p className="learning-empty">{role === 'admin' ? t.adminEmpty : t.emptyMessages}</p> : null}
      {role !== 'admin' || authority ? <LoadMore query={messages} /> : null}
      {participant && authority && (thread.state === 'OPEN' || commandJournal.get(sendPath)) ? <fieldset className="conversation-composer" disabled={locked && !locks.send && !commandJournal.get(sendPath)}><CommandForm title={t.send} path={sendPath} fields={[{ name: 'body', label: t.message, type: 'textarea', required: true, maxLength: 4000 }]} body={values => ({ body: String(values.get('body')) })} validateReceipt={validate} onLockedChange={sendLock} onSaved={changed} actionLabel={t.send} note={t.safety} /></fieldset> : null}
    </div><aside className="conversation-review-context"><section><h3><CuevoIcon name="shield" />{t.context}</h3><p>{t.note}</p>{thread.canModerate && authority ? <Button type="button" variant="secondary" disabled={locked} onClick={() => openAction({ id: thread.id, kind: 'state', version: thread.stateVersion, target: thread.state === 'OPEN' ? 'PAUSED' : 'OPEN' })}>{thread.state === 'OPEN' ? t.pause : t.resume}</Button> : null}</section>
      {validAction && actionPath ? <section ref={actionHeading} tabIndex={-1} className="conversation-action" aria-label={t.reviewAction}><fieldset disabled={!authority}><CommandForm title={action.kind === 'report' ? t.report : action.target === 'RESTORE' ? t.restore : action.target === 'HIDE' ? t.hide : action.target === 'OPEN' ? t.resume : t.pause} path={actionPath} draftKey={`${actionPath}:decision:${action.kind}:${action.target ?? ''}`} fields={[{ name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 1000 }, ...(action.kind !== 'report' ? [{ name: 'confirmModeration', label: t.moderationConfirm, type: 'checkbox' as const, required: true }] : [])]} body={values => {
        if (action.kind === 'state' ? thread.stateVersion !== action.version || (thread.state === 'OPEN' ? 'PAUSED' : 'OPEN') !== action.target : !currentActionMessage || currentActionMessage.moderationVersion !== action.version || action.kind === 'moderate' && (currentActionMessage.status === 'HIDDEN' ? 'RESTORE' : 'HIDE') !== action.target) throw new LearningApiError('conflict');
        return { reason: String(values.get('reason')), ...(action.kind === 'state' ? { state: action.target, expectedVersion: action.version, confirmModeration: values.get('confirmModeration') === 'on' } : action.kind === 'moderate' ? { action: action.target, expectedVersion: action.version, confirmModeration: values.get('confirmModeration') === 'on' } : {}) };
      }} validateReceipt={(receipt, original) => validateConversationReceipt(receipt, original, actor, role, thread, currentActionMessage ?? undefined)} onLockedChange={actionLock} onSaved={() => { closeAction(); changed(); if (action.kind === 'state') onStateChanged(); }} onCancel={closeAction} /></fieldset></section> : null}
      {thread.canModerate ? <section><h3>{t.reports}</h3>{reports.loading ? <p role="status">{t.loading}</p> : reports.error || reports.moreError ? <LearningError error={reports.error ?? reports.moreError!} /> : reportRows.length ? reportRows.map(report => <article key={report.id}><p><strong><bdi>{report.reporterName}</bdi></strong></p><p dir="auto">{report.reason}</p>{!rows.some(message => message.id === report.messageId) ? <p className="learning-form__note">{t.reportSourceNotLoaded}</p> : null}</article>) : reports.loaded ? <p>{t.noReports}</p> : null}<LoadMore query={reports} /></section> : null}
    </aside></div>
  </section>;
}
