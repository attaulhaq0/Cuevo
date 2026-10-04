'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CuevoIcon } from '@cuevo/ui';
import { COGNITIVE_PROCESSES, thinkingFocusResponseSchema, thinkingFocusReviewInputSchema, type CognitiveProcess, type ThinkingFocusResponse, type LearningResource } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { CommandForm, type FormField } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { buildThinkingFocusDraft, currentThinkingFocusRead, parseThinkingFocusCatalogue, parseThinkingFocusQueue, parseThinkingFocusRead, parseThinkingFocusSnapshot, parseThinkingFocusRubric, parseThinkingFocusMaterials, thinkingFocusMaterialsPath, thinkingFocusActionAvailable, thinkingFocusPath, thinkingFocusTarget, validateThinkingFocusReceipt, type ThinkingFocusKind } from '../thinking-focus-model';
import type { Assessment } from '../model';
import { LearningApiError } from '../../../shared/api/client';
import { thinkingFocusAr, thinkingFocusEn } from '../thinking-focus-messages';

type EditorProps = { kind: ThinkingFocusKind; id: string; criterionKey?: string; courseId: string; expectedRubricVersion?: string; onChanged?: () => void; initiallyOpen?: boolean };
function useReadScope(path: string | null, refresh = 0) {
  const app = useApp();
  const ready = app.status === 'ready' && app.online && !!app.accessToken && !!app.membership;
  return { app, scope: ready && path ? JSON.stringify([app.apiUrl, app.membership?.schoolId, app.membership?.userId, app.membership?.role, app.accessToken, app.accessGeneration, app.selectedChildId, app.locale, path, refresh]) : null };
}

