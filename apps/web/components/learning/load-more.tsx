'use client';

import { Button } from '@cuevo/ui';
import { useLearningApi } from './use-learning';
import { LearningError } from './feedback';
import type { LearningApiError } from '../../lib/learning-api';

export function LoadMore({ query }: { query: { nextCursor: string | null; loading: boolean; loadingMore: boolean; loaded: boolean; moreError: LearningApiError | null; loadMore: () => void } }) {
  const { t } = useLearningApi();
  if (query.loading || !query.loaded) return null;
  return <div className="pagination-actions">{query.moreError ? <LearningError error={query.moreError} /> : null}{query.nextCursor ? <Button type="button" variant="secondary" disabled={query.loadingMore} onClick={query.loadMore}>{query.loadingMore ? t.loadingMore : t.loadMore}</Button> : <p role="status">{t.allLoaded}</p>}</div>;
}
