'use client';

import { useCallback, useEffect, useRef } from 'react';
import { apiRequest } from '../api/client';
import { browserDiagnosticsConfigSchema } from '@cuevo/contracts';
import { BrowserDiagnosticsSession, classifyRuntimeDiagnostic, diagnosticViewport, type DiagnosticSignal } from './browser-diagnostics';
import type { SessionReadLifecycle } from '../session/read-lifecycle';
import type { BrowserDiagnosticObservation, DiagnosticLocale } from '@cuevo/contracts/analytics';

export type { DiagnosticSignal } from './browser-diagnostics';
type CurrentDiagnosticContext = { apiUrl: string; userId?: string; schoolId?: string; accessToken?: string; ready: boolean; online: boolean; accessGeneration: number; locale: DiagnosticLocale; readLifecycle?: SessionReadLifecycle };

export function useBrowserDiagnostics(context: CurrentDiagnosticContext) {
  const scope = `${context.apiUrl}:${context.userId ?? ''}:${context.schoolId ?? ''}:${context.accessToken ?? ''}:${context.ready}:${context.online}:${context.accessGeneration}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const currentLocale = useRef(context.locale); currentLocale.current = context.locale;
  const session = useRef<BrowserDiagnosticsSession | null>(null);
  useEffect(() => {
    if (!context.ready || !context.online || !context.accessToken || !context.userId || !context.schoolId || context.readLifecycle && !context.readLifecycle.enabled) return;
    const configurationController = new AbortController();
    const readFrame = context.readLifecycle?.capture();
    const capturedScope = scope;
    const isCurrent = () => currentScope.current === capturedScope && !configurationController.signal.aborted && (!readFrame || !!context.readLifecycle?.isCurrent(readFrame));
    const config = { apiUrl: context.apiUrl, accessToken: context.accessToken, schoolId: context.schoolId };
    const reporter = new BrowserDiagnosticsSession({ isCurrent, send: async (value, signal) => {
      if (!isCurrent()) return;
      await apiRequest(config, '/v1/diagnostics/browser', { method: 'POST', key: value.diagnosticId, body: value, signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
    } });
    session.current = reporter;
    const reportRuntime = (category: BrowserDiagnosticObservation['category']) => reporter.report({ category, feature: 'other', status: 'unknown', timing: 'unknown', locale: currentLocale.current, viewport: diagnosticViewport(window.innerWidth) });
    const onError = (event: ErrorEvent) => reportRuntime(classifyRuntimeDiagnostic(event.message));
    const onRejection = () => reportRuntime('unhandled_rejection');
    const originalConsoleError = console.error;
    const diagnosticConsoleError: typeof console.error = (...args: unknown[]) => {
      // Preserve developer console behavior. Inspect only direct strings locally for known React hydration categories.
      originalConsoleError.apply(console, args);
      if (args.some(value => typeof value === 'string' && classifyRuntimeDiagnostic(value) === 'hydration_error')) reportRuntime('hydration_error');
    };
    let listening = false;
    void apiRequest(config, '/v1/diagnostics/config', { signal: AbortSignal.any([configurationController.signal, ...(readFrame ? [readFrame.signal] : []), AbortSignal.timeout(5000)]) }).then(value => {
      if (!isCurrent()) return;
      reporter.enable(value);
      if (browserDiagnosticsConfigSchema.safeParse(value).data?.enabled === true) {
        listening = true; window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection); console.error = diagnosticConsoleError;
      }
    }).catch(() => { /* Missing or denied server configuration leaves collection disabled. */ });
    return () => {
      configurationController.abort(); reporter.close();
      if (session.current === reporter) session.current = null;
      if (listening) { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); if (console.error === diagnosticConsoleError) console.error = originalConsoleError; }
    };
  }, [scope, context.apiUrl, context.accessToken, context.schoolId, context.userId, context.ready, context.online, context.readLifecycle]);
  return useCallback((value: DiagnosticSignal) => {
    session.current?.report({ ...value, locale: currentLocale.current, viewport: diagnosticViewport(window.innerWidth) });
  }, []);
}
