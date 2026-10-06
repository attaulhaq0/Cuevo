'use client';

import { useCallback } from 'react';
import { CuevoIcon, Status, WorkspaceState } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningApiError } from '../../../shared/api/client';
import { canOpenWorkspace } from '../../../shared/session/capabilities';
import type { DemoGuideManifest } from '../../../shared/session/demo-guide';
import { parseInsightContextEnvelope, parseProposalPracticeContext, parseCurrentIntervention, improvementReadScope, currentImprovementRead, type InsightContextEnvelope, type Intervention } from '../../improvement/model';
import { NativeResultView } from '../../academic/ui';

export type DemoPersonalizationData = { context: NonNullable<InsightContextEnvelope['context']>; practice: Intervention; result: NonNullable<InsightContextEnvelope['context']>['recentResults'][number] };

/** Join only the recorded analysis and its exact approved task. Presentation
 * neither awards learning progress nor promotes a proposal into authority. */
export function parseDemoPersonalization(contextValue: unknown, practiceValue: unknown, manifest: DemoGuideManifest): DemoPersonalizationData | null {
  const r = manifest.records;
  if (!r.agenticRunId || !r.agenticProposalId || !r.agenticPracticeId) throw new LearningApiError('invalid');
  const practice = parseCurrentIntervention(practiceValue, manifest.actors.student, r.agenticPracticeId);
  if (practice.recommendationId !== r.agenticProposalId || practice.baselineResultId !== r.followupResultId || practice.requiresReview || practice.status !== 'ASSIGNED') throw new LearningApiError('invalid');
  const source = parseProposalPracticeContext(contextValue, { runId: r.agenticRunId, learnerId: manifest.actors.student, referenceId: practice.referenceId, baselineResultId: r.followupResultId });
  if (!source.context) return null;
  if (source.context.courseId !== r.courseId) throw new LearningApiError('invalid');
  const result = source.context.recentResults.find(row => row.resultId === r.followupResultId);
  if (!result) throw new LearningApiError('invalid');
  return { context: source.context, practice, result };
}

const copy = {
  en: {
    title: 'Personalization explained', note: 'Demonstration analysis uses prepared example output; the source records and recorded teacher approval are real local demonstration data. The original 3 to 7 comparison belongs to separate manual support.',
    objective: 'Objective in recorded context', objectiveBody: 'The intended learning connects the work, teacher review and next approved practice. This source does not establish official curriculum coverage or mastery.',
    evidence: 'Source evidence', native: 'Released result included in this analysis', included: 'Learning actions included in this recorded context', practice: 'Practice', revision: 'Revision', reflection: 'Reflection', prior: 'Prior support records included', bounded: 'These are supplied context counts, not complete learner totals. No motivation, intelligence or character score is inferred.',
    decision: 'Teacher decision', approved: 'Teacher-approved practice', decisionBody: 'The recorded approval created this exact practice. The explanation does not make another decision or change a grade.',
    next: 'Next approved action', assigned: 'Assigned', unmeasured: 'The practice is not yet completed or reassessed; its outcome is unmeasured.', readOnly: 'This is a source explanation, not an adaptive learning engine. Use the ordinary practice workspace to act.',
    loading: 'Loading the current source explanation…', unknown: 'The current source explanation is unavailable. Return to the proposal or refresh the demonstration.', denied: 'Current access does not permit this source explanation.', review: 'The linked source or practice has changed. Review it in the ordinary workspace before continuing.',
  },
  ar: {
    title: 'شرح التخصيص', note: 'يستخدم التحليل التوضيحي مخرجات مثال معدّة مسبقًا؛ سجلات المصادر واعتماد المعلّم المسجّل بيانات فعلية في العرض المحلي. تعود المقارنة الأصلية من ٣ إلى ٧ إلى الدعم اليدوي المنفصل.',
    objective: 'الهدف في السياق المسجّل', objectiveBody: 'يربط التعلّم المقصود العمل ومراجعة المعلّم والتدريب التالي المعتمد. لا يثبت هذا المصدر تغطية منهج رسمي أو إتقانًا.',
    evidence: 'شواهد المصدر', native: 'النتيجة الصادرة المضمّنة في هذا التحليل', included: 'أنشطة التعلّم المضمّنة في هذا السياق المسجّل', practice: 'التدريب', revision: 'المراجعة', reflection: 'التأمّل', prior: 'سجلات الدعم السابق المضمّنة', bounded: 'هذه أعداد السياق المقدّم وليست إجمالي سجلات الطالب. لا تُستنتج درجة للدافعية أو الذكاء أو الشخصية.',
    decision: 'قرار المعلّم', approved: 'تدريب اعتمده المعلّم', decisionBody: 'أنشأ الاعتماد المسجّل هذا التدريب المحدّد. لا يتخذ الشرح قرارًا آخر ولا يغيّر درجة.',
    next: 'الخطوة التالية المعتمدة', assigned: 'مكلّف به', unmeasured: 'لم يكتمل التدريب ولم يُعَد تقييمه بعد؛ تظل نتيجته غير مقاسة.', readOnly: 'هذا شرح للمصدر وليس محرك تعلّم تكيّفيًا. استخدم مساحة التدريب المعتادة لاتخاذ إجراء.',
    loading: 'جارٍ تحميل شرح المصدر الحالي…', unknown: 'لا يتاح شرح المصدر الحالي. ارجع إلى المقترح أو حدّث العرض.', denied: 'لا تتيح الصلاحيات الحالية شرح هذا المصدر.', review: 'تغيّر المصدر المرتبط أو التدريب. راجعه في مساحة العمل المعتادة قبل المتابعة.',
  },
} as const;

