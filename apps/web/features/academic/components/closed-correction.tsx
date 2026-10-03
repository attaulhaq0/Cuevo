'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { CommandForm } from '../../../shared/components/command-form';
import { currentReleasedResultId, parseReleasedResult, type MarkingItem } from '../model';
import { academicEn, academicAr } from '../messages';
import { ResultHistory } from './result-history';
import { NativeResultView } from './native-result';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import { LearningApiError } from '../../../shared/api/client';
import { LearningError } from '../../../shared/components/feedback';
import { usePaginatedLearningQuery } from '../../../shared/hooks/use-paginated-query';
import { LoadMore } from '../../../shared/components/load-more';
import { closedCorrectionBasis, closedCorrectionBasisCurrent, validateClosedCorrectionReceipt, parseClosedCorrectionBasis, type ClosedCorrectionBasis } from '../closed-correction-model';
const sourceCopy = {
  en: { loading: 'Checking the previous released result for this closed work…', unavailable: 'The previous released result is not available in the current source records. Load all result pages or ask an authorized reviewer to check this closed source.', partial: 'Load all current released-result pages before correcting this review draft.', ambiguous: 'More than one current released result matches this closed source. An authorized reviewer must check the source identity before correction.' },
  ar: { loading: 'جارٍ التحقق من النتيجة الصادرة السابقة لهذا العمل المغلق…', unavailable: 'لا تتاح النتيجة الصادرة السابقة في سجلات المصادر الحالية. حمّل جميع صفحات النتائج أو اطلب من مراجع مخوّل التحقق من هذا المصدر المغلق.', partial: 'حمّل جميع صفحات النتائج الصادرة الحالية قبل تصحيح مسودة المراجعة هذه.', ambiguous: 'تطابق أكثر من نتيجة صادرة حالية هذا المصدر المغلق. يجب أن يراجع شخص مخوّل هوية المصدر قبل التصحيح.' },
};