function ThinkingFocusMaterials({ source, readScope, onReady }: { source: ThinkingFocusResponse; readScope: string | null; onReady: (value: string | null) => void }) {
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
  return <section className="thinking-focus-materials"><h4>{t.materials}</h4>{query.loading ? <p role="status">{t.loading}</p> : query.error ? <LearningError error={query.error}/> : manifest ? manifest.items.length ? <ul>{manifest.items.map(resource => <li key={`${resource.id}:${resource.revisionId}`}><div><p>{resource.title}</p><small><bdi>{resource.name}</bdi></small></div><Button type="button" variant="quiet" disabled={!!pending} onClick={() => void download(resource)}>{pending === resource.id ? t.openingMaterial : t.openMaterial}</Button></li>)}</ul> : <p>{t.noMaterials}</p> : <p role="status">{t.materialUnknown}</p>}{error ? <LearningError error={error}/> : null}{query.error || error ? <Button type="button" variant="quiet" onClick={() => { setError(null); setRefresh(value => value + 1); }}>{t.retry}</Button> : null}</section>;
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

function CurrentThinkingFocusEditor({ kind, id, criterionKey, courseId, expectedRubricVersion, onChanged, initiallyOpen = false }: EditorProps) {
  const owner = useApp();
  const restoredAction = (['draft', 'review'] as const).find(value => owner.commandJournal.get(thinkingFocusPath(kind, id, criterionKey, value)) || owner.formDrafts.model(`${owner.membership?.schoolId}:${owner.membership?.userId}:thinking-focus-basis:${thinkingFocusPath(kind, id, criterionKey, value)}`));
  const [open, setOpen] = useState(initiallyOpen || !!restoredAction);
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<'draft' | 'review' | null>(restoredAction ?? null);
  const [basis, setBasis] = useState<{ scope: string; value: ThinkingFocusResponse } | null>(null);
  const [locked, setLocked] = useState(false);
  const [primary, setPrimary] = useState<CognitiveProcess | null>(null);
  const [materialsReady, setMaterialsReady] = useState<string | null>(null);
  const path = thinkingFocusPath(kind, id, criterionKey);
  const { app, scope } = useReadScope(open ? path : null, refresh);
  const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusRead(value, thinkingFocusTarget(kind, id, criterionKey), courseId) }), [scope, kind, id, criterionKey, courseId]);
  const read = useApiQuery(scope ? path : null, parser, refresh);
  const latest = currentThinkingFocusRead(read.data, scope);
  const current = latest && (!expectedRubricVersion || latest.source.rubricVersion === expectedRubricVersion) ? latest : null;
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
  return <section className="thinking-focus-editor">
    <Button type="button" variant="quiet" disabled={locked} aria-expanded={open} onClick={() => setOpen(value => !value)}><CuevoIcon name="learning" size={20} />{open ? t.close : t.open}</Button>
    {open ? <>{read.loading ? <p role="status">{t.loading}</p> : read.error ? <><LearningError error={read.error} /><Button type="button" variant="quiet" onClick={() => setRefresh(value => value + 1)}>{t.retry}</Button></> : current ? <>
      <header className="cuevo-section-header"><div className="cuevo-section-header__context"><h3>{current.targetTitle}</h3><ThinkingFocusSummary value={current} locale={app.locale} /></div><div className="learning-actions">{current.canAuthor ? <Button type="button" variant="secondary" disabled={locked || materialsReady !== scope} onClick={() => start('draft')}>{t.edit}</Button> : null}{current.canReview && current.classification ? <Button type="button" disabled={locked || materialsReady !== scope} onClick={() => start('review')}>{t.review}</Button> : null}</div></header>
      <details className="thinking-focus-source" open={action === 'review' ? true : undefined}><summary>{t.source}</summary><p className="lesson-content">{current.source.instructions || t.noInstructions}</p>{current.source.criterionTitle ? <p>{current.source.criterionTitle}</p> : null}{current.classification ? <p>{current.classification.rationale}</p> : null}</details>
      <ThinkingFocusMaterials key={`${scope}:${current.sourceVersion}`} source={current} readScope={scope} onReady={setMaterialsReady}/>
      {catalogue.error ? <LearningError error={catalogue.error} /> : null}
      {action && frozen && actionPath && currentPermission ? sourceMatches || current?.sourceVersion === frozen.sourceVersion && app.commandJournal.get(actionPath) ? catalogue.loading ? <p role="status">{t.loading}</p> : catalogue.data ? <CommandForm key={`${actionPath}:${frozen.revision}:${frozen.sourceVersion}`} title={action === 'draft' ? t.edit : t.review} regionLabel={`${action === 'draft' ? t.edit : t.review}: ${frozen.targetTitle}`} path={actionPath} fields={fields} body={values => { if (materialsReady !== scope) throw new LearningApiError('conflict'); return action === 'draft' ? buildThinkingFocusDraft(values, frozen) : thinkingFocusReviewInputSchema.parse({ expectedRevision: frozen.revision, expectedSourceVersion: frozen.sourceVersion, decision: values.get('decision'), reason: values.get('reason'), confirmReview: values.get('confirmReview') === 'on' }); }} validateReceipt={(receipt, command) => validateThinkingFocusReceipt(receipt, command, frozen, app.membership!.userId, action)} onValuesChange={values => { if (action === 'draft' && COGNITIVE_PROCESSES.includes(values.get('primaryProcess') as CognitiveProcess)) setPrimary(values.get('primaryProcess') as CognitiveProcess); }} onSaved={saved} onCancel={cancel} onLockedChange={setLocked} actionLabel={action === 'draft' ? t.draft : t.review} note={t.reviewNote} /> : null : <p className="notice">{t.sourceChanged}</p> : null}
    </> : latest ? <p role="status">{t.sourceChanged}</p> : null}</> : null}
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
  return <section className="thinking-focus-criteria"><Button type="button" variant="quiet" aria-expanded={open} onClick={() => { setOpen(value => !value); setSelected(null); }}>{t.criteria}</Button>{open ? <>{query.loading || rubric.loading ? <p role="status">{t.loading}</p> : query.error || rubric.error ? <><LearningError error={query.error ?? rubric.error!}/><Button type="button" variant="quiet" onClick={changed}>{t.retry}</Button></> : !source || !criteria ? <p role="status">{t.rubricUnavailable}</p> : <><h3>{t.criteria}</h3><p>{t.chooseCriterion}</p>{criteria.map(criterion => <article key={criterion.key}><h4>{criterion.title}</h4><Button type="button" variant="secondary" onClick={() => setSelected(criterion.key)}>{t.openTask}</Button></article>)}{selectedKey ? <ThinkingFocusEditor key={`${source.sourceVersion}:${selectedKey}`} initiallyOpen kind="criterion" id={assessment.id} criterionKey={selectedKey} courseId={assessment.courseId} expectedRubricVersion={source.source.rubricVersion ?? undefined} onChanged={changed}/> : null}</>}</> : null}</section>;
}

