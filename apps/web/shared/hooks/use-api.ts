'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../session/providers';
import { apiRequest, LearningApiError, type Command } from '../api/client';
import { commonAr, commonEn } from '../i18n/common';

export function useApi() {
  const { apiUrl, accessToken, membership, locale, refreshAccess, commandJournal } = useApp();
  const schoolId = membership?.schoolId;
  const t = locale === 'ar' ? commonAr : commonEn;
  const request = useCallback(async (path: string, options: { command?: Command; signal?: AbortSignal } = {}) => {
    if (!accessToken || !schoolId) throw new LearningApiError('unauthorized');
    try {
      return await apiRequest({ apiUrl, accessToken, schoolId }, path, options.command ? { method: 'POST', key: options.command.key, body: options.command.body, signal: options.signal } : { signal: options.signal });
    } catch (error) {
      if (error instanceof LearningApiError && error.kind === 'unauthorized') refreshAccess();
      throw error;
    }
  }, [accessToken, apiUrl, schoolId, refreshAccess]);
  return { request, journal: commandJournal, t };
}

export function useApiQuery<T>(path: string | null, parse: (value: unknown) => T, refresh: number) {
  const { request } = useApi();
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: LearningApiError | null }>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: null }); return; }
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    void request(path, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setState({ data: parse(value), loading: false, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ data: null, loading: false, error: error instanceof LearningApiError ? error : new LearningApiError('invalid') });
    });
    return () => controller.abort();
  }, [path, parse, refresh, request]);
  return state;
}
