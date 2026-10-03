'use client';
import { z } from 'zod';
import { insightContextSchema } from '@cuevo/contracts';
import { useApp } from '../../../shared/session/providers';
import { useApiQuery } from '../../../shared/hooks/use-api';
import { LearningError } from '../../../shared/components/feedback';
const parseContext = (value: unknown) => z.object({ runId: z.uuid(), context: insightContextSchema.nullable() }).strict().parse(value);
export function ApprovedPracticeOptions({ runId, selected, onSelected, locked }: { runId: string; selected: string[]; onSelected: (ids: string[]) => void; locked: boolean }) {
  const { locale } = useApp(); const ar = locale === 'ar'; const current = useApiQuery(`/v1/intelligence/runs/${runId}/context`, parseContext, 0);
  if (current.loading) return <p role="status">{ar ? 'جارٍ تحميل خيارات التدريب…' : 'Loading practice options…'}</p>;
  if (current.error) return <LearningError error={current.error} />;
  if (!current.data?.context) return null;
  const options = current.data.context.learningOptions.filter(option => option.kind === 'practice');
  return options.length ? <fieldset disabled={locked}><legend>{ar ? 'خيارات تدريب معتمدة للطالب (اختيارية، حتى ثلاثة)' : 'Approved practice choices for the learner (optional, up to three)'}</legend><p>{ar ? 'اختيار هذه الأنشطة في الموافقة يتيح للطالب اختيار تدريب واحد. تبقى الهوية والتعليمات الأصلية محفوظة.' : 'Selecting these activities in the approval allows the learner to choose one practice. Original identity and instructions remain recorded.'}</p>{options.map(option => <div className="checkbox-field" key={option.activityId}><input type="checkbox" id={`approve-practice-${runId}-${option.activityId}`} checked={selected.includes(option.activityId)} disabled={!selected.includes(option.activityId) && selected.length >= 3} onChange={event => onSelected(event.target.checked ? [...selected, option.activityId] : selected.filter(id => id !== option.activityId))} /><label htmlFor={`approve-practice-${runId}-${option.activityId}`}>{option.title}</label><p>{option.instructions}</p></div>)}</fieldset> : null;
}
