'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../session/providers';
import { LearningApiError } from '../api/client';
import { PageAccumulator, pagePath, parsePage } from '../api/pagination';
import { useApi } from './use-api';

type PageState<T> = { data: T[]; nextCursor: string | null; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; loaded: boolean; context: string };
function empty<T>(context: string, loading: boolean): PageState<T> { return { data: [], nextCursor: null, loading, loadingMore: false, error: null, moreError: null, loaded: false, context }; }

export function usePaginatedLearningQuery<T extends { id: string }>(path: string | null, parse: (value: unknown) => T, refresh: number) {
  const { request } = useApi();
  const { membership, apiUrl } = useApp();
  const context = `${apiUrl}:${membership?.userId ?? ''}:${membership?.schoolId ?? ''}:${path ?? ''}:${refresh}`;
  const accumulator = useRef(new PageAccumulator<T>());
  const pending = useRef(false);
  const moreController = useRef<AbortController | null>(null);
  const requestRef = useRef(request); requestRef.current = request;
  const [state, setState] = useState<PageState<T>>(() => empty(context, !!path));
  useEffect(() => {
    accumulator.current.reset(context); pending.current = false;
    moreController.current?.abort();
    setState(empty(context, !!path));
    if (!path) return;
    const controller = new AbortController();
    void requestRef.current(path, { signal: controller.signal }).then((value) => {
      if (controller.signal.aborted) return;
      const page = parsePage(value, parse);
      if (accumulator.current.apply(context, null, page)) setState({ ...empty<T>(context, false), data: accumulator.current.items, nextCursor: page.nextCursor, loaded: true });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && accumulator.current.context === context) setState({ ...empty<T>(context, false), error: error instanceof LearningApiError ? error : new LearningApiError('invalid') });
    });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [context, path, parse]);

  const loadMore = useCallback(() => {
    if (!path || pending.current || accumulator.current.context !== context || !accumulator.current.nextCursor) return;
    const cursor = accumulator.current.nextCursor;
    const controller = new AbortController(); moreController.current = controller; pending.current = true;
    setState((value) => ({ ...value, loadingMore: true, moreError: null }));
    void requestRef.current(pagePath(path, cursor), { signal: controller.signal }).then((value) => {
      if (controller.signal.aborted) return;
      const page = parsePage(value, parse);
      if (accumulator.current.apply(context, cursor, page)) setState((current) => ({ ...current, data: accumulator.current.items, nextCursor: page.nextCursor, loadingMore: false }));
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && accumulator.current.context === context) setState((value) => ({ ...value, loadingMore: false, moreError: error instanceof LearningApiError ? error : new LearningApiError('invalid') }));
    }).finally(() => { if (accumulator.current.context === context) pending.current = false; });
  }, [context, path, parse]);
  return { ...(state.context === context ? state : empty<T>(context, !!path)), loadMore };
}
