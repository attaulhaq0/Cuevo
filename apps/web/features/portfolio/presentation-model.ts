import type { ReleasedResult } from '../academic/model.ts';

export function portfolioReviewFocus(input:{reviewing:boolean;focusOnLoad:boolean;alreadyFocused:boolean;loading:boolean;settled:boolean;activeIntent:boolean}):'none'|'focus'|'scroll'{if(!input.focusOnLoad||input.alreadyFocused||input.loading||!input.settled||!input.activeIntent)return'none';return input.reviewing?'scroll':'focus';}

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
