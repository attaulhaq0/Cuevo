'use client';
import { WorkspaceState } from '@cuevo/ui';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { COGNITIVE_PROCESSES, thinkingFocusResponseSchema, thinkingFocusReviewInputSchema, type CognitiveProcess, type ThinkingFocusResponse, type LearningResource } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { buildThinkingFocusDraft, currentThinkingFocusRead, parseThinkingFocusCatalogue, parseThinkingFocusQueue, parseThinkingFocusRead, parseThinkingFocusSnapshot, parseThinkingFocusRubric, parseThinkingFocusMaterials, thinkingFocusMaterialsPath, thinkingFocusActionAvailable, thinkingFocusPath, thinkingFocusTarget, validateThinkingFocusReceipt, parseThinkingFocusSelection, currentThinkingFocusSelection, type ThinkingFocusSelection, type ThinkingFocusKind } from '../thinking-focus-model';
import type { Assessment } from '../model';
import { LearningApiError,type Command,type CommandJournal } from '../../../shared/api/client';
import { thinkingFocusAr, thinkingFocusEn } from '../thinking-focus-messages';

type EditorProps = { kind: ThinkingFocusKind; id: string; criterionKey?: string; courseId: string; expectedRubricVersion?: string;expectedSourceVersion?:string;expectedRevision?:number;queueCursor?:string|null;headingLevel?:2|3;onReaderReady?:(heading:HTMLHeadingElement)=>void;onReaderDetached?:(heading:HTMLHeadingElement)=>void;onReaderUnavailable?:()=>void; onChanged?: () => void; initiallyOpen?: boolean; onClose?:()=>void; closeLabel?:string; onLockedChange?:(locked:boolean)=>void; sourceAvailable?:boolean };
type ThinkingCommandContext={actor:string;sourceVersion:string;courseId:string;selection:ThinkingFocusSelection;validate:(receipt:unknown,command:Command)=>void};
const thinkingCommandContexts=new WeakMap<CommandJournal,Map<string,ThinkingCommandContext>>();
function useReadScope(path: string | null, refresh = 0) {
  const app = useApp();
  const ready = app.status === 'ready' && app.online && !!app.accessToken && !!app.membership;
  return { app, scope: ready && path ? JSON.stringify([app.apiUrl, app.membership?.schoolId, app.membership?.userId, app.membership?.role, app.accessToken, app.accessGeneration, app.selectedChildId, app.locale, path, refresh]) : null };
}