export function DemoPersonalizationView({ locale, data, state = 'unknown' }: { locale: 'en' | 'ar'; data: DemoPersonalizationData | null; state?: 'loading' | 'unknown' | 'denied' | 'review' }) {
  const t = copy[locale], number = new Intl.NumberFormat(locale);
  if (!data) return <section className="demo-personalization" data-presentation-personalization data-personalization-state={state} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}><h1>{t.title}</h1><WorkspaceState kind={state} icon={state === 'denied' ? 'shield' : 'learning'} description={t[state]} role="status" /></section>;
  const counts = (kind: 'practice' | 'revision' | 'reflection') => data.context.observations.filter(row => row.kind === kind).length;
  return <section className="demo-personalization" data-presentation-personalization data-personalization-state="ready" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-label={t.title}>
    <h1>{t.title}</h1><p className="demo-personalization__notice">{t.note}</p>
    <ol className="demo-personalization__steps">
      <li data-personalization-card="objective"><article><h2><CuevoIcon name="learning" size={24} />{t.objective}</h2><p><strong>{data.context.reference.title}</strong></p><p>{t.objectiveBody}</p></article></li>
      <li data-personalization-card="evidence"><article><h2><CuevoIcon name="assessment" size={24} />{t.evidence}</h2><p>{t.native}</p>{'score' in data.result ? <p className="demo-personalization__native" dir="ltr"><strong>{number.format(data.result.score)} / {number.format(data.result.maxScore)}</strong></p> : <NativeResultView result={data.result.nativeResult} />}
        <p>{t.included}</p><dl>{(['practice', 'revision', 'reflection'] as const).map(kind => <div key={kind}><dt>{t[kind]}</dt><dd>{number.format(counts(kind))}</dd></div>)}<div><dt>{t.prior}</dt><dd>{number.format(data.context.priorInterventions.length)}</dd></div></dl><p>{t.bounded}</p></article></li>
      <li data-personalization-card="decision"><article><h2><CuevoIcon name="person" size={24} />{t.decision}</h2><Status tone="positive">{t.approved}</Status><p><strong>{data.practice.title}</strong></p><p dir="auto">{data.practice.instructions}</p><p>{t.decisionBody}</p></article></li>
      <li data-personalization-card="next"><article><h2><CuevoIcon name="practice" size={24} />{t.next}</h2><Status>{t.assigned}</Status><p>{t.unmeasured}</p><p>{t.readOnly}</p></article></li>
    </ol>
  </section>;
}

export function DemoPersonalization({ manifest }: { manifest: DemoGuideManifest }) {
  const app = useApp(), r = manifest.records;
  const permitted = app.status === 'ready' && app.online && app.membership?.schoolId === manifest.schoolId && app.membership.role === 'teacher' && app.membership.userId === manifest.actors.teacher && canOpenWorkspace('improvement', app.membership.entitlements, app.membership.role);
  const contextPath = permitted && r.agenticRunId ? '/v1/intelligence/runs/' + r.agenticRunId + '/context' : null;
  const practicePath = permitted && r.agenticPracticeId ? '/v1/interventions/' + r.agenticPracticeId : null;
  const contextScope = improvementReadScope(app, contextPath, 0), practiceScope = improvementReadScope(app, practicePath, 0);
  const parseContext = useCallback((value: unknown) => ({ scope: contextScope, value: parseInsightContextEnvelope(value) }), [contextScope]);
  const parsePractice = useCallback((value: unknown) => ({ scope: practiceScope, value: parseCurrentIntervention(value, manifest.actors.student, r.agenticPracticeId) }), [practiceScope, manifest.actors.student, r.agenticPracticeId]);
  const contextQuery = useApiQuery(contextPath, parseContext, 0), practiceQuery = useApiQuery(practicePath, parsePractice, 0);
  const context = currentImprovementRead(contextQuery.data, contextScope), practice = currentImprovementRead(practiceQuery.data, practiceScope);
  if (!permitted) return <DemoPersonalizationView locale={app.locale} data={null} state="denied" />;
  if (contextQuery.loading || practiceQuery.loading) return <DemoPersonalizationView locale={app.locale} data={null} state="loading" />;
  if (contextQuery.error || practiceQuery.error) return <DemoPersonalizationView locale={app.locale} data={null} state={contextQuery.error?.kind === 'denied' || practiceQuery.error?.kind === 'denied' ? 'denied' : 'unknown'} />;
  let data: DemoPersonalizationData | null = null;
  try { if (context && practice) data = parseDemoPersonalization(context, practice, manifest); } catch { return <DemoPersonalizationView locale={app.locale} data={null} state="review" />; }
  return <DemoPersonalizationView locale={app.locale} data={data} />;
}
