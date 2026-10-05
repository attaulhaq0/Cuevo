'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../session/providers';
import { apiRequest, LearningApiError, type Command } from '../api/client';
import { commonAr, commonEn } from '../i18n/common';
import { diagnosticFeature, diagnosticTiming, parseDiagnosticResponse } from '../diagnostics/browser-diagnostics';
import { queryReadEnabled, queryReadFrame } from './query-frame';

export function useApi() {
  const app = useApp();
  const { apiUrl, accessToken, membership, locale, refreshAccess, commandJournal, formDrafts, reportDiagnostic } = app;
  const schoolId = membership?.schoolId;
  const scope = queryReadFrame(app, null, 0);
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const t = locale === 'ar' ? commonAr : commonEn;
  const request = useCallback(async (path: string, options: { command?: Command; signal?: AbortSignal; isCurrentRead?: () => boolean } = {}) => {
    if (!accessToken || !schoolId) throw new LearningApiError('unauthorized');
    const isCurrent = () => mounted.current && currentScope.current === scope && !options.signal?.aborted && (options.isCurrentRead?.() ?? true);
    try {
      return await apiRequest({ apiUrl, accessToken, schoolId }, path, { ...(options.command ? { method: 'POST' as const, key: options.command.key, body: options.command.body, signal: options.signal } : { signal: options.signal }), observe: value => {
        const feature = diagnosticFeature(path);
        if (feature && isCurrent()) reportDiagnostic({ category: value.category, feature, status: value.status, timing: diagnosticTiming(value.durationMs) });
      } });
    } catch (error) {
      if (isCurrent() && error instanceof LearningApiError && ['denied', 'unauthorized'].includes(error.kind)) { formDrafts.clear(); }
      if (isCurrent() && error instanceof LearningApiError && error.kind === 'unauthorized') refreshAccess();
      throw error;
    }
  }, [accessToken, apiUrl, schoolId, refreshAccess, formDrafts, scope, reportDiagnostic]);
  const parseResponse = useCallback(<T,>(path: string, value: unknown, parse: (value: unknown) => T): T => {
    const feature = diagnosticFeature(path);
    return parseDiagnosticResponse(value, parse, observation => { if (feature && mounted.current && currentScope.current === scope) reportDiagnostic(observation); }, { category: 'response_invalid', feature: feature ?? 'other', status: 'invalid', timing: 'unknown' });
  }, [scope, reportDiagnostic]);
  return { request, journal: commandJournal, t, parseResponse };
}

export function useApiQuery<T>(path: string | null, parse: (value: unknown) => T, refresh: number) {
  const { request, parseResponse } = useApi();
  const app = useApp(); const { formDrafts, membership } = app;
  const frame = queryReadFrame(app, path, refresh), enabled = queryReadEnabled(app, path);
  const currentFrame = useRef(frame); currentFrame.current = frame;
  const requestRef = useRef(request); requestRef.current = request;
  const parseResponseRef = useRef(parseResponse); parseResponseRef.current = parseResponse;
  const draftScope = `${membership?.schoolId}:${membership?.userId}:`;
  const empty = { frame, data: null, loading: enabled, error: null };
  const [state, setState] = useState<{ frame: string; data: T | null; loading: boolean; error: LearningApiError | null }>(empty);
  useEffect(() => {
    if (!enabled || !path) { setState({ frame, data: null, loading: false, error: null }); return; }
    const controller = new AbortController();
    setState({ frame, data: null, loading: true, error: null });
    const currentParseResponse = parseResponseRef.current;
    void requestRef.current(path, { signal: controller.signal, isCurrentRead: () => currentFrame.current === frame }).then((value) => {
      if (!controller.signal.aborted && currentFrame.current === frame) setState({ frame, data: currentParseResponse(path, value, parse), loading: false, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted && currentFrame.current === frame) { formDrafts.clearRead(draftScope, path); setState({ frame, data: null, loading: false, error: error instanceof LearningApiError ? error : new LearningApiError('invalid') }); }
    });
    return () => controller.abort();
  }, [frame, enabled, path, parse, formDrafts, draftScope]);
  return state.frame === frame ? state : empty;
}