function ThinkingFocusMaterials({ source, readScope, onReady,onLockedChange,headingLevel=4 }: { source: ThinkingFocusResponse; readScope: string | null; onReady: (value: string | null) => void;onLockedChange?:(value:boolean)=>void;headingLevel?:3|4 }) {
  const [refresh, setRefresh] = useState(0);
  const path = thinkingFocusMaterialsPath(source.target, source.sourceVersion);
  const { app, scope } = useReadScope(path, refresh); const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusMaterials(value, source) }), [scope, source]);
  const query = useApiQuery(scope ? path : null, parser, refresh);
  const manifest = query.data?.scope === scope ? query.data.value : null;
  const [pending, setPending] = useState<string | null>(null), [error, setError] = useState<LearningApiError | null>(null);
  const controller = useRef<AbortController | null>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { onReady(manifest && !query.error && !error ? readScope : null); return () => onReady(null); }, [manifest, query.error, error, readScope, onReady]);
  useEffect(()=>{onLockedChange?.(!!pending);return()=>onLockedChange?.(false);},[pending,onLockedChange]);
  async function download(resource: LearningResource) {
    if (!manifest || !app.accessToken || !app.membership || pending) return;
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort; setPending(resource.id); setError(null);
    try {
      const response = await fetch(`${app.apiUrl}${thinkingFocusMaterialsPath(source.target, source.sourceVersion, resource)}`, { headers: { Authorization: `Bearer ${app.accessToken}`, 'X-School-Id': app.membership.schoolId }, cache: 'no-store', credentials: 'omit', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new LearningApiError(response.status === 403 ? 'denied' : response.status === 409 ? 'conflict' : 'unavailable');
      const bytes = await response.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      if (bytes.byteLength !== resource.byteSize || sha256 !== resource.sha256 || response.headers.get('content-type')?.split(';')[0] !== resource.contentType) throw new LearningApiError('invalid');
      if (!mounted.current || abort.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: resource.contentType })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = resource.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { if (mounted.current && !abort.signal.aborted) setError(failure instanceof LearningApiError ? failure : new LearningApiError('unavailable')); }
    finally { if (mounted.current && !abort.signal.aborted) setPending(null); }
  }
  const Heading=headingLevel===3?'h3':'h4';
  return <section className="thinking-focus-materials"><Heading>{t.materials}</Heading>{query.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : query.error ? <LearningError error={query.error}/> : manifest ? manifest.items.length ? <ul>{manifest.items.map(resource => <li key={`${resource.id}:${resource.revisionId}`}><div><p>{resource.title}</p><small><bdi>{resource.name}</bdi></small></div><Button type="button" variant="quiet" disabled={!!pending} onClick={() => void download(resource)}>{pending === resource.id ? t.openingMaterial : t.openMaterial}</Button></li>)}</ul> : <WorkspaceState kind="empty" icon="portfolio" description={t.noMaterials}/> : <WorkspaceState kind="unknown" icon="help" description={t.materialUnknown} role="status"/>}{error ? <LearningError error={error}/> : null}{query.error || error ? <Button type="button" variant="quiet" onClick={() => { setError(null); setRefresh(value => value + 1); }}>{t.retry}</Button> : null}</section>;
}

export function ThinkingFocusSummary({ value, locale = 'en' }: { value: ThinkingFocusResponse | null | undefined; locale?: 'en' | 'ar' }) {
  const t = locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parsed = thinkingFocusResponseSchema.safeParse(value);
  const current = parsed.success ? parsed.data : null;
  const focus = current?.status === 'APPROVED' ? current.classification?.focus : null;
  const description = focus ? t.prompts[focus.primaryProcess] : current?.status === 'SOURCE_CHANGED' ? t.sourceChanged : current?.status === 'AWAITING_REVIEW' ? t.awaiting : current?.status === 'REJECTED' ? t.rejected : current?.status === 'WITHDRAWN' ? t.withdrawn : t.unknown;
  return <div className="thinking-focus-summary"><p><CuevoIcon name="learning" size={20} /><span>{description}</span></p>{focus ? <><p className="thinking-focus-summary__categories"><strong>{t.processes[focus.primaryProcess]}</strong>{focus.additionalProcesses.length ? ` · ${focus.additionalProcesses.map(process => t.processes[process]).join(' · ')}` : ''}</p><details><summary>{t.title}</summary><p>{t.processes[focus.primaryProcess]}{focus.additionalProcesses.length ? ` · ${focus.additionalProcesses.map(process => t.processes[process]).join(' · ')}` : ''}</p><p>{t.explanation}</p></details></> : null}</div>;
}

export function ThinkingFocusEditor(props: EditorProps) {
  const { membership } = useApp();
  return <CurrentThinkingFocusEditor key={`${membership?.schoolId}:${membership?.userId}:${props.courseId}:${props.kind}:${props.id}:${props.criterionKey ?? ''}`} {...props} />;
}

function CurrentThinkingFocusEditor({ kind, id, criterionKey, courseId, expectedRubricVersion,expectedSourceVersion,expectedRevision,queueCursor=null,headingLevel=3,onReaderReady,onReaderDetached,onReaderUnavailable, onChanged, initiallyOpen = false,onClose,closeLabel,onLockedChange,sourceAvailable=true }: EditorProps) {
  const owner = useApp();
  useSyncExternalStore(owner.commandJournal.subscribe,owner.commandJournal.getSnapshot,owner.commandJournal.getSnapshot);
  const restoredAction = (['draft', 'review'] as const).find(value => owner.commandJournal.get(thinkingFocusPath(kind, id, criterionKey, value)) || owner.formDrafts.model(`${owner.membership?.schoolId}:${owner.membership?.userId}:thinking-focus-basis:${thinkingFocusPath(kind, id, criterionKey, value)}`));
  const [open, setOpen] = useState(initiallyOpen || !!restoredAction);
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<'draft' | 'review' | null>(restoredAction ?? null);
  const [basis, setBasis] = useState<{ scope: string; value: ThinkingFocusResponse } | null>(null);
  const [locked, setLocked] = useState(false);
  const [materialLocked,setMaterialLocked]=useState(false);
  const [primary, setPrimary] = useState<CognitiveProcess | null>(null);
  const [materialsReady, setMaterialsReady] = useState<string | null>(null);
  const path = thinkingFocusPath(kind, id, criterionKey);
  const { app, scope } = useReadScope(open ? path : null, refresh);
  const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusRead(value, thinkingFocusTarget(kind, id, criterionKey), courseId) }), [scope, kind, id, criterionKey, courseId]);
  const read = useApiQuery(scope ? path : null, parser, refresh);
  const latest = currentThinkingFocusRead(read.data, scope);
  const current = sourceAvailable&&latest && (!expectedRubricVersion || latest.source.rubricVersion === expectedRubricVersion)&& (expectedSourceVersion===undefined||latest.sourceVersion===expectedSourceVersion)&&(expectedRevision===undefined||latest.revision===expectedRevision) ? latest : null;
  const heading=useRef<HTMLHeadingElement|null>(null);
  const trackHeading=useCallback((element:HTMLHeadingElement|null)=>{if(!element&&heading.current)onReaderDetached?.(heading.current);heading.current=element;},[onReaderDetached]);
  useEffect(()=>{if(current&&!read.loading&&heading.current)onReaderReady?.(heading.current);},[current,read.loading,onReaderReady]);
  useEffect(()=>{if(open&&!read.loading&&(read.error||!current))onReaderUnavailable?.();},[open,current,read.loading,read.error,onReaderUnavailable]);
  const catalogue = useApiQuery(scope ? '/v1/thinking-focus/catalogue' : null, parseThinkingFocusCatalogue, 0);
  const prefix = `${app.membership?.schoolId}:${app.membership?.userId}:`;
  const actionPath = action ? thinkingFocusPath(kind, id, criterionKey, action) : null;
  const basisSlot = `${prefix}thinking-focus-basis:${actionPath ?? ''}`;
  const storedBasis = actionPath ? app.formDrafts.model<{ scope: string; value: ThinkingFocusResponse }>(basisSlot) : undefined;
  const basisScope = JSON.stringify([app.apiUrl, app.membership?.schoolId, app.membership?.userId, app.membership?.role, app.accessToken, app.accessGeneration, app.selectedChildId, app.locale, path]);
  const parsedStoredBasis = storedBasis?.scope === basisScope ? thinkingFocusResponseSchema.safeParse(storedBasis.value) : null;
  const restoredBasis = parsedStoredBasis?.success && parsedStoredBasis.data.courseId === courseId && parsedStoredBasis.data.target.kind.toLowerCase() === kind && parsedStoredBasis.data.target.id === id && parsedStoredBasis.data.target.criterionKey === (criterionKey ?? null) ? parsedStoredBasis.data : null;
  const frozen = restoredBasis ?? (basis?.scope === basisScope ? basis.value : null);
  const currentPermission = thinkingFocusActionAvailable(current, action, frozen, !!actionPath && !!app.commandJournal.get(actionPath));
  const sourceMatches = !!current && !!frozen && current.sourceVersion === frozen.sourceVersion && current.revision === frozen.revision;
  const commandContexts=thinkingCommandContexts.get(owner.commandJournal)??new Map<string,ThinkingCommandContext>();thinkingCommandContexts.set(owner.commandJournal,commandContexts);
  const actorContext=JSON.stringify([owner.apiUrl,owner.membership?.schoolId,owner.membership?.userId,owner.membership?.role]);
  const capture=useRef<{basis:ThinkingFocusResponse;action:'draft'|'review';path:string;actor:string;userId:string}|null>(null);
  capture.current=frozen&&action&&actionPath&&owner.membership?{basis:frozen,action,path:actionPath,actor:actorContext,userId:owner.membership.userId}:null;
  useEffect(()=>owner.commandJournal.subscribe(()=>{const keys=new Set(owner.commandJournal.pending().map(command=>command.key));for(const key of commandContexts.keys())if(!keys.has(key))commandContexts.delete(key);const value=capture.current;if(!value)return;const command=owner.commandJournal.get(value.path);if(command&&!commandContexts.has(command.key)){const basis=structuredClone(value.basis);commandContexts.set(command.key,{actor:value.actor,sourceVersion:basis.sourceVersion,courseId:basis.courseId,selection:{target:basis.target,sourceVersion:basis.sourceVersion,revision:basis.revision,cursor:queueCursor},validate:(receipt,original)=>validateThinkingFocusReceipt(receipt,original,basis,value.userId,value.action)});}}),[owner.commandJournal,commandContexts,queueCursor]);
  const original=actionPath?owner.commandJournal.get(actionPath):undefined,originalContext=original?commandContexts.get(original.key):undefined;
  const replayCurrent=sourceAvailable&&latest&&(!expectedRubricVersion||latest.source.rubricVersion===expectedRubricVersion)&&originalContext?.actor===actorContext&&originalContext.courseId===courseId&&originalContext.selection.target.kind===latest.target.kind&&originalContext.selection.target.id===latest.target.id&&originalContext.selection.target.criterionKey===latest.target.criterionKey&&originalContext.sourceVersion===latest.sourceVersion?latest:null;
  const originalRecovery=!!original&&!!replayCurrent&&(!frozen||!current);
  function start(next: 'draft' | 'review') {
    if (!current || materialsReady !== scope) return;
    const commandPath = thinkingFocusPath(kind, id, criterionKey, next);
    const slot = `${prefix}thinking-focus-basis:${commandPath}`;
    const saved = app.formDrafts.model<{ scope: string; value: ThinkingFocusResponse }>(slot);
    const parsed = saved?.scope === basisScope ? thinkingFocusResponseSchema.safeParse(saved.value) : null;
    const captured = parsed?.success && parsed.data.courseId === courseId && parsed.data.target.id === id && parsed.data.target.kind.toLowerCase() === kind && parsed.data.target.criterionKey === (criterionKey ?? null) ? parsed.data : current;
    app.formDrafts.saveModel(slot, { scope: basisScope, value: captured }); setBasis({ scope: basisScope, value: captured }); setPrimary(captured.classification?.focus.primaryProcess ?? null); setAction(next);
  }
  function saved() { app.formDrafts.remove(basisSlot); setBasis(null); setAction(null); setRefresh(value => value + 1); onChanged?.(); }
  function cancel() { app.formDrafts.remove(basisSlot); setBasis(null); setAction(null); }
  const workingPrimary = actionPath ? app.formDrafts.get(prefix + actionPath)?.values.primaryProcess : undefined;
  const retainedPrimary = actionPath ? app.commandJournal.get(actionPath)?.body.focus : undefined;
  const retainedFocus = retainedPrimary && typeof retainedPrimary === 'object' && 'primaryProcess' in retainedPrimary ? retainedPrimary.primaryProcess : undefined;
  const selectedPrimary = primary ?? (COGNITIVE_PROCESSES.includes(workingPrimary as CognitiveProcess) ? workingPrimary as CognitiveProcess : COGNITIVE_PROCESSES.includes(retainedFocus as CognitiveProcess) ? retainedFocus as CognitiveProcess : frozen?.classification?.focus.primaryProcess ?? null);
  const navigationLocked=locked||materialLocked||!!owner.commandJournal.get(thinkingFocusPath(kind,id,criterionKey,'draft'))||!!owner.commandJournal.get(thinkingFocusPath(kind,id,criterionKey,'review'));
  useEffect(()=>{onLockedChange?.(navigationLocked);return()=>onLockedChange?.(false);},[navigationLocked,onLockedChange]);
  const labels = catalogue.data?.processes ?? [];
  const fields: FormField[] = action === 'draft' ? [
    { name: 'primaryProcess', label: t.primary, type: 'select', required: true, defaultValue: selectedPrimary ?? '', options: labels.map(process => ({ value: process.process, label: process.label[app.locale] })) },
    ...COGNITIVE_PROCESSES.filter(process => process !== selectedPrimary).map(process => ({ name: `additional:${process}`, label: `${t.additional}: ${t.processes[process]}`, type: 'checkbox' as const, defaultChecked: frozen?.classification?.focus.additionalProcesses.includes(process) ?? false })),
    { name: 'rationale', label: t.rationale, type: 'textarea', required: true, maxLength: 2000, defaultValue: frozen?.classification?.rationale ?? '' },
  ] : [
    { name: 'decision', label: t.decision, type: 'select', required: true, options: frozen?.status === 'APPROVED' ? [{ value: 'WITHDRAW', label: t.withdraw }] : [{ value: 'APPROVE', label: t.approve }, { value: 'REJECT', label: t.reject }] },
    { name: 'reason', label: t.reason, type: 'textarea', required: true, maxLength: 2000 },
    { name: 'confirmReview', label: t.confirm, type: 'checkbox', required: true },
  ];
  const Heading=headingLevel===2?'h2':'h3';
  return <section className="thinking-focus-editor">
    <Button type="button" variant="quiet" disabled={navigationLocked} aria-expanded={open} onClick={() => {if(navigationLocked)return;if(open&&onClose)onClose();else setOpen(value => !value)}}><CuevoIcon name="learning" size={20} />{open ? closeLabel??t.close : t.open}</Button>
    {open ? <>{read.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : read.error ? <><LearningError error={read.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.retry}</Button></> : current ? <>
      <header className="cuevo-section-header"><div className="cuevo-section-header__context"><Heading ref={trackHeading} tabIndex={onReaderReady?-1:undefined}>{current.targetTitle}</Heading><ThinkingFocusSummary value={current} locale={app.locale} /></div><div className="learning-actions">{current.canAuthor ? <Button type="button" variant="secondary" disabled={navigationLocked || materialsReady !== scope} onClick={() => start('draft')}>{t.edit}</Button> : null}{current.canReview && current.classification ? <Button type="button" disabled={navigationLocked || materialsReady !== scope} onClick={() => start('review')}>{t.review}</Button> : null}</div></header>
      <details className="thinking-focus-source" open={action === 'review' ? true : undefined}><summary>{t.source}</summary><p className="lesson-content">{current.source.instructions || t.noInstructions}</p>{current.source.criterionTitle ? <p>{current.source.criterionTitle}</p> : null}{current.classification ? <p>{current.classification.rationale}</p> : null}</details>
      <ThinkingFocusMaterials key={`${scope}:${current.sourceVersion}`} source={current} readScope={scope} onReady={setMaterialsReady} onLockedChange={setMaterialLocked} headingLevel={headingLevel===2?3:4}/>
      {catalogue.error ? <LearningError error={catalogue.error} /> : null}
      {action && frozen && actionPath && currentPermission ? sourceMatches || current?.sourceVersion === frozen.sourceVersion && app.commandJournal.get(actionPath) ? catalogue.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : catalogue.data ? <CommandForm key={`${actionPath}:${frozen.revision}:${frozen.sourceVersion}`} title={action === 'draft' ? t.edit : t.review} regionLabel={`${action === 'draft' ? t.edit : t.review}: ${frozen.targetTitle}`} path={actionPath} fields={fields} body={values => { if (materialsReady !== scope) throw new LearningApiError('conflict'); return action === 'draft' ? buildThinkingFocusDraft(values, frozen) : thinkingFocusReviewInputSchema.parse({ expectedRevision: frozen.revision, expectedSourceVersion: frozen.sourceVersion, decision: values.get('decision'), reason: values.get('reason'), confirmReview: values.get('confirmReview') === 'on' }); }} validateReceipt={(receipt, command) => validateThinkingFocusReceipt(receipt, command, frozen, app.membership!.userId, action)} onValuesChange={values => { if (action === 'draft' && COGNITIVE_PROCESSES.includes(values.get('primaryProcess') as CognitiveProcess)) setPrimary(values.get('primaryProcess') as CognitiveProcess); }} onSaved={saved} onCancel={cancel} onLockedChange={setLocked} actionLabel={action === 'draft' ? t.draft : t.review} note={t.reviewNote} /> : null : <WorkspaceState kind="review" icon="help" description={t.sourceChanged}/> : null}
      {originalRecovery&&original&&originalContext?<CommandForm title={t.originalAction} path={original.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} validateReceipt={originalContext.validate} onSaved={saved} onLockedChange={setLocked} note={t.originalActionNote}/>:original&&!frozen?<WorkspaceState kind="review" icon="help" description={t.sourceChanged}/>:null}
    </> : latest ? <><WorkspaceState kind="review" icon="help" description={t.sourceChanged} role="status"/>{originalRecovery&&original&&originalContext?<CommandForm title={t.originalAction} path={original.path} fields={[]} body={()=>{throw new LearningApiError('conflict');}} validateReceipt={originalContext.validate} onSaved={saved} onLockedChange={setLocked} note={t.originalActionNote}/>:null}</> : null}</> : null}
  </section>;
}

