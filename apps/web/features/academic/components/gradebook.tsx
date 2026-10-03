'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, CuevoIcon, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApi, useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { CommandForm } from '../../../shared/components/command-form';
import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { parseCourse } from '../../learning/model';
import { parseCurrentMarking, sameNativeResult, type NativeResult } from '../model';
import { currentGradebookRead, gradebookReadScope, parseCurrentGradebook, parseCurrentGradebookPreview, validateGradebookReleaseReceipt, gradebookAmbiguousNames, type GradebookPage, type GradebookSelection, type GradebookPreview } from '../gradebook-model';
import { academicAr, academicEn } from '../messages';
import { NativeResultView } from './native-result';
import { MarkingDetail } from './marking';
import { EvidenceDetail } from './results';

export function ClassGradebook() {
  const app = useApp();
  if (!gradebookReadScope(app, '/v1/courses', 0)) return null;
  return <CurrentClassGradebook key={`${app.apiUrl}:${app.membership?.schoolId}:${app.membership?.userId}:${app.membership?.role}`} />;
}
function CurrentClassGradebook() {
  const app = useApp(); const { locale, membership, formDrafts, commandJournal } = app;
  const t = locale === 'ar' ? academicAr : academicEn;
  const courseSlot = `${membership?.schoolId}:${membership?.userId}:gradebook-course`;
  const [courseId, setCourseId] = useState(() => formDrafts.model<string>(courseSlot) ?? '');
  const [refresh, setRefresh] = useState(0); const [locked, setLocked] = useState(false);
  useSyncExternalStore(commandJournal.subscribe, commandJournal.getSnapshot, commandJournal.getSnapshot);
  const coursePath = '/v1/courses?limit=100'; const scope = gradebookReadScope(app, coursePath, refresh);
  const parser = useCallback((value: unknown) => { const course = parseCourse(value); return { ...course, sourceScope: scope }; }, [scope]);
  const courses = usePaginatedLearningQuery(scope ? coursePath : null, parser, refresh);
  const rows = courses.data.filter(row => row.sourceScope === scope);
  const selected = rows.find(row => row.id === courseId && rows.filter(candidate => candidate.title === row.title).length === 1);
  const retained = !!commandJournal.get(`/v1/courses/${courseId}/gradebook/release`);
  const onLockedChange = useCallback((value: boolean) => setLocked(value), []);
  return <section className="gradebook-workspace"><div className="gradebook-context"><div className="field"><label htmlFor="gradebook-course">{t.course}</label><select id="gradebook-course" value={selected ? courseId : ''} disabled={locked || retained} onChange={event => { setCourseId(event.target.value); formDrafts.saveModel(courseSlot, event.target.value); }}><option value="">{t.chooseGradebookCourse}</option>{rows.map(course => <option key={course.id} value={course.id} disabled={rows.filter(row => row.title === course.title).length > 1}>{course.title}</option>)}</select></div><p>{t.gradebookNote}</p></div>{courses.loading ? <p role="status">{t.loading}</p> : courses.error ? <LearningError error={courses.error} /> : null}<LoadMore query={courses} />{rows.some(course => rows.filter(row => row.title === course.title).length > 1) ? <p className="notice">{t.gradebookCourseIdentityReview}</p> : null}{selected && !courses.error ? <GradebookCourse key={`${selected.id}:${refresh}`} courseId={selected.id} onChanged={() => setRefresh(value => value + 1)} onLockedChange={onLockedChange} /> : null}</section>;
}
type Cell = GradebookPage['items'][number]['cells'][number];
type Detail = { scope: string; cell: Cell; learnerId: string; kind: 'work' | 'evidence'; opener: HTMLButtonElement };
function GradebookCourse({ courseId, onChanged, onLockedChange }: { courseId: string; onChanged: () => void; onLockedChange: (locked: boolean) => void }) {
  const app = useApp(); const { locale } = app; const t = locale === 'ar' ? academicAr : academicEn; const { request, journal } = useApi();
  useSyncExternalStore(journal.subscribe, journal.getSnapshot, journal.getSnapshot);
  const [learnerCursor, setLearnerCursor] = useState<string | null>(null); const [assessmentCursor, setAssessmentCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ scope: string; items: GradebookSelection[] } | null>(null);
  const [review, setReview] = useState<{ scope: string; value: GradebookPreview; page: GradebookPage } | null>(null);
  const [previewError, setPreviewError] = useState<LearningApiError | null>(null); const [pending, setPending] = useState(false); const [releaseLocked, setReleaseLocked] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const path = `/v1/courses/${courseId}/gradebook?learnerLimit=25&assessmentLimit=10${learnerCursor ? `&learnerCursor=${learnerCursor}` : ''}${assessmentCursor ? `&assessmentCursor=${assessmentCursor}` : ''}`;
  const scope = gradebookReadScope(app, path, 0);
  const currentScope = useRef(scope); currentScope.current = scope; const serial = useRef(0); const mounted = useRef(false);
  const parser = useCallback((value: unknown) => ({ scope, value: parseCurrentGradebook(value, courseId) }), [scope, courseId]);
  const query = useApiQuery(scope ? path : null, parser, 0); const page = currentGradebookRead(query.data, scope);
  const releasePath = `/v1/courses/${courseId}/gradebook/release`; const retained = journal.get(releasePath);
  const selections = selected?.scope === scope ? selected.items : [];
  const preview = review?.scope === scope ? review : null;
  const locked = pending || releaseLocked || !!retained;
  const activeDetail = detail?.scope === scope ? detail : null;
  const onFormLock = useCallback((value: boolean) => setReleaseLocked(value), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { serial.current++; setSelected(null); setReview(null); setPreviewError(null); setPending(false); setReleaseLocked(false); setDetail(null); }, [scope]);
  useEffect(() => { onLockedChange(locked); return () => onLockedChange(false); }, [locked, onLockedChange]);
  useEffect(() => { if (query.error) { setSelected(null); setReview(null); setDetail(null); } }, [query.error]);
  function move(learner: string | null, assessment: string | null) { if (locked) return; setLearnerCursor(learner); setAssessmentCursor(assessment); }
  function select(cell: Cell, active: boolean) {
    if (locked || !scope) return; setReview(null); setPreviewError(null);
    const rest = selections.filter(item => item.markingId !== cell.markingId);
    setSelected({ scope, items: active && cell.markingId && cell.submissionId && cell.markingRevision && cell.submissionRevision ? [...rest, { markingId: cell.markingId, submissionId: cell.submissionId, expectedRevision: cell.markingRevision, expectedSubmissionRevision: cell.submissionRevision, expectedPolicyVersion: cell.policyVersion, parentVisible: false }] : rest });
  }
  async function previewRelease() {
    if (locked || !page || !scope || !selections.length) return;
    setPending(true); setPreviewError(null); const expectedScope = scope; const requestSerial = ++serial.current; const original = structuredClone(selections); const source = page;
    try {
      const previewPath = `/v1/courses/${courseId}/gradebook/preview`;
      const response = await request(previewPath, { command: { path: previewPath, key: crypto.randomUUID(), body: { selections: original } } });
      const value = parseCurrentGradebookPreview(response, source, original);
      if (mounted.current && currentScope.current === expectedScope && serial.current === requestSerial) setReview({ scope: expectedScope, value, page: source });
    } catch (error) { if (mounted.current && currentScope.current === expectedScope && serial.current === requestSerial) setPreviewError(error instanceof LearningApiError ? error : new LearningApiError('invalid')); }
    finally { if (mounted.current && currentScope.current === expectedScope && serial.current === requestSerial) setPending(false); }
  }
  function openDetail(cell: Cell, learnerId: string, kind: Detail['kind'], opener: HTMLButtonElement) { if (scope && !locked) setDetail({ scope, cell, learnerId, kind, opener }); }
  function closeDetail() { const opener = activeDetail?.opener; setDetail(null); if (opener?.isConnected) opener.focus({ preventScroll: true }); }
  const ambiguous = gradebookAmbiguousNames(page?.items ?? []);
  const native = (value: NativeResult | null) => value ? <NativeResultView result={value} /> : null;
  return <section aria-label={t.gradebook} className="gradebook-course">
    {query.loading || !page && !query.error ? <p role="status">{t.loading}</p> : query.error ? <LearningError error={query.error} /> : page ? <>
      <header className="gradebook-heading"><div><h2>{page.courseTitle}</h2><p><bdi>{page.className} · {page.yearGroupName}</bdi></p></div><p className="gradebook-page-scope">{t.learners}: {page.items.length} / {page.learnerTotal} · {t.assessments}: {page.assessments.length} / {page.assessmentTotal}</p></header>
      <p className="learning-form__note">{t.gradebookScrollHint}</p>
      <div className="gradebook-scroll" tabIndex={0} role="region" aria-label={t.gradebookTable}><table className="gradebook-table"><caption>{t.gradebookTable}</caption><thead><tr><th scope="col">{t.learners}</th>{page.assessments.map(assessment => <th scope="col" key={assessment.id}><strong>{assessment.title}</strong><p>{assessment.referenceTitle ?? t.referenceMissing}</p></th>)}</tr></thead><tbody>{page.items.map(learner => <tr key={learner.id}><th scope="row"><bdi>{learner.learnerName}</bdi>{ambiguous.has(learner.id) ? <p className="notice">{t.gradebookIdentityReview}</p> : null}</th>{learner.cells.map(cell => <td key={cell.assessmentId}><Status tone={cell.state === 'RELEASED' ? 'positive' : cell.state === 'REVIEW' ? 'warning' : 'neutral'}>{t.gradebookStates[cell.state]}</Status>{native(cell.nativeResult)}{cell.state === 'REVIEW' && cell.releasedResult ? <details><summary>{t.previouslyReleased}</summary>{native(cell.releasedResult.nativeResult)}</details> : null}{cell.state === 'REVIEW' ? <label className="gradebook-selection"><input type="checkbox" checked={selections.some(item => item.markingId === cell.markingId)} disabled={locked || ambiguous.has(learner.id) || !selections.some(item => item.markingId === cell.markingId) && selections.length >= 25} onChange={event => select(cell, event.target.checked)} />{t.selectRelease}: <bdi>{learner.learnerName} · {page.assessments.find(item => item.id === cell.assessmentId)?.title}</bdi></label> : null}<div className="gradebook-cell-actions">{cell.submissionId ? <Button type="button" variant="quiet" disabled={locked} onClick={event => openDetail(cell, learner.id, 'work', event.currentTarget)}><CuevoIcon name="learning" size={18} />{t.openGradebookWork}</Button> : null}{cell.releasedResult ? <Button type="button" variant="quiet" disabled={locked} onClick={event => openDetail(cell, learner.id, 'evidence', event.currentTarget)}><CuevoIcon name="assessment" size={18} />{t.evidence}</Button> : null}</div></td>)}</tr>)}</tbody></table></div>
      <div className="learning-actions gradebook-actions">{learnerCursor || assessmentCursor ? <Button type="button" variant="quiet" disabled={locked} onClick={() => move(null, null)}>{t.firstGradebook}</Button> : null}{page.nextLearnerCursor ? <Button type="button" variant="secondary" disabled={locked} onClick={() => move(page.nextLearnerCursor, assessmentCursor)}>{t.nextLearners}</Button> : null}{page.nextAssessmentCursor ? <Button type="button" variant="secondary" disabled={locked} onClick={() => move(learnerCursor, page.nextAssessmentCursor)}>{t.nextAssessments}</Button> : null}<Button type="button" disabled={!selections.length || locked} onClick={() => void previewRelease()}>{pending ? t.loading : t.previewReleases} ({selections.length})</Button></div>
      {previewError ? <LearningError error={previewError} /> : null}
      {preview ? <section className="gradebook-review" aria-label={t.previewReleases}><h3>{t.previewReleases}</h3><p>{t.batchReleaseNote}</p><div className="gradebook-review__sources">{preview.value.items.map(item => <article key={item.selection.markingId}><h4><bdi>{item.learnerName} · {item.assessmentTitle}</bdi></h4><p>{item.referenceTitle}</p>{native(item.nativeResult)}<p dir="auto">{item.feedback}</p></article>)}</div><CommandForm title={t.confirmSelectedRelease} path={releasePath} fields={[...preview.value.items.map((item, index) => ({ name: `parent:${index}`, label: `${t.parentVisible}: ${item.learnerName} · ${item.assessmentTitle}`, type: 'checkbox' as const })), { name: 'confirmRelease', label: t.confirmSelectedReleaseApproval, type: 'checkbox', required: true }]} body={values => ({ selections: preview.value.items.map((item, index) => ({ ...item.selection, parentVisible: values.get(`parent:${index}`) === 'on' })), confirmRelease: values.get('confirmRelease') === 'on' })} validateReceipt={(receipt, originalCommand) => validateGradebookReleaseReceipt(receipt, originalCommand, preview.value, preview.page)} onLockedChange={onFormLock} onSaved={onChanged} onCancel={() => setReview(null)} actionLabel={t.releaseSelected} /></section> : null}
      {!preview && retained ? <CommandForm title={t.confirmSelectedRelease} path={releasePath} fields={[]} body={() => retained.body} validateReceipt={validateGradebookReleaseReceipt} onLockedChange={onFormLock} onSaved={onChanged} note={t.gradebookRetryNote} actionLabel={t.releaseSelected} /> : null}
    </> : null}
    {activeDetail ? <GradebookDetail key={`${activeDetail.kind}:${activeDetail.kind === 'work' ? activeDetail.cell.submissionId : activeDetail.cell.releasedResult?.evidenceId}`} detail={activeDetail} onClose={closeDetail} onChanged={onChanged} /> : null}
  </section>;
}
function GradebookDetail({ detail, onClose, onChanged }: { detail: Detail; onClose: () => void; onChanged: () => void }) {
  const app = useApp(); const { locale } = app; const t = locale === 'ar' ? academicAr : academicEn;
  const heading = useRef<HTMLElement | null>(null); useEffect(() => { heading.current?.focus({ preventScroll: false }); }, []);
  const sourceId = detail.cell.submissionId;
  const path = detail.kind === 'work' && sourceId ? `/v1/submissions/${sourceId}/gradebook-source` : null;
  const scope = gradebookReadScope(app, path, 0);
  const parser = useCallback((value: unknown) => {
    const item = parseCurrentMarking(value, sourceId ?? ''); const current = item.currentResult;
    if (item.learnerId !== detail.learnerId || item.assessmentId !== detail.cell.assessmentId || item.submissionRevision !== detail.cell.submissionRevision || item.policyVersion !== detail.cell.policyVersion || detail.cell.markingId && (!current || current.id !== detail.cell.markingId || current.revision !== detail.cell.markingRevision || !detail.cell.nativeResult || !sameNativeResult(current.model === 'numeric' ? { type: 'numeric', score: current.score, maxScore: current.maxScore, policyVersion: item.policyVersion } : current.nativeResult, detail.cell.nativeResult))) throw new LearningApiError('invalid');
    return { scope, value: item };
  }, [scope, sourceId, detail]);
  const query = useApiQuery(path && scope ? path : null, parser, 0); const item = currentGradebookRead(query.data, scope);
  return <section ref={heading} tabIndex={-1} className="gradebook-detail" aria-label={detail.kind === 'work' ? t.openGradebookWork : t.evidence}><Button type="button" variant="quiet" onClick={onClose}><CuevoIcon name="close" size={18} />{detail.kind === 'work' ? t.closeGradebookDetail : t.closeEvidence}</Button>{detail.kind === 'evidence' && detail.cell.releasedResult ? <EvidenceDetail evidenceId={detail.cell.releasedResult.evidenceId} learnerId={detail.learnerId} /> : query.loading || !item && !query.error ? <p role="status">{t.loading}</p> : query.error ? <LearningError error={query.error} /> : item ? <MarkingDetail item={item} onChanged={onChanged} /> : null}</section>;
}
