import type { ReleasedResult } from '../academic/model.ts';

type ChoiceLabels = { sourceTitleUnavailable: string; releasedOn: string; resultRevision: string };
export function portfolioReleasedWorkChoices(results: ReleasedResult[], locale: 'en' | 'ar', labels: ChoiceLabels): { value: string; label: string; ambiguous: boolean }[] {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const number = new Intl.NumberFormat(locale);
  const choices = results.map(result => ({
    value: result.evidenceId,
    label: [result.assessmentTitle?.trim() || labels.sourceTitleUnavailable, result.referenceTitle?.trim(), `${labels.releasedOn} ${date.format(new Date(result.createdAt))}`, `${labels.resultRevision} ${number.format(result.revision)}`].filter(Boolean).join(' · '),
    unknown: !result.assessmentTitle?.trim(),
  }));
  return choices.map(choice => ({ value: choice.value, label: choice.label, ambiguous: choice.unknown || choices.filter(candidate => candidate.label === choice.label).length > 1 }));
}