export function AssessmentCriterionThinkingFocus({ assessment, onChanged }: { assessment: Assessment; onChanged?: () => void }) {
  const { membership } = useApp();
  return assessment.model === 'rubric' ? <CurrentAssessmentCriterionFocus key={`${membership?.schoolId}:${membership?.userId}:${assessment.id}:${assessment.policyVersion}:${assessment.preparationVersion}:${assessment.rubricId}`} assessment={assessment} onChanged={onChanged} /> : null;
}
function CurrentAssessmentCriterionFocus({ assessment, onChanged }: { assessment: Assessment & { rubricId: string }; onChanged?: () => void }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string | null>(null), [refresh, setRefresh] = useState(0);
  const path = thinkingFocusPath('assessment', assessment.id);
  const { app, scope } = useReadScope(open ? path : null, refresh); const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const sourceParser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusRead(value, thinkingFocusTarget('assessment', assessment.id), assessment.courseId) }), [scope, assessment.id, assessment.courseId]);
  const query = useApiQuery(scope ? path : null, sourceParser, refresh);
  const current = currentThinkingFocusRead(query.data, scope);
  const source = current?.source.policyVersion === assessment.policyVersion && (assessment.preparationVersion === undefined || current.source.preparationVersion === assessment.preparationVersion) ? current : null;
  const rubricParser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusRubric(value, assessment, source!) }), [scope, assessment, source]);
  const rubric = useApiQuery(scope && source ? `/v1/rubrics/${assessment.rubricId}` : null, rubricParser, refresh);
  const criteria = rubric.data?.scope === scope ? rubric.data.value.criteria : null;
  const selectedKey = selected && criteria?.some(criterion => criterion.key === selected) ? selected : null;
  function changed() { setRefresh(value => value + 1); onChanged?.(); }
  return <section className="thinking-focus-criteria"><Button type="button" variant="quiet" aria-expanded={open} onClick={() => { setOpen(value => !value); setSelected(null); }}>{t.criteria}</Button>{open ? <>{query.loading || rubric.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : query.error || rubric.error ? <><LearningError error={query.error ?? rubric.error!}/><Button type="button" variant="quiet" onClick={changed}>{t.retry}</Button></> : !source || !criteria ? <WorkspaceState kind="unavailable" icon="assessment" description={t.rubricUnavailable} role="status"/> : <><h3>{t.criteria}</h3><WorkspaceState kind="review" icon="assessment" description={t.chooseCriterion}/>{criteria.map(criterion => <article key={criterion.key}><h4>{criterion.title}</h4><Button type="button" variant="secondary" onClick={() => setSelected(criterion.key)}>{t.openTask}</Button></article>)}{selectedKey ? <ThinkingFocusEditor key={`${source.sourceVersion}:${selectedKey}`} initiallyOpen kind="criterion" id={assessment.id} criterionKey={selectedKey} courseId={assessment.courseId} expectedRubricVersion={source.source.rubricVersion ?? undefined} onChanged={changed}/> : null}</>}</> : null}</section>;
}

