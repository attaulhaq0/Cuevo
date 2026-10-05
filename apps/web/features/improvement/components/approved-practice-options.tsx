'use client';
import { useCallback } from 'react';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
import { WorkspaceState } from '@cuevo/ui';
import { parseProposalPracticeContext } from '../model';
export function ApprovedPracticeOptions({ runId, learnerId, referenceId, baselineResultId, selected, onSelected, locked }: { runId: string; learnerId:string;referenceId:string;baselineResultId:string;selected: string[]; onSelected: (ids: string[]) => void; locked: boolean }) {
  const { locale } = useApp(); const ar = locale === 'ar'; const parseContext=useCallback((value:unknown)=>parseProposalPracticeContext(value,{runId,learnerId,referenceId,baselineResultId}),[runId,learnerId,referenceId,baselineResultId]);const current = useApiQuery(`/v1/intelligence/runs/${runId}/context`, parseContext, 0);
  if (current.loading) return <WorkspaceState kind="loading" icon="refresh" title={ar ? 'جارٍ تحميل خيارات التدريب…' : 'Loading practice options…'} role="status"/>;
  if (current.error) return <LearningError error={current.error} />;
  if (!current.data?.context) return null;
  const options = current.data.context.learningOptions.filter(option => option.kind === 'practice');
  return options.length ? <fieldset disabled={locked}><legend>{ar ? 'خيارات تدريب معتمدة للطالب (اختيارية، حتى ثلاثة)' : 'Approved practice choices for the learner (optional, up to three)'}</legend><p>{ar ? 'اختيار هذه الأنشطة في الموافقة يتيح للطالب اختيار تدريب واحد. تبقى الهوية والتعليمات الأصلية محفوظة.' : 'Selecting these activities in the approval allows the learner to choose one practice. Original identity and instructions remain recorded.'}</p>{options.map(option => <div className="checkbox-field" key={option.activityId}><input type="checkbox" id={`approve-practice-${runId}-${option.activityId}`} checked={selected.includes(option.activityId)} disabled={!selected.includes(option.activityId) && selected.length >= 3} onChange={event => onSelected(event.target.checked ? [...selected, option.activityId] : selected.filter(id => id !== option.activityId))} /><label htmlFor={`approve-practice-${runId}-${option.activityId}`}>{option.title}</label><p>{option.instructions}</p></div>)}</fieldset> : null;
}