export function CourseThinkingFocusReview({ courseId }: { courseId: string }) {
  const { membership } = useApp();
  return <CurrentCourseThinkingFocusReview key={`${membership?.schoolId}:${membership?.userId}:${courseId}`} courseId={courseId} />;
}
function CurrentCourseThinkingFocusReview({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false), [cursor, setCursor] = useState<string | null>(null), [refresh, setRefresh] = useState(0), [selected, setSelected] = useState<ThinkingFocusResponse | null>(null);
  const path = `/v1/thinking-focus/courses/${courseId}?limit=25${cursor ? `&cursor=${cursor}` : ''}`;
  const { app, scope } = useReadScope(open ? path : null, refresh); const t = app.locale === 'ar' ? thinkingFocusAr : thinkingFocusEn;
  const parser = useCallback((value: unknown) => ({ scope, value: parseThinkingFocusQueue(value, courseId) }), [scope, courseId]);
  const query = useApiQuery(scope ? path : null, parser, refresh); const current = query.data?.scope === scope ? query.data.value : null;
  return <section className="thinking-focus-queue"><Button type="button" variant="quiet" aria-expanded={open} onClick={() => { setOpen(value => !value); setSelected(null); }}>{t.reviewQueue}</Button>{open ? <>{query.loading ? <p role="status">{t.loading}</p> : query.error ? <><LearningError error={query.error} /><Button type="button" onClick={() => setRefresh(value => value + 1)}>{t.retry}</Button></> : current ? <>{current.items.length ? <ul className="thinking-focus-queue__items">{current.items.map(row => <li key={`${row.target.kind}:${row.target.id}:${row.target.criterionKey ?? ''}`}><div><h3>{row.targetTitle}</h3><ThinkingFocusSummary value={row} locale={app.locale} /></div><Button type="button" variant="secondary" onClick={() => setSelected(row)}>{t.openTask}</Button></li>)}</ul> : <p>{t.queueEmpty}</p>}{current.nextCursor ? <Button type="button" variant="quiet" onClick={() => { setCursor(current.nextCursor); setSelected(null); }}>{t.loadMore}</Button> : null}</> : null}{selected && current?.items.some(row => row.target.kind === selected.target.kind && row.target.id === selected.target.id && row.target.criterionKey === selected.target.criterionKey) ? <ThinkingFocusEditor initiallyOpen kind={selected.target.kind.toLowerCase() as ThinkingFocusKind} id={selected.target.id} criterionKey={selected.target.criterionKey ?? undefined} courseId={courseId} onChanged={() => setRefresh(value => value + 1)} /> : null}</> : null}</section>;
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
  return <section className="thinking-focus-snapshot"><Button type="button" variant="quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t.snapshot}</Button>{open ? <>{query.loading ? <p role="status">{t.loading}</p> : query.error ? <><LearningError error={query.error} /><Button type="button" onClick={() => setRefresh(value => value + 1)}>{t.retry}</Button></> : current ? current.recorded ? current.items.length ? <ul>{current.items.map(row => <li key={`${row.target.kind}:${row.target.id}:${row.target.criterionKey ?? ''}`}><h4>{row.targetTitle}</h4><ThinkingFocusSummary value={row} locale={app.locale} /></li>)}</ul> : <p>{t.snapshotEmpty}</p> : <p>{t.notRecorded}</p> : null}</> : null}</section>;
}