export function CourseThinkingFocusReview({ courseId,sourceAvailable=true,sourceLoading=false,onLockedChange }: { courseId: string;sourceAvailable?:boolean;sourceLoading?:boolean;onLockedChange?:(locked:boolean)=>void }) {
  const { membership } = useApp();
  return <CurrentCourseThinkingFocusReview key={`${membership?.schoolId}:${membership?.userId}:${courseId}`} courseId={courseId} sourceAvailable={sourceAvailable} sourceLoading={sourceLoading} onLockedChange={onLockedChange} />;
}
function CurrentCourseThinkingFocusReview({ courseId,sourceAvailable,sourceLoading,onLockedChange }: { courseId: string;sourceAvailable:boolean;sourceLoading:boolean;onLockedChange?:(locked:boolean)=>void }) {
  const owner=useApp(),slot=`${owner.membership?.schoolId}:${owner.membership?.userId}:thinking-focus-queue:${courseId}`;
  const actorContext=JSON.stringify([owner.apiUrl,owner.membership?.schoolId,owner.membership?.userId,owner.membership?.role]);
  const restoredSelection=()=>{const contexts=owner.commandJournal.pending().flatMap(command=>{const context=thinkingCommandContexts.get(owner.commandJournal)?.get(command.key);return context?.actor===actorContext&&context.courseId===courseId?[context.selection]:[];});return contexts.length===1?contexts[0]:contexts.length>1?null:parseThinkingFocusSelection(owner.formDrafts.model(slot));};
  const [open, setOpen] = useState(()=>!!restoredSelection()), [cursor, setCursor] = useState<string | null>(()=>restoredSelection()?.cursor??null), [refresh, setRefresh] = useState(0), [selected, setSelected] = useState<ThinkingFocusSelection | null>(restoredSelection),[editorLocked,setEditorLocked]=useState(false);
  const path = `/v1/thinking-focus/courses/${courseId}?limit=25${cursor ? `&cursor=${cursor}` : ''}`;
  const { app, scope } = useReadScope(open&&sourceAvailable ? path : null, refresh); const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusQueue(value, courseId) }), [scope, courseId]);
  const query = useApiQuery(scope ? path : null, parser, refresh); const current = query.data?.scope === scope ? query.data.value : null;
  useSyncExternalStore(owner.commandJournal.subscribe,owner.commandJournal.getSnapshot,owner.commandJournal.getSnapshot);
  const pending=owner.commandJournal.pending().some(command=>selected&&(['draft','review']as const).some(action=>command.path===thinkingFocusPath(selected.target.kind.toLowerCase()as ThinkingFocusKind,selected.target.id,selected.target.criterionKey??undefined,action))),navigationLocked=editorLocked||pending;
  useEffect(()=>{onLockedChange?.(navigationLocked);return()=>onLockedChange?.(false);},[navigationLocked,onLockedChange]);
  const selectedSource=currentThinkingFocusSelection(current?.items??[],selected,courseId,!!current&&!query.loading&&!query.error);
  const replayRows=selected&&pending&&current&&!query.loading&&!query.error?current.items.filter(row=>row.courseId===courseId&&row.target.kind===selected.target.kind&&row.target.id===selected.target.id&&row.target.criterionKey===selected.target.criterionKey&&row.sourceVersion===selected.sourceVersion):[];
  const replaySource=replayRows.length===1?replayRows[0]:null;
  const root=useRef<HTMLElement|null>(null),openerTarget=useRef<string|null>(null);
  const focusIntent=useRef<{kind:'open'|'back';scope:string;origin:Element|null}|null>(null);
  const restoreFocus=useRef<{kind:'reader'|'choice';scope:string;selection:ThinkingFocusSelection}|null>(null);
  const focusAuthority=owner.status==='ready'&&owner.online&&owner.accessToken&&owner.membership?JSON.stringify([owner.apiUrl,owner.membership?.schoolId,owner.membership?.userId,owner.membership?.role,owner.accessToken,owner.selectedChildId,owner.locale,path,refresh]):null;
  const focusScope=useRef(focusAuthority);focusScope.current=focusAuthority;
  if(focusIntent.current?.scope!==focusAuthority)focusIntent.current=null;
  if(restoreFocus.current?.scope!==focusAuthority)restoreFocus.current=null;
  const focusSelection=useRef(selected);focusSelection.current=selected;
  const onEditorLocked=useCallback((value:boolean)=>setEditorLocked(value),[]);
  const cancelFocus=useCallback(()=>{focusIntent.current=null;restoreFocus.current=null;},[]);
  useEffect(()=>{if(!sourceLoading&&(!sourceAvailable||!query.loading&&(query.error||!current||selected&&!selectedSource)))cancelFocus();},[sourceAvailable,sourceLoading,query.loading,query.error,current,selected,selectedSource,cancelFocus]);
  useEffect(()=>{const cancelOnFocus=(event:FocusEvent)=>{const intent=focusIntent.current;if(event.target!==document.body&&event.target!==document.documentElement){if(intent&&event.target!==intent.origin)focusIntent.current=null;restoreFocus.current=null;}};const cancelOnInput=()=>{focusIntent.current=null;restoreFocus.current=null;};document.addEventListener('focusin',cancelOnFocus);document.addEventListener('pointerdown',cancelOnInput);document.addEventListener('keydown',cancelOnInput);return()=>{document.removeEventListener('focusin',cancelOnFocus);document.removeEventListener('pointerdown',cancelOnInput);document.removeEventListener('keydown',cancelOnInput);focusIntent.current=null;restoreFocus.current=null;};},[]);
  const detachReader=useCallback((target:HTMLHeadingElement)=>{if(document.activeElement===target&&selected&&focusAuthority)restoreFocus.current={kind:'reader',scope:focusAuthority,selection:selected};},[selected,focusAuthority]);
  const focusReader=useCallback((target:HTMLHeadingElement)=>{const intent=focusIntent.current,restored=restoreFocus.current,selection=focusSelection.current;const active=document.activeElement;if(intent?.kind==='open'&&intent.scope===focusScope.current){focusIntent.current=null;restoreFocus.current=null;if(active!==intent.origin&&active!==document.body&&active!==document.documentElement)return;target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});return;}if(restored?.kind==='reader'&&restored.scope===focusScope.current&&selection&&JSON.stringify(restored.selection)===JSON.stringify(selection)){restoreFocus.current=null;if(active===document.body||active===document.documentElement)target.focus({preventScroll:true});}},[]);
  useEffect(()=>{const restored=restoreFocus.current;if(restored?.kind!=='choice'||selected||query.loading||query.error||!current)return;const row=currentThinkingFocusSelection(current.items,restored.selection,courseId,true);restoreFocus.current=null;if(!row||restored.scope!==focusScope.current||document.activeElement!==document.body&&document.activeElement!==document.documentElement)return;root.current?.querySelector<HTMLElement>(`[data-thinking-focus-choice="${row.target.kind}:${row.target.id}:${row.target.criterionKey??''}"] button`)?.focus({preventScroll:true});},[selected,query.loading,query.error,current,courseId]);
  function trackChoice(element:HTMLLIElement|null,row:ThinkingFocusResponse){if(element)return()=>{const active=document.activeElement;if(focusAuthority&&active instanceof HTMLButtonElement&&element.contains(active))restoreFocus.current={kind:'choice',scope:focusAuthority,selection:{target:row.target,sourceVersion:row.sourceVersion,revision:row.revision,cursor}};};}
  useEffect(()=>{if(focusIntent.current?.kind!=='back'||selected||sourceLoading||!sourceAvailable||query.loading)return;const frame=requestAnimationFrame(()=>{const intent=focusIntent.current;if(intent?.kind!=='back'||intent.scope!==focusScope.current)return;const active=document.activeElement;if(active!==intent.origin&&active!==document.body&&active!==document.documentElement){focusIntent.current=null;return;}const sameChoice=root.current?.querySelector<HTMLElement>(`[data-thinking-focus-choice="${openerTarget.current}"] button`);const target=sameChoice??root.current?.querySelector<HTMLElement>('.thinking-focus-review-directory h2[tabindex="-1"]');if(!target)return;focusIntent.current=null;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'instant'});});return()=>cancelAnimationFrame(frame);},[selected,sourceAvailable,sourceLoading,query.loading,current]);
  function closeSelected(){if(navigationLocked)return;focusIntent.current=focusAuthority?{kind:'back',scope:focusAuthority,origin:document.activeElement}:null;setSelected(null);owner.formDrafts.remove(slot);}
  function choose(row:ThinkingFocusResponse,button:HTMLButtonElement){if(navigationLocked)return;const selection={target:row.target,sourceVersion:row.sourceVersion,revision:row.revision,cursor};focusIntent.current=focusAuthority?{kind:'open',scope:focusAuthority,origin:button}:null;openerTarget.current=`${row.target.kind}:${row.target.id}:${row.target.criterionKey??''}`;owner.formDrafts.saveModel(slot,selection);setSelected(selection);}
  return <section ref={root} className="thinking-focus-queue"><Button type="button" variant="quiet" disabled={navigationLocked} aria-expanded={open} onClick={() => {if(navigationLocked)return;setOpen(value => !value);setSelected(null);owner.formDrafts.remove(slot);}}>{t.reviewQueue}</Button>{open?sourceAvailable?<div className="thinking-focus-review-layout" data-selected={!!selected}><div className="thinking-focus-review-directory"><h2 tabIndex={-1}>{t.taskReviews}</h2>{query.loading?<WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/>:query.error?<LearningError error={query.error}/>:current?current.items.length?<ul className="thinking-focus-queue__items">{current.items.map(row=><li ref={element=>trackChoice(element,row)} key={`${row.target.kind}:${row.target.id}:${row.target.criterionKey??''}`} data-thinking-focus-choice={`${row.target.kind}:${row.target.id}:${row.target.criterionKey??''}`}><div><h3>{row.targetTitle}</h3><ThinkingFocusSummary value={row} locale={app.locale}/></div><Button type="button" variant="secondary" disabled={navigationLocked} onClick={event=>choose(row,event.currentTarget)}>{t.openTask}</Button></li>)}</ul>:<WorkspaceState kind={current.nextCursor?'unknown':'empty'} icon="curriculum" description={current.nextCursor?t.queuePartial:t.queueEmpty}/>:null}<Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.retry}</Button>{current?.nextCursor?<Button type="button" variant="quiet" disabled={navigationLocked} onClick={()=>{setCursor(current.nextCursor);closeSelected();}}>{t.loadMore}</Button>:null}</div>{selected?<div className="thinking-focus-review-reader">{selectedSource||pending?<ThinkingFocusEditor initiallyOpen kind={selected.target.kind.toLowerCase()as ThinkingFocusKind} id={selected.target.id} criterionKey={selected.target.criterionKey??undefined} courseId={courseId} sourceAvailable={!!selectedSource||!!replaySource} expectedSourceVersion={selected.sourceVersion} expectedRevision={selected.revision} queueCursor={selected.cursor} headingLevel={2} onReaderReady={focusReader} onReaderDetached={detachReader} onReaderUnavailable={cancelFocus} onClose={closeSelected} closeLabel={t.backToReviews} onLockedChange={onEditorLocked} onChanged={()=>setRefresh(value=>value+1)}/>:<section><Button type="button" variant="quiet" disabled={navigationLocked} onClick={closeSelected}>{t.backToReviews}</Button><WorkspaceState kind={query.loading?'loading':'review'} icon={query.loading?'refresh':'help'} description={query.loading?t.loading:t.sourceChanged}/><Button type="button" variant="quiet" onClick={()=>setRefresh(value=>value+1)}>{t.retry}</Button></section>}</div>:null}</div>:<WorkspaceState kind={sourceLoading?'loading':'review'} icon={sourceLoading?'refresh':'help'} description={sourceLoading?t.loading:t.sourceChanged} role="status"/>:null}</section>;
}

