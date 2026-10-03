import type { ReleasedResult } from '../academic/model.ts';
import type { PersonChoice } from '../../shared/api/people.ts';
export function baselineLabel(result: ReleasedResult, people: PersonChoice[], locale: string, unknown: string): string {
  const learner = people.find(person => person.id === result.learnerId);
  const number = new Intl.NumberFormat(locale);
  return [learner?.displayName ?? result.learnerName ?? unknown, ...(learner?.classLabels ?? []), result.assessmentTitle ?? unknown, result.model==='numeric'?`${number.format(result.score)} / ${number.format(result.maxScore)}`:result.nativeResult.rubricTitle, new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(result.createdAt)), `${locale === 'ar' ? 'مراجعة' : 'Revision'} ${number.format(result.revision)}`].join(' · ');
}