export function ClosedCorrection({ item, onChanged }: { item: MarkingItem; onChanged: () => void }) {
  const { membership } = useApp();
  return <CurrentClosedCorrection key={`${membership?.schoolId}:${membership?.userId}:${membership?.role}:${item.id}`} item={item} onChanged={onChanged} />;
}
function CurrentClosedCorrection({ item, onChanged }: { item: MarkingItem; onChanged: () => void }) {
  const { locale, membership, status, online, commandJournal, formDrafts, apiUrl, accessToken, accessGeneration } = useApp();
  const t = locale === 'ar' ? academicAr : academicEn; const path = `/v1/submissions/${item.id}/closed-result`;
  const c = sourceCopy[locale];
  const decisionKey = `${path}:decision`; const slot = `${membership?.schoolId}:${membership?.userId}:${decisionKey}`;
  const [open, setOpen] = useState(() => !!commandJournal.get(path) || !!formDrafts.get(slot)); const [locked, setLocked] = useState(false);
  const [basis, setBasis] = useState<ClosedCorrectionBasis | null>(() => parseClosedCorrectionBasis(formDrafts.model<ClosedCorrectionBasis>(slot)) ?? closedCorrectionBasis(item));
  const can = status === 'ready' && online && !!membership && ['teacher','admin'].includes(membership.role) && canOpenWorkspace('academic', membership.entitlements, membership.role);
  const current = item.currentResult; const resultId = currentReleasedResultId(current);
  const priorScope = JSON.stringify([apiUrl,membership?.schoolId,membership?.userId,membership?.role,accessToken,online,accessGeneration,item.id,item.assessmentId,item.learnerId]);
  const priorParser = useCallback((value: unknown) => ({ ...parseReleasedResult(value), scope: priorScope }), [priorScope]);
  const priorResults = usePaginatedLearningQuery(can && current?.status === 'REVIEW' ? '/v1/results?limit=100' : null, priorParser, 0);
  const matching = priorResults.data.filter(row => row.scope === priorScope && row.submissionId === item.id && row.learnerId === item.learnerId && row.assessmentId === item.assessmentId);
  const prior = priorResults.loaded && !priorResults.loading && !priorResults.error && !priorResults.moreError && !priorResults.nextCursor && matching.length === 1 ? matching[0] : null;
  const currentBasis = closedCorrectionBasis(item, prior); const onLockedChange = useCallback((value: boolean) => setLocked(value), []);
  useEffect(() => { if (!can || priorResults.error || priorResults.moreError) { formDrafts.remove(slot); setBasis(null); } }, [can, priorResults.error, priorResults.moreError, formDrafts, slot]);
  function close() { formDrafts.remove(slot); setOpen(false); setBasis(null); }
  if (!can) return null;
  if (!currentBasis) return <section><p className="notice">{t.closedCorrectionNote}</p>{priorResults.loading ? <p role="status">{c.loading}</p> : priorResults.error ? <LearningError error={priorResults.error} /> : <p className="notice">{priorResults.nextCursor ? c.partial : matching.length > 1 ? c.ambiguous : c.unavailable}</p>}<LoadMore query={priorResults} label={t.results} /></section>;
  return <section>{current ? <section aria-label={current.status === 'RELEASED' ? t.published : t.latestDraft}><h3>{current.status === 'RELEASED' ? t.published : t.latestDraft}</h3><Status tone={current.status === 'RELEASED' ? 'positive' : 'warning'}>{current.status === 'RELEASED' ? t.published : t.review}</Status><NativeResultView result={current.model === 'numeric' ? { type: 'numeric', score: current.score, maxScore: current.maxScore, policyVersion: item.policyVersion } : current.nativeResult} /><h4>{t.feedback}</h4><p className="lesson-content" dir="auto">{current.feedback}</p></section> : null}{current?.status === 'REVIEW' && prior ? <section aria-label={t.previouslyReleased}><h3>{t.previouslyReleased}</h3><NativeResultView result={prior.nativeResult} /><p className="lesson-content" dir="auto">{prior.feedback}</p></section> : null}<p className="notice">{t.closedCorrectionNote}</p><Button type="button" variant="secondary" disabled={locked || !!commandJournal.get(path)} onClick={() => { if (open) close(); else { const next = closedCorrectionBasis(item, prior); setBasis(next); formDrafts.saveModel(slot, next); setOpen(true); } }}>{current ? t.correctClosed : t.markClosed}</Button>
    {open && basis ? <CommandForm title={basis.resultId ? t.correctClosed : t.markClosed} path={path} draftKey={decisionKey} fields={[...(item.model === 'numeric' ? [{ name: 'score', label: `${t.score} (0–${item.maxScore})`, type: 'number' as const, min: 0, max: item.maxScore, step: 'any' as const, required: true, defaultValue: current?.model === 'numeric' ? current.score : undefined }] : item.rubric.criteria.map(criterion => ({ name: `criterion:${criterion.key}`, label: criterion.title, type: 'select' as const, required: true, options: criterion.levels.map(level => ({ value: level.key, label: `${level.label} — ${level.description}` })), defaultValue: current?.model === 'rubric' ? current.nativeResult.criteria.find(choice => choice.criterionKey === criterion.key)?.levelKey : undefined }))), { name: 'feedback', label: t.feedback, type: 'textarea', required: true, defaultValue: current?.feedback, maxLength: 10000 }, { name: 'reason', label: t.correctionReason, type: 'textarea', required: true, maxLength: 2000 }, { name: 'parentVisible', label: t.parentVisible, type: 'checkbox' }, { name: 'confirmCorrection', label: t.confirmClosedCorrection, type: 'checkbox', required: true }]} body={values => {
      if (!closedCorrectionBasisCurrent(basis, item, prior)) throw new LearningApiError('conflict');
      return { ...(item.model === 'numeric' ? { score: Number(values.get('score')) } : { nativeResult: { type: 'rubric', rubricId: item.rubric.id, criteria: item.rubric.criteria.map(criterion => ({ criterionKey: criterion.key, levelKey: String(values.get(`criterion:${criterion.key}`)) })) } }), feedback: String(values.get('feedback')), reason: String(values.get('reason')), parentVisible: values.get('parentVisible') === 'on', expectedPolicyVersion: basis.policyVersion, expectedRevision: basis.markRevision, expectedSubmissionRevision: basis.submissionRevision, expectedResultId: basis.resultId, expectedResultRevision: basis.resultRevision, sourceEvidence: true };
    }} validateReceipt={(receipt, originalCommand) => { validateClosedCorrectionReceipt(receipt, originalCommand, item, membership.userId, prior); }} onLockedChange={onLockedChange} actionLabel={t.confirmAndRelease} onSaved={() => { close(); onChanged(); }} onCancel={close} note={t.closedCorrectionNote} /> : null}
    {resultId ? <ResultHistory resultId={resultId} anchor={{ submissionId: item.id, assessmentId: item.assessmentId, learnerId: item.learnerId }} /> : null}
  </section>;
}
