'use client';

import { Button } from '@cuevo/ui';
import { useApi } from '../hooks/use-api';
import { LearningError } from './feedback';
import type { LearningApiError } from '../api/client';

export function LoadMore({ query, label }: { query: { nextCursor: string | null; loading: boolean; loadingMore: boolean; loaded: boolean; moreError: LearningApiError | null; loadMore: () => void }; label?: string }) {
  const { t } = useApi();
  if (query.loading || !query.loaded) return null;
  return <div className="pagination-actions">{query.moreError ? <LearningError error={query.moreError} /> : null}{query.nextCursor ? <Button type="button" variant="secondary" disabled={query.loadingMore} aria-label={label ? `${query.loadingMore ? t.loadingMore : t.loadMore}: ${label}` : undefined} onClick={query.loadMore}>{query.loadingMore ? t.loadingMore : t.loadMore}{label ? ` · ${label}` : ''}</Button> : <p role="status">{t.allLoaded}</p>}</div>;
}
