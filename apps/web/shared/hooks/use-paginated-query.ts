'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../session/providers';
import { LearningApiError } from '../api/client';
import { PageAccumulator, pagePath, parsePage } from '../api/pagination';
import { useApi } from './use-api';
import { queryReadEnabled, queryReadFrame } from './query-frame';

type PageState<T> = { data: T[]; nextCursor: string | null; loading: boolean; loadingMore: boolean; error: LearningApiError | null; moreError: LearningApiError | null; loaded: boolean; context: string };
function empty<T>(context: string, loading: boolean): PageState<T> { return { data: [], nextCursor: null, loading, loadingMore: false, error: null, moreError: null, loaded: false, context }; }

export function usePaginatedLearningQuery<T extends { id: string }>(path: string | null, parse: (value: unknown) => T, refresh: number) {
  const { request, parseResponse } = useApi();
  const app = useApp(); const { membership, formDrafts } = app;
  const context = queryReadFrame(app, path, refresh), enabled = queryReadEnabled(app, path);
  const currentContext = useRef(context); currentContext.current = context;
  const accumulator = useRef(new PageAccumulator<T>());
  const pending = useRef(false);
  const moreController = useRef<AbortController | null>(null);
  const requestRef = useRef(request); requestRef.current = request;
  const parseResponseRef = useRef(parseResponse); parseResponseRef.current = parseResponse;
  const [state, setState] = useState<PageState<T>>(() => empty(context, enabled));
  useEffect(() => {
    accumulator.current.reset(context); pending.current = false;
    moreController.current?.abort();
    setState(empty(context, enabled));
    if (!enabled || !path) return;
    const controller = new AbortController();
    const currentParseResponse = parseResponseRef.current;
    void requestRef.current(path, { signal: controller.signal, isCurrentRead: () => currentContext.current === context }).then((value) => {
      if (controller.signal.aborted || currentContext.current !== context) return;
      const page = currentParseResponse(path, value, value => parsePage(value, parse));
      if (accumulator.current.apply(context, null, page)) setState({ ...empty<T>(context, false), data: accumulator.current.items, nextCursor: page.nextCursor, loaded: true });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && currentContext.current === context && accumulator.current.context === context) { formDrafts.clearRead(`${membership?.schoolId}:${membership?.userId}:`, path); setState({ ...empty<T>(context, false), error: error instanceof LearningApiError ? error : new LearningApiError('invalid') }); }
    });
    return () => { controller.abort(); moreController.current?.abort(); };
  }, [context, enabled, path, parse, formDrafts]);

  const loadMore = useCallback(() => {
    if (!enabled || !path || currentContext.current !== context || pending.current || accumulator.current.context !== context || !accumulator.current.nextCursor) return;
    const cursor = accumulator.current.nextCursor;
    const controller = new AbortController(); moreController.current = controller; pending.current = true;
    const currentParseResponse = parseResponseRef.current;
    setState((value) => ({ ...value, loadingMore: true, moreError: null }));
    void requestRef.current(pagePath(path, cursor), { signal: controller.signal, isCurrentRead: () => currentContext.current === context }).then((value) => {
      if (controller.signal.aborted || currentContext.current !== context) return;
      const page = currentParseResponse(path, value, value => parsePage(value, parse));
      if (accumulator.current.apply(context, cursor, page)) { pending.current = false; setState((current) => ({ ...current, data: accumulator.current.items, nextCursor: page.nextCursor, loadingMore: false })); }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && currentContext.current === context && accumulator.current.context === context) { pending.current = false; setState((value) => ({ ...value, loadingMore: false, moreError: error instanceof LearningApiError ? error : new LearningApiError('invalid') })); }
    }).finally(() => { if (currentContext.current === context && accumulator.current.context === context && moreController.current === controller) pending.current = false; });
  }, [context, enabled, path, parse]);
  return { ...(state.context === context ? state : empty<T>(context, enabled)), loadMore };
}
