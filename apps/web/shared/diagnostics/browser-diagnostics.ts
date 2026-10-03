import { browserDiagnosticObservationSchema, browserDiagnosticsConfigSchema } from '@cuevo/contracts';
import type { BrowserDiagnostic, BrowserDiagnosticObservation, DiagnosticCategory, DiagnosticFeature, DiagnosticTiming, DiagnosticViewport } from '@cuevo/contracts/analytics';

export function diagnosticFeature(path: string): DiagnosticFeature | null {
  const route = path.split('?', 1)[0];
  if (/^\/v1\/diagnostics(?:\/|$)/.test(route)) return null;
  if (/^\/v1\/(?:me)(?:\/|$)/.test(route)) return 'session';
  if (/^\/v1\/(?:school|people|children)(?:\/|$)/.test(route)) return 'school';
  if (/^\/v1\/(?:courses|assignments|quizzes|submissions|activities|lessons|learning)(?:\/|$)/.test(route)) return 'learning';
  if (/^\/v1\/(?:academic|results|assessments|rubrics|gradebook)(?:\/|$)/.test(route)) return 'academic';
  if (/^\/v1\/(?:curriculum)(?:\/|$)/.test(route)) return 'curriculum';
  if (/^\/v1\/(?:learner-state|attention|reports|progress)(?:\/|$)/.test(route)) return 'progress';
  if (/^\/v1\/(?:intelligence|recommendations|interventions|reassessments|outcomes|improvement)(?:\/|$)/.test(route)) return 'improvement';
  if (/^\/v1\/(?:community|conversations|notifications)(?:\/|$)/.test(route)) return 'community';
  if (/^\/v1\/(?:portfolio)(?:\/|$)/.test(route)) return 'portfolio';
  if (/^\/v1\/(?:development|goals)(?:\/|$)/.test(route)) return 'development';
  if (/^\/v1\/(?:assets|resources)(?:\/|$)/.test(route)) return 'files';
  return 'other';
}
export function diagnosticTiming(elapsed: number): DiagnosticTiming {
  return !Number.isFinite(elapsed) || elapsed < 0 ? 'unknown' : elapsed < 250 ? 'under_250ms' : elapsed < 1000 ? '250_to_999ms' : elapsed < 5000 ? '1_to_4s' : elapsed < 15000 ? '5_to_14s' : '15s_or_more';
}
export function diagnosticViewport(width: number): DiagnosticViewport { return !Number.isFinite(width) || width <= 0 ? 'unknown' : width < 768 ? 'mobile' : width < 1200 ? 'tablet' : 'desktop'; }
export function classifyRuntimeDiagnostic(value: unknown): DiagnosticCategory {
  // Text is inspected locally only to select a fixed category; it is never returned or recorded.
  return typeof value === 'string' && /hydration failed|hydration mismatch|hydrated but some attributes|server rendered HTML didn't match|text content does not match server-rendered HTML|\bMinified React error #418\b/i.test(value) ? 'hydration_error' : 'runtime_error';
}
export type DiagnosticSignal = Pick<BrowserDiagnosticObservation, 'category' | 'feature' | 'status' | 'timing'>;
export function parseDiagnosticResponse<T>(value: unknown, parse: (value: unknown) => T, report: (observation: DiagnosticSignal) => void, context: DiagnosticSignal): T {
  try { return parse(value); } catch (error) { try { report({ ...context, category: 'response_invalid', status: 'invalid' }); } catch { /* Diagnostics never change parser failures. */ } throw error; }
}

export class BrowserDiagnosticsSession {
  private enabled = false;
  private closed = false;
  private signatures = new Set<string>();
  private successSamples = 0;
  private queue: BrowserDiagnostic[] = [];
  private inFlight: AbortController | undefined;
  constructor(private readonly deps: { isCurrent: () => boolean; send: (value: BrowserDiagnostic, signal: AbortSignal) => Promise<void> }) {}
  enable(value: unknown): void { this.enabled = !this.closed && browserDiagnosticsConfigSchema.safeParse(value).data?.enabled === true; }
  report(value: unknown): void {
    if (!this.enabled || this.closed || !this.deps.isCurrent()) return;
    const parsed = browserDiagnosticObservationSchema.safeParse(value);
    if (!parsed.success || this.signatures.size >= 20) return;
    if (parsed.data.status === 'success' && this.successSamples >= 5) return;
    const signature = JSON.stringify(parsed.data);
    if (this.signatures.has(signature)) return;
    this.signatures.add(signature);
    if (parsed.data.status === 'success') this.successSamples++;
    this.queue.push({ ...parsed.data, diagnosticId: crypto.randomUUID() });
    this.flush();
  }
  private flush(): void {
    if (this.closed || this.inFlight || !this.deps.isCurrent()) return;
    const value = this.queue.shift(); if (!value) return;
    const controller = new AbortController(); this.inFlight = controller;
    void this.deps.send(value, controller.signal).catch(() => { /* No retries, error recursion, raw exception or durable browser queue. */ }).finally(() => {
      if (this.inFlight === controller) this.inFlight = undefined;
      if (!this.closed && this.deps.isCurrent()) this.flush();
    });
  }
  close(): void { this.closed = true; this.enabled = false; this.queue = []; this.inFlight?.abort(); }
}
