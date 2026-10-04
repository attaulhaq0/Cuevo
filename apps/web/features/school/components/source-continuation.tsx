'use client';

import { LearningError } from '../../../shared/components/feedback';
import { LoadMore } from '../../../shared/components/load-more';
import type { LearningApiError } from '../../../shared/api/client';

/** An absent continuation has no row; current paging/error authority stays shared. */
export function SchoolSourceContinuation({ query, label, allowPage = true }: { query: { nextCursor: string | null; loading: boolean; loadingMore: boolean; loaded: boolean; moreError: LearningApiError | null; loadMore: () => void }; label: string; allowPage?: boolean }) {
  const paging = !!query.nextCursor && allowPage;
  if (!query.moreError && !paging) return null;
  return <div className="school-source-continuation">{paging ? <LoadMore query={query} label={label} /> : query.moreError ? <LearningError error={query.moreError} /> : null}</div>;
}
