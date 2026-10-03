import type { LiveAnalyticsConfig, PosthogEvent } from './posthog';
export type CaptureOutcome = 'ACCEPTED' | 'RETRY_REQUIRED' | 'OUTCOME_UNKNOWN';
export async function capturePosthogEvent(config: LiveAnalyticsConfig, event: PosthogEvent, request: typeof fetch = fetch): Promise<CaptureOutcome> {
  try {
    const response = await request('https://us.i.posthog.com/i/v0/e/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: config.projectKey, ...event }), signal: AbortSignal.timeout(3000), redirect: 'error', credentials: 'omit', cache: 'no-store' });
    // The remote response body is neither operational context nor safe log data.
    void response.body?.cancel().catch(() => undefined);
    return response.ok ? 'ACCEPTED' : 'RETRY_REQUIRED';
  } catch { return 'OUTCOME_UNKNOWN'; }
}
