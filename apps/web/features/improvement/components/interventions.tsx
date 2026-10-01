'use client';

import { useState } from 'react';
import { Button, Status } from '@cuevo/ui';
import { useApp } from '../../../shared/session/providers';
import type { Intervention } from '../model';
import type { NumericReleasedResult } from '../../academic/model';
import type { NumericAssessment } from '../../learning/model';
import { improvementAr, improvementEn } from '../messages';
import { CommandForm } from '../../../shared/components/command-form';

export function InterventionList({ interventions, assessments, results, canManage, onChanged }: { interventions: Intervention[]; assessments: NumericAssessment[]; results: NumericReleasedResult[]; canManage: boolean; onChanged: () => void }) {
  const { membership, locale } = useApp(); const t = locale === 'ar' ? improvementAr : improvementEn;
  const [action, setAction] = useState<{ id: string; kind: 'link' | 'measure' } | null>(null);
  function saved() { setAction(null); onChanged(); }
  return interventions.length ? <section>{interventions.map((intervention) => {
    const followUps = results.filter((result) => result.learnerId === intervention.learnerId && result.assessmentId === intervention.followUpAssessmentId && result.referenceId === intervention.referenceId);
    return <article className="academic-row" key={intervention.id} data-intervention-id={intervention.id}><div className="learning-section-heading"><h3>{intervention.title}</h3><Status tone={intervention.status === 'ASSIGNED' ? 'neutral' : 'positive'}>{intervention.status === 'ASSIGNED' ? t.assigned : intervention.status === 'COMPLETED' ? t.completed : t.measured}</Status></div><p className="lesson-content">{intervention.instructions}</p><p className="learning-form__note">{t.baselineId}: <bdi>{intervention.baselineResultId}</bdi></p>{membership?.role === 'student' && intervention.status === 'ASSIGNED' ? <CommandForm title={t.tryPractice} path={`/v1/interventions/${intervention.id}/complete`} fields={[{ name: 'reflection', label: t.reflection, type: 'textarea', maxLength: 10000 }]} body={(values) => { const reflection = String(values.get('reflection') ?? '').trim(); return reflection ? { reflection } : {}; }} onSaved={saved} actionLabel={t.complete} /> : null}
      {canManage && intervention.status === 'COMPLETED' ? <><div className="learning-actions">{!intervention.followUpAssessmentId ? <Button type="button" variant="secondary" onClick={() => setAction({ id: intervention.id, kind: 'link' })}>{t.linkFollowUp}</Button> : <Button type="button" disabled={!followUps.length} onClick={() => setAction({ id: intervention.id, kind: 'measure' })}>{t.measure}</Button>}</div>{intervention.followUpAssessmentId && !followUps.length ? <p className="learning-form__note">{t.noCompatible}</p> : null}{action?.id === intervention.id ? action.kind === 'link' ? <CommandForm title={t.linkFollowUp} path={`/v1/interventions/${intervention.id}/reassessment`} fields={[{ name: 'assessmentId', label: t.followUpAssessment, type: 'select', required: true, options: assessments.filter((assessment) => assessment.status === 'PUBLISHED').map((assessment) => ({ value: assessment.id, label: `${assessment.title} (${assessment.maxScore})` })) }]} body={(values) => ({ assessmentId: String(values.get('assessmentId')) })} onSaved={saved} onCancel={() => setAction(null)} actionLabel={t.linkFollowUp} note={t.followUpNote} /> : <CommandForm title={t.measure} path={`/v1/interventions/${intervention.id}/measure`} fields={[{ name: 'followUpResultId', label: t.followUpResult, type: 'select', required: true, options: followUps.map((result) => ({ value: result.id, label: `${result.assessmentTitle ?? result.id} · ${result.score}/${result.maxScore}` })) }, { name: 'minimumChange', label: t.minimumChange, type: 'number', min: 0.01, step: 'any', required: true }]} body={(values) => ({ followUpResultId: String(values.get('followUpResultId')), minimumChange: Number(values.get('minimumChange')) })} onSaved={saved} onCancel={() => setAction(null)} actionLabel={t.measure} note={t.thresholdNote} /> : null}</> : null}
    </article>;
  })}</section> : <p className="learning-empty">{t.noTasks}</p>;
}
