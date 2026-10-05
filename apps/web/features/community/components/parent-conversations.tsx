'use client';
import { WorkspaceState } from '@cuevo/ui';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Ref } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { useChildContext } from '../../../shared/hooks/use-child-context';
import { ChildSelector } from '../../../shared/components/child-selector';
import { LearningApiError } from '../../../shared/api/client';
import { conversationReadScope, currentConversationRead, parseConversationPolicy, parseCurrentConversationChoice, parseCurrentConversation, conversationChoiceOptions, conversationIdentity, validateConversationReceipt } from '../conversation-model';
import { conversationEn, conversationAr } from '../conversation-messages';
import { ConversationThread } from './conversation-thread';
import { parseConversationIntent, conversationChildCurrent, conversationChildMatches, recoverConversationChoice, type ConversationIntent } from '../conversation-state-model';
import { conversationReadingKey } from '../conversation-reading-focus';
import { useConversationReadingFocus } from './use-conversation-reading-focus';

export function ParentConversations({ pageHeading = false }: { pageHeading?: boolean } = {}) {
  const app = useApp();
  if (!conversationReadScope(app, '/v1/community/conversations', 0)) return null;
  return <CurrentParentConversations pageHeading={pageHeading} key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`} />;
}
function CurrentParentConversations({ pageHeading }: { pageHeading: boolean }) {
  const app = useApp(); const { membership, locale, formDrafts, commandJournal } = app;
  const t = locale === 'ar' ? conversationAr : conversationEn;
  const actorId = membership!.userId, role = membership!.role, prefix = `${membership!.schoolId}:${actorId}:`;
  const path = '/v1/community/conversations', selectedSlot = `${prefix}conversation-selected`, createSlot = `${prefix}${path}`;
  const heading = useRef<HTMLElement | null>(null), returnFocus = useRef(false);
  const root = useRef<HTMLElement | null>(null);
  const focusContext = useRef('');
  const focused = useRef<{ context: string; element: HTMLElement; form: string | null; name: string | null } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const childContext = useChildContext(refresh);
  const parent = role === 'parent';
  const child = parent ? conversationChildCurrent(childContext.child,childContext.query) : null;
  const childId = child?.id ?? null;
  const [selected, setSelected] = useState<ConversationIntent | null>(() => parseConversationIntent(formDrafts.model<ConversationIntent>(selectedSlot)));
  const readingScope=conversationReadScope(app,`${path}:reading:${locale}:${childId??''}`,refresh);
  const readingFocus=useConversationReadingFocus(root,readingScope,selected?conversationReadingKey(selected):null);
  const [creating, setCreating] = useState(() => !!formDrafts.get(`${createSlot}:choice`) || !!commandJournal.get(path));
  const [choiceId, setChoiceId] = useState(() => formDrafts.model<string>(`${createSlot}:choice`) ?? '');
  focusContext.current = `${prefix}:${selected?.id ?? ''}:${choiceId}`;
  const [locked, setLocked] = useState(false); const [policyLocked, setPolicyLocked] = useState(false);
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const policyPath = `${path}/policy`, policyScope = conversationReadScope(app, policyPath, refresh);
  const policyParser = useCallback((value: unknown) => ({ scope: policyScope, value: parseConversationPolicy(value) }), [policyScope]);
  const policyQuery = useApiQuery(policyScope ? policyPath : null, policyParser, refresh);
  const policy = currentConversationRead(policyQuery.data, policyScope);
  const choicePath = `${path}/choices?limit=100${parent&&childId?`&learnerId=${childId}`:''}`, choiceScope = conversationReadScope(app, choicePath, refresh);
  const choiceParser = useCallback((value: unknown) => {const row=parseCurrentConversationChoice(value,role,actorId);if(parent&&!conversationChildMatches(row,childId))throw new LearningApiError('invalid');return{...row,sourceScope:choiceScope};}, [choiceScope, role, actorId,parent,childId]);
  const choices = usePaginatedLearningQuery(policy?.enabled && role !== 'admin' && (!parent||childId) ? choicePath : null, choiceParser, refresh);
  const threadPath = `${path}?limit=100${parent&&childId?`&learnerId=${childId}`:''}`, threadScope = conversationReadScope(app, threadPath, refresh);
  const threadParser = useCallback((value: unknown) => {
    if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw new LearningApiError('invalid');
    const row=parseCurrentConversation(value,value.id,role,actorId);if(parent&&!conversationChildMatches(row,childId))throw new LearningApiError('invalid');return{...row,sourceScope:threadScope};
  }, [threadScope, role, actorId,parent,childId]);
  const threads = usePaginatedLearningQuery(policy?.enabled && (!parent ? !selected : !!childId) ? threadPath : null, threadParser, refresh);
  const currentChoices = choices.data.filter(row => row.sourceScope === choiceScope && (!parent||conversationChildMatches(row,childId)));
  const options = conversationChoiceOptions(currentChoices);
  const choicesReady = choices.loaded && !choices.loading && !choices.error && !choices.moreError && !choices.nextCursor;
  const recoveredChoice=choicesReady?recoverConversationChoice(commandJournal.get(path),currentChoices):null;
  const choice = choicesReady ? recoveredChoice??currentChoices.find(row => row.id === choiceId && !options.find(option => option.value === row.id)?.requiresReview) : undefined;
  const rows = threads.data.filter(row => row.sourceScope === threadScope && (!parent||conversationChildMatches(row,childId)));
  const pendingThreadId=commandJournal.pending().map(command=>command.path.match(/^\/v1\/community\/conversations\/([^/]+)\/messages$/)?.[1]).filter((id):id is string=>!!id);
  useEffect(()=>{if(!parent||selected||pendingThreadId.length!==1||threads.loading||threads.error||threads.moreError)return;const original=rows.find(row=>row.id===pendingThreadId[0]);if(original){const intent=conversationIdentity(original);setSelected(intent);formDrafts.saveModel(selectedSlot,intent);}},[parent,selected,pendingThreadId.join(','),threads.loading,threads.error,threads.moreError,rows,formDrafts,selectedSlot]);
  const blocked = locked || policyLocked || !!commandJournal.get(path) || !!commandJournal.get(policyPath) || parent&&commandJournal.pending().some(command=>command.path.startsWith(`${path}/`)&&command.path!==policyPath);
  const sourceReviewOnly=parent&&!commandJournal.get(path)&&commandJournal.pending().some(command=>/^\/v1\/community\/conversations\/messages\/[^/]+\/(read|report|moderate)$/.test(command.path));
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
  function back() { readingFocus.cancel();formDrafts.remove(selectedSlot); setSelected(null); setRefresh(value => value + 1); returnFocus.current = true; }
  function reload() { readingFocus.cancel();setRefresh(value => value + 1); }
  function open(thread: Parameters<typeof conversationIdentity>[0],opener?:HTMLElement) { const intent = conversationIdentity(thread);if(opener)readingFocus.request(conversationReadingKey(intent),opener);else readingFocus.cancel();formDrafts.saveModel(selectedSlot, intent); setSelected(intent); }
  function created(receipt: unknown) {
    const row = receipt as Parameters<typeof conversationIdentity>[0]; setCreating(false); setChoiceId(''); formDrafts.remove(`${createSlot}:choice`); open(row);
  }
  const validate = (receipt: unknown, original: Parameters<typeof validateConversationReceipt>[1]) => validateConversationReceipt(receipt, original, actorId, role);
  const childMismatch = parent && !!selected && !conversationChildMatches(selected,childId);
  const originalCreate=commandJournal.get(path);
  const createMismatch=parent&&!!originalCreate&&(!childId||originalCreate.body.learnerId!==childId);
  useEffect(()=>{if(policyQuery.error||!policyQuery.loading&&policy&&!policy.enabled||childMismatch||createMismatch)readingFocus.cancel();},[policyQuery.error,policyQuery.loading,policy,childMismatch,createMismatch,readingFocus.cancel]);
  function directory(){return <section className="parent-conversation-directory" aria-label={t.directory}><h2>{t.directory}</h2>{threads.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:threads.error||threads.moreError?<LearningError error={threads.error??threads.moreError!}/>:rows.length?<ul>{rows.map(thread=><li key={thread.id}><Button type="button" variant="quiet" disabled={blocked&&!sourceReviewOnly} aria-pressed={selected?.id===thread.id} onClick={event=>open(thread,event.currentTarget)}><CuevoIcon name="feedback" size={24}/><span><strong><bdi>{thread.title}</bdi></strong><small><bdi>{thread.teacherName} · {thread.className} · {thread.subjectName}</bdi></small></span></Button></li>)}</ul>:threads.loaded?<WorkspaceState kind={threads.nextCursor||threads.loadingMore?"unknown":"empty"} icon="community" description={threads.nextCursor||threads.loadingMore?t.partialRecords:t.empty}/>:null}<LoadMore query={threads}/></section>;}
  return <section ref={root} onFocusCapture={event => { const element = event.target as HTMLElement; if (element.matches('input,textarea,select')) focused.current = { context: focusContext.current, element, form: element.closest('section[aria-label]')?.getAttribute('aria-label') ?? null, name: element.getAttribute('name') }; }} className={`conversation-workspace${parent?' conversation-workspace--parent':''}`} aria-label={t.heading}>
    {parent?<div className="parent-conversation-child"><ChildSelector context={childContext}/>{!pageHeading ? <Button type="button" variant="quiet" onClick={reload}><CuevoIcon name="refresh"/>{t.refresh}</Button> : null}</div>:null}
    {parent&&!child?<WorkspaceState kind="review" icon="people" description={t.chooseChild} role="status"/>:null}
    {childMismatch||createMismatch?<section className="parent-conversation-recovery"><h2>{t.originalChildContext}</h2><WorkspaceState kind="review" icon="people" description={t.returnOriginalChild} role="status"/>{selected?<Button type="button" variant="secondary" disabled={blocked&&!sourceReviewOnly} onClick={back}>{t.back}</Button>:null}</section>:parent&&!child?null:selected ? policyQuery.loading || !policy && !policyQuery.error ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : policyQuery.error ? <section><LearningError error={policyQuery.error}/><Button type="button" disabled={blocked&&!sourceReviewOnly} onClick={back}>{t.back}</Button><Button type="button" onClick={reload}>{t.refresh}</Button></section> : policy?.enabled ? <div className={parent?'parent-conversation-selected':''}>{parent?directory():null}<ConversationThread key={selected.id} intent={selected} onBack={back} onReadingState={readingFocus.receive} /></div> : <section><WorkspaceState kind="denied" icon="shield" description={t.disabled} role="status"/><Button type="button" disabled={blocked&&!sourceReviewOnly} onClick={back}>{t.back}</Button></section> : <>
      <header className="conversation-heading"><div>{pageHeading ? <p ref={heading as Ref<HTMLParagraphElement>} tabIndex={-1} className="conversation-reading-return">{t.note}</p> : <h2 ref={heading as Ref<HTMLHeadingElement>} tabIndex={-1}>{t.heading}</h2>}{!pageHeading ? <p>{t.note}</p> : null}</div><Button type="button" variant="quiet" onClick={reload}><CuevoIcon name="refresh" />{t.refresh}</Button></header>
      {policyQuery.loading || !policy && !policyQuery.error ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : policyQuery.error ? <LearningError error={policyQuery.error} /> : policy ? <>
        {role === 'admin' ? <section className="conversation-policy"><CommandForm title={t.policy} path={policyPath} fields={[{ name: 'enabled', label: t.enabled, type: 'checkbox', defaultChecked: policy.enabled }, { name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 1000 }, { name: 'confirmApproval', label: t.confirm, type: 'checkbox', required: true }]} body={values => ({ enabled: values.get('enabled') === 'on', reason: String(values.get('reason')), confirmApproval: values.get('confirmApproval') === 'on', expectedVersion: policy.version })} validateReceipt={validate} onLockedChange={onPolicyLock} onSaved={reload} actionLabel={t.approve} /></section> : null}
        {!policy.enabled ? <WorkspaceState kind="denied" icon="shield" description={t.disabled} role="status"/> : <>
          <div className="conversation-list-actions"><p className="conversation-safety"><CuevoIcon name="shield" />{role === 'admin' ? t.adminScope : t.safety}</p>{role !== 'admin' ? <Button type="button" disabled={blocked} onClick={() => setCreating(true)}><CuevoIcon name="feedback" />{t.create}</Button> : null}</div>
          {creating && role !== 'admin' ? <section className="conversation-create">
            {choices.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : choices.error ? <LearningError error={choices.error} /> : <>
              <div className="field"><label htmlFor="conversation-choice">{t.choice}</label><select id="conversation-choice" value={choice?.id??''} disabled={blocked || !choicesReady} onChange={event => { setChoiceId(event.target.value); formDrafts.saveModel(`${createSlot}:choice`, event.target.value); }}><option value="">{t.choose}</option>{options.map(option => <option key={option.value} value={option.value} disabled={option.requiresReview}>{option.label}</option>)}</select></div>
              {!choicesReady && choices.nextCursor ? <WorkspaceState kind="unknown" icon="help" description={t.completeChoices} role="status"/> : null}{options.some(option => option.requiresReview) ? <WorkspaceState kind="review" icon="people" description={t.matchingChoices} role="status"/> : null}
              {choice ? <CommandForm key={choice.id} title={t.create} path={path} draftKey={`${path}:choice:${choice.id}`} fields={[{ name: 'title', label: t.title, required: true, maxLength: 200 }, { name: 'body', label: t.message, type: 'textarea', required: true, maxLength: 4000 }]} body={values => ({ learnerId: choice.learnerId, parentId: choice.parentId, teacherId: choice.teacherId, classId: choice.classId, subjectId: choice.subjectId, title: String(values.get('title')), body: String(values.get('body')) })} validateReceipt={validate} onLockedChange={onCreateLock} onSaved={created} onCancel={() => { setCreating(false); formDrafts.remove(`${createSlot}:choice`); }} actionLabel={t.send} /> : <WorkspaceState kind={choicesReady && !options.length ? "empty" : "review"} icon="people" description={choicesReady && !options.length ? t.noChoices : t.choose}/>}<LoadMore query={choices} />
            </>}
          </section> : null}
          <div className="conversation-list">{threads.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : threads.error || threads.moreError ? <LearningError error={threads.error ?? threads.moreError!} /> : rows.length ? rows.map(thread => <article key={thread.id} className="conversation-list-item"><div className="conversation-list-symbol"><CuevoIcon name="feedback" variant="filled" size={28} /></div><div><h3><bdi>{thread.title}</bdi></h3><p><bdi>{thread.learnerName} · {thread.className} · {thread.academicYearName} · {thread.subjectName}</bdi></p><p><bdi>{thread.parentName}</bdi><span aria-hidden="true"> · </span><bdi>{thread.teacherName}</bdi></p><Status tone={thread.state === 'PAUSED' ? 'warning' : 'neutral'}>{thread.state === 'PAUSED' ? t.pausedShort : t.openState}</Status></div><Button type="button" variant="secondary" disabled={blocked&&!sourceReviewOnly} onClick={event => open(thread,event.currentTarget)}>{t.open}<CuevoIcon name="arrow" /></Button></article>) : threads.loaded ? <WorkspaceState kind={threads.nextCursor||threads.loadingMore?"unknown":"empty"} icon="community" description={threads.nextCursor||threads.loadingMore?t.partialRecords:t.empty}/> : null}</div><LoadMore query={threads} />
        </>}
      </> : null}
    </>}
  </section>;
}
