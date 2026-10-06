type ChoiceSource = { loaded: boolean; loading: boolean; loadingMore: boolean; nextCursor: string | null; error: unknown; moreError: unknown };
type Choice = { value: string; requiresReview: boolean };
/** Choice-read status supplies presentation only; the exact learner read keeps its own complete-source guard. */
export function learnerProfileChoiceState(source: ChoiceSource, choices: Choice[], selected: string): 'EMPTY' | 'LOADING' | 'FAILED' | 'INCOMPLETE' | 'CHOOSE' | 'SELECTED' | 'REQUIRES_REVIEW' {
  if (source.error || source.moreError) return 'FAILED';
  if (!source.loaded || source.loading || source.loadingMore) return 'LOADING';
  if (source.nextCursor) return 'INCOMPLETE';
  if (!choices.length) return 'EMPTY';
  if (selected) return choices.some(choice => choice.value === selected && !choice.requiresReview) ? 'SELECTED' : 'REQUIRES_REVIEW';
  return choices.some(choice => !choice.requiresReview) ? 'CHOOSE' : 'REQUIRES_REVIEW';
}