export function ThinkingFocusSnapshot({ type, sourceId }: { type: 'completion' | 'submission' | 'result'; sourceId: string }) {
  const { membership } = useApp();
  return <CurrentThinkingFocusSnapshot key={`${membership?.schoolId}:${membership?.userId}:${type}:${sourceId}`} type={type} sourceId={sourceId} />;
}
function CurrentThinkingFocusSnapshot({ type, sourceId }: { type: 'completion' | 'submission' | 'result'; sourceId: string }) {
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0);
  const path = `/v1/thinking-focus/sources/${type}/${sourceId}`;
  const { app, scope } = useReadScope(open ? path : null, refresh); const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusSnapshot(value, type, sourceId) }), [scope, type, sourceId]);
  const query = useApiQuery(scope ? path : null, parser, refresh); const current = query.data?.scope === scope ? query.data.value : null;
  return <section className="thinking-focus-snapshot"><Button type="button" variant="quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t.snapshot}</Button>{open ? <>{query.loading ? <WorkspaceState kind="loading" icon="refresh" description={t.loading} role="status"/> : query.error ? <><LearningError error={query.error} /><Button type="button" onClick={() => setRefresh(value => value + 1)}>{t.retry}</Button></> : current ? current.recorded ? current.items.length ? <ul>{current.items.map(row => <li key={`${row.target.kind}:${row.target.id}:${row.target.criterionKey ?? ''}`}><h4>{row.targetTitle}</h4><ThinkingFocusSummary value={row} locale={app.locale} /></li>)}</ul> : <WorkspaceState kind="empty" icon="curriculum" description={t.snapshotEmpty}/> : <WorkspaceState kind="unknown" icon="help" description={t.notRecorded}/> : null}</> : null}</section>;
}
