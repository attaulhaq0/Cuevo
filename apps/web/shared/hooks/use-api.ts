'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../session/providers';
import { apiRequest, LearningApiError, type Command } from '../api/client';
import { commonAr, commonEn } from '../i18n/common';
import { diagnosticFeature, diagnosticTiming, parseDiagnosticResponse } from '../diagnostics/browser-diagnostics';

export function useApi() {
  const { apiUrl, accessToken, membership, locale, refreshAccess, commandJournal, formDrafts, reportDiagnostic, accessGeneration } = useApp();
  const schoolId = membership?.schoolId;
  const scope = `${membership?.userId}:${schoolId}:${accessToken ?? ''}:${accessGeneration}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const t = locale === 'ar' ? commonAr : commonEn;
  const request = useCallback(async (path: string, options: { command?: Command; signal?: AbortSignal } = {}) => {
    if (!accessToken || !schoolId) throw new LearningApiError('unauthorized');
    try {
      return await apiRequest({ apiUrl, accessToken, schoolId }, path, { ...(options.command ? { method: 'POST' as const, key: options.command.key, body: options.command.body, signal: options.signal } : { signal: options.signal }), observe: value => {
        const feature = diagnosticFeature(path);
        if (feature && mounted.current && currentScope.current === scope && !options.signal?.aborted) reportDiagnostic({ category: value.category, feature, status: value.status, timing: diagnosticTiming(value.durationMs) });
      } });
    } catch (error) {
      if (mounted.current && currentScope.current === scope && error instanceof LearningApiError && ['denied', 'unauthorized'].includes(error.kind)) { formDrafts.clear(); }
      if (mounted.current && currentScope.current === scope && error instanceof LearningApiError && error.kind === 'unauthorized') refreshAccess();
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
  const { formDrafts, membership, accessGeneration } = useApp();
  const draftScope = `${membership?.schoolId}:${membership?.userId}:`;
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: LearningApiError | null }>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return; }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    void request(path, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setState({ data: parseResponse(path, value, parse), loading: false, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted) { formDrafts.clearRead(draftScope, path); setState({ data: null, loading: false, error: error instanceof LearningApiError ? error : new LearningApiError('invalid') }); }
    });
    return () => controller.abort();
  }, [path, parse, refresh, request, parseResponse, formDrafts, draftScope, accessGeneration]);
  return state;
}
